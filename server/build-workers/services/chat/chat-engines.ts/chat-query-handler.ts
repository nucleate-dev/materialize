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
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import { DevServerStatus } from "../../../types/BuildWorkerTypes.js";
import {
  ChatContentBlock,
  ChatEvent,
  ChatQueryData,
  ChatServerMessage,
} from "../../../types/ChatTypes.js";
import { Database } from "../../../types/supabase.js";
import { NucleateDevelopmentServerService } from "../../dev-server/NucleateDevelopmentServerService.js";
import { FileSyncService } from "../../FileSyncService.js";
import { SandboxService } from "../../SandboxService.js";
import { SupabaseClientService } from "../../SupabaseClientService.js";
import { TerminalService } from "../../terminals/TerminalService.js";
import { getSystemPromptForDesignStyle } from "../prompts/ClaudeCodePrompts.js";
import {
  costFunctionV3,
  CURRENT_COST_FUNCTION_NAME,
} from "../cost/cost-calculation.js";
import { hasRemainingCredits } from "../../../utils/credit-checks.js";
import {
  DEFAULT_DESIGN_AGENT_MODELS,
  executeDesignAgent,
  persistDesignSpecToFiles,
  type DesignAgentProvider,
} from "../classifiers-and-subagents.ts/design-agent-service.js";
import { classifyDesignIntent } from "../classifiers-and-subagents.ts/design-intent-classifier.js";
import { createDesignToolsMcpServer } from "../mcp/mcp-design-tools.js";
import { createDevelopmentToolsMcpServer } from "../mcp/mcp-dev-tools.js";
import { getToolDisplayName } from "../helpers/message-handlers.js";
import { ToolPermissionService } from "../helpers/tool-permission-service.js";
import { trackApiUsageBuildWorker } from "../cost/usage-tracking.js";
import { baseLogger, WORK_DIR } from "../../../worker.js";

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
  firstMessageStatus: { sessionId: string; isFirst: boolean } | null;
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

interface DesignAgentMetadata {
  scope: "app" | "screen" | "component" | "other" | "unknown";
}

interface QueryExecutionContext {
  prototypeId: string;
  socket: WebSocket;
  data: ChatQueryData;
  sessionState: CodeSessionState;
  validAiChatSessionIds: Set<string>;
  logger: SystemLogger;
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
    provider?: string | null,
    model?: string | null,
  ) => Promise<void>;
  uploadChatImages: (
    prototypeId: string,
    chatSessionId: string,
    images: Array<{ base64: string; mediaType: string }>,
  ) => Promise<
    Array<{ storage_path: string; media_type: string; file_size: number }>
  >;
  updatePersistenceClient?: (client: unknown) => void;
  notifyOrchestrationStartChat: (prototypeId: string) => Promise<void>;
  notifyOrchestrationEndChat: (prototypeId: string) => Promise<void>;
}

interface StreamContext {
  messageContent:
    | string
    | Array<{ type: string; text?: string; source?: unknown }>;
  queryOptions: Options & { resume?: string };
  sessionState: CodeSessionState;
  validAiChatSessionIds: Set<string>;
  socket: WebSocket;
  bufferState: {
    assistantMessageBuffer: string;
    creditsUsed: number | undefined;
    costFunction: string | undefined;
  };
}

interface HookContext {
  input: HookInput;
  toolUseID: string | undefined;
  socket: WebSocket;
  sessionState?: CodeSessionState;
  flushAssistantBuffer?: () => Promise<void>;
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
  // Feature flags for MCP stream fix
  // When enabled, keeps the input stream open until the result message arrives
  // to prevent premature MCP server connection closure during multi-turn conversations
  private static readonly ENABLE_MCP_STREAM_FIX = true;
  private static readonly MCP_STREAM_MAX_WAIT_MS = 120000; // 2 minutes (accounting for maxTurns: 50)
  private static readonly MCP_STREAM_POLL_INTERVAL_MS = 100; // Check every 100ms

  private readonly supabaseClientService: SupabaseClientService;
  private readonly fileSyncService: FileSyncService;
  private readonly toolPermissionService: ToolPermissionService;
  private readonly sandboxService: SandboxService;
  private readonly devServerService: NucleateDevelopmentServerService;
  private readonly terminalService: TerminalService;
  private readonly getAak: () => string | null;
  private enableDesignAgentOnFirstMessage: boolean;
  private enableDesignMcpTools: boolean;

  constructor(
    supabaseClientService: SupabaseClientService,
    fileSyncService: FileSyncService,
    toolPermissionService: ToolPermissionService,
    sandboxService: SandboxService,
    devServerService: NucleateDevelopmentServerService,
    terminalService: TerminalService,
    enableDesignAgentOnFirstMessage: boolean,
    enableDesignMcpTools: boolean,
    getAak: () => string | null,
  ) {
    this.supabaseClientService = supabaseClientService;
    this.fileSyncService = fileSyncService;
    this.toolPermissionService = toolPermissionService;
    this.sandboxService = sandboxService;
    this.devServerService = devServerService;
    this.terminalService = terminalService;
    this.getAak = getAak;
    this.enableDesignAgentOnFirstMessage = enableDesignAgentOnFirstMessage;
    this.enableDesignMcpTools = enableDesignMcpTools;
  }

  public setEnableDesignAgentOnFirstMessage(enabled: boolean): void {
    this.enableDesignAgentOnFirstMessage = enabled;
  }

  public setEnableDesignMcpTools(enabled: boolean): void {
    this.enableDesignMcpTools = enabled;
  }

  /**
   * Main entry point for handling a query request
   */
  public async handleQuery(
    context: QueryExecutionContext,
    handlers: MessageHandlers,
  ): Promise<void> {
    const { prototypeId, socket, data, sessionState, logger } = context;
    const { prompt, content, token, ai_chat_session_id, design_style } = data;
    const framework = this.devServerService.prototypeFramework;
    baseLogger.consoleLogDevOnly("info", "framework in handleQuery is: ", {
      framework,
    });

    const options = (data.options ?? {}) as Options;

    // Log incoming parameters
    logger.consoleLogDevOnly("info", "handleQuery received parameters", {
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
        logger,
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
    this.setupSessionState(data, sessionState, logger);

    // Step 4: Load design system if needed
    const designSystemResult = await this.loadDesignSystem(
      logger,
      data.custom_design_system_id ?? null,
      sessionState,
      design_style,
      framework,
      data.current_viewing_path,
      options,
    );

    // Step 5: Perform credit check
    const creditCheck = await this.performCreditCheck(prototypeId, logger);
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

    // Step 6: Check if this is the first message and execute design agent if needed
    let designAgentCost: number | undefined = undefined;
    let designSpec: string | null = null;
    let designMetadata: DesignAgentMetadata | null = null;

    const canAttemptClassification =
      this.enableDesignAgentOnFirstMessage &&
      !!sessionState.prototypeChatSessionId;

    if (!canAttemptClassification) {
      logger.consoleLogDevOnly(
        "info",
        "Skipping design intent classification gate",
        {
          prototypeId,
          enableDesignAgentOnFirstMessage: this.enableDesignAgentOnFirstMessage,
          hasPrototypeChatSessionId: !!sessionState.prototypeChatSessionId,
        },
      );
    }

    if (canAttemptClassification) {
      const isFirst = await this.isFirstMessage(
        prototypeId,
        sessionState.prototypeChatSessionId ?? "",
        sessionState,
        logger,
      );

      if (isFirst) {
        logger.debug("Preparing to classify user intent", {
          prototypeId,
          enableDesignAgentOnFirstMessage: this.enableDesignAgentOnFirstMessage,
          hasSession: !!sessionState.prototypeChatSessionId,
          willClassify: true,
        });

        // Extract user message text for design agent
        const userMessageText =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content
                  .filter((block) => block.type === "text")
                  .map((block) => block.text || "")
                  .join("\n")
              : prompt || "";

        if (userMessageText) {
          // Create abort controller for classifier and potential design agent
          const classifierAbortController = new AbortController();
          sessionState.abortController = classifierAbortController;

          // Step 6a: Classify the user's intent
          logger.debug("Classifying user intent on first message", {
            prototypeId,
            userMessageLength: userMessageText.length,
          });

          const classificationResult = await classifyDesignIntent({
            userMessage: userMessageText,
            abortController: classifierAbortController,
            logger: logger,
            prototypeId,
          });

          const classifierCost = classificationResult.costUsd;
          const shouldRunDesignAgent =
            classificationResult.intent === "design_mode";

          logger.debug("User intent classified", {
            prototypeId,
            intent: classificationResult.intent,
            classifierCost,
          });

          logger.debug("Design agent routing decision", {
            prototypeId,
            shouldRunDesignAgent,
            intent: classificationResult.intent,
          });

          // Step 6b: Only run design agent if user wants a design mode
          if (shouldRunDesignAgent) {
            // Send design generation started message to client
            handlers.sendMessage(socket, {
              type: ChatEvent.DESIGN_GENERATION,
              data: {
                status: "started",
                message: "Generating design specification...",
                runDesignAgent: true,
              },
            });

            logger.debug("Calling design agent", {
              prototypeId,
              userMessageLength: userMessageText.length,
              hasAbortController: !!classifierAbortController,
            });

            const designResult = await this.executeDesignAgentWrapper(
              prototypeId,
              userMessageText,
              classifierAbortController,
              logger,
              "", // system prompt not used anymore (handled by design-agent-service)
            );

            logger.debug("Design agent returned", {
              prototypeId,
              hasDesignSpec: !!designResult.designSpec,
              designSpecLength: designResult.designSpec?.length,
              costUsd: designResult.costUsd,
            });

            // Add classifier cost to design agent cost
            designAgentCost =
              (designResult.costUsd ?? 0) + (classifierCost ?? 0);

            if (designResult.designSpec) {
              const { spec, metadata } = this.parseDesignAgentSpec(
                designResult.designSpec,
              );
              designSpec = spec;
              designMetadata = metadata;

              // Always persist design spec to CLAUDE.md and project_context for now
              await persistDesignSpecToFiles(
                WORK_DIR,
                designSpec,
                logger,
                prototypeId,
              );

              // Also store in database for backup/reference
              const { error: updateError } = await this.supabaseClientService
                .getClient()
                .from("prototypes")
                .update({ project_context: designSpec })
                .eq("id", prototypeId);

              if (updateError) {
                logger.error(
                  updateError,
                  "Failed to store design specification in project_context",
                  { prototypeId },
                );
              } else {
                logger.consoleLogDevOnly(
                  "info",
                  "Stored design specification in project_context database",
                  { prototypeId, specLength: designSpec.length },
                );
              }
            }

            logger.consoleLogDevOnly(
              "info",
              "Design agent execution completed",
              {
                prototypeId,
                hasDesignSpec: !!designSpec,
                designAgentCost,
                metadata: designMetadata,
              },
            );
          } else {
            // User wants standard mode - skip design agent, just track classifier cost
            designAgentCost = classifierCost;
            logger.consoleLogDevOnly(
              "info",
              "Skipping design agent - user wants standard mode",
              {
                prototypeId,
                intent: classificationResult.intent,
                classifierCost,
              },
            );
          }
        }

        if (sessionState.prototypeChatSessionId) {
          sessionState.firstMessageStatus = {
            sessionId: sessionState.prototypeChatSessionId,
            isFirst: false,
          };
        }
      }
    }

    // Step 7: Invalidate build before chat starts
    this.devServerService.developmentServerState.lastUpdatedTime = new Date();

    // Step 8: Notify orchestration that chat is starting
    await handlers.notifyOrchestrationStartChat(prototypeId);

    // Step 9: Execute query with proper cleanup
    let implementationCostUsd: number | undefined = undefined;

    try {
      implementationCostUsd = await this.executeClaudeQuery(
        context,
        designSystemResult.systemPrompt,
        handlers,
        logger,
        framework,
        designSpec,
        designMetadata ?? undefined,
      );
    } finally {
      // Step 10: Combine costs from design agent and implementation
      const totalCostUsd =
        (designAgentCost ?? 0) + (implementationCostUsd ?? 0);

      logger.consoleLogDevOnly("info", "Combined cost calculation", {
        designAgentCost,
        implementationCostUsd,
        totalCostUsd,
      });

      // Step 11: Sync files and track usage
      await this.syncAndTrackUsage(
        prototypeId,
        socket,
        sessionState,
        totalCostUsd,
        handlers.sendMessage,
        logger,
      );

      // Step 12: Invalidate build after chat ends
      this.devServerService.developmentServerState.lastUpdatedTime = new Date();

      // Step 13: Always notify orchestration that chat has ended
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
    logger: SystemLogger,
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

      logger.consoleLogDevOnly(
        "info",
        "Refreshed Supabase client with JWT token",
        {
          prototypeId,
        },
      );
      return { success: true };
    } catch (error) {
      logger.error(
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
    logger: SystemLogger,
  ): void {
    const { prototype_chat_session_id, ai_chat_session_id } = data;
    const previousPrototypeChatSessionId = sessionState.prototypeChatSessionId;

    // Use the chat_session_id provided by the client for message persistence
    if (prototype_chat_session_id) {
      sessionState.prototypeChatSessionId = prototype_chat_session_id;
      logger.consoleLogDevOnly("info", "Using chat session ID from client", {
        chatSessionId: prototype_chat_session_id,
        claudeCodeSessionId: ai_chat_session_id,
      });
      if (previousPrototypeChatSessionId !== prototype_chat_session_id) {
        sessionState.firstMessageStatus = null;
      }
    } else {
      logger.warn("No chat_session_id provided by client", {
        session_id: ai_chat_session_id,
      });
      sessionState.prototypeChatSessionId = null;
      sessionState.firstMessageStatus = null;
    }

    // If client explicitly passes null session_id, it wants to start a NEW session
    if (ai_chat_session_id === null) {
      logger.consoleLogDevOnly(
        "info",
        "Client requested new session - clearing internal state",
        {
          previousSessionId: sessionState.sessionId,
        },
      );
      sessionState.sessionId = null;
      sessionState.firstMessageStatus = null;
    }
  }

  /**
   * Loads design system and builds system prompt
   */
  private async loadDesignSystem(
    logger: SystemLogger,
    custom_design_system_id: string | null,
    sessionState: CodeSessionState,
    design_style: string | undefined,
    framework: string | undefined,
    _current_viewing_path: string | undefined,
    _options: Options,
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
        logger.consoleLogDevOnly("info", "Design system cleared");
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
            logger.error(error, "Failed to fetch design system", {
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
            logger.warn("Design system not found", {
              designSystemId: custom_design_system_id,
            });
            sessionState.designSystemId = null;
            sessionState.designSystemRules = null;
          }
        } catch (error) {
          logger.error(
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
    let systemPromptAppend = getSystemPromptForDesignStyle(
      design_style,
      framework,
    );
    logger.consoleLogDevOnly("info", "systemprompt: ", { systemPromptAppend });

    logger.consoleLogDevOnly(
      "info",
      "Using design-style-specific system prompt",
      {
        design_style,
        hasCustomDesignSystem: !!sessionState.designSystemRules,
        framework,
      },
    );

    // Append custom design system rules if available
    if (sessionState.designSystemRules) {
      systemPromptAppend +=
        "\n\n## Custom Design System Rules:\n" + sessionState.designSystemRules;
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
  private async performCreditCheck(
    prototypeId: string,
    logger: SystemLogger,
  ): Promise<{
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
        logger.error(
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
        logger,
      );

      if (!creditCheck.hasCredits) {
        logger.warn("User has no remaining credits", {
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
      logger.error(
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
   * Checks if this is the user's first message for the entire prototype
   * Returns true only if:
   * 1. No messages exist in prototype_chat_messages for this session
   * 2. This is the only chat session in prototype_chat_sessions for this prototype
   */
  private async isFirstMessage(
    prototypeId: string,
    prototypeChatSessionId: string,
    sessionState: CodeSessionState,
    logger: SystemLogger,
  ): Promise<boolean> {
    if (!prototypeChatSessionId) {
      return false;
    }

    const cached = sessionState.firstMessageStatus;
    if (cached && cached.sessionId === prototypeChatSessionId) {
      return cached.isFirst;
    }

    try {
      // Check if any messages exist for this chat session
      const { count: messageCount, error: messageError } =
        await this.supabaseClientService
          .getClient()
          .from("prototype_chat_messages")
          .select("*", { count: "exact", head: true })
          .eq("chat_session_id", prototypeChatSessionId);

      if (messageError) {
        logger.error(
          messageError,
          "Failed to check message count for first message detection",
          { prototypeChatSessionId },
        );
        return false;
      }

      // If messages exist, not the first message
      if (messageCount && messageCount > 0) {
        return false;
      }

      // Check if this is the only chat session for this prototype
      const { count: sessionCount, error: sessionError } =
        await this.supabaseClientService
          .getClient()
          .from("prototype_chat_sessions")
          .select("*", { count: "exact", head: true })
          .eq("prototype_id", prototypeId);

      if (sessionError) {
        logger.error(
          sessionError,
          "Failed to check session count for first message detection",
          { prototypeId },
        );
        return false;
      }

      // This is the first message if this is the only session
      const isFirst = sessionCount === 1;

      sessionState.firstMessageStatus = {
        sessionId: prototypeChatSessionId,
        isFirst,
      };

      logger.consoleLogDevOnly("info", "First message detection result", {
        prototypeId,
        prototypeChatSessionId,
        messageCount,
        sessionCount,
        isFirst,
      });

      return isFirst;
    } catch (error) {
      logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Error during first message detection",
        { prototypeId, prototypeChatSessionId },
      );
      return false;
    }
  }

  /**
   * Executes the design agent to generate a comprehensive design specification
   * Only called on the user's first message for a prototype
   * Uses AI SDK for flexible model support (Google, OpenAI)
   * Note: Does NOT persist the message - caller should persist after user message
   */
  private async executeDesignAgentWrapper(
    prototypeId: string,
    userMessage: string,
    abortController: AbortController,
    logger: SystemLogger,
    _systemPrompt: string,
  ): Promise<{ designSpec: string | null; costUsd: number | undefined }> {
    // Use Gemini by default for design agent (fast and free)
    const provider: DesignAgentProvider = "google";
    const model = DEFAULT_DESIGN_AGENT_MODELS[provider];

    logger.consoleLogDevOnly("info", "Executing design agent via AI SDK", {
      prototypeId,
      provider,
      model,
      userMessageLength: userMessage.length,
    });

    return executeDesignAgent({
      provider,
      model,
      userMessage,
      workDir: WORK_DIR,
      abortController,
      logger: logger,
      prototypeId,
    });
  }

  private parseDesignAgentSpec(rawSpec: string): {
    spec: string;
    metadata: DesignAgentMetadata;
  } {
    const defaultMetadata: DesignAgentMetadata = {
      scope: "unknown",
    };

    const metadataHeading = "### METADATA";
    const headingIndex = rawSpec.lastIndexOf(metadataHeading);

    if (headingIndex === -1) {
      return { spec: rawSpec.trim(), metadata: defaultMetadata };
    }

    const specWithoutMetadata = rawSpec.slice(0, headingIndex).trim();
    const metadataSection = rawSpec
      .slice(headingIndex + metadataHeading.length)
      .trim();

    const metadataLines = metadataSection
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const metadata: DesignAgentMetadata = { ...defaultMetadata };

    for (const line of metadataLines) {
      const [rawKey, ...rest] = line.split(":");
      if (!rawKey || rest.length === 0) {
        continue;
      }
      const key = rawKey.trim().toLowerCase();
      const value = rest.join(":").trim().toLowerCase();

      if (key === "scope") {
        if (value === "app") {
          metadata.scope = "app";
        } else if (value === "screen") {
          metadata.scope = "screen";
        } else if (value === "component") {
          metadata.scope = "component";
        } else if (value === "other") {
          metadata.scope = "other";
        }
      }
    }

    return { spec: specWithoutMetadata, metadata };
  }

  /**
   * Executes the Claude query with hooks and streaming
   */
  private async executeClaudeQuery(
    context: QueryExecutionContext,
    systemPromptAppend: string,
    handlers: MessageHandlers,
    logger: SystemLogger,
    framework: Database["public"]["Enums"]["prototype_framework"],
    designSpec?: string | null,
    designMetadata?: DesignAgentMetadata,
  ): Promise<number | undefined> {
    const { prototypeId, socket, data, sessionState, validAiChatSessionIds } =
      context;
    const { prompt, content, ai_chat_session_id } = data;
    const options = (data.options ?? {}) as Options;

    try {
      const metadata: DesignAgentMetadata = designMetadata ?? {
        scope: "unknown",
      };
      const isAppLevel = metadata.scope === "app";
      const isNarrowBuild =
        metadata.scope === "screen" || metadata.scope === "component";
      const shouldRunDesignAgent = !!designSpec;

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

      // Persist design spec as assistant message right after user message (if available)
      if (designSpec) {
        await handlers.persistMessage(
          "assistant",
          designSpec,
          "text",
          "design_generation",
          { prototypeId },
        );

        // Send design generation completed message to client
        handlers.sendMessage(socket, {
          type: ChatEvent.DESIGN_GENERATION,
          data: {
            status: "completed",
            message: "Design specification generated",
            designSpec: designSpec, // Include the actual spec content
            runDesignAgent: shouldRunDesignAgent,
            isAppLevel,
            isNarrowBuild,
            persistToProjectContext: true,
            scope: metadata.scope,
          },
        });

        logger.consoleLogDevOnly(
          "info",
          "Persisted design spec after user message",
          { prototypeId, designSpecLength: designSpec.length },
        );
      }

      // Create shared state for assistant message buffering
      // This allows the flush callback to access and clear the buffer
      const bufferState = {
        assistantMessageBuffer: "",
        creditsUsed: undefined as number | undefined,
        costFunction: undefined as string | undefined,
      };

      // Create flush callback that will be passed to hooks
      const flushAssistantBuffer = async (): Promise<void> => {
        if (bufferState.assistantMessageBuffer.trim()) {
          await this.persistAssistantMessageBuffer(
            bufferState.assistantMessageBuffer,
            handlers.persistMessage,
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
        systemPromptAppend,
        abortController,
        socket,
        sessionState,
        handlers,
        flushAssistantBuffer,
        logger,
        framework,
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
        logger.warn(
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

      logger.consoleLogDevOnly("info", "Querying Claude Agent SDK", {
        hasResume: !!queryOptions.resume,
        resumeSessionId: queryOptions.resume,
        providedSessionId: ai_chat_session_id,
        isValidSessionId,
        internalSessionId: sessionState.sessionId,
        model: queryOptions.model,
        cwd: WORK_DIR,
      });

      // Execute query and stream responses
      const streamContext: StreamContext = {
        messageContent,
        queryOptions,
        sessionState,
        validAiChatSessionIds,
        socket,
        bufferState,
      };
      const totalCostUsd = await this.streamQueryResponse(
        streamContext,
        handlers,
        logger,
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

      logger.error(
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
    flushAssistantBuffer: () => Promise<void>,
    logger: SystemLogger,
    framework: Database["public"]["Enums"]["prototype_framework"],
  ): Promise<Options & { resume?: string }> {
    const canUseTool: CanUseTool = async (
      toolName: ToolName,
      input: ToolInput,
      _options: unknown,
    ): Promise<PermissionResult> => {
      return this.toolPermissionService.evaluateToolPermission(toolName, input);
    };

    // Prepare environment variables
    const env: Record<string, string | undefined> = {};
    const aak = this.getAak();
    logger.consoleLogDevOnly("info", "AAK", {
      exists: !!aak,
      lastFourCharacters: aak?.slice(-4),
    });
    if (aak) {
      env.ANTHROPIC_API_KEY = aak;
    }

    const allowedToolsDefault = [
      "Read",
      "Edit",
      "Glob",
      "Grep",
      "WebSearch",
      "WebFetch",
      "TodoWrite",
      // MCP tools from devtools server
      "mcp__devtools__SafeWrite",
      "mcp__devtools__SafeBash",
      "mcp__devtools__checkTerminal",
      "mcp__devtools__RestartDevServer",
    ];

    if (this.enableDesignMcpTools) {
      allowedToolsDefault.push("mcp__design__GeminiDesignExpert");
    }

    const mcpServers: Record<string, McpSdkServerConfigWithInstance> = {
      devtools: createDevelopmentToolsMcpServer(
        async (command: string, args: string[], cwd?: string) => {
          const executeSandboxCommandResult = await this.executeSandboxCommand(
            logger,
            command,
            args,
            cwd,
          );
          return executeSandboxCommandResult;
        },
        async (filePath: string, content: string) => {
          const writeFileResult = await this.handleMcpWriteFile(
            logger,
            filePath,
            content,
          );
          logger.consoleLogDevOnly(
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
          logger.consoleLogDevOnly(
            "info",
            "MCP restartDevServer tool: restarting dev server",
          );
          this.devServerService.developmentServerState.devServerStatus =
            DevServerStatus.RESTARTING;
          await this.devServerService.developmentServerAdapter.restartDevServer(
            logger,
          );
          this.devServerService.developmentServerState.devServerStatus =
            DevServerStatus.RUNNING;
        },
      ),
    };

    if (this.enableDesignMcpTools) {
      mcpServers.design = createDesignToolsMcpServer(logger);
    }

    return {
      ...options,
      includePartialMessages: false,
      cwd: WORK_DIR,
      maxTurns: options?.maxTurns ?? 50,
      disallowedTools: ["Write", "Bash"],
      allowedTools: options?.allowedTools ?? allowedToolsDefault,
      // model: options?.model ?? "claude-sonnet-4-5",
      systemPrompt: {
        type: "preset" as const,
        preset: "claude_code" as const,
        append: getSystemPromptForDesignStyle(undefined, framework),
      },
      settingSources: ["project"] as SettingSource[],
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
                  flushAssistantBuffer,
                };
                return this.handlePreToolUseHook(hookContext, handlers, logger);
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
                  sessionState,
                };
                return this.handlePostToolUseHook(
                  hookContext,
                  handlers,
                  logger,
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
    logger: SystemLogger,
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
        logger.warn(
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
      logger.error(
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
    logger: SystemLogger,
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
      logger.error(
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
    logger: SystemLogger,
  ): Promise<HookJSONOutput> {
    const { input, toolUseID, socket, flushAssistantBuffer } = hookContext;

    try {
      if (input.hook_event_name === "PreToolUse") {
        logger.debug(
          `PreToolUse Hook called for tool ${input.tool_name} with args: ${JSON.stringify(
            input.tool_input,
          )}`,
        );
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

        // Flush any accumulated assistant message buffer BEFORE persisting tool
        if (flushAssistantBuffer) {
          await flushAssistantBuffer();
        }

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
      logger.error(
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
    logger: SystemLogger,
  ): Promise<HookJSONOutput> {
    const { input, toolUseID, socket, sessionState } = hookContext;

    try {
      logger.consoleLogDevOnly("debug", JSON.stringify(input));

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
      logger.error(
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
    persistMessage: (
      role: "user" | "assistant" | "system",
      content: string,
      messageType: "text" | "tool_use" | "tool_result" | "error" | "system",
      eventType?: string | null,
      eventData?: unknown,
      creditsUsed?: number | null,
      costFunction?: string | null,
    ) => Promise<void>,
    creditsUsed?: number,
    costFunction?: string,
  ): Promise<boolean> {
    const trimmedBuffer = buffer.trim();
    if (!trimmedBuffer) {
      return false;
    }

    await persistMessage(
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
    handlers: MessageHandlers,
    logger: SystemLogger,
  ): Promise<number | undefined> {
    const {
      messageContent,
      queryOptions,
      sessionState,
      validAiChatSessionIds,
      socket,
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
        sessionState.isActive = true;
        if (isNewSession) {
          sessionState.createdAt = Date.now();
        }
        sessionState.lastActiveAt = Date.now();

        // Add this session ID to our set of valid session IDs
        validAiChatSessionIds.add(msg.session_id);

        logger.consoleLogDevOnly("info", "Claude Code session initialized", {
          sessionId: msg.session_id,
          isNewSession,
          previousSessionId,
        });

        // Persist the newly created Claude session ID to the prototype chat session row
        if (sessionState.prototypeChatSessionId) {
          try {
            const { error } = await this.supabaseClientService
              .getClient()
              .from("prototype_chat_sessions")
              .update({ session_id: msg.session_id })
              .eq("id", sessionState.prototypeChatSessionId);

            if (error) {
              logger.error(
                error,
                "Failed to update session_id in prototype_chat_sessions",
                {
                  chatSessionId: sessionState.prototypeChatSessionId,
                  claudeSessionId: msg.session_id,
                },
              );
            } else {
              logger.consoleLogDevOnly(
                "info",
                "Updated prototype_chat_sessions with new Claude session_id",
                {
                  chatSessionId: sessionState.prototypeChatSessionId,
                  claudeSessionId: msg.session_id,
                },
              );
            }
          } catch (error) {
            logger.error(
              error instanceof Error ? error : new Error(String(error)),
              "Exception while updating session_id in prototype_chat_sessions",
              {
                chatSessionId: sessionState.prototypeChatSessionId,
                claudeSessionId: msg.session_id,
              },
            );
          }
        } else {
          logger.warn(
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

          // Store total_cost_usd for usage tracking in finally block
          totalCostUsd = total_cost_usd;

          // Calculate credits used using the shared cost calculation function
          bufferState.creditsUsed = costFunctionV3(total_cost_usd);
          bufferState.costFunction = CURRENT_COST_FUNCTION_NAME;

          logger.metricTokenUsage({
            modelName: queryOptions.model ?? "unknown",
            inputTokens,
            outputTokens,
            cacheReadInputTokens,
            cacheCreationOutputTokens,
            costInUsd: total_cost_usd,
            durationMs: duration_ms,
            durationApiMs: duration_api_ms,
          });
          tokenUsageLogged = true;
        } catch (logError) {
          logger.error(
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

    // Persist any remaining accumulated assistant message if there is any
    // This handles cases where the conversation ends with assistant text (no tools after)
    if (bufferState.assistantMessageBuffer.trim()) {
      await this.persistAssistantMessageBuffer(
        bufferState.assistantMessageBuffer,
        handlers.persistMessage,
        bufferState.creditsUsed,
        bufferState.costFunction,
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
    logger: SystemLogger,
  ): Promise<void> {
    // Sync file changes to Supabase
    try {
      logger.consoleLogDevOnly(
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
        logger.consoleLogDevOnly("info", "File sync completed successfully", {
          prototypeId,
          filesUpdated: syncResult.filesUpdated,
          filesDeleted: syncResult.filesDeleted,
          assetsUpdated: syncResult.assetsUpdated,
          assetsDeleted: syncResult.assetsDeleted,
        });
      } else {
        logger.error(
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
      logger.error(
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
        logger.error(
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
        logger.warn("Unable to track API usage - no authenticated user", {
          prototypeId,
          error: userError,
        });
      } else {
        // Calculate credits used using the shared cost calculation function
        const creditsUsed = costFunctionV3(totalCostUsd) ?? 1.0;

        logger.consoleLogDevOnly("info", "Tracking API usage", {
          userId: user.id,
          prototypeId,
          totalCostUsd,
          creditsUsed,
        });

        const { totalRemainingCredits } = await trackApiUsageBuildWorker(
          this.supabaseClientService.getClient(),
          user.id,
          prototypeId,
          logger,
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

        logger.consoleLogDevOnly("info", "API usage tracked successfully", {
          userId: user.id,
          prototypeId,
          totalCostUsd,
          creditsUsed,
          totalRemainingCredits,
        });
      }
    } catch (usageError) {
      logger.error(
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
    if (absolutePath.startsWith(WORK_DIR)) {
      return absolutePath.slice(WORK_DIR.length + 1);
    }
    return absolutePath;
  }
}
