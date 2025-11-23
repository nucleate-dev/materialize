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
import { SupabaseClient } from "@supabase/supabase-js";
import axios from "axios";
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
  SyncFilesRequest,
} from "../types/ChatTypes.js";
import { Database } from "../types/supabase.js";
import { SYSTEM_PROMPT } from "../utils/ClaudeCodePrompts.js";
import { processImage } from "../utils/imageProcessing.js";
import {
  PrototypeAssetInputWithContent,
  PrototypeFileInput,
  writeProjectFiles,
} from "../utils/shared-utils.js";
import { FileSyncService } from "./FileSyncService.js";
import { SupabaseClientService } from "./SupabaseClientService.js";
import { hasRemainingCredits } from "./utils/credit-checks.js";
import { trackApiUsageBuildWorker } from "./utils/usage-tracking.js";
import { ToolPermissionService } from "./utils/tool-permission-service.js";
/**
 * FILE SYNC STRATEGY
 *
 * This service supports two file sync strategies:
 *
 * 1. FULL_SYNC (default, recommended):
 *    - Syncs ALL files from workDir to Supabase after each query
 *    - Simple, reliable, guarantees complete state sync
 *    - No tracking overhead during query execution
 *    - Slightly higher network usage but negligible for typical projects
 *
 * 2. INCREMENTAL_SYNC (legacy):
 *    - Uses hook-based tracking to capture only modified files
 *    - PostToolUse hook tracks Write, Edit, and NotebookEdit tool executions
 *    - Lower network usage but adds complexity
 *    - Risk of missing files if tracking fails
 *
 * Set ENABLE_FULL_SYNC to false to use incremental sync strategy.
 */
const ENABLE_FULL_SYNC = true;
const CHAT_HEARTBEAT_INTERVAL_MS = 15000;
const HISTORY_MESSAGE_REQUEST_COUNT = 6;

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

interface ChatConnection {
  socket: WebSocket;
  heartbeat?: NodeJS.Timeout;
}

export class CodeService {
  private readonly workDir: string;
  private readonly allowedRoot: string;
  private readonly logger: SystemLogger;
  private readonly fastifyApp: FastifyInstance;
  private readonly fileSyncService: FileSyncService;
  private readonly supabaseClientService: SupabaseClientService;
  private readonly toolPermissionService: ToolPermissionService;
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
  ) {
    this.workDir = workDir;
    this.allowedRoot = path.resolve("/tmp/materialize-dev-server");
    this.fastifyApp = fastifyApp;
    this.logger = logger.child({ service: "CodeService" });
    this.supabaseClientService = supabaseClientService;
    this.fileSyncService = new FileSyncService(
      workDir,
      supabaseClientService.getClient(),
      logger,
    );
    this.toolPermissionService = new ToolPermissionService(
      this.allowedRoot,
      logger,
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
        this.logger.info("Found materialize-user GID", {
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

    this.logger.info("CodeService initialized", {
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
      this.logger.info("Claude Code WebSocket connection closed", {
        prototypeId,
        connectionId,
        code,
        reason: reason.toString(),
      });
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
        await this.handleResetSession(socket);
        break;

      case ChatClientEvent.SYNC_FILES:
        await this.handleSyncFiles(socket, message.data);
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
    const {
      prompt,
      content,
      token,
      ai_chat_session_id,
      prototype_chat_session_id,
      current_viewing_path,
    } = data;
    const options = (data.options ?? {}) as Options;

    // Log all incoming parameters for debugging
    this.logger.info("handleQuery received parameters", {
      prototypeId,
      session_id: ai_chat_session_id,
      chat_session_id: prototype_chat_session_id,
      current_viewing_path,
      custom_design_system_id: data.custom_design_system_id,
      hasPrompt: !!prompt,
      hasContent: !!content,
      contentLength: content?.length,
      hasToken: !!token,
      hasOptions: !!data.options,
      options: data.options,
    });

    // Support both old format (prompt) and new format (content)
    if (!prompt && !content) {
      this.sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: { message: "prompt or content is required" },
      });
      return;
    }

    // Validate content if provided
    if (content && (!Array.isArray(content) || content.length === 0)) {
      this.sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: { message: "content must be a non-empty array" },
      });
      return;
    }

    // Refresh Supabase client with JWT token if provided
    if (token) {
      try {
        // Refresh the Supabase client with the authenticated token
        this.supabaseClientService.refreshClientWithToken(token);
        // Update the FileSyncService's Supabase client reference
        this.fileSyncService.setSupabaseClient(
          this.supabaseClientService.getClient(),
        );
        this.logger.info("Refreshed Supabase client with JWT token", {
          prototypeId,
        });
      } catch (error) {
        this.logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to refresh Supabase client with JWT token",
          { prototypeId },
        );
        this.sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: "Failed to authenticate with provided token",
            details: error instanceof Error ? error.message : String(error),
          },
        });
        return;
      }
    }

    // Use the chat_session_id provided by the client for message persistence
    // The client manages chat sessions and always provides the correct ID
    if (prototype_chat_session_id) {
      this.sessionState.prototypeChatSessionId = prototype_chat_session_id;
      this.logger.info("Using chat session ID from client", {
        chatSessionId: prototype_chat_session_id,
        claudeCodeSessionId: ai_chat_session_id,
        prototypeId,
      });
    } else {
      this.logger.warn("No chat_session_id provided by client", {
        prototypeId,
        session_id: ai_chat_session_id,
      });
      this.sessionState.prototypeChatSessionId = null;
    }

    // If client explicitly passes null session_id, it wants to start a NEW session
    // Clear internal session state to force Claude to create a fresh session
    if (ai_chat_session_id === null) {
      this.logger.info(
        "Client requested new session - clearing internal state",
        {
          previousSessionId: this.sessionState.sessionId,
        },
      );
      this.sessionState.sessionId = null;
    }

    // Handle custom design system
    const { custom_design_system_id } = data;

    // Check if design system changed or needs to be loaded
    if (custom_design_system_id !== this.sessionState.designSystemId) {
      if (
        custom_design_system_id === null ||
        custom_design_system_id === undefined
      ) {
        // Clear design system
        this.sessionState.designSystemId = null;
        this.sessionState.designSystemRules = null;
        this.logger.info("Design system cleared");
      } else {
        // Fetch new design system
        try {
          const { data: designSystem, error } = await this.supabaseClientService
            .getClient()
            .from("design_systems")
            .select("rules")
            .eq("id", custom_design_system_id)
            .single();

          if (error) {
            this.logger.error(error, "Failed to fetch design system", {
              designSystemId: custom_design_system_id,
            });
            // Continue with default prompt - don't fail the query
            this.sessionState.designSystemId = null;
            this.sessionState.designSystemRules = null;
          } else if (designSystem) {
            this.sessionState.designSystemId = custom_design_system_id;
            this.sessionState.designSystemRules = designSystem;
          } else {
            this.logger.warn("Design system not found", {
              designSystemId: custom_design_system_id,
            });
            this.sessionState.designSystemId = null;
            this.sessionState.designSystemRules = null;
          }
        } catch (error) {
          this.logger.error(
            error instanceof Error ? error : new Error(String(error)),
            "Error fetching design system",
            { designSystemId: custom_design_system_id },
          );
          // Continue with default prompt - don't fail the query
          this.sessionState.designSystemId = null;
          this.sessionState.designSystemRules = null;
        }
      }
    }

    this.logger.info("Starting Claude Code query", {
      prototypeId,
      hasSession: !!this.sessionState.sessionId,
      hasPrompt: !!prompt,
      hasContent: !!content,
      contentLength: content?.length,
      hasToken: !!token,
      providedSessionId: ai_chat_session_id,
      hasDesignSystem: !!this.sessionState.designSystemRules,
    });

    // ------------------------------------------------------------------------------------------------
    // Paywall check: Verify user has remaining credits before starting chat
    // ------------------------------------------------------------------------------------------------
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
        this.sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: "Authentication required",
            details: "Unable to verify user credentials",
          },
        });
        return;
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

        this.sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: "Credit limit exceeded",
            details: `You have used all ${creditCheck.granted} credits available. Please upgrade your plan to continue.`,
          },
        });
        return;
      }

      this.logger.info("Credit check passed", {
        userId: user.id,
        prototypeId,
        remaining: creditCheck.remaining,
        plan: creditCheck.plan,
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Error during credit check",
        { prototypeId },
      );
      // On error, deny access to be safe
      this.sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: "Unable to verify credits",
          details: "An error occurred while checking your credit balance",
        },
      });
      return;
    }

    // Notify control plane that chat is starting
    await this.notifyOrchestrationStartChat(prototypeId);

    // CRITICAL: Wrap entire query processing in try-finally to ensure end-chat
    // notification is ALWAYS sent, regardless of success or failure
    // Declare totalCostUsd here so it's accessible in the finally block
    let totalCostUsd: number | undefined = undefined;

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

        // Extract images from content for later storage (after successful query)
        const imagesFromContent = Array.isArray(messageContent)
          ? messageContent
              .filter((block) => block.type === "image")
              .map((block) => ({
                base64: (block.source as { data: string }).data,
                mediaType: (block.source as { media_type: string }).media_type,
              }))
          : [];

        // Persist user message to database (without images initially)
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

        await this.persistMessage(
          "user",
          userMessageDisplay,
          "text",
          null,
          null,
        );

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
        // Build system prompt with optional design system rules and viewing path context
        let systemPromptAppend = SYSTEM_PROMPT;

        // Append custom design system rules if available
        if (this.sessionState.designSystemRules) {
          systemPromptAppend +=
            "\n\n## Custom Design System Rules:\n" +
            this.sessionState.designSystemRules;
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
          this.logger.info("Injected history context into system prompt", {
            contextLength: historyContext.length,
          });
        }

        const canUseTool: CanUseTool = async (
          toolName: ToolName,
          input: ToolInput,
          _options,
        ): Promise<PermissionResult> => {
          return this.toolPermissionService.evaluateToolPermission(
            toolName,
            input,
          );
        };

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
          systemPrompt: {
            type: "preset" as const,
            preset: "claude_code" as const,
            append: systemPromptAppend,
          },
          settingSources: ["user"] as SettingSource[],
          permissionMode: "default" as PermissionMode,
          // permissionMode: "bypassPermissions" as PermissionMode, // other options are 'default', 'acceptEdits', 'plan'
          abortController,
          canUseTool,
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
                        const permission =
                          this.toolPermissionService.evaluateToolPermission(
                            input.tool_name as ToolName,
                            (input.tool_input ?? {}) as ToolInput,
                          );

                        if (permission.behavior === "deny") {
                          const message =
                            permission.message ?? "Tool denied by policy";
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

                        const normalizedToolInput =
                          permission.updatedInput ?? input.tool_input;

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

                        // Persist tool start to database
                        await this.persistMessage(
                          "assistant",
                          `Tool: ${input.tool_name}`,
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
                        // Apply shared permissions to files created/modified by file-modifying tools
                        const fileModifyingTools = [
                          "Write",
                          "Edit",
                          "NotebookEdit",
                        ];
                        if (fileModifyingTools.includes(input.tool_name)) {
                          const toolInput =
                            input.tool_input as ToolInputWithFilePath;
                          const toolResponse =
                            input.tool_response as ToolResponseWithFilePath;

                          // Extract file path from tool input or response
                          let filePath: string | null = null;

                          if (toolInput?.file_path) {
                            filePath = toolInput.file_path;
                          } else if (toolInput?.notebook_path) {
                            filePath = toolInput.notebook_path;
                          } else if (toolResponse?.file_path) {
                            filePath = toolResponse.file_path;
                          }

                          if (filePath) {
                            const relativePath = this.getRelativePath(filePath);

                            // Track for incremental sync (legacy mode)
                            if (!ENABLE_FULL_SYNC) {
                              this.sessionState.trackedFiles.add(relativePath);
                              this.logger.info(
                                "File tracked for sync (incremental)",
                                {
                                  tool: input.tool_name,
                                  filePath: relativePath,
                                  totalTrackedFiles:
                                    this.sessionState.trackedFiles.size,
                                },
                              );
                            }

                            // Track for query-level reporting
                            this.sessionState.modifiedFilesThisQuery.add(
                              relativePath,
                            );
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
                        await this.persistMessage(
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
        };

        // Only resume if the provided session ID is valid (exists in our set of known session IDs)
        const isValidSessionId =
          ai_chat_session_id &&
          this.validAiChatSessionIds.has(ai_chat_session_id);

        // If client sent a session ID but it's invalid, request historical messages
        if (
          !isValidSessionId &&
          ai_chat_session_id !== null &&
          ai_chat_session_id !== undefined
        ) {
          this.logger.info(
            "Invalid session ID detected - requesting history from client",
            {
              providedSessionId: ai_chat_session_id,
              validSessionCount: this.validAiChatSessionIds.size,
            },
          );

          this.sendMessage(socket, {
            type: ChatEvent.HISTORY_REQUEST,
            data: {
              message:
                "Session invalid - please provide recent conversation history",
              requested_message_count: HISTORY_MESSAGE_REQUEST_COUNT,
              original_query: data,
            },
          });
          return; // Don't process query yet - wait for history response
        }

        if (isValidSessionId) {
          queryOptions.resume = ai_chat_session_id;
        }

        this.logger.info("Querying Claude Agent SDK", {
          hasResume: !!queryOptions.resume,
          resumeSessionId: queryOptions.resume,
          providedSessionId: ai_chat_session_id,
          isValidSessionId,
          internalSessionId: this.sessionState.sessionId,
          model: queryOptions.model,
          cwd: this.workDir,
        });

        // Stream responses back to client
        const response = query({
          prompt: generateMessages() as AsyncIterable<SDKUserMessage>,
          options: queryOptions,
        });

        // Buffer for assistant message text (to persist at the end)
        let assistantMessageBuffer = "";
        let tokenUsageLogged = false;

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

            // Add this session ID to our set of valid session IDs
            this.validAiChatSessionIds.add(msg.session_id);

            this.logger.info("Claude Code session initialized", {
              sessionId: msg.session_id,
              isNewSession,
              previousSessionId,
            });

            // Persist the newly created Claude session ID to the prototype chat session row
            if (this.sessionState.prototypeChatSessionId) {
              try {
                const { error } = await this.supabaseClientService
                  .getClient()
                  .from("prototype_chat_sessions")
                  .update({ session_id: msg.session_id })
                  .eq("id", this.sessionState.prototypeChatSessionId);

                if (error) {
                  this.logger.error(
                    error,
                    "Failed to update session_id in prototype_chat_sessions",
                    {
                      chatSessionId: this.sessionState.prototypeChatSessionId,
                      claudeSessionId: msg.session_id,
                    },
                  );
                } else {
                  this.logger.info(
                    "Updated prototype_chat_sessions with new Claude session_id",
                    {
                      chatSessionId: this.sessionState.prototypeChatSessionId,
                      claudeSessionId: msg.session_id,
                    },
                  );
                }
              } catch (error) {
                this.logger.error(
                  error instanceof Error ? error : new Error(String(error)),
                  "Exception while updating session_id in prototype_chat_sessions",
                  {
                    chatSessionId: this.sessionState.prototypeChatSessionId,
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
              const { usage, total_cost_usd, duration_ms, duration_api_ms } =
                msg;
              const inputTokens = usage?.input_tokens ?? 0;
              const outputTokens = usage?.output_tokens ?? 0;

              // Store total_cost_usd for usage tracking in finally block
              totalCostUsd = total_cost_usd;

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
                logError instanceof Error
                  ? logError
                  : new Error(String(logError)),
                "Failed to log token usage",
              );
            }
          }

          // Update last active time
          this.sessionState.lastActiveAt = Date.now();

          // Forward message to client
          this.sendMessage(socket, {
            type: ChatEvent.AGENT_MESSAGE,
            data: msg,
          });
        }

        // Persist accumulated assistant message if there is any
        if (assistantMessageBuffer.trim()) {
          await this.persistMessage(
            "assistant",
            assistantMessageBuffer,
            "text",
            null,
            null,
          );
        }

        // Process and upload images to storage after successful query
        if (
          imagesFromContent.length > 0 &&
          this.sessionState.prototypeChatSessionId
        ) {
          await this.uploadChatImages(
            prototypeId,
            this.sessionState.prototypeChatSessionId,
            imagesFromContent,
          );
        }

        // Clear the abort controller
        this.sessionState.abortController = null;

        // Send completion message
        this.sendMessage(socket, {
          type: ChatEvent.QUERY_COMPLETE,
          data: {
            sessionId: this.sessionState.sessionId,
          },
        });
      } catch (error) {
        // Clear the abort controller on error
        this.sessionState.abortController = null;

        const errorMessage =
          error instanceof Error ? error.message : String(error);

        this.logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Claude Code query failed",
          { prototypeId },
        );

        // Persist error to database
        await this.persistMessage(
          "system",
          `Error: ${errorMessage}`,
          "error",
          "query_error",
          {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
          },
        );

        this.sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: "Query failed",
            details: errorMessage,
          },
        });
      }
    } finally {
      // Sync file changes to Supabase before notifying orchestration
      // This ensures all Claude Code edits are persisted before the session ends
      try {
        let syncResult: Awaited<
          ReturnType<typeof this.fileSyncService.syncFilesToSupabase>
        >;

        if (ENABLE_FULL_SYNC) {
          // Full sync strategy: Upload ALL files from workDir
          this.logger.info("Syncing all files to Supabase (full sync)", {
            prototypeId,
          });
          syncResult =
            await this.fileSyncService.syncAllFilesToSupabase(prototypeId);
        } else {
          // Incremental sync strategy: Upload only tracked files
          this.logger.info(
            "Syncing file changes to Supabase (incremental sync)",
            {
              prototypeId,
              trackedFilesCount: this.sessionState.trackedFiles.size,
              trackedFiles: Array.from(this.sessionState.trackedFiles),
            },
          );
          syncResult = await this.fileSyncService.syncFilesToSupabase(
            prototypeId,
            this.sessionState.trackedFiles,
          );
        }

        if (syncResult.success) {
          this.logger.info("File sync completed successfully", {
            prototypeId,
            filesUpdated: syncResult.filesUpdated,
            filesDeleted: syncResult.filesDeleted,
            assetsUpdated: syncResult.assetsUpdated,
            assetsDeleted: syncResult.assetsDeleted,
          });

          // Clear tracked files after successful sync
          this.sessionState.trackedFiles.clear();
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
          type: ChatEvent.FILE_SYNC_COMPLETE,
          data: {
            success: syncResult.success,
            filesUpdated: syncResult.filesUpdated,
            filesDeleted: syncResult.filesDeleted,
            assetsUpdated: syncResult.assetsUpdated,
            assetsDeleted: syncResult.assetsDeleted,
            errorCount: syncResult.errors.length,
            errors:
              syncResult.errors.length > 0 ? syncResult.errors : undefined,
          },
        });
      } catch (syncError) {
        // Log sync errors but don't fail the session
        this.logger.error(
          syncError instanceof Error ? syncError : new Error(String(syncError)),
          "Failed to sync files to Supabase",
          { prototypeId },
        );

        // Still send a sync complete message, but mark as failed
        this.sendMessage(socket, {
          type: ChatEvent.FILE_SYNC_COMPLETE,
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

      // Emit list of files modified by tools during this query
      const modifiedFiles = Array.from(
        this.sessionState.modifiedFilesThisQuery,
      );
      if (modifiedFiles.length > 0) {
        try {
          this.sendMessage(socket, {
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
      this.sessionState.modifiedFilesThisQuery.clear();

      // ------------------------------------------------------------------------------------------------
      // Track API usage
      // ------------------------------------------------------------------------------------------------
      try {
        // Get user ID from authenticated Supabase client
        const {
          data: { user },
          error: userError,
        } = await this.supabaseClientService.getClient().auth.getUser();

        if (userError || !user) {
          this.logger.warn(
            "Unable to track API usage - no authenticated user",
            {
              prototypeId,
              error: userError,
            },
          );
        } else {
          // Calculate credits used based on total cost: total_cost_usd / 0.12
          const creditsUsed =
            totalCostUsd !== undefined ? totalCostUsd / 0.12 : 1.0;

          this.logger.info("Tracking API usage", {
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
          this.sendMessage(socket, {
            type: ChatEvent.USAGE_UPDATE,
            data: {
              creditsRemaining: totalRemainingCredits,
            },
          });

          this.logger.info("API usage tracked successfully", {
            userId: user.id,
            prototypeId,
            totalCostUsd,
            creditsUsed,
            totalRemainingCredits,
          });
        }
      } catch (usageError) {
        // Log but don't fail the session if usage tracking fails
        this.logger.error(
          usageError instanceof Error
            ? usageError
            : new Error(String(usageError)),
          "Failed to track API usage",
          { prototypeId },
        );
      }

      // CRITICAL: This notification must ALWAYS be sent at the end of every chat session,
      // regardless of success or failure. The control plane relies on this to properly
      // manage container state, resource allocation, and cleanup operations.
      // The method includes retry logic to ensure delivery.
      await this.notifyOrchestrationEndChat(prototypeId);
    }
  }

  private async handleHistoryResponse(
    socket: WebSocket,
    data: HistoryResponseData,
    prototypeId: string,
  ): Promise<void> {
    const { historical_messages, original_query } = data;

    this.logger.info("Received history response from client", {
      messageCount: historical_messages.length,
      prototypeId,
    });

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

      this.logger.info("Formatted history context", {
        contextLength: historyContext.length,
        messageCount: historical_messages.length,
      });
    } else {
      this.logger.info(
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

    this.logger.info("Processing query with history context", {
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
    );
  }

  private async handleInterrupt(socket: WebSocket): Promise<void> {
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
    this.logger.info("Resetting Claude Code session", {
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

  private async handleSyncFiles(
    socket: WebSocket,
    data: SyncFilesRequest,
  ): Promise<void> {
    this.logger.info("Sync files requested", { data });

    try {
      const syncData = data ?? {};

      const prototypeId = syncData.prototypeId;
      if (!prototypeId) {
        this.sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: "prototypeId is required for file sync",
          },
        });
        return;
      }

      const filenames = syncData.filenames ?? [];
      const assetNames = syncData.assetNames ?? [];
      const token = syncData.token;

      // Determine if we're syncing all or specific files
      const syncAll = filenames.length === 0 && assetNames.length === 0;

      this.logger.info("Starting file sync", {
        prototypeId,
        syncAll,
        filenamesCount: filenames.length,
        assetNamesCount: assetNames.length,
        hasToken: !!token,
      });

      // Get Supabase client - use JWT-authenticated client if token provided
      let supabase: SupabaseClient<Database>;
      if (token) {
        try {
          this.supabaseClientService.refreshClientWithToken(token);
          supabase = this.supabaseClientService.getClient();
          this.logger.info(
            "Using JWT-authenticated Supabase client for file sync",
            {
              prototypeId,
            },
          );
        } catch (error) {
          const errorMsg = "Failed to create authenticated Supabase client";
          this.logger.error(
            error instanceof Error ? error : new Error(String(error)),
            errorMsg,
            { prototypeId },
          );
          this.sendMessage(socket, {
            type: ChatEvent.ERROR,
            error: {
              message: errorMsg,
              details: error instanceof Error ? error.message : String(error),
            },
          });
          return;
        }
      } else {
        supabase = this.supabaseClientService.getClient();
      }

      // Fetch text files from prototype_files table
      let filesQuery = supabase
        .from("prototype_files")
        .select("*")
        .eq("prototype_id", prototypeId);

      // Filter by specific filenames if provided
      if (!syncAll && filenames.length > 0) {
        filesQuery = filesQuery.in("name", filenames);
      }

      const { data: filesData, error: filesError } = await filesQuery;

      if (filesError) {
        const errorMsg = `Failed to fetch files from Supabase: ${filesError.message}`;
        this.logger.error(new Error(errorMsg), "Supabase file fetch failed", {
          error: filesError,
        });
        this.sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: errorMsg,
          },
        });
        return;
      }

      const files: PrototypeFileInput[] = (filesData || []).map((file) => ({
        name: file.name,
        contents: file.contents,
      }));

      this.logger.info("Fetched files from Supabase", {
        fileCount: files.length,
      });

      // Fetch assets from prototype_assets table
      let assetsQuery = supabase
        .from("prototype_assets")
        .select("*")
        .eq("prototype_id", prototypeId);

      // Filter by specific asset names if provided
      if (!syncAll && assetNames.length > 0) {
        assetsQuery = assetsQuery.in("name", assetNames);
      }

      const { data: assetsData, error: assetsError } = await assetsQuery;

      if (assetsError) {
        const errorMsg = `Failed to fetch assets from Supabase: ${assetsError.message}`;
        this.logger.error(new Error(errorMsg), "Supabase asset fetch failed", {
          error: assetsError,
        });
        this.sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: errorMsg,
          },
        });
        return;
      }

      this.logger.info("Fetched assets from Supabase", {
        assetCount: assetsData?.length || 0,
      });

      // Download assets from Supabase storage and convert to base64
      const assetsWithContent: PrototypeAssetInputWithContent[] =
        await Promise.all(
          (assetsData || []).map(async (asset) => {
            try {
              const { data, error } = await supabase.storage
                .from("prototype-assets")
                .download(`${asset.prototype_id}/${asset.name}`);

              if (error || !data) {
                this.logger.error(
                  error,
                  `Failed to download asset ${asset.name}: ${
                    error?.message ?? "unknown error"
                  }`,
                );
                return null;
              }

              const arrayBuffer = await data.arrayBuffer();
              const base64Content = Buffer.from(arrayBuffer).toString("base64");

              return {
                name: asset.name,
                contents: base64Content,
              };
            } catch (err) {
              this.logger.error(err, `Error downloading asset ${asset.name}`);
              return null;
            }
          }),
        ).then((results) =>
          results.filter(
            (r): r is PrototypeAssetInputWithContent => r !== null,
          ),
        );

      this.logger.info("Downloaded assets from Supabase storage", {
        downloadedCount: assetsWithContent.length,
      });

      // Write files and assets to disk
      await writeProjectFiles(files, assetsWithContent, this.workDir);

      this.logger.info("File sync completed successfully", {
        filesCount: files.length,
        assetsCount: assetsWithContent.length,
      });

      // Send success response
      this.sendMessage(socket, {
        type: ChatEvent.SYNC_COMPLETE,
        data: {
          success: true,
          filesCount: files.length,
          assetsCount: assetsWithContent.length,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        error instanceof Error ? error : new Error(errorMessage),
        "File sync failed",
      );

      this.sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: "File sync failed",
          details: errorMessage,
        },
      });
    }
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
      const axiosError = axios.isAxiosError(error) ? error : null;
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to notify control plane of chat start",
        {
          prototypeId,
          statusCode: axiosError?.response?.status,
          responseBody: axiosError?.response?.data,
        },
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
        const axiosError = axios.isAxiosError(error) ? error : null;
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          lastError,
          `Failed to notify control plane of chat end (attempt ${attempt}/${maxRetries})`,
          {
            prototypeId,
            statusCode: axiosError?.response?.status,
            responseBody: axiosError?.response?.data,
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
    this.logger.error(
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
    this.logger.info("Registered valid session IDs from restored sessions", {
      count: sessionIds.length,
      sessionIds,
    });
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
      this.logger.info("Uploading chat images to storage", {
        prototypeId,
        chatSessionId,
        imageCount: images.length,
      });

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

          this.logger.info("Updated user message with image metadata", {
            messageId,
            imageCount: uploadedImageMetadata.length,
          });
        }
      }

      this.logger.info("Chat images upload completed", {
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

    this.logger.info("Starting file system watcher", {
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
        this.logger.info("File system watcher ready", {
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
      this.logger.info("Stopping file system watcher", {
        trackedFilesCount: this.sessionState.trackedFiles.size,
      });

      await this.sessionState.fileWatcher.close();
      this.sessionState.fileWatcher = null;

      this.logger.info("File system watcher stopped successfully");
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

  private normalizePathToAllowedRoot(rawPath: string): {
    resolvedPath: string;
    withinRoot: boolean;
  } {
    const resolvedPath = path.isAbsolute(rawPath)
      ? path.resolve(rawPath)
      : path.resolve(this.allowedRoot, rawPath);

    return {
      resolvedPath,
      withinRoot: this.isPathInsideAllowedRoot(resolvedPath),
    };
  }

  private isSensitiveSystemPath(resolvedPath: string): boolean {
    const normalizedPath = path.resolve(resolvedPath);
    const blockedRoots = ["/proc", "/sys", "/dev", "/run", "/var/run"];

    return blockedRoots.some((blocked) => {
      const blockedWithSep = blocked.endsWith(path.sep)
        ? blocked
        : `${blocked}${path.sep}`;

      return (
        normalizedPath === blocked || normalizedPath.startsWith(blockedWithSep)
      );
    });
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
