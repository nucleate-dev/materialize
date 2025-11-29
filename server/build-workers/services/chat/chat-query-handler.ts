import {
  CanUseTool,
  HookInput,
  HookJSONOutput,
  Options,
  PermissionMode,
  PermissionResult,
  query,
  SDKAssistantMessage,
  SDKUserMessage,
  SettingSource,
} from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import WebSocket from "ws";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import {
  ChatContentBlock,
  ChatEvent,
  ChatQueryData,
  ChatServerMessage,
} from "../../types/ChatTypes.js";
import { Database } from "../../types/supabase.js";
import { ExpoDevServerService } from "../dev-server/ExpoDevServerService.js";
import { FileSyncService } from "../FileSyncService.js";
import { SandboxService } from "../SandboxService.js";
import { SupabaseClientService } from "../SupabaseClientService.js";
import { TerminalService } from "../terminals/TerminalService.js";
import { getSystemPromptForDesignStyle } from "./ClaudeCodePrompts.js";
import {
  costFunctionV1,
  CURRENT_COST_FUNCTION_NAME,
} from "./cost-calculation.js";
import { hasRemainingCredits } from "./credit-checks.js";
import { createDevelopmentToolsMcpServer } from "./mcp-tools.js";
import { getToolDisplayName } from "./message-handlers.js";
import { ToolPermissionService } from "./tool-permission-service.js";
import { trackApiUsageBuildWorker } from "./usage-tracking.js";

const HISTORY_MESSAGE_REQUEST_COUNT = 6;

interface CodeSessionState {
  sessionId: string | null;
  prototypeChatSessionId: string | null;
  isActive: boolean;
  createdAt: number;
  lastActiveAt: number;
  abortController: AbortController | null;
  modifiedFilesThisQuery: Set<string>;
  designSystemId: string | null;
  designSystemRules: string | null;
}

interface ToolInputWithFilePath {
  file_path?: string;
  notebook_path?: string;
  [key: string]: unknown;
}

interface ToolResponseWithFilePath {
  file_path?: string;
  [key: string]: unknown;
}

type ToolName =
  | "Bash"
  | "BashOutput"
  | "Read"
  | "Write"
  | "Edit"
  | "NotebookEdit"
  | "Glob"
  | "Grep"
  | string;

type ToolInput = Record<string, unknown>;

interface QueryValidationResult {
  valid: boolean;
  errorMessage?: string;
  errorDetails?: string;
}

interface DesignSystemResult {
  systemPrompt: string;
  designSystemId: string | null;
  designSystemRules: string | null;
}

interface QueryExecutionContext {
  prototypeId: string;
  socket: WebSocket;
  data: ChatQueryData;
  sessionState: CodeSessionState;
  validAiChatSessionIds: Set<string>;
}

interface MessageHandlers {
  sendMessage: (socket: WebSocket, message: ChatServerMessage) => void;
  persistMessage: (
    role: "user" | "assistant" | "system",
    content: string,
    messageType: "text" | "tool_use" | "tool_result" | "error" | "system",
    eventType?: string | null,
    eventData?: unknown,
    creditsUsed?: number | null,
    costFunction?: string | null,
  ) => Promise<void>;
  uploadChatImages: (
    prototypeId: string,
    chatSessionId: string,
    images: Array<{ base64: string; mediaType: string; }>,
  ) => Promise<
    Array<{ storage_path: string; media_type: string; file_size: number; }>
  >;
  updatePersistenceClient?: (client: unknown) => void;
  notifyOrchestrationStartChat: (prototypeId: string) => Promise<void>;
  notifyOrchestrationEndChat: (prototypeId: string) => Promise<void>;
}

interface StreamContext {
  messageContent:
  | string
  | Array<{ type: string; text?: string; source?: unknown; }>;
  queryOptions: Options & { resume?: string; };
  sessionState: CodeSessionState;
  validAiChatSessionIds: Set<string>;
  socket: WebSocket;
}

interface HookContext {
  input: HookInput;
  toolUseID: string | undefined;
  socket: WebSocket;
  sessionState?: CodeSessionState;
}

/**
 * Handles the execution of Claude Code queries, including:
 * - Request validation (auth, credits, content)
 * - Design system loading
 * - Claude SDK query execution with hooks
 * - Response streaming
 * - File sync coordination
 * - Usage tracking
 */
export class ChatQueryHandler {
  private readonly workDir: string;
  private readonly logger: SystemLogger;
  private readonly supabaseClientService: SupabaseClientService;
  private readonly fileSyncService: FileSyncService;
  private readonly toolPermissionService: ToolPermissionService;
  private readonly sandboxService: SandboxService;
  private readonly expoDevServerService: ExpoDevServerService;
  private readonly terminalService: TerminalService;
  private readonly getAak: () => string | null;

  constructor(
    workDir: string,
    logger: SystemLogger,
    supabaseClientService: SupabaseClientService,
    fileSyncService: FileSyncService,
    toolPermissionService: ToolPermissionService,
    sandboxService: SandboxService,
    expoDevServerService: ExpoDevServerService,
    terminalService: TerminalService,
    getAak: () => string | null,
  ) {
    this.workDir = workDir;
    this.logger = logger.child({ service: "ChatQueryHandler" });
    this.supabaseClientService = supabaseClientService;
    this.fileSyncService = fileSyncService;
    this.toolPermissionService = toolPermissionService;
    this.sandboxService = sandboxService;
    this.expoDevServerService = expoDevServerService;
    this.terminalService = terminalService;
    this.getAak = getAak;
  }

  /**
   * Main entry point for handling a query request
   */
  public async handleQuery(
    context: QueryExecutionContext,
    handlers: MessageHandlers,
  ): Promise<void> {
    const { prototypeId, socket, data, sessionState } = context;
    const { prompt, content, token, ai_chat_session_id, design_style } = data;
    const options = (data.options ?? {}) as Options;

    // Log incoming parameters
    this.logger.consoleLogDevOnly("info", "handleQuery received parameters", {
      prototypeId,
      session_id: ai_chat_session_id,
      chat_session_id: data.prototype_chat_session_id,
      current_viewing_path: data.current_viewing_path,
      custom_design_system_id: data.custom_design_system_id,
      design_style,
      hasPrompt: !!prompt,
      hasContent: !!content,
      contentLength: content?.length,
      hasToken: !!token,
      hasOptions: !!data.options,
      options: data.options,
    });

    // Step 1: Validate request
    const validation = this.validateQueryRequest(data);
    if (!validation.valid) {
      handlers.sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: validation.errorMessage!,
          details: validation.errorDetails,
        },
      });
      return;
    }

    // Step 2: Authenticate with token if provided
    if (token) {
      const authResult = await this.authenticateWithToken(
        token,
        prototypeId,
        handlers,
      );
      if (!authResult.success) {
        handlers.sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: authResult.errorMessage!,
            details: authResult.errorDetails,
          },
        });
        return;
      }
    }

    // Step 3: Setup session state
    this.setupSessionState(data, sessionState);

    // Step 4: Load design system if needed
    const designSystemResult = await this.loadDesignSystem(
      data.custom_design_system_id ?? null,
      sessionState,
      design_style,
      data.current_viewing_path,
      options,
    );

    // Step 5: Perform credit check
    const creditCheck = await this.performCreditCheck(prototypeId);
    if (!creditCheck.success) {
      handlers.sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: creditCheck.errorMessage!,
          details: creditCheck.errorDetails,
        },
      });
      return;
    }

    // Step 6: Notify orchestration that chat is starting
    await handlers.notifyOrchestrationStartChat(prototypeId);

    // Step 7: Execute query with proper cleanup
    let totalCostUsd: number | undefined = undefined;

    try {
      totalCostUsd = await this.executeClaudeQuery(
        context,
        designSystemResult.systemPrompt,
        handlers,
      );
    } finally {
      // Step 8: Sync files and track usage
      await this.syncAndTrackUsage(
        prototypeId,
        socket,
        sessionState,
        totalCostUsd,
        handlers.sendMessage,
      );

      // Step 9: Always notify orchestration that chat has ended
      await handlers.notifyOrchestrationEndChat(prototypeId);
    }
  }

  /**
   * Validates the incoming query request
   */
  private validateQueryRequest(data: ChatQueryData): QueryValidationResult {
    const { prompt, content } = data;

    // Support both old format (prompt) and new format (content)
    if (!prompt && !content) {
      return {
        valid: false,
        errorMessage: "prompt or content is required",
      };
    }

    // Validate content if provided
    if (content && (!Array.isArray(content) || content.length === 0)) {
      return {
        valid: false,
        errorMessage: "content must be a non-empty array",
      };
    }

    return { valid: true };
  }

  /**
   * Authenticates with JWT token and refreshes Supabase client
   */
  private async authenticateWithToken(
    token: string,
    prototypeId: string,
    handlers: MessageHandlers,
  ): Promise<{
    success: boolean;
    errorMessage?: string;
    errorDetails?: string;
  }> {
    try {
      // Refresh the Supabase client with the authenticated token
      this.supabaseClientService.refreshClientWithToken(token);

      // FileSyncService will automatically use the updated client from SupabaseClientService

      // Update MessagePersistenceService's Supabase client reference
      if (handlers.updatePersistenceClient) {
        handlers.updatePersistenceClient(
          this.supabaseClientService.getClient(),
        );
      }

      this.logger.consoleLogDevOnly(
        "info",
        "Refreshed Supabase client with JWT token",
        {
          prototypeId,
        },
      );
      return { success: true };
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to refresh Supabase client with JWT token",
        { prototypeId },
      );
      return {
        success: false,
        errorMessage: "Failed to authenticate with provided token",
        errorDetails: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Sets up session state based on incoming request data
   */
  private setupSessionState(
    data: ChatQueryData,
    sessionState: CodeSessionState,
  ): void {
    const { prototype_chat_session_id, ai_chat_session_id } = data;

    // Use the chat_session_id provided by the client for message persistence
    if (prototype_chat_session_id) {
      sessionState.prototypeChatSessionId = prototype_chat_session_id;
      this.logger.consoleLogDevOnly(
        "info",
        "Using chat session ID from client",
        {
          chatSessionId: prototype_chat_session_id,
          claudeCodeSessionId: ai_chat_session_id,
        },
      );
    } else {
      this.logger.warn("No chat_session_id provided by client", {
        session_id: ai_chat_session_id,
      });
      sessionState.prototypeChatSessionId = null;
    }

    // If client explicitly passes null session_id, it wants to start a NEW session
    if (ai_chat_session_id === null) {
      this.logger.consoleLogDevOnly(
        "info",
        "Client requested new session - clearing internal state",
        {
          previousSessionId: sessionState.sessionId,
        },
      );
      sessionState.sessionId = null;
    }
  }

  /**
   * Loads design system and builds system prompt
   */
  private async loadDesignSystem(
    custom_design_system_id: string | null,
    sessionState: CodeSessionState,
    design_style: string | undefined,
    current_viewing_path: string | undefined,
    options: Options,
  ): Promise<DesignSystemResult> {
    // Check if design system changed or needs to be loaded
    if (custom_design_system_id !== sessionState.designSystemId) {
      if (
        custom_design_system_id === null ||
        custom_design_system_id === undefined
      ) {
        // Clear design system
        sessionState.designSystemId = null;
        sessionState.designSystemRules = null;
        this.logger.consoleLogDevOnly("info", "Design system cleared");
      } else {
        // Fetch new design system
        try {
          const { data: designSystem, error } = await this.supabaseClientService
            .getClient()
            .from("design_systems")
            .select("*")
            .eq("id", custom_design_system_id)
            .single();

          if (error) {
            this.logger.error(error, "Failed to fetch design system", {
              designSystemId: custom_design_system_id,
            });
            sessionState.designSystemId = null;
            sessionState.designSystemRules = null;
          } else if (designSystem) {
            sessionState.designSystemId = custom_design_system_id;
            sessionState.designSystemRules = (
              designSystem as Database["public"]["Tables"]["design_systems"]["Row"]
            ).design_rules;
          } else {
            this.logger.warn("Design system not found", {
              designSystemId: custom_design_system_id,
            });
            sessionState.designSystemId = null;
            sessionState.designSystemRules = null;
          }
        } catch (error) {
          this.logger.error(
            error instanceof Error ? error : new Error(String(error)),
            "Error fetching design system",
            { designSystemId: custom_design_system_id },
          );
          sessionState.designSystemId = null;
          sessionState.designSystemRules = null;
        }
      }
    }

    // Build system prompt with optional design system rules and viewing path context
    let systemPromptAppend = getSystemPromptForDesignStyle(design_style);

    this.logger.consoleLogDevOnly(
      "info",
      "Using design-style-specific system prompt",
      {
        design_style,
        hasCustomDesignSystem: !!sessionState.designSystemRules,
      },
    );

    // Append custom design system rules if available
    if (sessionState.designSystemRules) {
      systemPromptAppend +=
        "\n\n## Custom Design System Rules:\n" + sessionState.designSystemRules;
    }

    // Append current viewing path context if available
    if (current_viewing_path) {
      systemPromptAppend += `\n\n## Current Viewing Context:\nThe user is currently viewing the route: ${current_viewing_path}\n(Note: This context may or may not be relevant to the user's query)`;
    }

    // Append history context if provided (from handleQueryWithHistory)
    const historyContext = (options as Record<string, unknown>)
      ?.__historyContext as string | undefined;
    if (historyContext) {
      systemPromptAppend += historyContext;
      this.logger.consoleLogDevOnly(
        "info",
        "Injected history context into system prompt",
        {
          contextLength: historyContext.length,
        },
      );
    }

    return {
      systemPrompt: systemPromptAppend,
      designSystemId: sessionState.designSystemId,
      designSystemRules: sessionState.designSystemRules,
    };
  }

  /**
   * Performs credit check to ensure user has remaining credits
   */
  private async performCreditCheck(prototypeId: string): Promise<{
    success: boolean;
    errorMessage?: string;
    errorDetails?: string;
  }> {
    try {
      const {
        data: { user },
        error: userError,
      } = await this.supabaseClientService.getClient().auth.getUser();

      if (userError || !user) {
        this.logger.error(
          userError || new Error("No user found"),
          "Unable to verify user for credit check",
          { prototypeId },
        );
        return {
          success: false,
          errorMessage: "Authentication required",
          errorDetails: "Unable to verify user credentials",
        };
      }

      const creditCheck = await hasRemainingCredits(
        this.supabaseClientService.getClient(),
        user.id,
        this.logger,
      );

      if (!creditCheck.hasCredits) {
        this.logger.warn("User has no remaining credits", {
          userId: user.id,
          prototypeId,
          remaining: creditCheck.remaining,
          used: creditCheck.used,
          granted: creditCheck.granted,
          plan: creditCheck.plan,
        });

        return {
          success: false,
          errorMessage: "Credit limit exceeded",
          errorDetails: `You have used all ${creditCheck.granted} credits available. Please upgrade your plan to continue.`,
        };
      }

      return { success: true };
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Error during credit check",
        { prototypeId },
      );
      return {
        success: false,
        errorMessage: "Unable to verify credits",
        errorDetails: "An error occurred while checking your credit balance",
      };
    }
  }

  /**
   * Executes the Claude query with hooks and streaming
   */
  private async executeClaudeQuery(
    context: QueryExecutionContext,
    systemPromptAppend: string,
    handlers: MessageHandlers,
  ): Promise<number | undefined> {
    const { prototypeId, socket, data, sessionState, validAiChatSessionIds } =
      context;
    const { prompt, content, ai_chat_session_id } = data;
    const options = (data.options ?? {}) as Options;

    try {
      // Create a new AbortController for this query
      const abortController = new AbortController();
      sessionState.abortController = abortController;

      // Prepare message content - support both text and image content blocks
      const messageContent = this.prepareMessageContent(
        prompt,
        content as ChatContentBlock[] | undefined,
      );

      // Extract images from content for storage (now images are URLs, not base64)
      const imagesFromContent = this.extractImagesFromContent(messageContent);

      // Get image metadata from query data (images already uploaded by frontend)
      const imageMetadata: Array<{
        storage_path: string;
        media_type: string;
        name?: string;
      }> = data.image_metadata || [];

      // Persist user message to database with image metadata
      await this.persistUserMessage(
        messageContent,
        imagesFromContent,
        imageMetadata,
        handlers.persistMessage,
      );

      // Setup query options
      const queryOptions = await this.setupQueryOptions(
        options,
        systemPromptAppend,
        abortController,
        socket,
        sessionState,
        handlers,
      );

      // Check if session is valid for resumption
      const isValidSessionId =
        ai_chat_session_id && validAiChatSessionIds.has(ai_chat_session_id);

      // Handle invalid session ID
      if (
        !isValidSessionId &&
        ai_chat_session_id !== null &&
        ai_chat_session_id !== undefined
      ) {
        this.logger.warn(
          "Invalid session ID detected - requesting history from client",
          {
            providedSessionId: ai_chat_session_id,
            validSessionCount: validAiChatSessionIds.size,
          },
        );

        handlers.sendMessage(socket, {
          type: ChatEvent.HISTORY_REQUEST,
          data: {
            message:
              "Session invalid - please provide recent conversation history",
            requested_message_count: HISTORY_MESSAGE_REQUEST_COUNT,
            original_query: data,
          },
        });
        return undefined;
      }

      if (isValidSessionId) {
        queryOptions.resume = ai_chat_session_id;
      }

      this.logger.consoleLogDevOnly("info", "Querying Claude Agent SDK", {
        hasResume: !!queryOptions.resume,
        resumeSessionId: queryOptions.resume,
        providedSessionId: ai_chat_session_id,
        isValidSessionId,
        internalSessionId: sessionState.sessionId,
        model: queryOptions.model,
        cwd: this.workDir,
      });

      // Execute query and stream responses
      const streamContext: StreamContext = {
        messageContent,
        queryOptions,
        sessionState,
        validAiChatSessionIds,
        socket,
      };
      const totalCostUsd = await this.streamQueryResponse(
        streamContext,
        handlers,
      );

      // Images were already uploaded before persisting the user message
      // No need to upload them again here

      // Clear abort controller
      sessionState.abortController = null;

      // Send completion message
      handlers.sendMessage(socket, {
        type: ChatEvent.QUERY_COMPLETE,
        data: {
          sessionId: sessionState.sessionId,
        },
      });

      return totalCostUsd;
    } catch (error) {
      // Clear the abort controller on error
      sessionState.abortController = null;

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Claude Code query failed",
        { prototypeId },
      );

      // Persist error to database
      await handlers.persistMessage(
        "system",
        `Error: ${errorMessage}`,
        "error",
        "query_error",
        {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      handlers.sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: "Query failed",
          details: errorMessage,
        },
      });

      return undefined;
    }
  }

  /**
   * Prepares message content supporting both text and image blocks
   */
  private prepareMessageContent(
    prompt: string | undefined,
    content: ChatContentBlock[] | undefined,
  ): string | Array<{ type: string; text?: string; source?: unknown; }> {
    if (content) {
      return content.map((block) => {
        if (block.type === "text") {
          return {
            type: "text",
            text: block.text || "",
          };
        } else if (block.type === "image") {
          return {
            type: "image",
            source: block.source,
          };
        }
        return block;
      });
    }
    return prompt!;
  }

  /**
   * Extracts images from content for storage
   */
  private extractImagesFromContent(
    messageContent:
      | string
      | Array<{ type: string; text?: string; source?: unknown; }>,
  ): Array<{ base64: string; mediaType: string; }> {
    if (!Array.isArray(messageContent)) {
      return [];
    }

    return messageContent
      .filter((block) => block.type === "image")
      .map((block) => ({
        base64: (block.source as { data: string; }).data,
        mediaType: (block.source as { media_type: string; }).media_type,
      }));
  }

  /**
   * Persists user message to database with image metadata if present
   */
  private async persistUserMessage(
    messageContent:
      | string
      | Array<{ type: string; text?: string; source?: unknown; }>,
    imagesFromContent: Array<{ base64: string; mediaType: string; }>,
    imageMetadata: Array<{
      storage_path: string;
      media_type: string;
      name?: string;
    }>,
    persistMessage: (
      role: "user" | "assistant" | "system",
      content: string,
      messageType: "text" | "tool_use" | "tool_result" | "error" | "system",
      eventType?: string | null,
      eventData?: unknown,
    ) => Promise<void>,
  ): Promise<void> {
    const userMessageText =
      typeof messageContent === "string"
        ? messageContent
        : messageContent
          .filter((block) => block.type === "text")
          .map((block) => block.text || "")
          .join("\n");

    const hasImages = imagesFromContent.length > 0;
    const userMessageDisplay = hasImages
      ? `${userMessageText} [with ${imagesFromContent.length} image${imagesFromContent.length > 1 ? "s" : ""}]`
      : userMessageText;

    // Include image metadata in event_data if images were uploaded
    const eventData =
      imageMetadata.length > 0 ? { images: imageMetadata } : null;

    await persistMessage("user", userMessageDisplay, "text", null, eventData);
  }

  /**
   * Sets up query options including hooks and MCP servers
   */
  private async setupQueryOptions(
    options: Options,
    systemPromptAppend: string,
    abortController: AbortController,
    socket: WebSocket,
    sessionState: CodeSessionState,
    handlers: MessageHandlers,
  ): Promise<Options & { resume?: string; }> {
    const canUseTool: CanUseTool = async (
      toolName: ToolName,
      input: ToolInput,
      _options,
    ): Promise<PermissionResult> => {
      return this.toolPermissionService.evaluateToolPermission(toolName, input);
    };

    // Prepare environment variables
    const env: Record<string, string | undefined> = {};
    const aak = this.getAak();
    this.logger.consoleLogDevOnly("info", "AAK", {
      exists: !!aak,
      lastFourCharacters: aak?.slice(-4),
    });
    if (aak) {
      env.ANTHROPIC_API_KEY = aak;
    }

    return {
      ...options,
      includePartialMessages: false,
      cwd: this.workDir,
      maxTurns: options?.maxTurns ?? 50,
      disallowedTools: ["Write", "Bash"],
      allowedTools: options?.allowedTools ?? [
        "Read",
        "Edit",
        "Glob",
        "Grep",
        // MCP tools from devtools server
        "mcp__devtools__SafeWrite",
        "mcp__devtools__SafeBash",
        "mcp__devtools__checkTerminal",
        "mcp__devtools__RestartDevServer",
      ],
      model: options?.model ?? "claude-sonnet-4-5",
      systemPrompt: {
        type: "preset" as const,
        preset: "claude_code" as const,
        append: systemPromptAppend,
      },
      settingSources: ["user"] as SettingSource[],
      permissionMode: "default" as PermissionMode,
      abortController,
      canUseTool,
      // Add MCP servers with development tools
      mcpServers: {
        "devtools": createDevelopmentToolsMcpServer(
          async (command, args) => {
            const executeSandboxCommandResult = await this.executeSandboxCommand(command, args);
            return executeSandboxCommandResult;
          },
          async (filePath: string, content: string) => {
            const writeFileResult = await this.handleMcpWriteFile(filePath, content);
            this.logger.consoleLogDevOnly("info", "MCP writeFile tool: write file result:", {
              filePath,
              content,
            });
            return writeFileResult;
          },
          this.terminalService,
          async () => {
            this.logger.consoleLogDevOnly(
              "info",
              "MCP restartDevServer tool: restarting dev server",
            );
            await this.expoDevServerService.restartDevServer(this.logger);
          },
        ),
      },
      // Add hooks to stream tool usage to WebSocket clients
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (
                input: HookInput,
                toolUseID: string | undefined,
                _options: { signal: AbortSignal; },
              ): Promise<HookJSONOutput> => {
                const hookContext: HookContext = {
                  input,
                  toolUseID,
                  socket,
                };
                return this.handlePreToolUseHook(hookContext, handlers);
              },
            ],
          },
        ],
        PostToolUse: [
          {
            hooks: [
              async (
                input: HookInput,
                toolUseID: string | undefined,
                _options: { signal: AbortSignal; },
              ): Promise<HookJSONOutput> => {
                const hookContext: HookContext = {
                  input,
                  toolUseID,
                  socket,
                  sessionState,
                };
                return this.handlePostToolUseHook(hookContext, handlers);
              },
            ],
          },
        ],
      },
    };
  }

  /**
   * Executes sandbox command for MCP tools
   */
  private async executeSandboxCommand(
    command: string,
    args: string[],
  ): Promise<{ stdout: string; isError: boolean; }> {
    try {
      const { response: responseRaw } =
        await this.sandboxService.runCommandInternal({
          command,
          args,
          cwd: this.workDir,
          session_id: "test",
          timeout_ms: 30000,
          strip_ansi: true,
        });
      const response = responseRaw.data;
      if (!response) {
        throw new Error("No response from sandbox service");
      }

      if (response.status === "success") {
        return {
          stdout: response.stdout || "Command executed successfully",
          isError: false,
        };
      } else if (response.status === "timeout") {
        this.logger.warn(
          "Terminal command timed out in MCP executeSandboxCommand tool",
          {
            command,
            args,
          },
        );
        return {
          stdout: response.stdout || "Command timed out",
          isError: true,
        };
      }
      return {
        stdout: response.stdout || "Unknown error",
        isError: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        error instanceof Error ? error : new Error(errorMsg),
        "MCP Tool execution failed",
      );
      return { stdout: `System Error: ${errorMsg}`, isError: true };
    }
  }

  /**
   * Handles MCP write file requests
   */
  private async handleMcpWriteFile(
    filePath: string,
    content: string,
  ): Promise<{
    success: boolean;
    bytesWritten?: number;
    error?: string;
  }> {
    try {
      // Parse the file path to get directory and filename
      const resolvedPath = path.resolve(this.workDir, filePath);
      const relativePath = path.relative(
        this.workDir,
        path.dirname(resolvedPath),
      );
      const filename = path.basename(resolvedPath);

      this.logger.consoleLogDevOnly("info", "MCP Write tool: writing file", {
        filePath,
        resolvedPath,
        relativePath,
        filename,
      });

      // Use SandboxService's writeFile method
      const result = await this.sandboxService.writeFile(
        relativePath,
        filename,
        content,
      );

      if (result.success) {
        // Calculate bytes written
        const bytesWritten = Buffer.byteLength(content, "utf-8");
        return {
          success: true,
          bytesWritten,
        };
      } else {
        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        error instanceof Error ? error : new Error(errorMessage),
        "MCP Write tool: failed to write file",
        { filePath },
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Handles PreToolUse hook
   */
  private async handlePreToolUseHook(
    hookContext: HookContext,
    handlers: MessageHandlers,
  ): Promise<HookJSONOutput> {
    const { input, toolUseID, socket } = hookContext;

    this.logger.debug("PreToolUse Hook called: ", {
      input: JSON.stringify(input),
    });

    try {
      if (input.hook_event_name === "PreToolUse") {
        const permission = this.toolPermissionService.evaluateToolPermission(
          input.tool_name as ToolName,
          (input.tool_input ?? {}) as ToolInput,
        );

        if (permission.behavior === "deny") {
          const message = permission.message ?? "Tool denied by policy";
          return {
            continue: false,
            decision: "block",
            stopReason: message,
            systemMessage: message,
            reason: message,
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "deny",
              permissionDecisionReason: message,
            },
          };
        }

        const normalizedToolInput = permission.updatedInput ?? input.tool_input;

        // Send tool start event to WebSocket client
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: ChatEvent.TOOL_START,
              data: {
                tool_name: input.tool_name,
                tool_input: normalizedToolInput,
                tool_call_id: toolUseID,
              },
            }),
          );
        }

        // Persist tool start to database with friendly display name
        const displayName = getToolDisplayName(
          input.tool_name,
          normalizedToolInput as ToolInput,
        );
        await handlers.persistMessage(
          "assistant",
          displayName,
          "tool_use",
          "tool_start",
          {
            tool_name: input.tool_name,
            tool_input: normalizedToolInput,
            tool_call_id: toolUseID,
          },
        );
      }
    } catch (error) {
      // Log but don't fail the hook
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "PreToolUse hook error",
      );
    }
    return { continue: true };
  }

  /**
   * Handles PostToolUse hook
   */
  private async handlePostToolUseHook(
    hookContext: HookContext,
    handlers: MessageHandlers,
  ): Promise<HookJSONOutput> {
    const { input, toolUseID, socket, sessionState } = hookContext;

    try {
      this.logger.consoleLogDevOnly("debug", JSON.stringify(input));

      if (input.hook_event_name === "PostToolUse") {
        // Track file modifications
        const fileModifyingTools = [
          "Write",
          "Edit",
          "NotebookEdit",
          "SafeWrite",
        ];
        if (fileModifyingTools.includes(input.tool_name)) {
          const toolInput = input.tool_input as ToolInputWithFilePath;
          const toolResponse = input.tool_response as ToolResponseWithFilePath;

          // Extract file path from tool input or response
          let filePath: string | null = null;

          if (toolInput?.file_path) {
            filePath = toolInput.file_path;
          } else if (toolInput?.notebook_path) {
            filePath = toolInput.notebook_path;
          } else if (toolResponse?.file_path) {
            filePath = toolResponse.file_path;
          }

          if (filePath && sessionState) {
            const relativePath = this.getRelativePath(filePath);
            // Track for query-level reporting
            sessionState.modifiedFilesThisQuery.add(relativePath);
          }
        }

        // Send tool complete event to WebSocket client
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: ChatEvent.TOOL_COMPLETE,
              data: {
                tool_name: input.tool_name,
                tool_input: input.tool_input,
                tool_response: input.tool_response,
                tool_call_id: toolUseID,
              },
            }),
          );
        }

        // Persist tool completion to database
        await handlers.persistMessage(
          "assistant",
          `Tool completed: ${input.tool_name}`,
          "tool_result",
          "tool_complete",
          {
            tool_name: input.tool_name,
            tool_input: input.tool_input,
            tool_response: input.tool_response,
            tool_call_id: toolUseID,
          },
        );
      }
    } catch (error) {
      // Log but don't fail the hook
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "PostToolUse hook error",
      );
    }
    return { continue: true };
  }

  /**
   * Streams query response and handles session updates
   */
  private async streamQueryResponse(
    streamContext: StreamContext,
    handlers: MessageHandlers,
  ): Promise<number | undefined> {
    const {
      messageContent,
      queryOptions,
      sessionState,
      validAiChatSessionIds,
      socket,
    } = streamContext;
    // Create async generator for streaming input
    async function* generateMessages(): AsyncGenerator<{
      type: "user";
      message: {
        role: "user";
        content:
        | string
        | Array<{ type: string; text?: string; source?: unknown; }>;
      };
    }> {
      yield {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: messageContent,
        },
      };
    }

    // Stream responses back to client
    const response = query({
      prompt: generateMessages() as AsyncIterable<SDKUserMessage>,
      options: queryOptions,
    });

    // Buffer for assistant message text (to persist at the end)
    let assistantMessageBuffer = "";
    let tokenUsageLogged = false;
    let totalCostUsd: number | undefined = undefined;
    let creditsUsed: number | undefined = undefined;

    for await (const msg of response) {
      // Capture session ID from init message
      if (msg.type === "system" && msg.subtype === "init") {
        const isNewSession = sessionState.sessionId !== msg.session_id;
        const previousSessionId = sessionState.sessionId;

        sessionState.sessionId = msg.session_id;
        sessionState.isActive = true;
        if (isNewSession) {
          sessionState.createdAt = Date.now();
        }
        sessionState.lastActiveAt = Date.now();

        // Add this session ID to our set of valid session IDs
        validAiChatSessionIds.add(msg.session_id);

        this.logger.consoleLogDevOnly(
          "info",
          "Claude Code session initialized",
          {
            sessionId: msg.session_id,
            isNewSession,
            previousSessionId,
          },
        );

        // Persist the newly created Claude session ID to the prototype chat session row
        if (sessionState.prototypeChatSessionId) {
          try {
            const { error } = await this.supabaseClientService
              .getClient()
              .from("prototype_chat_sessions")
              .update({ session_id: msg.session_id })
              .eq("id", sessionState.prototypeChatSessionId);

            if (error) {
              this.logger.error(
                error,
                "Failed to update session_id in prototype_chat_sessions",
                {
                  chatSessionId: sessionState.prototypeChatSessionId,
                  claudeSessionId: msg.session_id,
                },
              );
            } else {
              this.logger.consoleLogDevOnly(
                "info",
                "Updated prototype_chat_sessions with new Claude session_id",
                {
                  chatSessionId: sessionState.prototypeChatSessionId,
                  claudeSessionId: msg.session_id,
                },
              );
            }
          } catch (error) {
            this.logger.error(
              error instanceof Error ? error : new Error(String(error)),
              "Exception while updating session_id in prototype_chat_sessions",
              {
                chatSessionId: sessionState.prototypeChatSessionId,
                claudeSessionId: msg.session_id,
              },
            );
          }
        } else {
          this.logger.warn(
            "Cannot persist Claude session_id because prototypeChatSessionId is missing",
            { claudeSessionId: msg.session_id },
          );
        }
      }

      // Track assistant text content for persistence
      if (msg.type === "assistant") {
        const message = (msg as SDKAssistantMessage).message;
        if (message?.content) {
          for (const content of message.content) {
            if (content.type === "text" && content.text) {
              assistantMessageBuffer += content.text;
            }
          }
        }
      }

      // Log token usage once when the final result message arrives
      if (msg.type === "result" && !tokenUsageLogged) {
        try {
          const { usage, total_cost_usd, duration_ms, duration_api_ms } = msg;
          const inputTokens = usage?.input_tokens ?? 0;
          const outputTokens = usage?.output_tokens ?? 0;

          // Store total_cost_usd for usage tracking in finally block
          totalCostUsd = total_cost_usd;

          // Calculate credits used using the shared cost calculation function
          creditsUsed = costFunctionV1(total_cost_usd);

          this.logger.metricTokenUsage(
            queryOptions.model ?? "unknown",
            inputTokens,
            outputTokens,
            total_cost_usd,
            duration_ms,
            duration_api_ms,
          );
          tokenUsageLogged = true;
        } catch (logError) {
          this.logger.error(
            logError instanceof Error ? logError : new Error(String(logError)),
            "Failed to log token usage",
          );
        }
      }

      // Update last active time
      sessionState.lastActiveAt = Date.now();

      // Forward message to client
      handlers.sendMessage(socket, {
        type: ChatEvent.AGENT_MESSAGE,
        data: msg,
      });
    }

    // Persist accumulated assistant message if there is any
    if (assistantMessageBuffer.trim()) {
      await handlers.persistMessage(
        "assistant",
        assistantMessageBuffer,
        "text",
        null,
        null,
        creditsUsed ?? null,
        creditsUsed !== undefined ? CURRENT_COST_FUNCTION_NAME : null,
      );
    }

    return totalCostUsd;
  }

  /**
   * Syncs files and tracks usage after query completion
   */
  private async syncAndTrackUsage(
    prototypeId: string,
    socket: WebSocket,
    sessionState: CodeSessionState,
    totalCostUsd: number | undefined,
    sendMessage: (socket: WebSocket, message: ChatServerMessage) => void,
  ): Promise<void> {
    // Sync file changes to Supabase
    try {
      this.logger.consoleLogDevOnly(
        "info",
        "Syncing file changes to Supabase (incremental sync)",
        {
          prototypeId,
        },
      );
      const syncResult = await this.fileSyncService.syncFilesToSupabase(
        prototypeId,
        "tracked",
      );

      if (syncResult.success) {
        this.logger.consoleLogDevOnly(
          "info",
          "File sync completed successfully",
          {
            prototypeId,
            filesUpdated: syncResult.filesUpdated,
            filesDeleted: syncResult.filesDeleted,
            assetsUpdated: syncResult.assetsUpdated,
            assetsDeleted: syncResult.assetsDeleted,
          },
        );
      } else {
        this.logger.error(
          new Error("File sync completed with errors"),
          "File sync had errors",
          {
            prototypeId,
            errorCount: syncResult.errors.length,
            errors: syncResult.errors,
          },
        );
      }
    } catch (syncError) {
      this.logger.error(
        syncError instanceof Error ? syncError : new Error(String(syncError)),
        "Failed to sync files to Supabase",
        { prototypeId },
      );
    }

    // Emit modified files list
    const modifiedFiles = Array.from(sessionState.modifiedFilesThisQuery);
    if (modifiedFiles.length > 0) {
      try {
        sendMessage(socket, {
          type: ChatEvent.MODIFIED_FILES,
          data: { files: modifiedFiles },
        });
      } catch (modifiedFilesError) {
        this.logger.error(
          modifiedFilesError instanceof Error
            ? modifiedFilesError
            : new Error(String(modifiedFilesError)),
          "Failed to send modified files event",
          { prototypeId },
        );
      }
    }
    sessionState.modifiedFilesThisQuery.clear();

    // Track API usage
    try {
      const {
        data: { user },
        error: userError,
      } = await this.supabaseClientService.getClient().auth.getUser();

      if (userError || !user) {
        this.logger.warn("Unable to track API usage - no authenticated user", {
          prototypeId,
          error: userError,
        });
      } else {
        // Calculate credits used using the shared cost calculation function
        const creditsUsed = costFunctionV1(totalCostUsd) ?? 1.0;

        this.logger.consoleLogDevOnly("info", "Tracking API usage", {
          userId: user.id,
          prototypeId,
          totalCostUsd,
          creditsUsed,
        });

        const { totalRemainingCredits } = await trackApiUsageBuildWorker(
          this.supabaseClientService.getClient(),
          user.id,
          prototypeId,
          this.logger,
          creditsUsed,
        );

        // Send updated credits to client
        sendMessage(socket, {
          type: ChatEvent.USAGE_UPDATE,
          data: {
            creditsUsed: creditsUsed,
            creditsRemaining: totalRemainingCredits,
          },
        });

        this.logger.consoleLogDevOnly(
          "info",
          "API usage tracked successfully",
          {
            userId: user.id,
            prototypeId,
            totalCostUsd,
            creditsUsed,
            totalRemainingCredits,
          },
        );
      }
    } catch (usageError) {
      this.logger.error(
        usageError instanceof Error
          ? usageError
          : new Error(String(usageError)),
        "Failed to track API usage",
        { prototypeId },
      );
    }
  }

  /**
   * Converts absolute file path to relative path from workDir
   */
  private getRelativePath(absolutePath: string): string {
    if (absolutePath.startsWith(this.workDir)) {
      return absolutePath.slice(this.workDir.length + 1);
    }
    return absolutePath;
  }
}
