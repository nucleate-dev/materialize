import { ChildProcessByStdio, spawn } from "child_process";
import { Readable } from "stream";
import WebSocket from "ws";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import { ChatEvent } from "../../../types/ChatTypes.js";
import { SupabaseClientService } from "../../SupabaseClientService.js";
import { getToolDisplayName } from "../helpers/message-handlers.js";
import { ToolPermissionService } from "../helpers/tool-permission-service.js";
import { baseLogger, WORK_DIR } from "../../../worker.js";
import { NucleateDevelopmentServerService } from "../../dev-server/NucleateDevelopmentServerService.js";
import {
  ChatEngine,
  ChatEngineContext,
  ChatEngineMessageHandlers,
  ChatEngineSessionState,
  CliAuthEnvironment,
  ChatEngineResult,
} from "./chat-engine.js";

// CLI message types from --output-format stream-json
interface ClaudeCodeMessage {
  type: "assistant" | "tool_result" | "result" | "system" | "error";
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  session_id?: string;
  usage?: unknown;
  total_cost_usd?: number;
  subtype?: string;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface SessionState {
  modifiedFilesThisQuery: Set<string>;
  pendingToolCalls: Map<string, ToolUseBlock>;
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

/**
 * Handler for executing queries using the Claude Code CLI in headless mode.
 * This handler spawns the CLI process, parses its JSON output, and transforms
 * it into WebSocket messages that match the existing frontend expectations.
 */
export class ClaudeCodeCliQueryHandler implements ChatEngine {
  private readonly supabaseClientService: SupabaseClientService;
  private readonly toolPermissionService: ToolPermissionService;
  private readonly devServerService: NucleateDevelopmentServerService;
  private sessionState: SessionState;

  constructor(
    supabaseClientService: SupabaseClientService,
    toolPermissionService: ToolPermissionService,
    devServerService: NucleateDevelopmentServerService,
  ) {
    this.supabaseClientService = supabaseClientService;
    this.toolPermissionService = toolPermissionService;
    this.devServerService = devServerService;
    this.sessionState = {
      modifiedFilesThisQuery: new Set(),
      pendingToolCalls: new Map(),
    };
  }

  /**
   * Main entry point for handling a query using the CLI
   */
  async handleQuery(
    context: ChatEngineContext,
    handlers: ChatEngineMessageHandlers,
  ): Promise<ChatEngineResult | void> {
    const { socket, data, sessionState, logger, cliAuthEnv, designContext } =
      context;
    const { sendMessage } = handlers;
    if (!cliAuthEnv) {
      sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: "Missing CLI authentication context",
        },
      });
      return;
    }

    try {
      const systemPromptAppend = designContext?.systemPrompt ?? "";

      // Reset session state for new query
      this.sessionState.modifiedFilesThisQuery.clear();
      sessionState.modifiedFilesThisQuery.clear();
      this.sessionState.pendingToolCalls.clear();

      // Get the query text - support both old format (prompt) and new format (content)
      let queryText = "";
      if (data.prompt) {
        queryText = data.prompt;
      } else if (data.content && Array.isArray(data.content)) {
        // Extract text from content blocks
        queryText = data.content
          .filter((block) => block.type === "text")
          .map((block) => block.text || "")
          .join("\n");
      }

      if (!queryText) {
        throw new Error("No query provided");
      }

      // Spawn CLI process
      const cliProcess = this.spawnCliProcess(
        queryText,
        cliAuthEnv.env,
        sessionState,
        systemPromptAppend,
      );

      // Set up abort controller
      const abortController = new AbortController();
      sessionState.abortController = abortController;

      abortController.signal.addEventListener("abort", () => {
        logger.info("Query aborted, killing CLI process");
        cliProcess.kill("SIGTERM");
      });

      // Parse and handle CLI output
      await this.handleCliOutput(cliProcess, socket, handlers, context);

      // Query completed successfully
      logger.info("CLI query completed successfully", {
        authMethod: cliAuthEnv.authMethod,
      });
    } catch (error) {
      logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to execute CLI query",
      );

      sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: "Failed to execute query",
          details: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      // Clear abort controller
      sessionState.abortController = null;
    }

    return {};
  }

  /**
   * Spawn the Claude CLI process with streaming JSON output
   */
  private spawnCliProcess(
    query: string,
    env: NodeJS.ProcessEnv,
    sessionState: ChatEngineSessionState,
    systemPromptAppend?: string,
  ): ChildProcessByStdio<null, Readable, Readable> {
    const args = [
      "-p",
      query,
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "acceptEdits",
    ];

    // Add resume flag if we have an active session
    if (sessionState.sessionId) {
      args.push("--resume", sessionState.sessionId);
    }

    // Add system prompt append if provided
    if (systemPromptAppend && systemPromptAppend.trim()) {
      args.push("--append-system-prompt", systemPromptAppend);
    }

    baseLogger.debug("Spawning Claude CLI process", {
      args,
      cwd: WORK_DIR,
      hasSessionId: !!sessionState.sessionId,
      hasSystemPrompt: !!systemPromptAppend,
    });

    const cliProcess = spawn("claude", args, {
      cwd: WORK_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    return cliProcess;
  }

  /**
   * Handle CLI output stream, parsing JSON and sending to WebSocket
   */
  private async handleCliOutput(
    cliProcess: ChildProcessByStdio<null, Readable, Readable>,
    socket: WebSocket,
    handlers: ChatEngineMessageHandlers,
    context: ChatEngineContext,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let stdoutBuffer = "";
      let stderrBuffer = "";

      cliProcess.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();

        // Process complete JSON lines
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line) as ClaudeCodeMessage;
              baseLogger.debug("CLI message received", {
                type: message.type,
                subtype: message.subtype,
                messagePreview: JSON.stringify(message).substring(0, 200),
              });
              void this.handleCliMessage(message, socket, handlers, context);
            } catch (error) {
              baseLogger.warn("Failed to parse CLI JSON output", {
                line,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      });

      cliProcess.stderr.on("data", (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
        baseLogger.warn("CLI stderr output", { stderr: chunk.toString() });
      });

      cliProcess.on("close", (code: number | null) => {
        if (code === 0) {
          baseLogger.info("CLI process exited successfully");
          resolve();
        } else {
          const error = new Error(
            `CLI process exited with code ${code}: ${stderrBuffer}`,
          );
          baseLogger.error(error, "CLI process failed");
          reject(error);
        }
      });

      cliProcess.on("error", (error: Error) => {
        baseLogger.error(error, "CLI process error");
        reject(error);
      });
    });
  }

  /**
   * Handle a single CLI message and transform to WebSocket format
   */
  private async handleCliMessage(
    cliMessage: ClaudeCodeMessage,
    socket: WebSocket,
    handlers: ChatEngineMessageHandlers,
    context: ChatEngineContext,
  ): Promise<void> {
    const { sendMessage } = handlers;

    switch (cliMessage.type) {
      case "assistant":
        await this.handleAssistantMessage(
          cliMessage,
          socket,
          handlers,
          context,
        );
        break;

      case "tool_result":
        await this.handleToolResult(cliMessage, socket, handlers, context);
        break;

      case "result":
        this.handleQueryComplete(cliMessage, socket, handlers, context);
        break;

      case "system":
        if (cliMessage.subtype === "init") {
          await this.handleSystemInitMessage(cliMessage, context);
        } else {
          sendMessage(socket, {
            type: ChatEvent.INFO,
            message: String(cliMessage.message || "System message"),
          });
        }
        break;

      case "error":
        sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: cliMessage.message?.content?.[0]?.text || "Unknown error",
          },
        });
        break;

      default:
        baseLogger.debug("Unknown CLI message type", { cliMessage });
    }
  }

  /**
   * Handle assistant message - forward to frontend and process tool calls
   */
  private async handleAssistantMessage(
    message: ClaudeCodeMessage,
    socket: WebSocket,
    handlers: ChatEngineMessageHandlers,
    _context: ChatEngineContext,
  ): Promise<void> {
    const { sendMessage, persistMessage } = handlers;
    const content = message.message?.content || [];

    // Forward the entire CLI message to frontend (it expects this exact structure)
    sendMessage(socket, {
      type: ChatEvent.AGENT_MESSAGE,
      data: message, // Send the whole message - frontend expects type:"assistant" and message.content
    });

    // Extract and persist text content to database
    const textParts = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text);

    if (textParts.length > 0) {
      const text = textParts.join("");
      await persistMessage("assistant", text, "text");
    }

    // Process tool calls - apply PreToolUse hook logic
    const toolUses = content.filter(
      (c): c is ToolUseBlock =>
        c.type === "tool_use" && !!c.id && !!c.name && !!c.input,
    );

    for (const toolUse of toolUses) {
      await this.handlePreToolUse(toolUse, socket, handlers);
    }
  }

  /**
   * PreToolUse hook equivalent - runs before tool execution
   * Note: In CLI mode, we can't actually block the tool, only monitor
   */
  private async handlePreToolUse(
    toolUse: ToolUseBlock,
    socket: WebSocket,
    handlers: ChatEngineMessageHandlers,
  ): Promise<void> {
    const { sendMessage, persistMessage } = handlers;
    const { id: toolUseId, name: toolName, input: toolInput } = toolUse;

    baseLogger.debug(`PreToolUse: ${toolName}`, { toolUseId, toolInput });

    // 1. Evaluate tool permission (monitoring only in CLI mode)
    const permission = this.toolPermissionService.evaluateToolPermission(
      toolName as ToolName,
      toolInput as ToolInput,
    );

    if (permission.behavior === "deny") {
      const message = permission.message ?? "Tool denied by policy";
      baseLogger.warn(`Tool denied: ${toolName}`, { message });

      // Send denial notification (can't actually block in CLI mode)
      // Use INFO event since TOOL_DENIED doesn't exist in ChatEvent enum
      sendMessage(socket, {
        type: ChatEvent.INFO,
        message: `Tool ${toolName} denied by policy: ${message}`,
      });
    }

    // 2. Normalize tool input
    // Note: permission service doesn't currently support input updates
    const normalizedInput = toolInput;

    // 3. Track pending tool call
    this.sessionState.pendingToolCalls.set(toolUseId, {
      ...toolUse,
      input: normalizedInput as Record<string, unknown>,
    });

    // 4. Send TOOL_START event to WebSocket
    sendMessage(socket, {
      type: ChatEvent.TOOL_START,
      data: {
        tool_name: toolName,
        tool_input: normalizedInput,
        tool_call_id: toolUseId,
      },
    });

    // 5. Persist tool start to database
    const displayName = getToolDisplayName(
      toolName,
      normalizedInput as ToolInput,
    );
    await persistMessage("assistant", displayName, "tool_use", "tool_start", {
      tool_name: toolName,
      tool_input: normalizedInput,
      tool_call_id: toolUseId,
    });
  }

  /**
   * PostToolUse hook equivalent - runs after tool execution
   */
  private async handleToolResult(
    result: ClaudeCodeMessage,
    socket: WebSocket,
    handlers: ChatEngineMessageHandlers,
    _context: ChatEngineContext,
  ): Promise<void> {
    const { sendMessage, persistMessage } = handlers;
    const toolUseId = result.tool_use_id;
    const content = result.content || "";
    const isError = result.is_error || false;

    if (!toolUseId) {
      baseLogger.warn("Tool result missing tool_use_id", { result });
      return;
    }

    // Get the original tool call
    const toolUse = this.sessionState.pendingToolCalls.get(toolUseId);
    if (!toolUse) {
      baseLogger.warn("Tool result for unknown tool call", { toolUseId });
      return;
    }

    const { name: toolName, input: toolInput } = toolUse;

    baseLogger.debug(`PostToolUse: ${toolName}`, { toolUseId, isError });

    // 1. Track file modifications
    const fileModifyingTools = ["Write", "Edit", "NotebookEdit", "SafeWrite"];
    if (fileModifyingTools.includes(toolName)) {
      const filePath =
        (toolInput as { file_path?: string; notebook_path?: string })
          .file_path || (toolInput as { notebook_path?: string }).notebook_path;

      if (filePath) {
        const relativePath = context.getRelativePath(filePath);
        this.sessionState.modifiedFilesThisQuery.add(relativePath);
        context.sessionState.modifiedFilesThisQuery.add(relativePath);
        baseLogger.debug("File modified", { relativePath });
      }
    }

    // 2. Send TOOL_COMPLETE event to WebSocket
    sendMessage(socket, {
      type: ChatEvent.TOOL_COMPLETE,
      data: {
        tool_name: toolName,
        tool_input: toolInput,
        tool_response: content,
        tool_call_id: toolUseId,
      },
    });

    // 3. Persist tool completion to database
    await persistMessage(
      "assistant",
      `Tool completed: ${toolName}`,
      "tool_result",
      "tool_complete",
      {
        tool_name: toolName,
        tool_input: toolInput,
        tool_response: content,
        tool_call_id: toolUseId,
        is_error: isError,
      },
    );

    // 4. Clean up pending tool call
    this.sessionState.pendingToolCalls.delete(toolUseId);
  }

  /**
   * Handle query completion - report modified files
   */
  private handleQueryComplete(
    message: ClaudeCodeMessage,
    socket: WebSocket,
    handlers: ChatEngineMessageHandlers,
    context: ChatEngineContext,
  ): void {
    const { sendMessage } = handlers;
    const { sessionState } = context;

    // Update session ID from CLI output
    if (message.session_id) {
      sessionState.sessionId = message.session_id;
    }

    // Send query complete event
    sendMessage(socket, {
      type: ChatEvent.QUERY_COMPLETE,
      data: {
        sessionId: message.session_id || null,
      },
    });

    // Reset session state for next query
    this.sessionState.modifiedFilesThisQuery.clear();
    this.sessionState.pendingToolCalls.clear();
  }

  /**
   * Handle system init message - update session state and persist to database
   */
  private async handleSystemInitMessage(
    message: ClaudeCodeMessage,
    context: ChatEngineContext,
  ): Promise<void> {
    const { sessionState } = context;

    if (!message.session_id) {
      baseLogger.warn("System init message missing session_id");
      return;
    }

    const previousSessionId = sessionState.sessionId;
    const isNewSession = previousSessionId !== message.session_id;

    // Update in-memory state
    sessionState.sessionId = message.session_id;
    sessionState.isActive = true;
    if (isNewSession) {
      sessionState.createdAt = Date.now();
    }
    sessionState.lastActiveAt = Date.now();

    baseLogger.consoleLogDevOnly(
      "info",
      "Claude Code CLI session initialized",
      {
        sessionId: message.session_id,
        isNewSession,
        previousSessionId,
      },
    );

    // Persist to database
    await this.persistSessionToDatabase(
      message.session_id,
      sessionState.prototypeChatSessionId,
    );
  }

  /**
   * Persist Claude session ID and session type to database
   */
  private async persistSessionToDatabase(
    claudeSessionId: string,
    prototypeChatSessionId: string | null,
  ): Promise<void> {
    if (!prototypeChatSessionId) {
      baseLogger.warn(
        "Cannot persist Claude session_id because prototypeChatSessionId is missing",
        { claudeSessionId },
      );
      return;
    }

    try {
      const { error } = await this.supabaseClientService
        .getClient()
        .from("prototype_chat_sessions")
        .update({
          session_id: claudeSessionId,
          session_type: "claude_code_cli",
        })
        .eq("id", prototypeChatSessionId);

      if (error) {
        baseLogger.error(
          error,
          "Failed to update session_id in prototype_chat_sessions",
          {
            chatSessionId: prototypeChatSessionId,
            claudeSessionId: claudeSessionId,
          },
        );
      } else {
        baseLogger.consoleLogDevOnly(
          "info",
          "Updated prototype_chat_sessions with Claude Code CLI session_id",
          {
            chatSessionId: prototypeChatSessionId,
            claudeSessionId: claudeSessionId,
          },
        );
      }
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Exception while updating session_id in prototype_chat_sessions",
        {
          chatSessionId: prototypeChatSessionId,
          claudeSessionId: claudeSessionId,
        },
      );
    }
  }
