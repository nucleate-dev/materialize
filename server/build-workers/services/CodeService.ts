import {
  HookInput,
  HookJSONOutput,
  Options,
  query,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { SupabaseClient } from "@supabase/supabase-js";
import axios from "axios";
import { FastifyInstance, FastifyRequest } from "fastify";
import WebSocket from "ws";
import { SystemLogger } from "../loggers/SystemLogger.js";
import { Database } from "../types/supabase.js";
import { FileSyncService } from "./FileSyncService.js";

interface CodeSessionState {
  sessionId: string | null;
  isActive: boolean;
  createdAt: number;
  lastActiveAt: number;
  abortController: AbortController | null;
}

interface ClientMessage {
  type: string;
  data?: unknown;
}

interface ContentBlock {
  type: "text" | "image";
  text?: string;
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

interface QueryData {
  prompt?: string; // Keep for backward compatibility
  content?: ContentBlock[];
  options?: Options;
}

export class CodeService {
  private readonly workDir: string;
  private readonly logger: SystemLogger;
  private readonly fastifyApp: FastifyInstance;
  private readonly fileSyncService: FileSyncService;
  private sessionState: CodeSessionState = {
    sessionId: null,
    isActive: false,
    createdAt: 0,
    lastActiveAt: 0,
    abortController: null,
  };
  private activeConnections = new Map<string, WebSocket>();
  private orchestrationToken: string | null = null;

  constructor(
    fastifyApp: FastifyInstance,
    workDir: string,
    logger: SystemLogger,
    supabaseClient: SupabaseClient<Database>,
  ) {
    this.workDir = workDir;
    this.fastifyApp = fastifyApp;
    this.logger = logger.child({ service: "CodeService" });
    this.fileSyncService = new FileSyncService(
      workDir,
      supabaseClient,
      logger,
    );

    this.logger.info("CodeService initialized", {
      workDir: this.workDir,
    });
  }

  public setOrchestrationToken(token: string): void {
    this.orchestrationToken = token;
    this.logger.info("Orchestration token set");
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

    this.logger.info("Claude Code WebSocket connection established", {
      prototypeId,
      connectionId,
    });

    this.activeConnections.set(connectionId, socket);

    // Send initial connection confirmation
    this.sendMessage(socket, {
      type: "system",
      subtype: "connection",
      data: {
        connectionId,
        prototypeId,
        sessionId: this.sessionState.sessionId,
      },
    });

    // Handle incoming messages
    socket.on("message", async (raw: Buffer | string) => {
      try {
        const message = JSON.parse(raw.toString());
        await this.handleClientMessage(socket, message, prototypeId);
      } catch (error) {
        this.logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to process WebSocket message",
          { connectionId },
        );
        this.sendMessage(socket, {
          type: "error",
          error: {
            message: "Failed to process message",
            details: error instanceof Error ? error.message : String(error),
          },
        });
      }
    });

    socket.on("close", (code: number, reason: Buffer) => {
      this.logger.info("Claude Code WebSocket connection closed", {
        prototypeId,
        connectionId,
        code,
        reason: reason.toString(),
      });
      this.activeConnections.delete(connectionId);
    });

    socket.on("error", (error: Error) => {
      this.logger.error(error, "Claude Code WebSocket error", {
        prototypeId,
        connectionId,
      });
      this.activeConnections.delete(connectionId);
    });
  }

  private async handleClientMessage(
    socket: WebSocket,
    message: ClientMessage,
    prototypeId: string,
  ): Promise<void> {
    const { type, data } = message;

    switch (type) {
      case "query":
        await this.handleQuery(socket, data as QueryData, prototypeId);
        break;

      case "interrupt":
        await this.handleInterrupt(socket, data);
        break;

      case "reset_session":
        await this.handleResetSession(socket);
        break;

      default:
        this.sendMessage(socket, {
          type: "error",
          error: {
            message: `Unknown message type: ${type}`,
          },
        });
    }
  }

  private async handleQuery(
    socket: WebSocket,
    data: QueryData,
    prototypeId: string,
  ): Promise<void> {
    const { prompt, content, options = {} } = data;

    // Support both old format (prompt) and new format (content)
    if (!prompt && !content) {
      this.sendMessage(socket, {
        type: "error",
        error: { message: "prompt or content is required" },
      });
      return;
    }

    // Validate content if provided
    if (content && (!Array.isArray(content) || content.length === 0)) {
      this.sendMessage(socket, {
        type: "error",
        error: { message: "content must be a non-empty array" },
      });
      return;
    }

    this.logger.info("Starting Claude Code query", {
      prototypeId,
      hasSession: !!this.sessionState.sessionId,
      hasPrompt: !!prompt,
      hasContent: !!content,
      contentLength: content?.length,
    });

    // Notify control plane that chat is starting
    await this.notifyOrchestrationStartChat(prototypeId);

    // CRITICAL: Wrap entire query processing in try-finally to ensure end-chat
    // notification is ALWAYS sent, regardless of success or failure
    try {
      try {
        // Create a new AbortController for this query
        const abortController = new AbortController();
        this.sessionState.abortController = abortController;

        // Prepare message content - support both text and image content blocks
        const messageContent:
          | string
          | Array<{ type: string; text?: string; source?: unknown }> = content
          ? content.map((block) => {
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
            })
          : prompt!;

        // Create async generator for streaming input
        async function* generateMessages(): AsyncGenerator<{
          type: "user";
          message: {
            role: "user";
            content:
              | string
              | Array<{ type: string; text?: string; source?: unknown }>;
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

        // Query Claude with session resumption if available
        const queryOptions = {
          ...options,
          includePartialMessages: false,
          cwd: this.workDir,
          maxTurns: options?.maxTurns ?? 50,
          allowedTools: options?.allowedTools ?? [
            "Read",
            "Write",
            "Edit",
            "Glob",
            "Grep",
            "Bash",
          ],
          model: options?.model ?? "claude-sonnet-4-5",
          systemPrompt: "claude_code",
          // permissionMode: "bypassPermissions" as PermissionMode, // other options are 'default', 'acceptEdits', 'plan'
          abortController,
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
                    try {
                      if (input.hook_event_name === "PreToolUse") {
                        // Send tool start event to WebSocket client
                        if (socket.readyState === WebSocket.OPEN) {
                          socket.send(
                            JSON.stringify({
                              type: "tool_start",
                              data: {
                                tool_name: input.tool_name,
                                tool_input: input.tool_input,
                                tool_call_id: toolUseID,
                              },
                            }),
                          );
                        }
                      }
                    } catch (error) {
                      // Log but don't fail the hook
                      this.logger.error(
                        error instanceof Error
                          ? error
                          : new Error(String(error)),
                        "PreToolUse hook error",
                      );
                    }
                    return { continue: true };
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
                    try {
                      if (input.hook_event_name === "PostToolUse") {
                        // Send tool complete event to WebSocket client
                        if (socket.readyState === WebSocket.OPEN) {
                          socket.send(
                            JSON.stringify({
                              type: "tool_complete",
                              data: {
                                tool_name: input.tool_name,
                                tool_input: input.tool_input,
                                tool_response: input.tool_response,
                                tool_call_id: toolUseID,
                              },
                            }),
                          );
                        }
                      }
                    } catch (error) {
                      // Log but don't fail the hook
                      this.logger.error(
                        error instanceof Error
                          ? error
                          : new Error(String(error)),
                        "PostToolUse hook error",
                      );
                    }
                    return { continue: true };
                  },
                ],
              },
            ],
          },
          // Resume existing session if available
          ...(this.sessionState.sessionId && {
            resume: this.sessionState.sessionId,
          }),
        };

        this.logger.info("Querying Claude Agent SDK", {
          hasResume: !!queryOptions.resume,
          resumeSessionId: queryOptions.resume,
          model: queryOptions.model,
          cwd: this.workDir,
        });

        // Stream responses back to client
        const response = query({
          prompt: generateMessages() as AsyncIterable<SDKUserMessage>,
          options: queryOptions,
        });

        for await (const msg of response) {
          // Capture session ID from init message
          if (msg.type === "system" && msg.subtype === "init") {
            const isNewSession = this.sessionState.sessionId !== msg.session_id;
            const previousSessionId = this.sessionState.sessionId;

            this.sessionState.sessionId = msg.session_id;
            this.sessionState.isActive = true;
            if (isNewSession) {
              this.sessionState.createdAt = Date.now();
            }
            this.sessionState.lastActiveAt = Date.now();

            this.logger.info("Claude Code session initialized", {
              sessionId: msg.session_id,
              isNewSession,
              previousSessionId,
            });
          }

          // Update last active time
          this.sessionState.lastActiveAt = Date.now();

          // Forward message to client
          this.sendMessage(socket, {
            type: "agent_message",
            data: msg,
          });
        }

        // Clear the abort controller
        this.sessionState.abortController = null;

        // Send completion message
        this.sendMessage(socket, {
          type: "query_complete",
          data: {
            sessionId: this.sessionState.sessionId,
          },
        });
      } catch (error) {
        // Clear the abort controller on error
        this.sessionState.abortController = null;

        this.logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Claude Code query failed",
          { prototypeId },
        );

        this.sendMessage(socket, {
          type: "error",
          error: {
            message: "Query failed",
            details: error instanceof Error ? error.message : String(error),
          },
        });
      }
    } finally {
      // Sync file changes to Supabase before notifying orchestration
      // This ensures all Claude Code edits are persisted before the session ends
      try {
        this.logger.info("Syncing file changes to Supabase", { prototypeId });
        const syncResult =
          await this.fileSyncService.syncFilesToSupabase(prototypeId);

        if (syncResult.success) {
          this.logger.info("File sync completed successfully", {
            prototypeId,
            filesUpdated: syncResult.filesUpdated,
            filesDeleted: syncResult.filesDeleted,
            assetsUpdated: syncResult.assetsUpdated,
            assetsDeleted: syncResult.assetsDeleted,
          });
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

        // Send sync status to WebSocket client with detailed file change information
        this.sendMessage(socket, {
          type: "file_sync_complete",
          data: {
            success: syncResult.success,
            filesUpdated: syncResult.filesUpdated,
            filesDeleted: syncResult.filesDeleted,
            assetsUpdated: syncResult.assetsUpdated,
            assetsDeleted: syncResult.assetsDeleted,
            errorCount: syncResult.errors.length,
            errors: syncResult.errors.length > 0 ? syncResult.errors : undefined,
          },
        });
      } catch (syncError) {
        // Log sync errors but don't fail the session
        this.logger.error(
          syncError instanceof Error
            ? syncError
            : new Error(String(syncError)),
          "Failed to sync files to Supabase",
          { prototypeId },
        );

        // Still send a sync complete message, but mark as failed
        this.sendMessage(socket, {
          type: "file_sync_complete",
          data: {
            success: false,
            filesUpdated: 0,
            filesDeleted: 0,
            assetsUpdated: 0,
            assetsDeleted: 0,
            errorCount: 1,
            errors: [
              syncError instanceof Error
                ? syncError.message
                : String(syncError),
            ],
          },
        });
      }

      // CRITICAL: This notification must ALWAYS be sent at the end of every chat session,
      // regardless of success or failure. The control plane relies on this to properly
      // manage container state, resource allocation, and cleanup operations.
      // The method includes retry logic to ensure delivery.
      await this.notifyOrchestrationEndChat(prototypeId);
    }
  }

  private async handleInterrupt(
    socket: WebSocket,
    _data: unknown,
  ): Promise<void> {
    this.logger.info("Interrupt requested", {
      sessionId: this.sessionState.sessionId,
      hasAbortController: !!this.sessionState.abortController,
    });

    if (this.sessionState.abortController) {
      try {
        // Abort the current query
        this.sessionState.abortController.abort();
        this.sessionState.abortController = null;

        this.logger.info("Claude Code query interrupted successfully");

        this.sendMessage(socket, {
          type: "interrupted",
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
          type: "error",
          error: {
            message: "Failed to interrupt query",
            details: error instanceof Error ? error.message : String(error),
          },
        });
      }
    } else {
      this.sendMessage(socket, {
        type: "info",
        message: "No active query to interrupt",
      });
    }
  }

  private async handleResetSession(socket: WebSocket): Promise<void> {
    this.logger.info("Resetting Claude Code session", {
      oldSessionId: this.sessionState.sessionId,
    });

    // Abort any active query before resetting
    if (this.sessionState.abortController) {
      this.sessionState.abortController.abort();
    }

    this.sessionState = {
      sessionId: null,
      isActive: false,
      createdAt: 0,
      lastActiveAt: 0,
      abortController: null,
    };

    this.sendMessage(socket, {
      type: "session_reset",
      data: {
        message: "Session has been reset",
      },
    });
  }

  private sendMessage(socket: WebSocket, message: unknown): void {
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

  /**
   * Notifies the control plane that a chat session has started
   */
  private async notifyOrchestrationStartChat(
    prototypeId: string,
  ): Promise<void> {
    const serverEndpoint = process.env.MATERIALIZE_SERVER_ENDPOINT;
    if (!serverEndpoint) {
      this.logger.warn(
        "MATERIALIZE_SERVER_ENDPOINT not set, skipping start-chat notification",
      );
      return;
    }

    if (!this.orchestrationToken) {
      this.logger.error(
        new Error("Orchestration token not set"),
        "Cannot notify start-chat without orchestration token",
        { prototypeId },
      );
      return;
    }

    try {
      await axios.post(
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
      this.logger.info("Notified control plane of chat start", { prototypeId });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to notify control plane of chat start",
        { prototypeId },
      );
      // Don't throw - we want the chat to proceed even if notification fails
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
    const serverEndpoint = process.env.MATERIALIZE_SERVER_ENDPOINT;
    if (!serverEndpoint) {
      this.logger.warn(
        "MATERIALIZE_SERVER_ENDPOINT not set, skipping end-chat notification",
      );
      return;
    }

    if (!this.orchestrationToken) {
      this.logger.error(
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
        await axios.post(
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
        this.logger.info("Notified control plane of chat end", {
          prototypeId,
          attempt,
        });
        return; // Success - exit the function
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          lastError,
          `Failed to notify control plane of chat end (attempt ${attempt}/${maxRetries})`,
          { prototypeId },
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
    this.logger.error(
      lastError || new Error("Unknown error"),
      "CRITICAL: Failed to notify control plane of chat end after all retries",
      { prototypeId, maxRetries },
    );
  }

  public getSessionState(): CodeSessionState {
    return { ...this.sessionState };
  }

  public async shutdown(): Promise<void> {
    this.logger.info("Shutting down CodeService");

    // Abort any active query
    if (this.sessionState.abortController) {
      this.sessionState.abortController.abort();
    }

    // Close all active connections
    for (const [connectionId, socket] of this.activeConnections.entries()) {
      try {
        socket.close(1000, "Server shutting down");
      } catch {
        this.logger.warn("Failed to close WebSocket connection", {
          connectionId,
        });
      }
    }

    this.activeConnections.clear();
    this.sessionState = {
      sessionId: null,
      isActive: false,
      createdAt: 0,
      lastActiveAt: 0,
      abortController: null,
    };

    this.logger.info("CodeService shutdown complete");
  }
}
