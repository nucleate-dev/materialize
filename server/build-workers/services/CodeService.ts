import {
  HookInput,
  HookJSONOutput,
  Options,
  PermissionMode,
  query,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { FastifyInstance, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import WebSocket from "ws";
import { SupabaseClient } from "@supabase/supabase-js";
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
  private readonly getSupabaseClient: () => SupabaseClient | null;
  private sessionState: CodeSessionState = {
    sessionId: null,
    isActive: false,
    createdAt: 0,
    lastActiveAt: 0,
    abortController: null,
  };
  private activeConnections = new Map<string, WebSocket>();
  private connectionMetadata = new WeakMap<
    WebSocket,
    { connectionId: string; prototypeId: string }
  >();
  private changedFilesDuringQuery = new Map<string, Set<string>>();
  private deletedFilesDuringQuery = new Map<string, Set<string>>();

  constructor(
    fastifyApp: FastifyInstance,
    workDir: string,
    logger: SystemLogger,
    getSupabaseClient: () => SupabaseClient | null,
  ) {
    this.workDir = workDir;
    this.fastifyApp = fastifyApp;
    this.logger = logger.child({ service: "CodeService" });
    this.getSupabaseClient = getSupabaseClient;

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
    this.connectionMetadata.set(socket, { connectionId, prototypeId });

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
      this.connectionMetadata.delete(socket);
    });

    socket.on("error", (error: Error) => {
      this.logger.error(error, "Claude Code WebSocket error", {
        prototypeId,
        connectionId,
      });
      this.activeConnections.delete(connectionId);
      this.connectionMetadata.delete(socket);
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
    const connectionId = this.getConnectionIdForSocket(socket);

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

    try {
      if (connectionId) {
        this.changedFilesDuringQuery.set(connectionId, new Set());
        this.deletedFilesDuringQuery.set(connectionId, new Set());
      }
      // Create a new AbortController for this query
      const abortController = new AbortController();
      this.sessionState.abortController = abortController;

      // Prepare message content - support both text and image content blocks
      const messageContent: string | Array<{ type: string; text?: string; source?: unknown }> = content
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
        message: { role: "user"; content: string | Array<{ type: string; text?: string; source?: unknown }> };
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
        permissionMode: "bypassPermissions" as PermissionMode, // other options are 'default', 'acceptEdits', 'plan'
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
                      error instanceof Error ? error : new Error(String(error)),
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
                      if (connectionId && this.isFileModifyingTool(input.tool_name)) {
                        this.trackChangedFile(connectionId, input);
                      }
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
                      error instanceof Error ? error : new Error(String(error)),
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
    } finally {
      if (connectionId) {
        await this.syncFilesToSupabase(connectionId, prototypeId, socket);
      }
    }
  }

  private getConnectionIdForSocket(socket: WebSocket): string | null {
    const metadata = this.connectionMetadata.get(socket);
    return metadata?.connectionId ?? null;
  }

  private isFileModifyingTool(toolName: string): boolean {
    const normalized = toolName.toLowerCase();
    return ["write", "edit", "search_replace", "replace", "delete"].some((token) =>
      normalized.includes(token),
    );
  }

  private normalizeFilePath(filePath: string): string | null {
    if (!filePath) {
      return null;
    }

    const normalizedPath = path.normalize(filePath);
    let relativePath = normalizedPath;

    if (path.isAbsolute(normalizedPath)) {
      relativePath = path.relative(this.workDir, normalizedPath);
    } else if (normalizedPath.startsWith("./")) {
      relativePath = normalizedPath.replace(/^\.\/+/, "");
    }

    if (!relativePath || relativePath.startsWith("..")) {
      return null;
    }

    return relativePath;
  }

  private collectFilePathsFromToolInput(
    value: unknown,
    accumulator: Set<string>,
    keyHint?: string,
  ): void {
    if (typeof value === "string") {
      if (!keyHint || keyHint.includes("path") || keyHint.includes("file")) {
        accumulator.add(value);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectFilePathsFromToolInput(item, accumulator, keyHint);
      }
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, nestedValue] of Object.entries(value)) {
        const loweredKey = key.toLowerCase();
        if (loweredKey.includes("path") || loweredKey.includes("file")) {
          this.collectFilePathsFromToolInput(nestedValue, accumulator, loweredKey);
        }
      }
    }
  }

  private trackChangedFile(connectionId: string, hookInput: HookInput): void {
    const toolName = hookInput.tool_name.toLowerCase();
    const toolInput = hookInput.tool_input as unknown;

    if (!this.changedFilesDuringQuery.has(connectionId)) {
      this.changedFilesDuringQuery.set(connectionId, new Set());
    }
    if (!this.deletedFilesDuringQuery.has(connectionId)) {
      this.deletedFilesDuringQuery.set(connectionId, new Set());
    }

    const changed = this.changedFilesDuringQuery.get(connectionId)!;
    const deleted = this.deletedFilesDuringQuery.get(connectionId)!;

    const rawPaths = new Set<string>();
    this.collectFilePathsFromToolInput(toolInput, rawPaths);

    for (const rawPath of rawPaths) {
      const normalizedPath = this.normalizeFilePath(rawPath);
      if (!normalizedPath) {
        continue;
      }

      if (toolName.includes("delete")) {
        deleted.add(normalizedPath);
        changed.delete(normalizedPath);
      } else if (
        toolName.includes("write") ||
        toolName.includes("edit") ||
        toolName.includes("replace")
      ) {
        changed.add(normalizedPath);
        deleted.delete(normalizedPath);
      }
    }
  }

  private async syncFilesToSupabase(
    connectionId: string,
    prototypeId: string,
    socket: WebSocket,
  ): Promise<void> {
    const changed = this.changedFilesDuringQuery.get(connectionId) || new Set<string>();
    const deleted = this.deletedFilesDuringQuery.get(connectionId) || new Set<string>();

    if (changed.size === 0 && deleted.size === 0) {
      this.changedFilesDuringQuery.delete(connectionId);
      this.deletedFilesDuringQuery.delete(connectionId);
      return;
    }

    const supabaseClient = this.getSupabaseClient();
    if (!supabaseClient) {
      this.logger.warn("Supabase client not available - skipping file sync", {
        prototypeId,
      });
      this.changedFilesDuringQuery.delete(connectionId);
      this.deletedFilesDuringQuery.delete(connectionId);
      return;
    }

    try {
      const fileUpdates: Array<{
        prototype_id: string;
        name: string;
        contents: string;
        updated_at: string;
      }> = [];

      for (const filePath of changed) {
        const fullPath = path.isAbsolute(filePath)
          ? filePath
          : path.join(this.workDir, filePath);
        try {
          const contents = await fs.readFile(fullPath, "utf-8");
          fileUpdates.push({
            prototype_id: prototypeId,
            name: filePath,
            contents,
            updated_at: new Date().toISOString(),
          });
        } catch (error) {
          this.logger.warn("Failed to read file for Supabase sync", {
            prototypeId,
            filePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (fileUpdates.length > 0) {
        const { error } = await supabaseClient
          .from("prototype_files")
          .upsert(fileUpdates, {
            onConflict: "prototype_id,name",
            ignoreDuplicates: false,
          });

        if (error) {
          throw error;
        }
      }

      if (deleted.size > 0) {
        const { error } = await supabaseClient
          .from("prototype_files")
          .delete()
          .eq("prototype_id", prototypeId)
          .in("name", Array.from(deleted));

        if (error) {
          throw error;
        }
      }

      this.logger.info("Synced Claude Code file changes to Supabase", {
        prototypeId,
        updated: fileUpdates.length,
        deleted: deleted.size,
      });

      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "files_changed",
            data: {
              changedFiles: Array.from(changed),
              deletedFiles: Array.from(deleted),
            },
          }),
        );
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to sync Claude Code files to Supabase",
        { prototypeId },
      );
    } finally {
      this.changedFilesDuringQuery.delete(connectionId);
      this.deletedFilesDuringQuery.delete(connectionId);
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
