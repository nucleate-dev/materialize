import {
  CanUseTool,
  HookInput,
  HookJSONOutput,
  McpSdkServerConfigWithInstance,
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
import { DevServerStatus } from "../../../types/BuildWorkerTypes.js";
import {
  ChatContentBlock,
  ChatEvent,
  ChatQueryData,
  ChatServerMessage,
  ScreenUpdateData,
} from "../../../types/ChatTypes.js";
import { Database } from "../../../types/supabase.js";
import { baseLogger, getWorkerContext, WORK_DIR } from "../../../worker.js";
import { NucleateDevelopmentServerService } from "../../dev-server/NucleateDevelopmentServerService.js";
import { SandboxService } from "../../SandboxService.js";
import { SupabaseClientService } from "../../SupabaseClientService.js";
import { TerminalService } from "../../terminals/TerminalService.js";
import { ALLOWED_ROOTS } from "../ChatService.js";
import {
  costFunctionV3,
  CURRENT_COST_FUNCTION_NAME,
} from "../cost/cost-calculation.js";
import {
  calculateOAuthCredits,
  getPromptLengthFromQueryData,
  OAUTH_COST_FUNCTION_NAME,
} from "../cost/oauth-credit-calculation.js";
import {
  getToolDisplayName,
  persistChatMessage,
} from "../helpers/message-handlers.js";
import { evaluateToolPermission } from "../helpers/tool-permission-service.js";
import { createDesignToolsMcpServer } from "../mcp/mcp-design-tools.js";
import { createDevelopmentToolsMcpServer } from "../mcp/mcp-dev-tools.js";
import {
  getSourceRepositoryComponentHarvesterPrompt,
  getSourceRepositoryScreenExtractorPrompt,
  getSourceRepositoryThemeSyncPrompt,
  getSystemPromptForDesignStyle,
} from "../prompts/ClaudeCodePrompts.js";
import { broadcastToConnections } from "../websocket-broadcast.js";
import {
  ChatConnection,
  ChatEngine,
  ChatEngineContext,
  ChatEngineResult,
  ChatEngineSessionState,
} from "./chat-engine.js";

const HISTORY_MESSAGE_REQUEST_COUNT = 6;

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

interface StreamContext {
  messageContent:
    | string
    | Array<{ type: string; text?: string; source?: unknown }>;
  queryOptions: Options & { resume?: string };
  sessionState: ChatEngineSessionState;
  validAiChatSessionIds: Set<string>;
  socket: WebSocket;
  activeConnections: Map<string, ChatConnection>;
  bufferState: {
    assistantMessageBuffer: string;
    creditsUsed: number | undefined;
    costFunction: string | undefined;
    accumulatedGeminiCostUsd: number;
  };
  isUsingOAuthToken: boolean;
  queryData: ChatQueryData;
}

interface HookContext {
  input: HookInput;
  toolUseID: string | undefined;
  socket: WebSocket;
  activeConnections: Map<string, ChatConnection>;
  sessionState?: ChatEngineSessionState;
  flushAssistantBuffer?: () => Promise<void>;
  getRelativePath?: (path: string) => string;
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
export class ChatQueryHandler implements ChatEngine {
  // Feature flags for MCP stream fix
  // When enabled, keeps the input stream open until the result message arrives
  // to prevent premature MCP server connection closure during multi-turn conversations
  private static readonly ENABLE_MCP_STREAM_FIX = true;
  private static readonly MCP_STREAM_MAX_WAIT_MS = 120000; // 2 minutes (accounting for maxTurns: 50)
  private static readonly MCP_STREAM_POLL_INTERVAL_MS = 100; // Check every 100ms

  private readonly supabaseClientService: SupabaseClientService;
  private readonly sandboxService: SandboxService;
  private readonly devServerService: NucleateDevelopmentServerService;
  private readonly terminalService: TerminalService;

  // Map of pending user questions waiting for responses
  private pendingQuestions = new Map<
    string,
    {
      resolve: (answer: string) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(
    supabaseClientService: SupabaseClientService,
    sandboxService: SandboxService,
    devServerService: NucleateDevelopmentServerService,
    terminalService: TerminalService,
  ) {
    this.supabaseClientService = supabaseClientService;
    this.sandboxService = sandboxService;
    this.devServerService = devServerService;
    this.terminalService = terminalService;
  }

  /**
   * Main entry point for handling a query request
   */
  public async handleQuery(
    context: ChatEngineContext,
  ): Promise<ChatEngineResult | void> {
    const { data } = context;
    const workerContext = getWorkerContext();
    const prototypeId = workerContext.prototypeId || "unknown";
    const { prompt, content, token, ai_chat_session_id } = data;
    const framework = this.devServerService.prototypeFramework;

    // Log incoming parameters
    baseLogger.consoleLogDevOnly("info", "handleQuery received parameters", {
      prototypeId,
      session_id: ai_chat_session_id,
      chat_session_id: data.prototype_chat_session_id,
      current_viewing_path: data.current_viewing_path,
      hasPrompt: !!prompt,
      hasContent: !!content,
      contentLength: content?.length,
      hasToken: !!token,
      hasOptions: !!data.options,
      options: data.options,
    });

    // Step 4: Invalidate build before chat starts
    this.devServerService.developmentServerState.lastUpdatedTime = new Date();

    // Step 5: Execute query with proper cleanup
    let result: { totalCostUsd: number | undefined; geminiCostUsd: number } = {
      totalCostUsd: undefined,
      geminiCostUsd: 0,
    };

    try {
      result = await this.executeClaudeQuery(
        context,
        framework,
        context.systemPrompt,
      );
    } finally {
      // Step 6: Invalidate build after chat ends
      this.devServerService.developmentServerState.lastUpdatedTime = new Date();
    }

    return {
      totalCostUsd: result.totalCostUsd,
      geminiCostUsd: result.geminiCostUsd,
    };
  }

  /**
   * Executes the Claude query with hooks and streaming
   */
  private async executeClaudeQuery(
    context: ChatEngineContext,
    framework: Database["public"]["Enums"]["prototype_framework"],
    systemPrompt: string,
  ): Promise<{ totalCostUsd: number | undefined; geminiCostUsd: number }> {
    const {
      socket,
      activeConnections,
      data,
      sessionState,
      validAiChatSessionIds,
    } = context;
    const workerContext = getWorkerContext();
    const prototypeId = workerContext.prototypeId || "unknown";
    const { prompt, content, ai_chat_session_id } = data;
    const options = (data.options ?? {}) as Options;

    if (!sessionState.prototypeChatSessionId) {
      throw new Error("Missing prototype chat session ID, cannot start chat");
    }

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
        sessionState.prototypeChatSessionId,
      );

      // Create shared state for assistant message buffering
      // This allows the flush callback to access and clear the buffer
      const bufferState = {
        assistantMessageBuffer: "",
        creditsUsed: undefined as number | undefined,
        costFunction: undefined as string | undefined,
        accumulatedGeminiCostUsd: 0,
      };

      // Create flush callback that will be passed to hooks
      const flushAssistantBuffer = async (): Promise<void> => {
        if (bufferState.assistantMessageBuffer.trim()) {
          await this.persistAssistantMessageBuffer(
            bufferState.assistantMessageBuffer,
            sessionState.prototypeChatSessionId!,
            bufferState.creditsUsed,
            bufferState.costFunction,
          );
          // Clear buffer after persisting
          bufferState.assistantMessageBuffer = "";
        }
      };

      // Setup query options
      const queryOptions = await this.setupQueryOptions(
        options,
        abortController,
        socket,
        activeConnections,
        sessionState,
        flushAssistantBuffer,
        framework,
        context.getRelativePath,
        systemPrompt,
        sessionState.prototypeChatSessionId,
        data.visible_screens,
        !!this.devServerService.sourceRepository,
        // Callback to accumulate Gemini design tool costs
        (costUsd: number) => {
          bufferState.accumulatedGeminiCostUsd += costUsd;
        },
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
        baseLogger.warn(
          "Invalid session ID detected - requesting history from client",
          {
            providedSessionId: ai_chat_session_id,
            validSessionCount: validAiChatSessionIds.size,
          },
        );

        baseLogger.debug("Sending HISTORY_REQUEST to client", {
          providedSessionId: ai_chat_session_id,
          validSessionIds: Array.from(validAiChatSessionIds),
          requestedMessageCount: HISTORY_MESSAGE_REQUEST_COUNT,
        });

        this.sendMessage(socket, {
          type: ChatEvent.HISTORY_REQUEST,
          data: {
            message:
              "Session invalid - please provide recent conversation history",
            requested_message_count: HISTORY_MESSAGE_REQUEST_COUNT,
            original_query: data,
          },
        });
        return { totalCostUsd: undefined, geminiCostUsd: 0 };
      }

      if (isValidSessionId) {
        queryOptions.resume = ai_chat_session_id;
      }

      baseLogger.consoleLogDevOnly("info", "Querying Claude Agent SDK", {
        hasResume: !!queryOptions.resume,
        resumeSessionId: queryOptions.resume,
        providedSessionId: ai_chat_session_id,
        isValidSessionId,
        internalSessionId: sessionState.sessionId,
        model: queryOptions.model,
        cwd: WORK_DIR,
      });

      // Execute query and stream responses
      // Respect user's explicit preference, fall back to auto-detect
      const useOAuth =
        (data.use_oauth_token ?? context.isUsingOAuthToken) &&
        context.isUsingOAuthToken;

      const streamContext: StreamContext = {
        messageContent,
        queryOptions,
        sessionState,
        validAiChatSessionIds,
        socket,
        activeConnections,
        bufferState,
        isUsingOAuthToken: useOAuth,
        queryData: data,
      };
      const { totalCostUsd, geminiCostUsd } = await this.streamQueryResponse(
        streamContext,
        sessionState.prototypeChatSessionId,
      );

      // Images were already uploaded before persisting the user message
      // No need to upload them again here

      // Clear abort controller
      sessionState.abortController = null;

      // Send completion message
      broadcastToConnections(
        activeConnections,
        {
          type: ChatEvent.QUERY_COMPLETE,
          data: {
            sessionId: sessionState.sessionId,
          },
        },
        baseLogger,
      );

      return { totalCostUsd, geminiCostUsd };
    } catch (error) {
      // Clear the abort controller on error
      sessionState.abortController = null;

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Claude Code query failed",
        { prototypeId },
      );

      // Persist error to database
      await persistChatMessage(
        this.supabaseClientService,
        sessionState.prototypeChatSessionId,
        "system",
        `Error: ${errorMessage}`,
        "error",
        "query_error",
        {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      broadcastToConnections(
        activeConnections,
        {
          type: ChatEvent.ERROR,
          error: {
            message: "Query failed",
            details: errorMessage,
          },
        },
        baseLogger,
      );

      return { totalCostUsd: undefined, geminiCostUsd: 0 };
    }
  }

  /**
   * Prepares message content supporting both text and image blocks
   */
  private prepareMessageContent(
    prompt: string | undefined,
    content: ChatContentBlock[] | undefined,
  ): string | Array<{ type: string; text?: string; source?: unknown }> {
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
      | Array<{ type: string; text?: string; source?: unknown }>,
  ): Array<{ base64: string; mediaType: string }> {
    if (!Array.isArray(messageContent)) {
      return [];
    }

    return messageContent
      .filter((block) => block.type === "image")
      .map((block) => ({
        base64: (block.source as { data: string }).data,
        mediaType: (block.source as { media_type: string }).media_type,
      }));
  }

  /**
   * Persists user message to database with image metadata if present
   */
  private async persistUserMessage(
    messageContent:
      | string
      | Array<{ type: string; text?: string; source?: unknown }>,
    imagesFromContent: Array<{ base64: string; mediaType: string }>,
    imageMetadata: Array<{
      storage_path: string;
      media_type: string;
      name?: string;
    }>,
    prototypeChatSessionId: string,
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
      ? `${userMessageText} [with ${imagesFromContent.length} image${
          imagesFromContent.length > 1 ? "s" : ""
        }]`
      : userMessageText;

    // Include image metadata in event_data if images were uploaded
    const eventData =
      imageMetadata.length > 0 ? { images: imageMetadata } : null;

    await persistChatMessage(
      this.supabaseClientService,
      prototypeChatSessionId,
      "user",
      userMessageDisplay,
      "text",
      null,
      eventData,
    );
  }

  /**
   * Sets up query options including hooks and MCP servers
   */
  private async setupQueryOptions(
    options: Options,
    abortController: AbortController,
    socket: WebSocket,
    activeConnections: Map<string, ChatConnection>,
    sessionState: ChatEngineSessionState,
    flushAssistantBuffer: () => Promise<void>,
    framework: Database["public"]["Enums"]["prototype_framework"],
    relativePathResolver: (path: string) => string,
    systemPromptOverride: string,
    prototypeChatSessionId: string,
    visibleScreens?: Array<{ id: number; path: string }>,
    hasSourceRepository: boolean = false,
    onGeminiUsage?: (costUsd: number) => void,
  ): Promise<Options & { resume?: string }> {
    const canUseTool: CanUseTool = async (
      toolName: ToolName,
      input: ToolInput,
      _options: unknown,
    ): Promise<PermissionResult> => {
      // Handle AskUserQuestion specially - requires user interaction
      if (toolName === "AskUserQuestion") {
        return await this.handleAskUserQuestionTool(
          socket,
          activeConnections,
          input,
          prototypeChatSessionId,
        );
      }

      // All other tools use static permission evaluation
      return evaluateToolPermission(ALLOWED_ROOTS, toolName, input);
    };

    const allowedToolsDefault = [
      "Read",
      "Edit",
      "Glob",
      "Grep",
      "WebSearch",
      "WebFetch",
      "TodoWrite",
      "Skill",
      "AskUserQuestion",
      // MCP tools from devtools server
      "mcp__devtools__SafeWrite",
      "mcp__devtools__SafeBash",
      "mcp__devtools__checkTerminal",
      "mcp__devtools__RestartDevServer",
      // MCP tools from design server
      "mcp__design__GeminiDesignExpert",
      "mcp__design__GenerateImage",
    ];

    // Add UpdatePreviewScreens tool if multi-screen is enabled (visibleScreens provided)
    if (visibleScreens) {
      allowedToolsDefault.push("mcp__devtools__UpdatePreviewScreens");
    }

    const mcpServers: Record<string, McpSdkServerConfigWithInstance> = {
      devtools: createDevelopmentToolsMcpServer(
        async (command: string, args: string[], cwd?: string) => {
          const executeSandboxCommandResult = await this.executeSandboxCommand(
            command,
            args,
            cwd,
          );
          return executeSandboxCommandResult;
        },
        async (filePath: string, content: string) => {
          const writeFileResult = await this.handleMcpWriteFile(
            filePath,
            content,
          );
          baseLogger.consoleLogDevOnly(
            "info",
            "MCP writeFile tool: write file result:",
            {
              filePath,
              content,
            },
          );
          return writeFileResult;
        },
        this.terminalService,
        async () => {
          baseLogger.consoleLogDevOnly(
            "info",
            "MCP restartDevServer tool: restarting dev server",
          );
          this.devServerService.developmentServerState.devServerStatus =
            DevServerStatus.RESTARTING;
          await this.devServerService.developmentServerAdapter.restartDevServer(
            baseLogger,
          );
          this.devServerService.developmentServerState.devServerStatus =
            DevServerStatus.RUNNING;
        },
        // Screen update broadcast callback (only enabled if visibleScreens is provided)
        visibleScreens
          ? (data: ScreenUpdateData): void => {
              broadcastToConnections(activeConnections, {
                type: ChatEvent.SCREEN_UPDATE,
                data,
              });
            }
          : undefined,
        // Get visible screens count callback
        visibleScreens ? (): number => visibleScreens.length : undefined,
      ),
      design: createDesignToolsMcpServer(
        baseLogger,
        undefined,
        onGeminiUsage,
        WORK_DIR,
      ),
    };

    const agentConfigs: Record<
      string,
      { description: string; prompt: string; tools: string[] }
    > = {};

    if (hasSourceRepository) {
      const sourceAgentTools = [
        "Read",
        "Glob",
        "Grep",
        "TodoWrite",
        "mcp__devtools__SafeBash",
        "mcp__devtools__SafeWrite",
      ];
      agentConfigs["source-screen-extractor"] = {
        description:
          "Specialist that finds an existing screen in /tmp/source-repository, copies it plus dependencies into /tmp/materialize-dev-server/client, mocks backend calls, and runs npx tsc to ensure the sandbox builds.",
        prompt: getSourceRepositoryScreenExtractorPrompt(framework),
        tools: sourceAgentTools,
      };
      agentConfigs["source-theme-syncer"] = {
        description:
          "Theme and token expert that compares the sandbox theme files with the source repo tokens and rewrites sandbox theme files to match exactly.",
        prompt: getSourceRepositoryThemeSyncPrompt(framework),
        tools: sourceAgentTools,
      };
      agentConfigs["source-component-harvester"] = {
        description:
          "Component cataloger who searches the source repo for reusable UI components, copies them into the sandbox, and documents what is now available for the main agent.",
        prompt: getSourceRepositoryComponentHarvesterPrompt(framework),
        tools: sourceAgentTools,
      };
    }

    const agents =
      Object.keys(agentConfigs).length > 0 ? agentConfigs : undefined;

    return {
      ...options,
      agents,
      includePartialMessages: false,
      cwd: WORK_DIR,
      maxTurns: options?.maxTurns ?? 50,
      disallowedTools: ["Write", "Bash"],
      allowedTools: options?.allowedTools ?? allowedToolsDefault,
      // model: options?.model ?? "claude-sonnet-4-5",
      systemPrompt: {
        type: "preset" as const,
        preset: "claude_code" as const,
        append:
          systemPromptOverride ??
          getSystemPromptForDesignStyle(undefined, framework, visibleScreens),
      },
      settingSources: [
        "project", // For Project CLAUDE.MD
        "user", // For skills
      ] as SettingSource[],
      permissionMode: "default" as PermissionMode,
      abortController,
      canUseTool,
      // Add MCP servers with development tools
      mcpServers,
      // Add hooks to stream tool usage to WebSocket clients
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (
                input: HookInput,
                toolUseID: string | undefined,
                _options: { signal: AbortSignal },
              ): Promise<HookJSONOutput> => {
                const hookContext: HookContext = {
                  input,
                  toolUseID,
                  socket,
                  activeConnections,
                  flushAssistantBuffer,
                  getRelativePath: relativePathResolver,
                };
                return this.handlePreToolUseHook(
                  hookContext,
                  prototypeChatSessionId,
                );
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
                _options: { signal: AbortSignal },
              ): Promise<HookJSONOutput> => {
                const hookContext: HookContext = {
                  input,
                  toolUseID,
                  socket,
                  activeConnections,
                  sessionState,
                  getRelativePath: relativePathResolver,
                };
                return this.handlePostToolUseHook(
                  hookContext,
                  prototypeChatSessionId,
                );
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
    cwd?: string,
  ): Promise<{ stdout: string; isError: boolean }> {
    try {
      // Normalize cwd - if it doesn't start with WORK_DIR, treat it as relative
      let normalizedCwd = WORK_DIR;
      if (cwd) {
        if (cwd.startsWith(WORK_DIR)) {
          // Already absolute path starting with WORK_DIR
          normalizedCwd = cwd;
        } else {
          // Relative path - prepend WORK_DIR
          normalizedCwd = path.join(WORK_DIR, cwd);
        }
      }
      const { response: responseRaw } =
        await this.sandboxService.runCommandInternal({
          command,
          args,
          cwd: normalizedCwd,
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
        baseLogger.warn(
          "Terminal command timed out in MCP executeSandboxCommand tool",
          {
            command,
            args,
            cwd: normalizedCwd,
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
      baseLogger.error(
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
      const resolvedPath = path.resolve(WORK_DIR, filePath);
      const relativePath = path.relative(WORK_DIR, path.dirname(resolvedPath));
      const filename = path.basename(resolvedPath);

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
      baseLogger.error(
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
   * Handles AskUserQuestion tool by sending questions to frontend and awaiting responses.
   *
   * The SDK input format is:
   * {
   *   questions: Array<{
   *     question: string;
   *     header: string;
   *     options: Array<{ label: string; description: string }>;
   *     multiSelect: boolean;
   *   }>;
   * }
   *
   * We process questions sequentially, showing one modal at a time.
   * The SDK expects answers as: { answers: Record<string, string> }
   * where key = question text, value = selected label(s) joined with ", "
   */
  private async handleAskUserQuestionTool(
    socket: WebSocket,
    activeConnections: Map<string, ChatConnection>,
    input: ToolInput,
    prototypeChatSessionId: string,
  ): Promise<PermissionResult> {
    try {
      // Extract questions from SDK input
      const questions = (input as { questions?: unknown[] }).questions;

      if (!Array.isArray(questions) || questions.length === 0) {
        baseLogger.warn("AskUserQuestion called with no questions", { input });
        return {
          behavior: "deny" as const,
          message: "AskUserQuestion requires at least one question",
          interrupt: true,
        };
      }

      // Validate questions array (1-4 questions)
      if (questions.length > 4) {
        baseLogger.warn("AskUserQuestion called with too many questions", {
          count: questions.length,
        });
        return {
          behavior: "deny" as const,
          message: "AskUserQuestion supports maximum 4 questions",
          interrupt: true,
        };
      }

      // Validate each question structure
      for (const q of questions) {
        if (!q || typeof q !== "object") {
          return {
            behavior: "deny" as const,
            message: "Invalid question format",
            interrupt: true,
          };
        }

        const question = q as {
          question?: string;
          header?: string;
          options?: unknown[];
          multiSelect?: boolean;
        };

        if (!question.question || typeof question.question !== "string") {
          return {
            behavior: "deny" as const,
            message: "Each question must have a 'question' string field",
            interrupt: true,
          };
        }

        if (!question.header || typeof question.header !== "string") {
          return {
            behavior: "deny" as const,
            message: "Each question must have a 'header' string field",
            interrupt: true,
          };
        }

        if (
          !Array.isArray(question.options) ||
          question.options.length < 2 ||
          question.options.length > 4
        ) {
          return {
            behavior: "deny" as const,
            message: "Each question must have 2-4 options",
            interrupt: true,
          };
        }
      }

      // Process questions sequentially
      const allAnswers: Record<string, string> = {};

      for (const q of questions) {
        const question = q as {
          question: string;
          header: string;
          options: Array<{ label: string; description: string }>;
          multiSelect?: boolean;
        };

        const questionId = `question-${Date.now()}-${Math.random()}`;

        // Create promise for answer
        const answerPromise = new Promise<string>((resolve, reject) => {
          this.pendingQuestions.set(questionId, { resolve, reject });

          // Timeout after 5 minutes
          setTimeout(() => {
            if (this.pendingQuestions.has(questionId)) {
              this.pendingQuestions.delete(questionId);
              reject(new Error("User question timed out after 5 minutes"));
            }
          }, 300000);
        });

        // Persist question to database before sending to frontend
        await persistChatMessage(
          this.supabaseClientService,
          prototypeChatSessionId,
          "system",
          question.question,
          "user_question",
          null,
          {
            question_id: questionId,
            header: question.header,
            options: question.options,
            multiSelect: question.multiSelect ?? false,
          },
        );

        // Send question to frontend
        baseLogger.consoleLogDevOnly("info", "Sending question to frontend", {
          questionId,
          question: question.question,
          optionCount: question.options.length,
        });

        broadcastToConnections(
          activeConnections,
          {
            type: ChatEvent.USER_QUESTION_REQUEST,
            data: {
              question_id: questionId,
              question: question.question,
              header: question.header,
              options: question.options,
              multiSelect: question.multiSelect ?? false,
            },
          },
          baseLogger,
        );

        // Wait for answer
        try {
          const answer = await answerPromise;
          allAnswers[question.question] = answer;

          baseLogger.consoleLogDevOnly("info", "Received answer for question", {
            questionId,
            answerLength: answer.length,
          });
        } catch (error) {
          baseLogger.error(
            error instanceof Error ? error : new Error(String(error)),
            "Failed to get answer for question",
            { questionId },
          );
          return {
            behavior: "deny" as const,
            message:
              error instanceof Error
                ? error.message
                : "Question was not answered",
            interrupt: true,
          };
        }
      }

      // Return success with answers in SDK format
      baseLogger.consoleLogDevOnly(
        "info",
        "All questions answered successfully",
        {
          questionCount: questions.length,
          answerKeys: Object.keys(allAnswers),
        },
      );

      return {
        behavior: "allow" as const,
        updatedInput: {
          ...input,
          answers: allAnswers,
        },
      };
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Error handling AskUserQuestion tool",
      );
      return {
        behavior: "deny" as const,
        message: "Failed to process user question",
        interrupt: true,
      };
    }
  }

  /**
   * Resolves a pending user question with the provided answer.
   * Called by ChatService when USER_QUESTION_RESPONSE is received.
   */
  public resolveUserQuestion(questionId: string, answer: string): void {
    const pending = this.pendingQuestions.get(questionId);
    if (pending) {
      pending.resolve(answer);
      this.pendingQuestions.delete(questionId);
      baseLogger.consoleLogDevOnly("info", "Resolved user question", {
        questionId,
        answerLength: answer.length,
      });
    } else {
      baseLogger.warn("Attempted to resolve unknown question", { questionId });
    }
  }

  /**
   * Handles PreToolUse hook
   */
  private async handlePreToolUseHook(
    hookContext: HookContext,
    prototypeChatSessionId: string,
  ): Promise<HookJSONOutput> {
    const { input, toolUseID, activeConnections, flushAssistantBuffer } =
      hookContext;

    try {
      if (input.hook_event_name === "PreToolUse") {
        baseLogger.debug(
          `PreToolUse Hook called for tool ${input.tool_name} with args: ${JSON.stringify(
            input.tool_input,
          )}`,
        );
        const permission = evaluateToolPermission(
          ALLOWED_ROOTS,
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

        // Flush any accumulated assistant message buffer BEFORE persisting tool
        if (flushAssistantBuffer) {
          await flushAssistantBuffer();
        }

        // Send tool start event to WebSocket client
        broadcastToConnections(
          activeConnections,
          {
            type: ChatEvent.TOOL_START,
            data: {
              tool_name: input.tool_name,
              tool_input: normalizedToolInput,
              tool_call_id: toolUseID,
            },
          },
          baseLogger,
        );

        // Persist tool start to database with friendly display name
        const displayName = getToolDisplayName(
          input.tool_name,
          normalizedToolInput as ToolInput,
        );
        await persistChatMessage(
          this.supabaseClientService,
          prototypeChatSessionId,
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
      baseLogger.error(
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
    prototypeChatSessionId: string,
  ): Promise<HookJSONOutput> {
    const { input, toolUseID, activeConnections } = hookContext;

    try {
      baseLogger.consoleLogDevOnly("debug", JSON.stringify(input));

      if (input.hook_event_name === "PostToolUse") {
        // Send tool complete event to WebSocket client
        broadcastToConnections(
          activeConnections,
          {
            type: ChatEvent.TOOL_COMPLETE,
            data: {
              tool_name: input.tool_name,
              tool_input: input.tool_input as Record<string, unknown>,
              tool_response: input.tool_response,
              tool_call_id: toolUseID,
            },
          },
          baseLogger,
        );

        // Persist tool completion to database
        await persistChatMessage(
          this.supabaseClientService,
          prototypeChatSessionId,
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
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "PostToolUse hook error",
      );
    }
    return { continue: true };
  }

  /**
   * Persists accumulated assistant message buffer if it contains content
   */
  private async persistAssistantMessageBuffer(
    buffer: string,
    prototypeChatSessionId: string,
    creditsUsed?: number,
    costFunction?: string,
  ): Promise<boolean> {
    const trimmedBuffer = buffer.trim();
    if (!trimmedBuffer) {
      return false;
    }

    await persistChatMessage(
      this.supabaseClientService,
      prototypeChatSessionId,
      "assistant",
      trimmedBuffer,
      "text",
      null,
      null,
      creditsUsed ?? null,
      costFunction ?? null,
    );

    return true;
  }

  /**
   * Streams query response and handles session updates
   */
  private async streamQueryResponse(
    streamContext: StreamContext,
    prototypeChatSessionId: string,
  ): Promise<{ totalCostUsd: number | undefined; geminiCostUsd: number }> {
    const {
      messageContent,
      queryOptions,
      sessionState,
      validAiChatSessionIds,
      activeConnections,
      bufferState,
    } = streamContext;

    // Shared state for MCP stream fix - allows generator to monitor for result message
    const messages: Array<{ type: string; [key: string]: unknown }> = [];

    // Create async generator for streaming input
    const generateMessages = async function* (): AsyncGenerator<{
      type: "user";
      message: {
        role: "user";
        content:
          | string
          | Array<{ type: string; text?: string; source?: unknown }>;
      };
    }> {
      // Design spec is now written to CLAUDE.md and automatically read by Claude Code SDK
      // No need to inject it into the message stream

      yield {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: messageContent,
        },
      };

      // MCP stream fix: Keep input stream open until result message arrives
      // This prevents premature MCP server connection closure during multi-turn conversations
      if (ChatQueryHandler.ENABLE_MCP_STREAM_FIX) {
        const maxChecks =
          ChatQueryHandler.MCP_STREAM_MAX_WAIT_MS /
          ChatQueryHandler.MCP_STREAM_POLL_INTERVAL_MS;

        for (let i = 0; i < maxChecks; i++) {
          // Check if query was aborted
          if (queryOptions.abortController?.signal.aborted) {
            break;
          }

          await new Promise((resolve) =>
            setTimeout(resolve, ChatQueryHandler.MCP_STREAM_POLL_INTERVAL_MS),
          );

          // Check if result message has arrived
          if (messages.some((m) => m.type === "result")) {
            break;
          }
        }
      }
    }.bind(this);

    // Stream responses back to client
    const response = query({
      prompt: generateMessages() as AsyncIterable<SDKUserMessage>,
      options: queryOptions,
    });

    // Token usage tracking
    let tokenUsageLogged = false;
    let totalCostUsd: number | undefined = undefined;

    for await (const msg of response) {
      // Push to shared array for MCP stream fix monitoring
      if (ChatQueryHandler.ENABLE_MCP_STREAM_FIX) {
        messages.push(msg);
      }
      // Capture session ID from init message
      if (msg.type === "system" && msg.subtype === "init") {
        const isNewSession = sessionState.sessionId !== msg.session_id;
        const previousSessionId = sessionState.sessionId;

        sessionState.sessionId = msg.session_id;

        // Add this session ID to our set of valid session IDs
        validAiChatSessionIds.add(msg.session_id);

        baseLogger.consoleLogDevOnly(
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
              baseLogger.error(
                error,
                "Failed to update session_id in prototype_chat_sessions",
                {
                  chatSessionId: sessionState.prototypeChatSessionId,
                  claudeSessionId: msg.session_id,
                },
              );
            } else {
              baseLogger.consoleLogDevOnly(
                "info",
                "Updated prototype_chat_sessions with new Claude session_id",
                {
                  chatSessionId: sessionState.prototypeChatSessionId,
                  claudeSessionId: msg.session_id,
                },
              );
            }
          } catch (error) {
            baseLogger.error(
              error instanceof Error ? error : new Error(String(error)),
              "Exception while updating session_id in prototype_chat_sessions",
              {
                chatSessionId: sessionState.prototypeChatSessionId,
                claudeSessionId: msg.session_id,
              },
            );
          }
        } else {
          baseLogger.warn(
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
              bufferState.assistantMessageBuffer += content.text;
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
          const cacheReadInputTokens = usage?.cache_read_input_tokens ?? 0;
          const cacheCreationOutputTokens =
            usage?.cache_creation_output_tokens ?? 0;

          // Combine Claude costs with accumulated Gemini design tool costs
          const combinedCostUsd =
            (total_cost_usd ?? 0) + bufferState.accumulatedGeminiCostUsd;

          // Store combined cost for usage tracking in finally block
          totalCostUsd = combinedCostUsd;

          // Log Gemini costs if any were accumulated
          if (bufferState.accumulatedGeminiCostUsd > 0) {
            baseLogger.consoleLogDevOnly(
              "info",
              "Nucleate design tool costs included in total",
              {
                claudeCostUsd: total_cost_usd,
                geminiCostUsd: bufferState.accumulatedGeminiCostUsd,
                combinedCostUsd,
              },
            );
          }

          // Calculate credits used - use OAuth-aware calculation to match USAGE_UPDATE
          // Gemini costs (GeminiDesignExpert, GenerateImage) are ALWAYS charged regardless of auth method
          const geminiCredits =
            costFunctionV3(bufferState.accumulatedGeminiCostUsd) ?? 0;

          if (streamContext.isUsingOAuthToken) {
            // OAuth user: flat fee based on prompt length PLUS Gemini tool costs
            const promptLength = getPromptLengthFromQueryData(
              streamContext.queryData,
            );
            const oauthBaseCredits = calculateOAuthCredits(
              promptLength,
              baseLogger,
            );
            bufferState.creditsUsed = oauthBaseCredits + geminiCredits;
            bufferState.costFunction = OAUTH_COST_FUNCTION_NAME;
          } else {
            // API key user: token-based pricing (using combined cost which includes Gemini)
            bufferState.creditsUsed = costFunctionV3(combinedCostUsd);
            bufferState.costFunction = CURRENT_COST_FUNCTION_NAME;
          }

          baseLogger.metricTokenUsage({
            modelName: queryOptions.model ?? "unknown",
            inputTokens,
            outputTokens,
            cacheReadInputTokens,
            cacheCreationOutputTokens,
            costInUsd: combinedCostUsd,
            durationMs: duration_ms,
            durationApiMs: duration_api_ms,
          });
          tokenUsageLogged = true;
        } catch (logError) {
          baseLogger.error(
            logError instanceof Error ? logError : new Error(String(logError)),
            "Failed to log token usage",
          );
        }
      }

      // Forward message to client
      broadcastToConnections(
        activeConnections,
        {
          type: ChatEvent.AGENT_MESSAGE,
          data: msg,
        },
        baseLogger,
      );
    }

    // Persist any remaining accumulated assistant message if there is any
    // This handles cases where the conversation ends with assistant text (no tools after)
    if (bufferState.assistantMessageBuffer.trim()) {
      await this.persistAssistantMessageBuffer(
        bufferState.assistantMessageBuffer,
        prototypeChatSessionId,
        bufferState.creditsUsed,
        bufferState.costFunction,
      );
    }

    return {
      totalCostUsd,
      geminiCostUsd: bufferState.accumulatedGeminiCostUsd,
    };
  }

  private sendMessage(socket: WebSocket, message: ChatServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        baseLogger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to send WebSocket message",
        );
      }
    }
  }
}
