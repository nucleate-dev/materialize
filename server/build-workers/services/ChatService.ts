import { Options } from "@anthropic-ai/claude-agent-sdk";
import { execSync } from "child_process";
import chokidar, { FSWatcher } from "chokidar";
import { FastifyInstance, FastifyRequest } from "fastify";
import path from "path";
import WebSocket from "ws";
import { SystemLogger } from "../loggers/SystemLogger.js";
import {
  ChatClientEvent,
  ChatClientMessage,
  ChatEvent,
  ChatQueryData,
  ChatServerMessage,
  ChatSystemEventSubtype,
  HistoryResponseData,
} from "../types/ChatTypes.js";
import {
  notifyOrchestrationEndChat,
  notifyOrchestrationStartChat,
} from "../utils/chat-orchestration-notifiers.js";
import { processImage } from "../utils/imageProcessing.js";
import { ChatQueryHandler } from "./chat/chat-query-handler.js";
import { ToolPermissionService } from "./chat/tool-permission-service.js";
import { ExpoDevServerService } from "./ExpoDevServerService.js";
import { FileSyncService } from "./FileSyncService.js";
import { SandboxService } from "./SandboxService.js";
import { SupabaseClientService } from "./SupabaseClientService.js";
import { TerminalService } from "./TerminalService.js";
const CHAT_HEARTBEAT_INTERVAL_MS = 15000;

interface CodeSessionState {
  sessionId: string | null;
  prototypeChatSessionId: string | null; // ID from prototype_chat_sessions table
  isActive: boolean;
  createdAt: number;
  lastActiveAt: number;
  abortController: AbortController | null;
  trackedFiles: Set<string>; // Track files that were modified during the session
  modifiedFilesThisQuery: Set<string>; // Track files modified by tools for the current query
  fileWatcher: FSWatcher | null; // File system watcher for tracking changes
  designSystemId: string | null; // ID of currently loaded design system
  designSystemRules: string | null; // Cached design system rules
}

interface ChatConnection {
  socket: WebSocket;
  heartbeat?: NodeJS.Timeout;
}

export class ChatService {
  private readonly workDir: string;
  private readonly allowedRoot: string;
  private readonly logger: SystemLogger;
  private readonly fastifyApp: FastifyInstance;
  private readonly fileSyncService: FileSyncService;
  private readonly supabaseClientService: SupabaseClientService;
  private readonly toolPermissionService: ToolPermissionService;
  private readonly sandboxService: SandboxService;
  private readonly expoDevServerService: ExpoDevServerService;
  private readonly terminalService: TerminalService;
  private readonly queryHandler: ChatQueryHandler;
  private sessionState: CodeSessionState = {
    sessionId: null,
    prototypeChatSessionId: null,
    isActive: false,
    createdAt: 0,
    lastActiveAt: 0,
    abortController: null,
    trackedFiles: new Set<string>(),
    modifiedFilesThisQuery: new Set<string>(),
    fileWatcher: null,
    designSystemId: null,
    designSystemRules: null,
  };
  private activeConnections = new Map<string, ChatConnection>();
  private orchestrationToken: string | null = null;
  private validAiChatSessionIds = new Set<string>(); // Track valid session IDs created during this CodeService instance's lifetime
  private readonly sharedFileMode = 0o664;
  private readonly sharedDirMode = 0o775;
  private materializeUserGid: number | null = null;

  constructor(
    fastifyApp: FastifyInstance,
    workDir: string,
    logger: SystemLogger,
    supabaseClientService: SupabaseClientService,
    sandboxService: SandboxService,
    expoDevServerService: ExpoDevServerService,
    terminalService: TerminalService,
  ) {
    this.workDir = workDir;
    this.allowedRoot = path.resolve("/tmp/materialize-dev-server");
    this.fastifyApp = fastifyApp;
    this.logger = logger.child({ service: "CodeService" });
    this.supabaseClientService = supabaseClientService;
    this.sandboxService = sandboxService;
    this.expoDevServerService = expoDevServerService;
    this.terminalService = terminalService;
    this.fileSyncService = new FileSyncService(
      workDir,
      supabaseClientService.getClient(),
      logger,
    );
    this.toolPermissionService = new ToolPermissionService(
      this.allowedRoot,
      logger,
    );
    this.queryHandler = new ChatQueryHandler(
      workDir,
      logger,
      supabaseClientService,
      this.fileSyncService,
      this.toolPermissionService,
      sandboxService,
      expoDevServerService,
      terminalService,
    );

    // Get the GID for materialize-user to set group ownership on created files
    try {
      // Use 'id' command to get GID of materialize-user
      const gidOutput = execSync("id -g materialize-user", {
        encoding: "utf-8",
      }).trim();
      const gid = parseInt(gidOutput, 10);

      if (!isNaN(gid)) {
        this.materializeUserGid = gid;
        this.logger.consoleLogDevOnly("info", "Found materialize-user GID", {
          gid,
        });
      } else {
        this.logger.warn("Could not parse materialize-user GID", {
          gidOutput,
        });
      }
    } catch (error) {
      this.logger.warn(
        "Could not get materialize-user GID - group ownership will not be set",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }

    this.logger.consoleLogDevOnly("info", "CodeService initialized", {
      workDir: this.workDir,
      allowedRoot: this.allowedRoot,
    });

    const normalizedWorkDir = path.resolve(this.workDir);
    if (!this.isPathInsideAllowedRoot(normalizedWorkDir)) {
      this.logger.warn("WorkDir is outside the allowed root for Claude Code", {
        workDir: normalizedWorkDir,
        allowedRoot: this.allowedRoot,
      });
    }
  }

  public setOrchestrationToken(token: string): void {
    this.orchestrationToken = token;
    this.logger.consoleLogDevOnly("info", "Orchestration token set");
  }

  public getOrchestrationToken(): string | null {
    return this.orchestrationToken;
  }

  public registerRoutes(): void {
    // WebSocket endpoint for Claude Code
    this.fastifyApp.get(
      "/code/ws/:prototypeId",
      { websocket: true },
      this.handleWebSocketConnection.bind(this),
    );

    // Health check endpoint
    this.fastifyApp.get("/code/health", async () => {
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
    this.fastifyApp.get("/code/session", async () => {
      return {
        status: "ok",
        session: this.sessionState,
      };
    });
  }

  private handleWebSocketConnection(
    socket: WebSocket,
    req: FastifyRequest<{ Params: { prototypeId: string } }>,
  ): void {
    const { prototypeId } = req.params;
    const connectionId = `${prototypeId}-${Date.now()}`;

    this.logger.consoleLogDevOnly(
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
          this.logger.warn(
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

    this.activeConnections.set(connectionId, { socket, heartbeat });

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
        );
      } catch (error) {
        this.logger.error(
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
      this.logger.consoleLogDevOnly(
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
      this.logger.error(error, "Claude Code WebSocket error", {
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
  ): Promise<void> {
    switch (message.type) {
      case ChatClientEvent.QUERY:
        await this.handleQuery(socket, message.data, prototypeId);
        break;

      case ChatClientEvent.INTERRUPT:
        await this.handleInterrupt(socket);
        break;

      case ChatClientEvent.RESET_SESSION:
        // For now, we don't allow users to delete sessions
        // await this.handleResetSession(socket);
        break;

      case ChatClientEvent.SYNC_FILES:
        break;

      case ChatClientEvent.HISTORY_RESPONSE:
        await this.handleHistoryResponse(socket, message.data, prototypeId);
        break;
    }
  }

  private async handleQuery(
    socket: WebSocket,
    data: ChatQueryData,
    prototypeId: string,
  ): Promise<void> {
    // Delegate to ChatQueryHandler
    await this.queryHandler.handleQuery(
      {
        prototypeId,
        socket,
        data,
        sessionState: this.sessionState,
        validAiChatSessionIds: this.validAiChatSessionIds,
      },
      this.sendMessage.bind(this),
      this.persistMessage.bind(this),
      this.uploadChatImages.bind(this),
      async (prototypeId: string) => {
        await notifyOrchestrationStartChat(
          prototypeId,
          this.orchestrationToken,
          this.logger,
        );
      },
      async (prototypeId: string) => {
        await notifyOrchestrationEndChat(
          prototypeId,
          this.orchestrationToken,
          this.logger,
        );
      },
    );
  }

  private async handleHistoryResponse(
    socket: WebSocket,
    data: HistoryResponseData,
    prototypeId: string,
  ): Promise<void> {
    const { historical_messages, original_query } = data;

    this.logger.consoleLogDevOnly(
      "info",
      "Received history response from client",
      {
        messageCount: historical_messages.length,
        prototypeId,
      },
    );

    // Format historical messages for system prompt
    let historyContext = "";
    if (historical_messages.length > 0) {
      const formattedMessages = historical_messages
        .map((msg: { role: string; content: string }) => {
          const role = msg.role === "user" ? "User" : "Assistant";
          return `${role}: ${msg.content}`;
        })
        .join("\n\n");

      historyContext = `\n\n## Previous Conversation Context:\n${formattedMessages}\n\n---\n\nThe above is context from a previous session. Continue the conversation naturally.`;

      this.logger.consoleLogDevOnly("info", "Formatted history context", {
        contextLength: historyContext.length,
        messageCount: historical_messages.length,
      });
    } else {
      this.logger.consoleLogDevOnly(
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
    );
  }

  private async handleQueryWithHistory(
    socket: WebSocket,
    data: ChatQueryData,
    prototypeId: string,
    historyContext: string,
  ): Promise<void> {
    const options = (data.options ?? {}) as Options;

    this.logger.consoleLogDevOnly(
      "info",
      "Processing query with history context",
      {
        prototypeId,
        hasHistoryContext: historyContext.length > 0,
        historyContextLength: historyContext.length,
      },
    );

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
    );
  }

  private async handleInterrupt(socket: WebSocket): Promise<void> {
    this.logger.consoleLogDevOnly("info", "Interrupt requested", {
      sessionId: this.sessionState.sessionId,
      hasAbortController: !!this.sessionState.abortController,
    });

    if (this.sessionState.abortController) {
      try {
        // Abort the current query
        this.sessionState.abortController.abort();
        this.sessionState.abortController = null;

        this.logger.consoleLogDevOnly(
          "info",
          "Claude Code query interrupted successfully",
        );

        // Persist interrupt event to database
        await this.persistMessage(
          "system",
          "Query interrupted by user",
          "system",
          "query_interrupted",
          {
            sessionId: this.sessionState.sessionId,
          },
        );

        this.sendMessage(socket, {
          type: ChatEvent.INTERRUPTED,
          data: {
            message: "Query has been interrupted",
            sessionId: this.sessionState.sessionId,
          },
        });
      } catch (error) {
        this.logger.error(
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

  private async handleResetSession(socket: WebSocket): Promise<void> {
    this.logger.consoleLogDevOnly("info", "Resetting Claude Code session", {
      oldSessionId: this.sessionState.sessionId,
    });

    // Abort any active query before resetting
    if (this.sessionState.abortController) {
      this.sessionState.abortController.abort();
    }

    // Clear valid session IDs since we're resetting
    this.validAiChatSessionIds.clear();

    this.sessionState = {
      sessionId: null,
      prototypeChatSessionId: null,
      isActive: false,
      createdAt: 0,
      lastActiveAt: 0,
      abortController: null,
      trackedFiles: new Set<string>(),
      fileWatcher: null,
      designSystemId: null,
      designSystemRules: null,
      modifiedFilesThisQuery: new Set<string>(),
    };

    this.sendMessage(socket, {
      type: ChatEvent.SESSION_RESET,
      data: {
        message: "Session has been reset",
      },
    });
  }

  private sendMessage(socket: WebSocket, message: ChatServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        this.logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to send WebSocket message",
        );
      }
    }
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
    this.logger.consoleLogDevOnly(
      "info",
      "Registered valid session IDs from restored sessions",
      {
        count: sessionIds.length,
        sessionIds,
      },
    );
  }

  /**
   * Persists a message to the prototype_chat_messages table.
   * Called for user messages, assistant messages, tool events, and system events.
   */
  private async persistMessage(
    role: "user" | "assistant" | "system",
    content: string,
    messageType: "text" | "tool_use" | "tool_result" | "error" | "system",
    eventType?: string | null,
    eventData?: unknown,
  ): Promise<void> {
    if (!this.sessionState.prototypeChatSessionId) {
      this.logger.warn("Cannot persist message - no chat session ID", {
        role,
        messageType,
        eventType,
      });
      return;
    }

    try {
      const { error } = await this.supabaseClientService
        .getClient()
        .from("prototype_chat_messages")
        .insert({
          chat_session_id: this.sessionState.prototypeChatSessionId,
          role,
          content,
          message_type: messageType,
          event_type: eventType || null,
          event_data: eventData ? JSON.stringify(eventData) : null,
        });

      if (error) {
        this.logger.error(error, "Failed to persist message", {
          chatSessionId: this.sessionState.prototypeChatSessionId,
          role,
          messageType,
          eventType,
        });
      } else {
        this.logger.consoleLogDevOnly("debug", "Persisted message", {
          chatSessionId: this.sessionState.prototypeChatSessionId,
          role,
          messageType,
          eventType,
          contentLength: content.length,
        });
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Error in persistMessage",
        {
          chatSessionId: this.sessionState.prototypeChatSessionId,
          role,
          messageType,
        },
      );
    }
  }

  /**
   * Uploads chat images to Supabase Storage and updates the user message with image metadata
   * @param prototypeId - The prototype ID
   * @param chatSessionId - The chat session ID
   * @param images - Array of images with base64 data and media type
   */
  private async uploadChatImages(
    prototypeId: string,
    chatSessionId: string,
    images: Array<{ base64: string; mediaType: string }>,
  ): Promise<void> {
    try {
      this.logger.consoleLogDevOnly(
        "info",
        "Uploading chat images to storage",
        {
          prototypeId,
          chatSessionId,
          imageCount: images.length,
        },
      );

      const uploadedImageMetadata: Array<{
        storage_path: string;
        media_type: string;
        file_size: number;
      }> = [];

      // Process and upload each image
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        try {
          // Resize and optimize image
          const processed = await processImage(image.base64, image.mediaType);

          // Generate unique filename: timestamp_uuid.ext
          const timestamp = Date.now();
          const uuid = Math.random().toString(36).substring(2, 15);
          const filename = `${timestamp}_${uuid}.${processed.extension}`;
          const storagePath = `${prototypeId}/chat/${chatSessionId}/${filename}`;

          // Upload to Supabase Storage
          const { error: uploadError } = await this.supabaseClientService
            .getClient()
            .storage.from("prototype-assets")
            .upload(storagePath, processed.buffer, {
              contentType: processed.mediaType,
              upsert: false,
            });

          if (uploadError) {
            throw uploadError;
          }

          uploadedImageMetadata.push({
            storage_path: storagePath,
            media_type: processed.mediaType,
            file_size: processed.buffer.length,
          });

          this.logger.consoleLogDevOnly("debug", "Uploaded chat image", {
            storagePath,
            mediaType: processed.mediaType,
            fileSize: processed.buffer.length,
          });
        } catch (error) {
          this.logger.error(
            error instanceof Error ? error : new Error(String(error)),
            `Failed to upload image ${i + 1}/${images.length}`,
            { prototypeId, chatSessionId },
          );
          // Continue with other images even if one fails
        }
      }

      // Update the user message in database with image metadata
      if (uploadedImageMetadata.length > 0) {
        // Find the most recent user message for this chat session
        const { data: messages, error: fetchError } =
          await this.supabaseClientService
            .getClient()
            .from("prototype_chat_messages")
            .select("id")
            .eq("chat_session_id", chatSessionId)
            .eq("role", "user")
            .order("created_at", { ascending: false })
            .limit(1);

        if (fetchError) {
          throw fetchError;
        }

        if (messages && messages.length > 0) {
          const messageId = messages[0].id;

          // Update the message with image metadata
          const { error: updateError } = await this.supabaseClientService
            .getClient()
            .from("prototype_chat_messages")
            .update({
              event_data: JSON.stringify({ images: uploadedImageMetadata }),
            })
            .eq("id", messageId);

          if (updateError) {
            throw updateError;
          }

          this.logger.consoleLogDevOnly(
            "info",
            "Updated user message with image metadata",
            {
              messageId,
              imageCount: uploadedImageMetadata.length,
            },
          );
        }
      }

      this.logger.consoleLogDevOnly("info", "Chat images upload completed", {
        prototypeId,
        chatSessionId,
        successCount: uploadedImageMetadata.length,
        totalCount: images.length,
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to upload chat images",
        { prototypeId, chatSessionId },
      );
      // Don't throw - we don't want to fail the entire query if image upload fails
    }
  }

  /**
   * Starts a file system watcher to track all file changes in the work directory.
   * Uses chokidar for cross-platform file watching with proper event handling.
   */
  private startFileWatcher(): void {
    // Clean up any existing watcher
    if (this.sessionState.fileWatcher) {
      this.sessionState.fileWatcher.close();
    }

    this.logger.consoleLogDevOnly("info", "Starting file system watcher", {
      workDir: this.workDir,
    });

    try {
      // Initialize chokidar watcher with optimized settings
      const watcher = chokidar.watch(this.workDir, {
        // Don't fire events for files that already exist when watcher starts
        ignoreInitial: true,
        // Wait for file writes to complete before firing events
        awaitWriteFinish: {
          stabilityThreshold: 200, // Wait 200ms after last change
          pollInterval: 50,
        },
        // Performance optimizations
        atomic: true, // Use atomic writes when available
        usePolling: false, // Use native OS events (faster)
        // Ignore common directories and system files that shouldn't be synced
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.next/**",
          "**/dist/**",
          "**/build/**",
          "**/.cache/**",
          "**/tmp/**",
          "**/*.log",
          "**/.DS_Store",
        ],
      });

      // Track file additions and modifications
      watcher.on("add", (filePath) => {
        const relativePath = this.getRelativePath(filePath);
        this.sessionState.trackedFiles.add(relativePath);
        this.logger.consoleLogDevOnly("debug", "File watcher: file added", {
          path: relativePath,
          totalTracked: this.sessionState.trackedFiles.size,
        });
      });

      watcher.on("change", (filePath) => {
        const relativePath = this.getRelativePath(filePath);
        this.sessionState.trackedFiles.add(relativePath);
        this.logger.consoleLogDevOnly("debug", "File watcher: file changed", {
          path: relativePath,
          totalTracked: this.sessionState.trackedFiles.size,
        });
      });

      watcher.on("addDir", (dirPath) => {
        this.logger.consoleLogDevOnly(
          "debug",
          "File watcher: directory added",
          {
            path: this.getRelativePath(dirPath),
          },
        );
      });

      // Track file deletions separately (handled by FileSyncService)
      watcher.on("unlink", (filePath) => {
        const relativePath = this.getRelativePath(filePath);
        this.sessionState.trackedFiles.add(relativePath);
        this.logger.consoleLogDevOnly("debug", "File watcher: file deleted", {
          path: relativePath,
          totalTracked: this.sessionState.trackedFiles.size,
        });
      });

      // Log watcher errors but don't crash
      watcher.on("error", (error) => {
        this.logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "File watcher error",
        );
      });

      // Log when watcher is ready
      watcher.on("ready", () => {
        this.logger.consoleLogDevOnly("info", "File system watcher ready", {
          workDir: this.workDir,
        });
      });

      this.sessionState.fileWatcher = watcher;
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to start file watcher",
      );
      // Don't throw - we can fall back to hook-based tracking if enabled
    }
  }

  /**
   * Stops the file system watcher and cleans up resources.
   */
  private async stopFileWatcher(): Promise<void> {
    if (!this.sessionState.fileWatcher) {
      return;
    }

    try {
      this.logger.consoleLogDevOnly("info", "Stopping file system watcher", {
        trackedFilesCount: this.sessionState.trackedFiles.size,
      });

      await this.sessionState.fileWatcher.close();
      this.sessionState.fileWatcher = null;

      this.logger.consoleLogDevOnly(
        "info",
        "File system watcher stopped successfully",
      );
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to stop file watcher",
      );
      // Force cleanup even if close fails
      this.sessionState.fileWatcher = null;
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
    this.logger.info("Shutting down CodeService");

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
        this.logger.warn("Failed to close WebSocket connection", {
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
      fileWatcher: null,
      designSystemId: null,
      designSystemRules: null,
      modifiedFilesThisQuery: new Set<string>(),
    };

    this.logger.info("CodeService shutdown complete");
  }
}
