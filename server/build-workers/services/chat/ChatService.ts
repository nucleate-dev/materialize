import { Options } from "@anthropic-ai/claude-agent-sdk";
import type { UserContent } from "ai";
import { FastifyInstance, FastifyRequest } from "fastify";
import path from "path";
import WebSocket from "ws";
import { baseLogger, posthog } from "../../loggers/index.js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import {
  ChatClientEvent,
  ChatClientMessage,
  ChatEvent,
  ChatQueryData,
  ChatServerMessage,
  ChatSystemEventSubtype,
  HistoryResponseData,
} from "../../types/ChatTypes.js";
import { Database } from "../../types/supabase.js";
import { hasRemainingCredits } from "../../utils/credit-checks.js";
import { getWorkerContext, WORK_DIR } from "../../worker.js";
import { ClaudeTokenService } from "../auth/claude-token-service.js";
import { NucleateDevelopmentServerService } from "../dev-server/NucleateDevelopmentServerService.js";
import { FileSyncService } from "../FileSyncService.js";
import { SandboxService } from "../SandboxService.js";
import { SandboxOrchestrationInitiatorService } from "../SandboxOrchestrationInitiatorService.js";
import { SupabaseClientService } from "../SupabaseClientService.js";
import { TerminalService } from "../terminals/TerminalService.js";
import {
  ChatConnection,
  ChatEngine,
  ChatEngineResult,
  ChatEngineSessionState,
  DesignAgentMetadata,
} from "./chat-engines/chat-engine.js";
import { ChatQueryHandler } from "./chat-engines/chat-query-handler.js";
import {
  DEFAULT_DESIGN_AGENT_MODELS,
  type DesignAgentProvider,
  executeDesignAgent,
  persistDesignSpecToFiles,
} from "./classifiers-and-subagents/design-agent-service.js";
import { buildDesignAgentUserContent } from "./classifiers-and-subagents/design-classifier-utils.js";
import { classifyDesignIntent } from "./classifiers-and-subagents/design-intent-classifier.js";
import {
  costFunctionV3,
  CURRENT_COST_FUNCTION_NAME,
} from "./cost/cost-calculation.js";
import {
  calculateOAuthCredits,
  getPromptLengthFromQueryData,
  OAUTH_COST_FUNCTION_NAME,
} from "./cost/oauth-credit-calculation.js";
import { trackApiUsageBuildWorker } from "./cost/usage-tracking.js";
import { persistChatMessage } from "./helpers/message-handlers.js";
import { getSystemPromptForDesignStyle } from "./prompts/ClaudeCodePrompts.js";
import { broadcastToConnections } from "./websocket-broadcast.js";

export const ALLOWED_ROOT = "/tmp/materialize-dev-server";
const CHAT_HEARTBEAT_INTERVAL_MS = 15000;

interface ChatQueryValidationResult {
  valid: boolean;
  errorMessage?: string;
  errorDetails?: string;
}

export class ChatService {
  private readonly supabaseClientService: SupabaseClientService;
  private readonly sandboxService: SandboxService;
  private readonly devServerService: NucleateDevelopmentServerService;
  private readonly fileSyncService: FileSyncService;
  private readonly sandboxOrchestrationInitiatorService: SandboxOrchestrationInitiatorService;

  private readonly chatQueryHandler: ChatEngine;
  private readonly claudeTokenService: ClaudeTokenService;
  private sessionState: ChatEngineSessionState = {
    sessionId: null,
    prototypeChatSessionId: null,
    abortController: null,
    designSystemId: null,
    designSystemRules: null,
    firstMessageStatus: null,
  };
  private activeConnections = new Map<string, ChatConnection>();
  private aak: string | null = null;
  private userOAuthToken: string | null = null; // User's Claude subscription OAuth token
  private validAiChatSessionIds = new Set<string>(); // Track valid session IDs created during this CodeService instance's lifetime

  constructor(
    supabaseClientService: SupabaseClientService,
    sandboxService: SandboxService,
    devServerService: NucleateDevelopmentServerService,
    terminalService: TerminalService,
    fileSyncService: FileSyncService,
    sandboxOrchestrationInitiatorService: SandboxOrchestrationInitiatorService,
  ) {
    this.supabaseClientService = supabaseClientService;
    this.fileSyncService = fileSyncService;
    this.sandboxService = sandboxService;
    this.devServerService = devServerService;
    this.sandboxOrchestrationInitiatorService =
      sandboxOrchestrationInitiatorService;

    this.chatQueryHandler = new ChatQueryHandler(
      supabaseClientService,
      sandboxService,
      devServerService,
      terminalService,
    );
    this.claudeTokenService = new ClaudeTokenService(supabaseClientService);

    baseLogger.consoleLogDevOnly("info", "ChatService initialized", {
      workDir: WORK_DIR,
      allowedRoot: ALLOWED_ROOT,
    });
  }

  // ---------------------------------------------------------------------------
  // CLASS METHODS
  // ---------------------------------------------------------------------------

  public setAak(key: string): void {
    this.aak = key;
    baseLogger.consoleLogDevOnly("info", "Anthropic API key set");
  }

  /**
   * Set the user's OAuth token for Claude subscription authentication.
   * Called during worker allocation if user has connected their Claude Pro/Max subscription.
   */
  public setUserOAuthToken(token: string): void {
    this.userOAuthToken = token;
    baseLogger.consoleLogDevOnly("info", "User OAuth token set for ChatService");
  }

  /**
   * Check if the user has an OAuth token configured.
   */
  public hasUserOAuthToken(): boolean {
    return this.userOAuthToken !== null;
  }

  /**
   * Clear the user's OAuth token.
   */
  public clearUserOAuthToken(): void {
    this.userOAuthToken = null;
    baseLogger.consoleLogDevOnly("info", "User OAuth token cleared");
  }

  /**
   * Register previously created session IDs as valid for resumption.
   * Called during worker allocation to restore sessions from previous instances.
   */
  public registerValidSessionIds(sessionIds: string[]): void {
    for (const sessionId of sessionIds) {
      this.validAiChatSessionIds.add(sessionId);
    }
    baseLogger.consoleLogDevOnly(
      "info",
      "Registered valid session IDs from restored sessions",
      {
        count: sessionIds.length,
        sessionIds,
      },
    );
  }

  // ---------------------------------------------------------------------------
  // ROUTE HANDLERS
  // ---------------------------------------------------------------------------

  public registerRoutes(app: FastifyInstance): void {
    // WebSocket endpoint for Claude Code
    app.get(
      "/code/ws/:prototypeId",
      { websocket: true },
      this.handleWebSocketConnection.bind(this),
    );
  }

  // ---------------------------------------------------------------------------
  // WEBSOCKET CONNECTION HANDLERS AND UTILS
  // ---------------------------------------------------------------------------

  private handleWebSocketConnection(
    socket: WebSocket,
    req: FastifyRequest<{ Params: { prototypeId: string; }; }>,
  ): void {
    const { prototypeId } = req.params;
    const connectionId = `${prototypeId}-${Date.now()}`;

    baseLogger.consoleLogDevOnly(
      "info",
      "Claude Code WebSocket connection established",
      {
        prototypeId,
        connectionId,
      },
    );

    const heartbeat = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.ping();
        } catch (error) {
          baseLogger.warn(
            "Failed to send ping on Claude Code WebSocket connection",
            {
              connectionId,
              prototypeId,
              error: error instanceof Error ? error.message : String(error),
            },
          );
          this.cleanupConnection(connectionId);
        }
      } else {
        this.cleanupConnection(connectionId);
      }
    }, CHAT_HEARTBEAT_INTERVAL_MS);

    // Create a connection-scoped logger from the request logger (which has userId and prototypeId)
    const connectionLogger = req.log2.child({ connectionId });

    this.activeConnections.set(connectionId, {
      socket,
      heartbeat,
      logger: connectionLogger,
    });

    // Send initial connection confirmation
    this.sendMessage(socket, {
      type: ChatEvent.SYSTEM,
      subtype: ChatSystemEventSubtype.CONNECTION,
      data: {
        connectionId,
        prototypeId,
        sessionId: this.sessionState.sessionId,
        isUsingOAuthToken: this.hasUserOAuthToken(),
      },
    });

    // Handle incoming messages
    socket.on("message", async (raw: Buffer | string) => {
      try {
        const parsedMessage = JSON.parse(raw.toString());
        if (!parsedMessage || typeof parsedMessage.type !== "string") {
          throw new Error("Invalid message format");
        }

        const messageType = parsedMessage.type as ChatClientEvent;
        if (!Object.values(ChatClientEvent).includes(messageType)) {
          throw new Error(`Unknown message type: ${parsedMessage.type}`);
        }

        await this.handleClientMessage(
          socket,
          { ...parsedMessage, type: messageType } as ChatClientMessage,
          prototypeId,
          connectionId,
        );
      } catch (error) {
        baseLogger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to process WebSocket message",
          { connectionId },
        );
        broadcastToConnections(
          this.activeConnections,
          {
            type: ChatEvent.ERROR,
            error: {
              message: "Failed to process message",
              details: error instanceof Error ? error.message : String(error),
            },
          },
          baseLogger,
        );
      }
    });

    socket.on("close", (code: number, reason: Buffer) => {
      baseLogger.consoleLogDevOnly(
        "info",
        "Claude Code WebSocket connection closed",
        {
          prototypeId,
          connectionId,
          code,
          reason: reason.toString(),
        },
      );
      this.cleanupConnection(connectionId);
    });

    socket.on("error", (error: Error) => {
      baseLogger.error(error, "Claude Code WebSocket error", {
        prototypeId,
        connectionId,
      });
      this.cleanupConnection(connectionId);
    });
  }

  private cleanupConnection(connectionId: string): void {
    const connection = this.activeConnections.get(connectionId);
    if (connection?.heartbeat) {
      clearInterval(connection.heartbeat);
    }
    this.activeConnections.delete(connectionId);
  }

  public async shutdown(): Promise<void> {
    baseLogger.info("Shutting down CodeService");

    // Abort any active query
    if (this.sessionState.abortController) {
      this.sessionState.abortController.abort();
    }

    // Close all active connections
    for (const [connectionId, connection] of this.activeConnections.entries()) {
      try {
        if (connection.heartbeat) {
          clearInterval(connection.heartbeat);
        }
        connection.socket.close(1000, "Server shutting down");
      } catch {
        baseLogger.warn("Failed to close WebSocket connection", {
          connectionId,
        });
      }
    }

    this.activeConnections.clear();
    this.validAiChatSessionIds.clear(); // Clear valid session IDs on shutdown
    this.userOAuthToken = null; // Clear OAuth token on shutdown
    this.sessionState = {
      sessionId: null,
      prototypeChatSessionId: null,
      abortController: null,
      designSystemId: null,
      designSystemRules: null,
      firstMessageStatus: null,
    };

    // Cleanup ClaudeTokenService
    this.claudeTokenService.destroy();

    baseLogger.info("ChatService shutdown complete");
  }

  // --------------------------------------------------------------------------
  // CLIENT USER MESSAGE HANDLERS
  // --------------------------------------------------------------------------

  private async handleClientMessage(
    socket: WebSocket,
    message: ChatClientMessage,
    prototypeId: string,
    connectionId: string,
  ): Promise<void> {
    // Get the connection logger (which has userId and prototypeId from the request)
    const connection = this.activeConnections.get(connectionId);
    const logger = connection?.logger || baseLogger;

    switch (message.type) {
      case ChatClientEvent.QUERY:
        await this.handleQuery(socket, message.data, logger);
        break;

      case ChatClientEvent.INTERRUPT:
        await this.handleInterrupt();
        break;

      case ChatClientEvent.HISTORY_RESPONSE:
        await this.handleHistoryResponse(socket, message.data, logger);
        break;
    }
  }

  private async handleQuery(
    socket: WebSocket,
    data: ChatQueryData,
    logger: SystemLogger,
  ): Promise<void> {
    // 1. REFRESH THE USER TOKEN IN SUPABASE INSTANCE:
    if (data.token) {
      this.supabaseClientService.refreshClientWithToken(data.token);
    }
    // 2. VALIDATE USER QUERY
    const validationResult = this.validateChatQuery(data);
    if (!validationResult.valid) {
      broadcastToConnections(
        this.activeConnections,
        {
          type: ChatEvent.ERROR,
          error: {
            message: validationResult.errorMessage ?? "Invalid chat query",
            details: validationResult.errorDetails,
          },
        },
        logger,
      );
      return;
    }
    const { userId, prototypeId } = getWorkerContext();
    if (!prototypeId) {
      broadcastToConnections(
        this.activeConnections,
        {
          type: ChatEvent.ERROR,
          error: {
            message: "Sandbox is missing the project ID",
            details: "project ID is required. Please get a new sandbox.",
          },
        },
        logger,
      );
      return;
    }
    // 3. PAYWALL CHECK THE USER
    const creditResult = await this.ensureCreditsAvailable(prototypeId, logger);
    if (!creditResult.valid) {
      broadcastToConnections(
        this.activeConnections,
        {
          type: ChatEvent.ERROR,
          error: {
            message: creditResult.errorMessage ?? "Credit check failed",
            details: creditResult.errorDetails,
          },
        },
        logger,
      );
      return;
    }

    // 3a. BROADCAST USER MESSAGE TO OTHER COLLABORATORS
    // This allows other connected users to see messages in real-time
    if (userId && data.content) {
      const imageCount = Array.isArray(data.content)
        ? data.content.filter((block) => block.type === "image").length
        : 0;

      broadcastToConnections(
        this.activeConnections,
        {
          type: ChatEvent.COLLABORATOR_MESSAGE,
          data: {
            userId,
            content: data.content,
            timestamp: Date.now(),
            imageCount,
          },
        },
        logger,
        socket, // Exclude the sender from receiving their own message
      );
    }

    // 4. TELL CONTROL PLANE THAT CHAT IS STARTING
    try {
      await this.sandboxOrchestrationInitiatorService
        .notifyOrchestrationStartChat(prototypeId);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(err, "Failed to notify orchestration start chat", {
        prototypeId,
      });
      broadcastToConnections(
        this.activeConnections,
        {
          type: ChatEvent.ERROR,
          error: {
            message: "Failed to start chat session",
          },
        },
        logger,
      );
      return;
    }

    // 5. DETERMINE APPROPRIATE CHAT HANDLER FOR THE USER
    // 5a. Check if the user has a claude subscription token to determine whether to use CLI mode
    let useCliMode = false;
    if (userId) {
      try {
        const isFeatureEnabled = await posthog.isFeatureEnabled(
          "claude-code-cli-with-personal-token",
          userId,
        );
        if (isFeatureEnabled) {
          const userToken = await this.claudeTokenService.getUserToken(userId);
          useCliMode = !!userToken;
        }
        logger.consoleLogDevOnly(
          "info",
          "Checked user Claude subscription token",
          {
            userId,
            isFeatureEnabled,
            hasToken: useCliMode,
          },
        );
      } catch (error) {
        logger.warn("Failed to check user Claude subscription token", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    // 5. PREPARE SESSION STATE
    this.prepareSessionStateForQuery(data, logger);

    // 6. PERFORM DESIGN INSPIRATION + CLASSIFICATION STEPS FOR USER FIRST MESSAGES
    let isFirstMessage = false;
    if (this.sessionState.prototypeChatSessionId) {
      isFirstMessage = await this.isFirstMessageForPrototype(
        prototypeId,
        this.sessionState.prototypeChatSessionId,
        logger,
      );
    }

    const designPreparation = await this.prepareFirstMessageDesignContext(
      socket,
      data,
      prototypeId,
      logger,
      isFirstMessage,
    );

    if (
      designPreparation?.designSpec &&
      this.sessionState.prototypeChatSessionId
    ) {
      const designSpec = designPreparation.designSpec;
      const metadata = designPreparation.designMetadata;
      const scope = metadata?.scope ?? "unknown";
      const isAppLevel = scope === "app";
      const isNarrowBuild = scope === "screen" || scope === "component";

      await persistChatMessage(
        this.supabaseClientService,
        this.sessionState.prototypeChatSessionId,
        "assistant",
        designSpec,
        "text",
        "design_generation",
        { prototypeId },
        null,
        null,
        null,
        null,
      );

      broadcastToConnections(
        this.activeConnections,
        {
          type: ChatEvent.DESIGN_GENERATION,
          data: {
            status: "completed",
            message: "Design specification generated",
            designSpec,
            runDesignAgent: true,
            isAppLevel,
            isNarrowBuild,
            persistToProjectContext: true,
            scope,
          },
        },
        logger,
      );
    }

    // 7. CONSTRUCT DYNAMIC SYSTEM PROMPT (based on user design system + prototype framework)
    const framework = this.devServerService.prototypeFramework ?? null;
    const systemPrompt = await this.constructSystemPrompt(
      logger,
      data.custom_design_system_id ?? null,
      data.design_style,
      framework,
    );

    // 8. DISPATCH REQUEST TO SDK ENGINE
    logger.consoleLogDevOnly("info", "Dispatching chat query to SDK handler", {
      prototypeId,
      hasPrototypeChatSessionId: !!this.sessionState.prototypeChatSessionId,
      sessionId: this.sessionState.sessionId,
    });
    let handlerResult: ChatEngineResult | void = undefined;
    const designAgentCost = designPreparation?.designAgentCost;
    try {
      handlerResult = await this.chatQueryHandler.handleQuery({
        socket,
        activeConnections: this.activeConnections,
        data,
        sessionState: this.sessionState,
        validAiChatSessionIds: this.validAiChatSessionIds,
        systemPrompt,
        getRelativePath: this.getRelativePath.bind(this),
      });
    } finally {
      const combinedCost = designAgentCost === undefined &&
        handlerResult?.totalCostUsd === undefined
        ? undefined
        : (designAgentCost ?? 0) + (handlerResult?.totalCostUsd ?? 0);
      try {
        await this.finalizeChatExecution(
          prototypeId,
          socket,
          data,
          combinedCost,
          logger,
        );
      } catch (error) {
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to complete post-run bookkeeping",
          { prototypeId },
        );
      }
      try {
        await this.sandboxOrchestrationInitiatorService
          .notifyOrchestrationEndChat(prototypeId);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(err, "Failed to notify orchestration end chat", {
          prototypeId,
        });
      }
    }
  }

  private async handleHistoryResponse(
    socket: WebSocket,
    data: HistoryResponseData,
    logger: SystemLogger,
  ): Promise<void> {
    const { historical_messages, original_query } = data;

    logger.consoleLogDevOnly("info", "Received history response from client", {
      messageCount: historical_messages.length,
    });

    // Format historical messages for system prompt
    let historyContext = "";
    if (historical_messages.length > 0) {
      const formattedMessages = historical_messages
        .map((msg: { role: string; content: string; }) => {
          const role = msg.role === "user" ? "User" : "Assistant";
          return `${role}: ${msg.content}`;
        })
        .join("\n\n");

      historyContext =
        `\n\n## Previous Conversation Context:\n${formattedMessages}\n\n---\n\nThe above is context from a previous session. Continue the conversation naturally.`;

      logger.consoleLogDevOnly("info", "Formatted history context", {
        contextLength: historyContext.length,
        messageCount: historical_messages.length,
      });
    } else {
      logger.consoleLogDevOnly(
        "info",
        "No historical messages provided - starting fresh session",
      );
    }

    // Now process the original query with history context appended to system prompt
    // We need to temporarily store the history context and process the query
    // The easiest way is to modify the original_query data to include this in the system prompt append

    // Since we can't easily modify the handleQuery internals, we'll process the query here
    // with the history context added to the system prompt
    await this.handleQueryWithHistory(
      socket,
      original_query,
      historyContext,
      logger,
    );
  }

  private async handleInterrupt(): Promise<void> {
    baseLogger.consoleLogDevOnly("info", "Interrupt requested", {
      sessionId: this.sessionState.sessionId,
      hasAbortController: !!this.sessionState.abortController,
    });

    if (this.sessionState.abortController) {
      try {
        // Abort the current query
        this.sessionState.abortController.abort();
        this.sessionState.abortController = null;

        baseLogger.consoleLogDevOnly(
          "info",
          "Claude Code query interrupted successfully",
        );

        // Persist interrupt event to database
        if (this.sessionState.prototypeChatSessionId) {
          await persistChatMessage(
            this.supabaseClientService,
            this.sessionState.prototypeChatSessionId,
            "system",
            "Query interrupted by user",
            "system",
            "query_interrupted",
            {
              sessionId: this.sessionState.sessionId,
            },
          );
        }

        broadcastToConnections(
          this.activeConnections,
          {
            type: ChatEvent.INTERRUPTED,
            data: {
              message: "Query has been interrupted",
              sessionId: this.sessionState.sessionId,
            },
          },
          baseLogger,
        );
      } catch (error) {
        baseLogger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to interrupt query",
        );

        broadcastToConnections(
          this.activeConnections,
          {
            type: ChatEvent.ERROR,
            error: {
              message: "Failed to interrupt query",
              details: error instanceof Error ? error.message : String(error),
            },
          },
          baseLogger,
        );
      }
    } else {
      broadcastToConnections(
        this.activeConnections,
        {
          type: ChatEvent.INFO,
          message: "No active query to interrupt",
        },
        baseLogger,
      );
    }
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

  // --------------------------------------------------------------------------
  // PRE-CHAT EXECUTION UTILS
  // --------------------------------------------------------------------------

  private validateChatQuery(data: ChatQueryData): ChatQueryValidationResult {
    const { prompt, content } = data;

    if (!prompt && !content) {
      return {
        valid: false,
        errorMessage: "prompt or content is required",
      };
    }

    if (content && (!Array.isArray(content) || content.length === 0)) {
      return {
        valid: false,
        errorMessage: "content must be a non-empty array",
      };
    }

    return { valid: true };
  }

  private prepareSessionStateForQuery(
    data: ChatQueryData,
    logger: SystemLogger,
  ): void {
    const { prototype_chat_session_id, ai_chat_session_id } = data;
    const previousPrototypeChatSessionId =
      this.sessionState.prototypeChatSessionId;

    if (prototype_chat_session_id) {
      this.sessionState.prototypeChatSessionId = prototype_chat_session_id;
      logger.consoleLogDevOnly("info", "Using chat session ID from client", {
        chatSessionId: prototype_chat_session_id,
        claudeCodeSessionId: ai_chat_session_id,
      });
      if (previousPrototypeChatSessionId !== prototype_chat_session_id) {
        this.sessionState.firstMessageStatus = null;
      }
    } else {
      logger.warn("No chat_session_id provided by client", {
        session_id: ai_chat_session_id,
      });
      this.sessionState.prototypeChatSessionId = null;
      this.sessionState.firstMessageStatus = null;
    }

    if (ai_chat_session_id === null) {
      logger.consoleLogDevOnly(
        "info",
        "Client requested new session - clearing internal state",
        {
          previousSessionId: this.sessionState.sessionId,
        },
      );
      this.sessionState.sessionId = null;
      this.sessionState.firstMessageStatus = null; // Is this supposed to be here? --sourish
    }
  }

  private async ensureCreditsAvailable(
    prototypeId: string,
    logger: SystemLogger,
  ): Promise<ChatQueryValidationResult> {
    try {
      const { teamId } = getWorkerContext();
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
          valid: false,
          errorMessage: "Authentication required",
          errorDetails: "Unable to verify user credentials",
        };
      }
      if (!teamId) {
        logger.error(
          new Error("Team ID missing in worker context"),
          "Team ID required for credit check",
          {
            prototypeId,
            userId: user.id,
          },
        );
        return {
          valid: false,
          errorMessage: "Team context required",
          errorDetails: "Unable to verify team membership for credit check",
        };
      }

      const creditCheck = await hasRemainingCredits(
        this.supabaseClientService.getClient(),
        user.id,
        teamId,
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
          valid: false,
          errorMessage: "Credit limit exceeded",
          errorDetails:
            `You have used all ${creditCheck.granted} credits available. Please upgrade your plan to continue.`,
        };
      }

      return { valid: true };
    } catch (error) {
      logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Error during credit check",
        { prototypeId },
      );
      return {
        valid: false,
        errorMessage: "Unable to verify credits",
        errorDetails: "An error occurred while checking your credit balance",
      };
    }
  }

  private async handleQueryWithHistory(
    socket: WebSocket,
    data: ChatQueryData,
    historyContext: string,
    logger: SystemLogger,
  ): Promise<void> {
    const options = (data.options ?? {}) as Options;

    logger.consoleLogDevOnly("info", "Processing query with history context", {
      hasHistoryContext: historyContext.length > 0,
      historyContextLength: historyContext.length,
    });

    // For queries with history, we always start a fresh session (don't try to resume)
    // The history context provides continuity instead of session resumption

    // Call the original handleQuery but with ai_chat_session_id set to null
    // to force a new session, and we need to inject the history context
    const modifiedData = {
      ...data,
      ai_chat_session_id: null, // Force new session
    };

    // Store the history context temporarily so handleQuery can access it
    // We'll use a simple approach: add it as a special option
    const modifiedOptions = {
      ...options,
      __historyContext: historyContext, // Internal flag
    };

    await this.handleQuery(
      socket,
      { ...modifiedData, options: modifiedOptions },
      logger,
    );
  }

  private async prepareFirstMessageDesignContext(
    socket: WebSocket,
    data: ChatQueryData,
    prototypeId: string,
    logger: SystemLogger,
    isFirstMessage: boolean,
  ): Promise<
    {
      designSpec: string | null;
      designMetadata: DesignAgentMetadata | null;
      designAgentCost?: number;
    } | null
  > {
    if (!isFirstMessage) {
      return null;
    }

    const canAttemptClassification = !!this.sessionState.prototypeChatSessionId;
    if (!canAttemptClassification) {
      logger.consoleLogDevOnly(
        "info",
        "Skipping design intent classification gate",
        {
          prototypeId,
          hasPrototypeChatSessionId: !!this.sessionState.prototypeChatSessionId,
        },
      );
      return null;
    }

    const { prompt, content } = data;
    const userMessageText = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
          .filter((block) => block.type === "text")
          .map((block) => block.text || "")
          .join("\n")
        : prompt || "";

    const designAgentUserContent = buildDesignAgentUserContent(
      typeof content === "string" ? content : prompt,
      Array.isArray(content) ? content : undefined,
      logger,
      prototypeId,
    );

    if (!userMessageText) {
      return null;
    }

    const classifierAbortController = new AbortController();
    this.sessionState.abortController = classifierAbortController;

    logger.debug("Classifying user intent on first message", {
      prototypeId,
      userMessageLength: userMessageText.length,
    });

    const classificationResult = await classifyDesignIntent({
      userMessage: userMessageText,
      abortController: classifierAbortController,
      logger,
      prototypeId,
    });

    const classifierCost = classificationResult.costUsd;
    let designAgentCost = classifierCost;
    let designSpec: string | null = null;
    let designMetadata: DesignAgentMetadata | null = null;

    if (classificationResult.shouldGenerateDesignSpec) {
      broadcastToConnections(
        this.activeConnections,
        {
          type: ChatEvent.DESIGN_GENERATION,
          data: {
            status: "started",
            message: "Generating design specification...",
            runDesignAgent: true,
          },
        },
        logger,
      );

      logger.debug("Calling design agent", {
        prototypeId,
        userMessageLength: userMessageText.length,
        hasAbortController: !!classifierAbortController,
      });

      const designResult = await this.executeDesignAgentForFirstMessage(
        prototypeId,
        designAgentUserContent ?? userMessageText,
        classifierAbortController,
        logger,
      );

      designAgentCost = (designResult.costUsd ?? 0) + (designAgentCost ?? 0);

      if (designResult.designSpec) {
        const parsed = this.parseDesignAgentSpec(designResult.designSpec);
        designSpec = parsed.spec;
        designMetadata = parsed.metadata;

        await persistDesignSpecToFiles(
          WORK_DIR,
          designSpec,
          logger,
          prototypeId,
        );

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

      logger.consoleLogDevOnly("info", "Design agent execution completed", {
        prototypeId,
        hasDesignSpec: !!designSpec,
        designAgentCost,
        metadata: designMetadata,
      });
    } else {
      logger.consoleLogDevOnly(
        "info",
        "Skipping design agent - no design spec needed",
        {
          prototypeId,
          shouldGenerateDesignSpec:
            classificationResult.shouldGenerateDesignSpec,
          classifierCost,
        },
      );
    }

    if (this.sessionState.prototypeChatSessionId) {
      this.sessionState.firstMessageStatus = {
        sessionId: this.sessionState.prototypeChatSessionId,
        isFirst: false,
      };
    }

    return {
      designSpec,
      designMetadata,
      designAgentCost,
    };
  }

  private async constructSystemPrompt(
    logger: SystemLogger,
    customDesignSystemId: string | null,
    designStyle: string | undefined,
    framework: Database["public"]["Enums"]["prototype_framework"] | null,
  ): Promise<string> {
    if (customDesignSystemId !== this.sessionState.designSystemId) {
      if (!customDesignSystemId) {
        this.sessionState.designSystemId = null;
        this.sessionState.designSystemRules = null;
        logger.consoleLogDevOnly("info", "Design system cleared");
      } else {
        try {
          const { data: designSystem, error } = await this.supabaseClientService
            .getClient()
            .from("design_systems")
            .select("*")
            .eq("id", customDesignSystemId)
            .single();

          if (error) {
            logger.error(error, "Failed to fetch design system", {
              designSystemId: customDesignSystemId,
            });
            this.sessionState.designSystemId = null;
            this.sessionState.designSystemRules = null;
          } else if (designSystem) {
            this.sessionState.designSystemId = customDesignSystemId;
            this.sessionState.designSystemRules = (
              designSystem as Database["public"]["Tables"]["design_systems"][
              "Row"
              ]
            ).design_rules;
          } else {
            logger.warn("Design system not found", {
              designSystemId: customDesignSystemId,
            });
            this.sessionState.designSystemId = null;
            this.sessionState.designSystemRules = null;
          }
        } catch (error) {
          logger.error(
            error instanceof Error ? error : new Error(String(error)),
            "Error fetching design system",
            { designSystemId: customDesignSystemId },
          );
          this.sessionState.designSystemId = null;
          this.sessionState.designSystemRules = null;
        }
      }
    }

    let systemPromptAppend = getSystemPromptForDesignStyle(
      designStyle,
      framework ?? undefined,
    );

    if (this.sessionState.designSystemRules) {
      systemPromptAppend += "\n\n## Custom Design System Rules:\n" +
        this.sessionState.designSystemRules;
    }

    return systemPromptAppend;
  }

  private async isFirstMessageForPrototype(
    prototypeId: string,
    prototypeChatSessionId: string,
    logger: SystemLogger,
  ): Promise<boolean> {
    if (!prototypeChatSessionId) {
      return false;
    }

    const cached = this.sessionState.firstMessageStatus;
    if (cached && cached.sessionId === prototypeChatSessionId) {
      return cached.isFirst;
    }

    try {
      const { data: messageRows, error: messageError } = await this
        .supabaseClientService
        .getClient()
        .from("prototype_chat_messages")
        .select("id")
        .eq("chat_session_id", prototypeChatSessionId)
        .limit(1);

      if (messageError) {
        logger.error(
          messageError,
          "Failed to check message count for first message detection",
          { prototypeChatSessionId },
        );
        return false;
      }

      if (messageRows && messageRows.length > 0) {
        return false;
      }

      const { data: sessionRows, error: sessionError } = await this
        .supabaseClientService
        .getClient()
        .from("prototype_chat_sessions")
        .select("id")
        .eq("prototype_id", prototypeId)
        .limit(1);

      if (sessionError) {
        logger.error(
          sessionError,
          "Failed to check session count for first message detection",
          { prototypeId },
        );
        return false;
      }

      const isFirst = sessionRows.length === 1;

      this.sessionState.firstMessageStatus = {
        sessionId: prototypeChatSessionId,
        isFirst,
      };

      logger.consoleLogDevOnly("info", "First message detection result", {
        prototypeId,
        prototypeChatSessionId,
        messageRows,
        sessionRows,
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

  private isPathInsideAllowedRoot(resolvedPath: string): boolean {
    const normalizedPath = path.resolve(resolvedPath);
    const allowedWithSep = ALLOWED_ROOT.endsWith(path.sep)
      ? ALLOWED_ROOT
      : `${ALLOWED_ROOT}${path.sep}`;
    return (
      normalizedPath === ALLOWED_ROOT ||
      normalizedPath.startsWith(allowedWithSep)
    );
  }

  // --------------------------------------------------------------------------
  // POST CHAT EXECUTION UTILS
  // --------------------------------------------------------------------------

  private async finalizeChatExecution(
    prototypeId: string,
    socket: WebSocket,
    data: ChatQueryData,
    totalCostUsd: number | undefined,
    logger: SystemLogger,
  ): Promise<void> {
    try {
      await this.commitChatChangesToGit(data, logger);
    } catch (error) {
      logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to commit chat changes",
        { prototypeId },
      );
    }

    await this.syncFilesAndTrackUsage(
      prototypeId,
      socket,
      data,
      totalCostUsd,
      logger,
    );
  }

  private async commitChatChangesToGit(
    data: ChatQueryData,
    logger: SystemLogger,
  ): Promise<void> {
    const commitMessageArg = this.buildCommitMessageArg(data);
    if (!commitMessageArg) {
      logger.consoleLogDevOnly(
        "info",
        "Skipping git commit after chat - no commit message available",
      );
      return;
    }

    try {
      const { response } = await this.sandboxService.runCommandInternal({
        command: "git",
        args: ["add", ".", "&&", "git", "commit", "-m", commitMessageArg],
        cwd: WORK_DIR,
        session_id: "test",
        timeout_ms: 60000,
        strip_ansi: true,
      });

      if (response.error) {
        logger.warn("Git commit after chat failed", {
          error: response.error,
        });
        return;
      }

      const stdout = response.data?.stdout ?? "";
      const status = response.data?.status;

      if (
        status === "timeout" &&
        stdout.toLowerCase().includes("nothing to commit")
      ) {
        logger.consoleLogDevOnly(
          "info",
          "No git changes to commit after chat execution",
        );
        return;
      }

      logger.consoleLogDevOnly("info", "Committed chat changes to git", {
        status,
      });
    } catch (error) {
      logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to commit chat changes after execution",
      );
    }
  }

  private async syncFilesAndTrackUsage(
    prototypeId: string,
    socket: WebSocket,
    data: ChatQueryData,
    totalCostUsd: number | undefined,
    logger: SystemLogger,
  ): Promise<void> {
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
        // Calculate credits based on auth method
        let creditsUsed: number;
        let costFunction: string;

        if (this.hasUserOAuthToken()) {
          // OAuth user: flat fee based on prompt length
          const promptLength = getPromptLengthFromQueryData(data);
          creditsUsed = calculateOAuthCredits(promptLength, logger);
          costFunction = OAUTH_COST_FUNCTION_NAME;
        } else {
          // API key user: token-based pricing
          creditsUsed = costFunctionV3(totalCostUsd) ?? 1.0;
          costFunction = CURRENT_COST_FUNCTION_NAME;
        }

        logger.consoleLogDevOnly("info", "Tracking API usage", {
          userId: user.id,
          prototypeId,
          totalCostUsd,
          creditsUsed,
          costFunction,
          isOAuthUser: this.hasUserOAuthToken(),
        });

        const { teamId } = getWorkerContext();
        if (!teamId) {
          logger.error(
            new Error("Team ID missing in worker context"),
            "Cannot track usage without team context",
            {
              userId: user.id,
              prototypeId,
            },
          );
          // Continue without tracking usage rather than failing the entire request
        } else {
          const { totalRemainingCredits } = await trackApiUsageBuildWorker(
            this.supabaseClientService.getClient(),
            user.id,
            prototypeId,
            logger,
            creditsUsed,
            teamId,
          );

          broadcastToConnections(
            this.activeConnections,
            {
              type: ChatEvent.USAGE_UPDATE,
              data: {
                creditsUsed,
                creditsRemaining: totalRemainingCredits,
              },
            },
            logger,
          );

          logger.consoleLogDevOnly("info", "API usage tracked successfully", {
            userId: user.id,
            prototypeId,
            totalCostUsd,
            creditsUsed,
            costFunction,
            totalRemainingCredits,
          });
        }
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

  private buildCommitMessageArg(data: ChatQueryData): string | null {
    const userMessage = this.extractCommitMessageText(data);
    const normalized = userMessage.replace(/\s+/g, " ").trim();
    const baseMessage = normalized.length > 0
      ? normalized
      : "Automated chat commit";
    const truncated = baseMessage.length > 180
      ? `${baseMessage.slice(0, 177)}...`
      : baseMessage;

    const escaped = truncated
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`");

    if (!escaped.trim()) {
      return null;
    }

    return `"${escaped}"`;
  }

  private extractCommitMessageText(data: ChatQueryData): string {
    if (typeof data.prompt === "string" && data.prompt.length > 0) {
      return data.prompt;
    }

    if (Array.isArray(data.content)) {
      const text = data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text || "")
        .join(" ")
        .trim();
      if (text) {
        return text;
      }
    }

    return "";
  }

  // --------------------------------------------------------------------------
  // MISCELLANEOUS UTILS
  // --------------------------------------------------------------------------
  private getRelativePath(absolutePath: string): string {
    if (absolutePath.startsWith(WORK_DIR)) {
      return absolutePath.slice(WORK_DIR.length + 1);
    }
    return absolutePath;
  }

  private async executeDesignAgentForFirstMessage(
    prototypeId: string,
    userContent: UserContent,
    abortController: AbortController,
    logger: SystemLogger,
  ): Promise<{ designSpec: string | null; costUsd: number | undefined; }> {
    const provider: DesignAgentProvider = "google";
    const model = DEFAULT_DESIGN_AGENT_MODELS[provider];

    const imageCount = Array.isArray(userContent)
      ? userContent.filter((part) => part.type === "image").length
      : 0;
    logger.consoleLogDevOnly("info", "Executing design agent via AI SDK", {
      prototypeId,
      provider,
      model,
      userMessageLength: typeof userContent === "string"
        ? userContent.length
        : undefined,
      imageCount,
    });

    return executeDesignAgent({
      provider,
      model,
      userContent,
      workDir: WORK_DIR,
      abortController,
      logger,
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
}
