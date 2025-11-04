import {
  Options,
  PermissionMode,
  HookInput,
  HookJSONOutput,
  query,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { FastifyInstance, FastifyRequest } from "fastify";
import WebSocket from "ws";
import { SystemLogger } from "../loggers/SystemLogger.js";

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

interface QueryData {
  prompt: string;
  options?: Options;
}

export class CodeService {
  private readonly workDir: string;
  private readonly logger: SystemLogger;
  private readonly fastifyApp: FastifyInstance;
  private sessionState: CodeSessionState = {
    sessionId: null,
    isActive: false,
    createdAt: 0,
    lastActiveAt: 0,
    abortController: null,
  };
  private activeConnections = new Map<string, WebSocket>();

  constructor(
    fastifyApp: FastifyInstance,
    workDir: string,
    logger: SystemLogger,
  ) {
    this.workDir = workDir;
    this.fastifyApp = fastifyApp;
    this.logger = logger.child({ service: "CodeService" });

    this.logger.info("CodeService initialized", {
      workDir: this.workDir,
    });
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
    data: { prompt: string; options?: Options },
    prototypeId: string,
  ): Promise<void> {
    const { prompt, options = {} } = data;

    if (!prompt) {
      this.sendMessage(socket, {
        type: "error",
        error: { message: "prompt is required" },
      });
      return;
    }

    this.logger.info("Starting Claude Code query", {
      prototypeId,
      hasSession: !!this.sessionState.sessionId,
    });

    try {
      // Create a new AbortController for this query
      const abortController = new AbortController();
      this.sessionState.abortController = abortController;

      // Create async generator for streaming input
      async function* generateMessages(): AsyncGenerator<{
        type: "user";
        message: { role: "user"; content: string };
      }> {
        yield {
          type: "user" as const,
          message: {
            role: "user" as const,
            content: prompt,
          },
        };
      }

      // Query Claude with session resumption if available
      const queryOptions = {
        ...options,
        includePartialMessages: true,
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
        permissionMode: "bypassPermissions" as PermissionMode, // other options are 'default', 'acceptEdits', 'plan'
        abortController,
        // Add hooks to stream tool usage to WebSocket clients
        hooks: {
          PreToolUse: [
            {
              hooks: [
                async (input: HookInput): Promise<HookJSONOutput> => {
                  if (input.hook_event_name === "PreToolUse") {
                    // Send tool start event to WebSocket client
                    this.sendMessage(socket, {
                      type: "tool_start",
                      data: {
                        tool_name: input.tool_name,
                        tool_input: input.tool_input,
                      },
                    });
                  }
                  return { continue: true };
                },
              ],
            },
          ],
          PostToolUse: [
            {
              hooks: [
                async (input: HookInput): Promise<HookJSONOutput> => {
                  if (input.hook_event_name === "PostToolUse") {
                    // Send tool complete event to WebSocket client
                    this.sendMessage(socket, {
                      type: "tool_complete",
                      data: {
                        tool_name: input.tool_name,
                        tool_input: input.tool_input,
                        tool_response: input.tool_response,
                      },
                    });
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
