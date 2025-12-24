import { Options } from "@anthropic-ai/claude-agent-sdk";
import axios from "axios";
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
import {
  APIResponse,
  EndChatResponse,
  StandardErrorResponse,
  StartChatResponse,
} from "../../types/ControlPlaneTypes.js";
import { Database } from "../../types/supabase.js";
import { WORK_DIR } from "../../worker.js";
import { ClaudeTokenService } from "../auth/claude-token-service.js";
import { NucleateDevelopmentServerService } from "../dev-server/NucleateDevelopmentServerService.js";
import { FileSyncService } from "../FileSyncService.js";
import { SandboxService } from "../SandboxService.js";
import { SupabaseClientService } from "../SupabaseClientService.js";
import { TerminalService } from "../terminals/TerminalService.js";
import {
  ChatEngine,
  ChatEngineSessionState,
} from "./chat-engines/chat-engine.js";
import { ChatQueryHandler } from "./chat-engines/chat-query-handler.js";
import { ClaudeCodeCliQueryHandler } from "./chat-engines/claude-code-cli-query-handler.js";
import { MessagePersistenceService } from "./helpers/message-handlers.js";
import { ChatProvider, isAllowedModel } from "./helpers/model-providers.js";
import { ToolPermissionService } from "./helpers/tool-permission-service.js";

const CHAT_HEARTBEAT_INTERVAL_MS = 15000;

class OrchestrationAPIError<TData = unknown> extends Error {
  public readonly responseBody: APIResponse<TData, StandardErrorResponse>;

  constructor(
    message: string,
    responseBody: APIResponse<TData, StandardErrorResponse>,
  ) {
    super(message);
    this.name = "OrchestrationAPIError";
    this.responseBody = responseBody;
  }
}

interface CodeSessionState extends ChatEngineSessionState {
  trackedFiles: Set<string>; // Track files that were modified during the session
}

interface ChatConnection {
  socket: WebSocket;
  heartbeat?: NodeJS.Timeout;
  logger: SystemLogger;
}

export class ChatService {
  private readonly allowedRoot: string;
  private readonly supabaseClientService: SupabaseClientService;
  private readonly fileSyncService: FileSyncService;
  private readonly toolPermissionService: ToolPermissionService;
  private readonly messagePersistenceService: MessagePersistenceService;
  private readonly chatQueryHandler: ChatEngine;
  private readonly claudeCodeCliQueryHandler: ChatEngine;
  private readonly claudeTokenService: ClaudeTokenService;
  private sessionState: CodeSessionState = {
    sessionId: null,
    prototypeChatSessionId: null,
    isActive: false,
    createdAt: 0,
    lastActiveAt: 0,
    abortController: null,
    trackedFiles: new Set<string>(),
    modifiedFilesThisQuery: new Set<string>(),
    designSystemId: null,
    designSystemRules: null,
    firstMessageStatus: null,
  };
  private activeConnections = new Map<string, ChatConnection>();
  private orchestrationToken: string | null = null;
  private aak: string | null = null;
  private validAiChatSessionIds = new Set<string>(); // Track valid session IDs created during this CodeService instance's lifetime

  constructor(
    supabaseClientService: SupabaseClientService,
    sandboxService: SandboxService,
    devServerService: NucleateDevelopmentServerService,
    terminalService: TerminalService,
    fileSyncService: FileSyncService,
  ) {
    this.allowedRoot = path.resolve("/tmp/materialize-dev-server");
    this.supabaseClientService = supabaseClientService;
    this.fileSyncService = fileSyncService;
    this.toolPermissionService = new ToolPermissionService(this.allowedRoot);

    // Initialize MessagePersistenceService
    this.messagePersistenceService = new MessagePersistenceService(
      supabaseClientService.getClient(),
    );

    // Initialize ChatQueryHandler
    this.chatQueryHandler = new ChatQueryHandler(
      supabaseClientService,
      this.fileSyncService,
      this.toolPermissionService,
      sandboxService,
      devServerService,
      terminalService,
      () => this.getAak(),
    );

    // Initialize ClaudeTokenService
    this.claudeTokenService = new ClaudeTokenService(
      supabaseClientService.getClient(),
    );

    // Always initialize ClaudeCodeCliQueryHandler - will be used if user has a token
    this.claudeCodeCliQueryHandler = new ClaudeCodeCliQueryHandler(
      supabaseClientService,
      this.toolPermissionService,
      devServerService,
    );
    baseLogger.info(
      "Claude Code CLI handler initialized - will be used for users with subscription tokens",
    );

    baseLogger.consoleLogDevOnly("info", "ChatService initialized", {
      workDir: WORK_DIR,
      allowedRoot: this.allowedRoot,
    });


    const normalizedWorkDir = path.resolve(WORK_DIR);
    if (!this.isPathInsideAllowedRoot(normalizedWorkDir)) {
      baseLogger.warn("WorkDir is outside the allowed root for Claude Code", {
        workDir: normalizedWorkDir,
        allowedRoot: this.allowedRoot,
      });
    }
  }

  public setOrchestrationToken(token: string): void {
    this.orchestrationToken = token;
    baseLogger.consoleLogDevOnly("info", "Orchestration token set");
  }

  public getOrchestrationToken(): string | null {
    return this.orchestrationToken;
  }

  public setAak(key: string): void {
    this.aak = key;
    baseLogger.consoleLogDevOnly("info", "Anthropic API key set");
  }

  public getAak(): string | null {
    return this.aak;
  }

  public registerRoutes(app: FastifyInstance): void {
    // WebSocket endpoint for Claude Code
    app.get(
      "/code/ws/:prototypeId",
      { websocket: true },
      this.handleWebSocketConnection.bind(this),
    );

    // Health check endpoint
    app.get("/code/health", async () => {
      return {
        status: "ok",
        service: "claude-code-sdk",
        session: {
          id: this.sessionState.sessionId,
          isActive: this.sessionState.isActive,
          lastActiveAt: this.sessionState.lastActiveAt,
        },
      };
    });

    // Get session info
    app.get("/code/session", async () => {
      return {
        status: "ok",
        session: this.sessionState,
      };
    });
  }

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
        this.sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: "Failed to process message",
            details: error instanceof Error ? error.message : String(error),
          },
        });
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
        await this.handleQuery(socket, message.data, prototypeId, logger);
        break;

      case ChatClientEvent.INTERRUPT:
        await this.handleInterrupt(socket);
        break;

      case ChatClientEvent.RESET_SESSION:
        // For now, we don't allow users to delete sessions
        // await this.handleResetSession(socket);
        break;

      case ChatClientEvent.HISTORY_RESPONSE:
        await this.handleHistoryResponse(
          socket,
          message.data,
          prototypeId,
          logger,
        );
        break;
    }
  }

  private async handleQuery(
    socket: WebSocket,
    data: ChatQueryData,
    prototypeId: string,
    logger: SystemLogger,
  ): Promise<void> {
    const options = (data.options ?? {}) as Options & {
      provider?: ChatProvider;
      model?: string;
    };

    const provider: ChatProvider =
      (options.provider as ChatProvider) || "claude";
    const model = options.model;

    if (model && !isAllowedModel(provider, model)) {
      this.sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: `Model ${model} is not allowed for provider ${provider}`,
          details: "Please choose a supported model.",
        },
      });
      return;
    }

    // Check if user has a Claude Code subscription token
    let useCliMode = false;
    const token = data.token;

    if (token) {
      try {
        // Decode JWT to extract user ID
        const payload = JSON.parse(
          Buffer.from(token.split(".")[1], "base64").toString(),
        );
        const userId = payload.sub;

        if (userId) {
          // Check PostHog feature flag first
          const isFeatureEnabled = await posthog.isFeatureEnabled(
            "claude-code-cli-with-personal-token",
            userId,
          );

          if (isFeatureEnabled) {
            // Check if user has a Claude subscription token in the database
            const userToken =
              await this.claudeTokenService.getUserToken(userId);
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
        }
      } catch (error) {
        logger.warn("Failed to check user Claude subscription token", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Delegate to appropriate handler based on provider and user subscription
    let handler;
    let handlerName: string;

    if (provider === "vercel") {
      throw Error("This provider is not supported.");
    } else if (useCliMode && this.claudeCodeCliQueryHandler) {
      handler = this.claudeCodeCliQueryHandler;
      handlerName = "claude-cli";
    } else {
      handler = this.chatQueryHandler;
      handlerName = "claude-sdk";
    }

    logger.consoleLogDevOnly("info", "Dispatching chat query to handler", {
      prototypeId,
      handler: handlerName,
      useCliMode,
      hasPrototypeChatSessionId: !!this.sessionState.prototypeChatSessionId,
      sessionId: this.sessionState.sessionId,
    });

    await handler.handleQuery(
      {
        prototypeId,
        socket,
        data,
        sessionState: this.sessionState,
        validAiChatSessionIds: this.validAiChatSessionIds,
        logger,
      },
      {
        sendMessage: this.sendMessage.bind(this),
        persistMessage: async (
          role: "user" | "assistant" | "system",
          content: string,
          messageType: "text" | "tool_use" | "tool_result" | "error" | "system",
          eventType?: string | null,
          eventData?: unknown,
          creditsUsed?: number | null,
          costFunction?: string | null,
          provider?: string | null,
          model?: string | null,
        ) => {
          if (!this.sessionState.prototypeChatSessionId) {
            baseLogger.warn("Cannot persist message - no chat session ID");
            return;
          }
          await this.messagePersistenceService.persistMessage(
            this.sessionState.prototypeChatSessionId,
            role,
            content,
            messageType,
            eventType,
            {
              ...(eventData ?? {}),
              provider: provider ?? null,
              model: model ?? null,
            },
            creditsUsed,
            costFunction,
            provider,
            model,
          );
        },
        uploadChatImages: async (
          prototypeId: string,
          chatSessionId: string,
          images: Array<{ base64: string; mediaType: string; }>,
        ) => {
          return await this.messagePersistenceService.uploadChatImages(
            prototypeId,
            chatSessionId,
            images,
          );
        },
        updatePersistenceClient: (client: unknown) => {
          this.messagePersistenceService.setSupabaseClient(
            client as import("@supabase/supabase-js").SupabaseClient<Database>,
          );
        },
        notifyOrchestrationStartChat:
          this.notifyOrchestrationStartChat.bind(this),
        notifyOrchestrationEndChat: this.notifyOrchestrationEndChat.bind(this),
      },
    );
  }

  private async handleHistoryResponse(
    socket: WebSocket,
    data: HistoryResponseData,
    prototypeId: string,
    logger: SystemLogger,
  ): Promise<void> {
    const { historical_messages, original_query } = data;

    logger.consoleLogDevOnly("info", "Received history response from client", {
      messageCount: historical_messages.length,
      prototypeId,
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

      historyContext = `\n\n## Previous Conversation Context:\n${formattedMessages}\n\n---\n\nThe above is context from a previous session. Continue the conversation naturally.`;

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
      prototypeId,
      historyContext,
      logger,
    );
  }

  private async handleQueryWithHistory(
    socket: WebSocket,
    data: ChatQueryData,
    prototypeId: string,
    historyContext: string,
    logger: SystemLogger,
  ): Promise<void> {
    const options = (data.options ?? {}) as Options;

    logger.consoleLogDevOnly("info", "Processing query with history context", {
      prototypeId,
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
      prototypeId,
      logger,
    );
  }

  private async handleInterrupt(socket: WebSocket): Promise<void> {
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
          await this.messagePersistenceService.persistMessage(
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

        this.sendMessage(socket, {
          type: ChatEvent.INTERRUPTED,
          data: {
            message: "Query has been interrupted",
            sessionId: this.sessionState.sessionId,
          },
        });
      } catch (error) {
        baseLogger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to interrupt query",
        );

        this.sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: "Failed to interrupt query",
            details: error instanceof Error ? error.message : String(error),
          },
        });
      }
    } else {
      this.sendMessage(socket, {
        type: ChatEvent.INFO,
        message: "No active query to interrupt",
      });
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

  /**
   * Notifies the control plane that a chat session has started
   */
  private async notifyOrchestrationStartChat(
    prototypeId: string,
  ): Promise<void> {
    const serverEndpoint = process.env.NUCLEATE_SERVER_ENDPOINT;
    if (!serverEndpoint) {
      baseLogger.warn(
        "NUCLEATE_SERVER_ENDPOINT not set, skipping start-chat notification",
      );
      return;
    }

    if (!this.orchestrationToken) {
      baseLogger.error(
        new Error("Orchestration token not set"),
        "Cannot notify start-chat without orchestration token",
        { prototypeId },
      );
      return;
    }

    try {
      const response = await axios.post<
        APIResponse<StartChatResponse, StandardErrorResponse>
      >(
        `${serverEndpoint}/orchestration/start-chat`,
        { prototype_id: prototypeId },
        {
          headers: {
            "x-orchestration-token": this.orchestrationToken,
            "Content-Type": "application/json",
          },
          timeout: 5000,
        },
      );
      const payload = response.data;

      if (payload.error || !payload.data?.success) {
        throw new OrchestrationAPIError<StartChatResponse>(
          payload.error
            ? `Control plane rejected start-chat: ${payload.error.message}`
            : "Control plane returned an invalid start-chat response",
          payload,
        );
      }

      baseLogger.consoleLogDevOnly(
        "info",
        "Notified control plane of chat start",
        {
          prototypeId,
          responseMessage: payload.data.message,
        },
      );
    } catch (error) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      const orchestrationError =
        error instanceof OrchestrationAPIError ? error : null;
      const derivedError =
        orchestrationError ??
        (axiosError
          ? new Error(
            `Failed to notify control plane of chat start (status ${axiosError.response?.status ?? "unknown"})`,
          )
          : error instanceof Error
            ? error
            : new Error(String(error)));

      baseLogger.error(
        derivedError,
        "Failed to notify control plane of chat start",
        {
          prototypeId,
          statusCode: axiosError?.response?.status,
          responseBody:
            orchestrationError?.responseBody ?? axiosError?.response?.data,
        },
      );
      throw derivedError;
    }
  }

  /**
   * Notifies the control plane that a chat session has ended
   * CRITICAL: This method must ALWAYS be called at the end of every chat session,
   * regardless of success or failure. The control plane relies on this notification
   * to properly manage container state and resource allocation. If this call fails,
   * it will be retried to ensure the control plane receives the notification.
   */
  private async notifyOrchestrationEndChat(prototypeId: string): Promise<void> {
    const serverEndpoint = process.env.NUCLEATE_SERVER_ENDPOINT;
    if (!serverEndpoint) {
      baseLogger.warn(
        "NUCLEATE_SERVER_ENDPOINT not set, skipping end-chat notification",
      );
      return;
    }

    if (!this.orchestrationToken) {
      baseLogger.error(
        new Error("Orchestration token not set"),
        "Cannot notify end-chat without orchestration token",
        { prototypeId },
      );
      return;
    }

    // Retry logic to ensure this critical notification succeeds
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post<
          APIResponse<EndChatResponse, StandardErrorResponse>
        >(
          `${serverEndpoint}/orchestration/end-chat`,
          { prototype_id: prototypeId },
          {
            headers: {
              "x-orchestration-token": this.orchestrationToken,
              "Content-Type": "application/json",
            },
            timeout: 5000,
          },
        );
        const payload = response.data;

        if (payload.error || !payload.data?.success) {
          throw new OrchestrationAPIError<EndChatResponse>(
            payload.error
              ? `Control plane rejected end-chat: ${payload.error.message}`
              : "Control plane returned an invalid end-chat response",
            payload,
          );
        }

        baseLogger.consoleLogDevOnly(
          "info",
          "Notified control plane of chat end",
          {
            prototypeId,
            attempt,
            responseMessage: payload.data.message,
          },
        );
        return; // Success - exit the function
      } catch (error) {
        const axiosError = axios.isAxiosError(error) ? error : null;
        const orchestrationError =
          error instanceof OrchestrationAPIError ? error : null;
        lastError = error instanceof Error ? error : new Error(String(error));
        baseLogger.error(
          lastError,
          `Failed to notify control plane of chat end (attempt ${attempt}/${maxRetries})`,
          {
            prototypeId,
            statusCode: axiosError?.response?.status,
            responseBody:
              orchestrationError?.responseBody ?? axiosError?.response?.data,
          },
        );

        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 100),
          );
        }
      }
    }

    // If we get here, all retries failed
    baseLogger.error(
      lastError || new Error("Unknown error"),
      "CRITICAL: Failed to notify control plane of chat end after all retries",
      { prototypeId, maxRetries },
    );
  }

  public getSessionState(): CodeSessionState {
    return { ...this.sessionState };
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

  private isPathInsideAllowedRoot(resolvedPath: string): boolean {
    const normalizedPath = path.resolve(resolvedPath);
    const allowedWithSep = this.allowedRoot.endsWith(path.sep)
      ? this.allowedRoot
      : `${this.allowedRoot}${path.sep}`;
    return (
      normalizedPath === this.allowedRoot ||
      normalizedPath.startsWith(allowedWithSep)
    );
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
    this.sessionState = {
      sessionId: null,
      prototypeChatSessionId: null,
      isActive: false,
      createdAt: 0,
      lastActiveAt: 0,
      abortController: null,
      trackedFiles: new Set<string>(),
      designSystemId: null,
      designSystemRules: null,
      modifiedFilesThisQuery: new Set<string>(),
      firstMessageStatus: null,
    };

    // Cleanup ClaudeTokenService
    this.claudeTokenService.destroy();

    baseLogger.info("CodeService shutdown complete");
  }
}
