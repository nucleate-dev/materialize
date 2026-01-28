import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { existsSync, mkdirSync } from "fs";
import { IPty, IPtyForkOptions, spawn as spawnPty } from "node-pty";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import { baseLogger } from "../../loggers/index.js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { SupabaseClientService } from "../SupabaseClientService.js";
import {
  EternalTerminalLogManager,
  TerminalLogPersistenceResult,
} from "./EternalTerminalLogManager.js";
import {
  TerminalCloseResponse,
  TerminalCreateRequest,
  TerminalCreateResponse,
  TerminalInfoResponse,
  TerminalInputRequest,
  TerminalInputResponse,
  TerminalResizeRequest,
  TerminalResizeResponse,
  TerminalSessionType,
} from "../../types/BuildWorkerTypes.js";
import { TerminalCommandValidator } from "./TerminalCommandValidationUtils.js";
import { randomUUID } from "crypto";
import {
  resolveTerminalUserIdentity,
  TerminalUserIdentity,
} from "./TerminalUserUtils.js";
// import type { fastifyWebsocket } from "@fastify/websocket";

const TERMINAL_BUFFER_LIMIT = 5000;
const HEARTBEAT_INTERVAL_MS = 15000;
const LAUNCH_TEST_TERMINAL_AS_ROOT = false &&
  process.env.NODE_ENV === "development";
const TERMINAL_VALIDATION_DISABLED = true &&
  process.env.NODE_ENV === "development";
const ETERNAL_TERMINAL_BUCKET = "terminal-sessions";
const DEFAULT_TRACKED_SESSION_IDS = ["dev-server", "test", "build"];

export type TerminalRuntimeState = "running" | "exited" | "closed";

export interface TerminalEventPayload {
  [key: string]: unknown;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface TerminalEvent {
  type: "output" | "exit" | "start" | "status" | "close" | "error";
  payload: TerminalEventPayload;
  timestamp: number;
}

interface TerminalClient {
  id: string;
  socket: WebSocket;
  heartbeat?: NodeJS.Timeout;
}

export interface TerminalSession {
  id: string;
  type: TerminalSessionType;
  pty: IPty;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  cols: number;
  rows: number;
  state: TerminalRuntimeState;
  createdAt: number;
  updatedAt: number;
  buffer: TerminalEvent[];
  clients: Map<string, TerminalClient>;
}

export class TerminalService {
  private readonly workDir: string;
  private readonly allowedRoot: string;
  private readonly sessionInputBuffers = new Map<string, string>();
  private readonly commandValidator?: TerminalCommandValidator;
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly terminalUserIdentity: TerminalUserIdentity | null;
  private readonly supabaseClientService: SupabaseClientService;
  private readonly eternalTerminalLogManager: EternalTerminalLogManager;
  private readonly prototypeIdProvider?: () => string | undefined;

  constructor(
    workDir: string,
    supabaseClientService: SupabaseClientService,
    options: {
      prototypeIdProvider?: () => string | undefined;
      trackedSessionIds?: string[];
    } = {},
  ) {
    this.allowedRoot = path.resolve("/tmp/materialize-dev-server");
    if (!TERMINAL_VALIDATION_DISABLED) {
      this.commandValidator = new TerminalCommandValidator(this.allowedRoot);
    }
    const normalizedWorkDir = path.resolve(workDir);
    if (
      !TERMINAL_VALIDATION_DISABLED &&
      this.commandValidator?.isPathInsideAllowedRoot(normalizedWorkDir)
    ) {
      this.workDir = normalizedWorkDir;
    } else if (!TERMINAL_VALIDATION_DISABLED && this.commandValidator) {
      this.workDir = this.allowedRoot;
    } else {
      this.workDir = normalizedWorkDir;
    }
    this.supabaseClientService = supabaseClientService;
    this.prototypeIdProvider = options.prototypeIdProvider;
    const trackedSessionIds = new Set(
      options.trackedSessionIds ?? DEFAULT_TRACKED_SESSION_IDS,
    );
    this.eternalTerminalLogManager = new EternalTerminalLogManager(
      EternalTerminalLogManager.DEFAULT_LOG_ROOT,
      trackedSessionIds,
    );

    // Always resolve the terminal user identity for non-test terminals
    const terminalUsername = process.env.TERMINAL_USER ?? "materialize-user";
    this.terminalUserIdentity = resolveTerminalUserIdentity(
      baseLogger,
      terminalUsername,
      process.env.TERMINAL_GROUP,
    );
    if (this.terminalUserIdentity) {
      baseLogger.consoleLogDevOnly(
        "info",
        "Terminal sessions configured to drop privileges (except test terminal if LAUNCH_TERMINALS_AS_ROOT=true)",
        {
          username: this.terminalUserIdentity.username,
          uid: this.terminalUserIdentity.uid,
          gid: this.terminalUserIdentity.gid,
          homeDir: this.terminalUserIdentity.homeDir,
          testTerminalAsRoot: LAUNCH_TEST_TERMINAL_AS_ROOT,
        },
      );
    } else {
      baseLogger.error(
        new Error("TERMINAL_USER not found"),
        "Cannot initialize TerminalService without a non-root terminal user",
        { terminalUsername },
      );
      throw new Error(
        `TerminalService requires terminal user "${terminalUsername}" to exist`,
      );
    }

    if (LAUNCH_TEST_TERMINAL_AS_ROOT) {
      baseLogger.warn(
        "Test terminal will run as root (LAUNCH_TERMINALS_AS_ROOT=true)",
      );
    }

    if (
      !TERMINAL_VALIDATION_DISABLED &&
      this.commandValidator &&
      !this.commandValidator.isPathInsideAllowedRoot(normalizedWorkDir)
    ) {
      baseLogger.warn("WorkDir is outside the allowed root for terminals", {
        workDir: normalizedWorkDir,
        allowedRoot: this.allowedRoot,
      });
    }

    // Make sure work directory exists
    try {
      if (!existsSync(this.workDir)) {
        baseLogger.warn("workDir does not exist; creating it", {
          workDir: this.workDir,
        });
        mkdirSync(this.workDir, { recursive: true });
      }
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to ensure workDir exists",
        { workDir: this.workDir },
      );
      throw error;
    }

    // Every build worker is instantiated with three pre-configured terminals.
    // These terminals live throughout the entire lifecycle of the container.
    baseLogger.consoleLogDevOnly(
      "info",
      "Creating pre-configured terminal sessions",
    );

    try {
      // Use -i for interactive mode to keep bash alive
      this.getOrCreateTerminalSession("dev-server", "dev-server", {
        args: ["-i"],
      });
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to create dev-server terminal",
      );
    }

    try {
      this.getOrCreateTerminalSession("build", "build", {
        args: ["-i"],
      });
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to create build terminal",
      );
    }

    try {
      this.getOrCreateTerminalSession("test", "test", {
        args: ["-i"],
      });
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to create test terminal",
      );
    }

    baseLogger.consoleLogDevOnly(
      "info",
      "TerminalService initialization complete",
      {
        sessionsCreated: this.sessions.size,
        sessionIds: Array.from(this.sessions.keys()),
      },
    );
  }

  public registerRoutes(app: FastifyInstance): void {
    // POST /terminal/create - Create a new terminal session
    app.post<{ Body: TerminalCreateRequest }>(
      "/terminal/create",
      this.handleTerminalCreateRoute.bind(this),
    );

    // GET /terminal/:sessionId - Get terminal session info
    app.get<{ Params: { sessionId: string } }>(
      "/terminal/:sessionId",
      this.handleTerminalInfoRoute.bind(this),
    );

    // DELETE /terminal/:sessionId - Close a terminal session
    app.delete<{ Params: { sessionId: string } }>(
      "/terminal/:sessionId",
      this.handleTerminalCloseRoute.bind(this),
    );

    // POST /terminal/:sessionId/input - Send input to terminal
    app.post<{
      Params: { sessionId: string };
      Body: TerminalInputRequest;
    }>("/terminal/:sessionId/input", this.handleTerminalInputRoute.bind(this));

    // POST /terminal/:sessionId/resize - Resize terminal
    app.post<{
      Params: { sessionId: string };
      Body: TerminalResizeRequest;
    }>(
      "/terminal/:sessionId/resize",
      this.handleTerminalResizeRoute.bind(this),
    );

    // WebSocket /terminal/:sessionId/ws - WebSocket connection
    app.get(
      "/terminal/ws/:sessionId",
      { websocket: true },
      this.handleWebSocketConnection.bind(this),
    );
  }

  public getOrCreateTerminalSession(
    sessionId: string,
    type: TerminalSessionType,
    options: {
      command?: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      cols?: number;
      rows?: number;
    } = {},
  ): TerminalSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (existing.type !== type) {
        existing.type = type;
      }
      return existing;
    }

    // Create new session and immediately spawn PTY
    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;
    const requestedCwd = options.cwd ?? this.workDir;
    let cwd: string;
    if (TERMINAL_VALIDATION_DISABLED && this.commandValidator) {
      const { resolvedPath: normalizedCwd, withinRoot } = this.commandValidator
        .normalizePathToAllowedRoot(requestedCwd);
      cwd = withinRoot ? normalizedCwd : this.allowedRoot;
      if (!withinRoot) {
        baseLogger.warn(
          "Requested terminal cwd outside allowed root; clamped",
          {
            sessionId,
            requestedCwd,
            normalizedCwd,
            allowedRoot: this.allowedRoot,
          },
        );
      }
    } else {
      cwd = path.resolve(requestedCwd);
    }
    const defaultShell = process.env.SHELL ?? "/bin/bash";
    const requestedCommand = options.command ?? defaultShell;
    const command =
      path.resolve(requestedCommand) === path.resolve(defaultShell)
        ? requestedCommand
        : defaultShell;
    if (command !== requestedCommand) {
      baseLogger.warn("Terminal command overridden to default shell", {
        sessionId,
        requestedCommand,
        command,
      });
    }

    // Default to interactive mode for bash to prevent immediate exit
    const requestedArgs = options.args ?? ["-i"];
    const argsUnsafe = requestedArgs.length === 0 ||
      requestedArgs.some(
        (arg) => ["-c", "--command"].includes(arg) || arg.includes("-c"),
      );
    const args = argsUnsafe ? ["-i"] : requestedArgs;
    if (argsUnsafe) {
      baseLogger.warn("Terminal args reset to safe defaults", {
        sessionId,
        requestedArgs,
        args: ["-i"],
      });
    }
    const envBase = this.buildBaseEnvironment(cwd);
    const env = this.normalizeEnv(options.env, envBase);

    let pty: IPty;
    try {
      const spawnOptions: Parameters<typeof spawnPty>[2] = {
        name: "xterm-color",
        cols,
        rows,
        cwd,
        env,
      };

      // Only drop privileges if:
      // 1. We have a valid terminal user identity AND
      // 2. Either this is NOT the "test" terminal OR LAUNCH_TERMINALS_AS_ROOT is false
      const shouldDropPrivileges = this.terminalUserIdentity &&
        (sessionId !== "test" || !LAUNCH_TEST_TERMINAL_AS_ROOT);

      if (shouldDropPrivileges) {
        const unixOptions = spawnOptions as IPtyForkOptions;
        unixOptions.uid = this.terminalUserIdentity.uid;
        unixOptions.gid = this.terminalUserIdentity.gid;
      } else if (sessionId === "test" && LAUNCH_TEST_TERMINAL_AS_ROOT) {
        baseLogger.info(
          "Launching test terminal as root (LAUNCH_TERMINALS_AS_ROOT=true)",
          {
            sessionId,
            type,
          },
        );
      }

      pty = spawnPty(command, args, spawnOptions);
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to spawn PTY process",
        {
          sessionId,
          type,
          command,
          args,
          cwd,
        },
      );
      throw error;
    }

    const session: TerminalSession = {
      id: sessionId,
      type,
      pty,
      command,
      args,
      cwd,
      env,
      cols,
      rows,
      state: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      buffer: [],
      clients: new Map(),
    };
    this.sessions.set(sessionId, session);
    this.eternalTerminalLogManager.registerSession(session);

    pty.onData((chunk) => {
      session.updatedAt = Date.now();
      this.emitTerminalEvent(session, "output", { chunk });
    });

    pty.onExit(({ exitCode, signal }) => {
      this.handlePtyExit(session, exitCode ?? null, signal ?? null);
    });

    this.emitTerminalEvent(session, "start", {
      command: session.command,
      args: session.args,
      cwd: session.cwd,
      cols,
      rows,
    });
    this.emitTerminalEvent(
      session,
      "status",
      this.buildSessionSnapshot(session),
    );

    return session;
  }

  /**
   * Send input to a terminal session.
   *
   * @param sessionId - The ID of the terminal session
   * @param input - The input string to send to the terminal
   * @param options - Optional configuration
   * @param options.bypassValidation - If true, skips command validation.
   *                                    SECURITY WARNING: Only use this for trusted internal commands
   *                                    from the application itself, never for user input.
   *                                    Use cases: internal build commands, dev server management.
   */
  public sendInput(
    sessionId: string,
    input: string,
    options?: { bypassValidation?: boolean },
  ): void {
    const session = this.requireSession(sessionId);
    if (!session.pty) {
      baseLogger.error(
        new Error(`Terminal session ${sessionId} has no PTY`),
        "Cannot send input - PTY is null",
        {
          sessionId,
          state: session.state,
          terminalType: session.type,
        },
      );
      throw new Error(`Terminal session ${sessionId} is not running`);
    }

    // Skip validation if explicitly bypassed by trusted internal services
    if (options?.bypassValidation === true) {
      // baseLogger.consoleLogDevOnly(
      //   "debug",
      //   "Terminal input bypassing validation (trusted internal command)",
      //   {
      //     sessionId,
      //     inputPreview: input.slice(0, 100),
      //   },
      // );
      session.updatedAt = Date.now();
      try {
        session.pty.write(input);
      } catch (error) {
        baseLogger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to write input to PTY",
          {
            sessionId,
            ptyPid: session.pty.pid,
            state: session.state,
          },
        );
        throw error;
      }
      return;
    }

    // Normal validation flow for user input
    if (TERMINAL_VALIDATION_DISABLED && this.commandValidator) {
      const currentBuffer = this.sessionInputBuffers.get(session.id) ?? "";
      const { outputToWrite, newBuffer, error } = this.commandValidator
        .processAndValidateInput(
          session.id,
          session.cwd,
          input,
          currentBuffer,
          (newCwd) => {
            session.cwd = newCwd;
          },
        );

      this.sessionInputBuffers.set(session.id, newBuffer);

      if (error) {
        this.abortCurrentLine(session);
        baseLogger.warn("Terminal input blocked by policy", {
          sessionId,
          reason: error.message,
          inputPreview: input.slice(0, 200),
        });
        this.emitTerminalEvent(session, "error", { reason: error.message });
        throw error;
      }

      if (outputToWrite.length === 0) {
        return;
      }

      input = outputToWrite;
    }

    session.updatedAt = Date.now();
    try {
      session.pty.write(input);
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to write input to PTY",
        {
          sessionId,
          ptyPid: session.pty.pid,
          state: session.state,
        },
      );
      throw error;
    }
  }

  /**
   * Send input to a terminal session and wait for command completion with exit code detection.
   * This wraps the command with markers to detect when it completes and capture the exit code.
   *
   * @param sessionId - The ID of the terminal session
   * @param input - The command to execute
   * @param options - Optional configuration
   * @param options.timeout - Command timeout in milliseconds (default: 30000)
   * @param options.bypassValidation - If true, skips command validation (default: true for internal use)
   * @returns Promise resolving to { output: string, exitCode: number }
   */
  public async asyncSendInputWithCompletionDetectionOrTimeout(
    sessionId: string,
    input: string,
    options: { timeout?: number; bypassValidation?: boolean } = {},
  ): Promise<{ output: string; exitCode: number }> {
    const session = this.requireSession(sessionId);

    // 1. Create a unique sentinel
    const token = randomUUID().replace(/-/g, "");
    const startMarker = `__START_${token}__`;
    const endMarkerBase = `__END_${token}__`;
    const endMarkerWithExitPrefix = `${endMarkerBase}:`;

    // 2. Wrap the command
    // We print a start marker to help chop off the command echo at the top,
    // and an end marker with the exit code at the bottom.
    // checks for shell (bash/sh/zsh) compatibility
    const wrappedInput =
      `printf "${startMarker}\\n"; ${input}; printf "${endMarkerWithExitPrefix}%s\\n" $?`;

    return new Promise((resolve, reject) => {
      let buffer = "";
      const timeout = options.timeout ?? 30000;
      // Default to bypassing validation since this is typically used for internal commands
      // that require command chaining (semicolons) which would be blocked by validation
      const bypassValidation = options.bypassValidation ?? true;
      const endMarkerRegex = new RegExp(
        `${escapeRegex(endMarkerWithExitPrefix)}(-?\\d+)`,
      );

      // Cleanup function
      const cleanup = (): void => {
        clearTimeout(timeoutId);
        dataDisposable.dispose();
      };

      // 3. Timeout Logic
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Command timed out`));
      }, timeout);

      // 4. Data Listener
      const dataDisposable = session.pty.onData((chunk) => {
        buffer += chunk;

        // Check for the End Marker
        const markerMatch = buffer.match(endMarkerRegex);
        if (markerMatch && markerMatch.index !== undefined) {
          cleanup();
          const exitCode = parseInt(markerMatch[1], 10);

          // Clean up the output:
          // 1. Remove the command echo and start marker
          // 2. Remove everything from the end marker onward
          let cleanOutput = buffer.substring(0, markerMatch.index);
          const startIdx = cleanOutput.indexOf(startMarker);
          if (startIdx !== -1) {
            cleanOutput = cleanOutput
              .substring(startIdx + startMarker.length)
              .trim();
          }

          resolve({
            output: cleanOutput,
            exitCode: exitCode,
          });
        }
      });

      // 5. Send the wrapped command using sendInput() for consistency
      // Add \r to ensure it executes
      try {
        this.sendInput(sessionId, wrappedInput + "\r", { bypassValidation });
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  private abortCurrentLine(session: TerminalSession): void {
    if (!session.pty) {
      return;
    }
    try {
      session.pty.write("\u0003");
    } catch (error) {
      baseLogger.warn("Failed to abort terminal line after validation error", {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public resizeSession(sessionId: string, cols: number, rows: number): void {
    const session = this.requireSession(sessionId);
    if (!session.pty) {
      throw new Error(`Terminal session ${sessionId} is not running`);
    }

    session.pty.resize(cols, rows);
    session.cols = cols;
    session.rows = rows;
    session.updatedAt = Date.now();
    this.emitTerminalEvent(
      session,
      "status",
      this.buildSessionSnapshot(session),
    );
  }

  public closeSession(sessionId: string): TerminalCloseResponse {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        status: "error",
        error: "Terminal session not found",
      };
    }

    this.killSessionProcess(session);
    session.state = "closed";
    session.updatedAt = Date.now();

    this.emitTerminalEvent(
      session,
      "status",
      this.buildSessionSnapshot(session),
    );
    this.emitTerminalEvent(session, "close", { reason: "requested" });
    this.closeAllClients(session);

    this.sessions.delete(sessionId);
    this.sessionInputBuffers.delete(sessionId);

    this.finalizeEternalLog(sessionId);

    return {
      status: "success",
    };
  }

  public getSessionInfo(sessionId: string): TerminalInfoResponse {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        status: "error",
        error: "Terminal session not found",
      };
    }

    return {
      status: "success",
      session_id: session.id,
      session_type: session.type,
      state: session.state,
    };
  }

  public getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getAllSessions(): [string, TerminalSession][] {
    return Array.from(this.sessions.entries());
  }

  public addOutputListener(
    sessionId: string,
    callback: (output: string) => void,
  ): (() => void) | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.pty) {
      return null;
    }

    const disposable = session.pty.onData(callback);
    return () => disposable.dispose();
  }

  public killProcess(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    this.killSessionProcess(session);
  }

  public shutdownAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
  }

  public async persistTrackedTerminalLogs(
    logger?: SystemLogger,
  ): Promise<TerminalLogPersistenceResult> {
    const prototypeId = this.prototypeIdProvider?.();
    if (!prototypeId) {
      const result: TerminalLogPersistenceResult = {
        uploaded: [],
        failed: [],
        skippedReason: "missing-prototype-id",
      };
      (logger ?? baseLogger).warn(
        "Skipping terminal log persistence - no prototype id",
      );
      return result;
    }

    const supabaseClient = this.supabaseClientService.getClient();

    return this.eternalTerminalLogManager.persistTrackedTerminalLogs({
      prototypeId,
      supabaseClient,
      bucket: ETERNAL_TERMINAL_BUCKET,
      logger: logger ?? baseLogger,
    });
  }

  private requireSession(sessionId: string): TerminalSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Terminal session ${sessionId} not found`);
    }
    return session;
  }

  private buildSessionSnapshot(session: TerminalSession): TerminalEventPayload {
    return {
      sessionId: session.id,
      state: session.state,
      command: session.command,
      args: session.args,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      hasProcess: Boolean(session.pty),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      sessionType: session.type,
    };
  }

  private emitTerminalEvent(
    session: TerminalSession,
    eventType: TerminalEvent["type"],
    payload: TerminalEventPayload,
  ): void {
    const timestamp = Date.now();
    const event: TerminalEvent = {
      type: eventType,
      payload,
      timestamp,
    };

    session.buffer.push(event);
    if (session.buffer.length > TERMINAL_BUFFER_LIMIT) {
      session.buffer.shift();
    }

    if (session.clients.size > 0) {
      for (const client of session.clients.values()) {
        this.sendWebSocketMessage(
          client,
          event.type,
          session,
          { ...event.payload },
          event.timestamp,
        );
      }
    } else {
    }
    this.eternalTerminalLogManager.recordEvent(session, event);
  }

  private removeClient(session: TerminalSession, clientId: string): void {
    const client = session.clients.get(clientId);
    if (!client) {
      return;
    }

    if (client.heartbeat) {
      clearInterval(client.heartbeat);
    }
    try {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.close(1000, "Session cleanup");
      }
    } catch {
      // ignore close errors
    }
    session.clients.delete(clientId);
  }

  private closeAllClients(session: TerminalSession): void {
    for (const clientId of Array.from(session.clients.keys())) {
      this.removeClient(session, clientId);
    }
  }

  private handlePtyExit(
    session: TerminalSession,
    exitCode: number | null,
    signal: number | null,
  ): void {
    const timeSinceCreation = Date.now() - session.createdAt;
    session.state = "exited";
    session.updatedAt = Date.now();

    // Check if this is an abnormal exit
    if (timeSinceCreation < 1000) {
      baseLogger.error(
        new Error(
          `PTY exited immediately after spawn (${timeSinceCreation}ms)`,
        ),
        "Abnormal PTY exit detected - process died within 1 second",
        {
          sessionId: session.id,
          exitCode,
          signal,
          command: session.command,
          args: session.args,
          cwd: session.cwd,
          shell: process.env.SHELL,
        },
      );
    }

    this.emitTerminalEvent(session, "exit", {
      exitCode: exitCode ?? undefined,
      signal: signal ?? undefined,
    });
    this.emitTerminalEvent(
      session,
      "status",
      this.buildSessionSnapshot(session),
    );

    if (session.clients.size === 0) {
      this.sessions.delete(session.id);
      this.sessionInputBuffers.delete(session.id);
    }

    this.finalizeEternalLog(session.id);
  }

  private normalizeEnv(
    env?: Record<string, string>,
    baseEnv?: NodeJS.ProcessEnv,
  ): NodeJS.ProcessEnv {
    const merged: NodeJS.ProcessEnv = { ...(baseEnv ?? process.env) };
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        merged[key] = value;
      }
    }
    return merged;
  }

  private buildBaseEnvironment(cwd: string): NodeJS.ProcessEnv {
    const safeKeys = [
      "PATH",
      "TERM",
      "LANG",
      "LC_ALL",
      "LC_CTYPE",
      "LC_MESSAGES",
      "SHELL",
      "EXPO_NO_TELEMETRY",
      "CHOKIDAR_USEPOLLING",
      "CHOKIDAR_INTERVAL",
      "WATCHPACK_POLLING",
      "NPM_CONFIG_CACHE",
      "TZ",
      "NEXT_TELEMETRY_DISABLED",
      "NEXT_SHARP_PATH",
      "BUN_INSTALL",
      "BUN_INSTALL_CACHE_DIR",
      "BUN_TMPDIR",
    ];

    const env: NodeJS.ProcessEnv = {};
    for (const key of safeKeys) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }

    const username = this.terminalUserIdentity?.username ?? process.env.USER ??
      "root";

    env.PATH = env.PATH ??
      "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
    env.TERM = env.TERM ?? "xterm-256color";
    env.HOME = this.terminalUserIdentity?.homeDir ?? this.workDir;
    env.USER = username;
    env.LOGNAME = username;
    env.PWD = cwd;
    env.WORK_DIR = this.workDir;
    env.NPM_CONFIG_CACHE = path.join(this.workDir, ".npm-cache");
    env.NODE_ENV = "development";

    return env;
  }

  private killSessionProcess(session: TerminalSession): void {
    if (!session.pty) {
      return;
    }

    const ptyPid = session.pty.pid;

    try {
      session.pty.kill("SIGTERM");

      setTimeout(() => {
        if (session.pty) {
          baseLogger.warn(
            "Process did not terminate after SIGTERM, sending SIGKILL",
            {
              sessionId: session.id,
              terminalType: session.type,
              ptyPid: session.pty.pid,
            },
          );
          try {
            session.pty.kill("SIGKILL");
          } catch (killError) {
            baseLogger.error(
              killError instanceof Error
                ? killError
                : new Error(String(killError)),
              "Failed to send SIGKILL to PTY process",
              {
                sessionId: session.id,
                ptyPid: session.pty.pid,
              },
            );
          }
        }
      }, 5000);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : JSON.stringify(error);
      baseLogger.warn("Failed to kill terminal process cleanly", {
        sessionId: session.id,
        terminalType: session.type,
        ptyPid,
        error: message,
      });
    }
  }

  private async handleTerminalCreateRoute(
    request: FastifyRequest<{ Body: TerminalCreateRequest }>,
    reply: FastifyReply,
  ): Promise<TerminalCreateResponse> {
    try {
      const sessionType: TerminalSessionType = request.body.session_type ??
        "generic";

      // Generate unique session ID
      let sessionId = uuidv4();
      while (this.sessions.has(sessionId)) {
        sessionId = uuidv4();
      }

      // Create session with PTY
      const session = this.getOrCreateTerminalSession(sessionId, sessionType, {
        command: request.body.command,
        args: request.body.args,
        cwd: request.body.cwd ?? this.workDir,
        env: request.body.env,
        cols: request.body.cols,
        rows: request.body.rows,
      });

      return reply.code(200).send({
        status: "success",
        session_id: session.id,
        session_type: session.type,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      baseLogger.error(
        new Error(errorMessage),
        "Unexpected error in handleTerminalCreateRoute",
      );
      reply.code(500);
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private async handleTerminalInfoRoute(
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply,
  ): Promise<TerminalInfoResponse> {
    const { sessionId } = request.params;

    try {
      const response = this.getSessionInfo(sessionId);

      if (response.status === "success") {
        return reply.code(200).send(response);
      } else {
        reply.code(404);
        return response;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      baseLogger.error(
        new Error(errorMessage),
        "Unexpected error in handleTerminalInfo",
        { sessionId },
      );
      reply.code(500);
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private async handleTerminalCloseRoute(
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply,
  ): Promise<TerminalCloseResponse> {
    const { sessionId } = request.params;

    try {
      const response = this.closeSession(sessionId);

      if (response.status === "success") {
        return reply.code(200).send(response);
      } else {
        reply.code(404);
        return response;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      baseLogger.error(
        new Error(errorMessage),
        "Unexpected error in handleTerminalClose",
        { sessionId },
      );
      reply.code(500);
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private async handleTerminalInputRoute(
    request: FastifyRequest<{
      Params: { sessionId: string };
      Body: TerminalInputRequest;
    }>,
    reply: FastifyReply,
  ): Promise<TerminalInputResponse> {
    const { sessionId } = request.params;
    const { input } = request.body;

    if (input === undefined) {
      baseLogger.error(
        new Error("Missing required parameter: input"),
        "Missing required parameter: input",
        { sessionId },
      );
      reply.code(400);
      return {
        status: "error",
        error: "input is required",
      };
    }

    try {
      this.sendInput(sessionId, input);
      return reply.code(200).send({ status: "success" });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      const isNotFound = errorMessage.includes("not found");
      const isValidationError = error instanceof Error &&
        (error.name === "TerminalInputValidationError" ||
          errorMessage.toLowerCase().includes("rejected"));

      if (isNotFound) {
        baseLogger.warn("Terminal session not found", { sessionId });
        reply.code(404);
      } else if (isValidationError) {
        baseLogger.warn("Terminal input rejected by policy", {
          sessionId,
          error: errorMessage,
        });
        reply.code(400);
      } else {
        baseLogger.error(
          new Error(errorMessage),
          "Failed to send input to terminal",
          { sessionId },
        );
        reply.code(500);
      }

      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private async handleTerminalResizeRoute(
    request: FastifyRequest<{
      Params: { sessionId: string };
      Body: TerminalResizeRequest;
    }>,
    reply: FastifyReply,
  ): Promise<TerminalResizeResponse> {
    const { sessionId } = request.params;
    const { cols, rows } = request.body;

    if (!cols || !rows) {
      baseLogger.error(
        new Error("Missing required parameters: cols and rows"),
        "Missing required parameters: cols and rows",
      );
      reply.code(400);
      return {
        status: "error",
        error: "cols and rows are required",
      };
    }

    try {
      this.resizeSession(sessionId, cols, rows);
      return reply.code(200).send({ status: "success" });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      const isNotFound = errorMessage.includes("not found");

      if (isNotFound) {
        baseLogger.warn("Terminal session not found", { sessionId });
        reply.code(404);
      } else {
        baseLogger.error(new Error(errorMessage), "Failed to resize terminal", {
          sessionId,
        });
        reply.code(500);
      }

      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private handleWebSocketConnection(
    socket: WebSocket,
    req: FastifyRequest,
  ): void {
    const { sessionId } = req.params as { sessionId: string };
    // baseLogger.consoleLogDevOnly("info", "handleWebSocketConnection", {
    //   sessionId,
    // });
    // Attach the WebSocket to the session
    // This handles sending existing buffer, status, and setting up event listeners
    this.attachWebSocket(sessionId, socket, {
      allowCreate: false,
    });

    // Handle incoming messages from the client
    socket.on("message", (raw: Buffer | string) => {
      try {
        const message = JSON.parse(raw.toString());

        // Handle different message types
        if (message.type === "input" && typeof message.data === "string") {
          try {
            this.sendInput(sessionId, message.data);
          } catch (error) {
            baseLogger.warn("Failed to handle WebSocket terminal input", {
              error: JSON.stringify(error),
              sessionId,
            });
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  event: "error",
                  data: {
                    error: error instanceof Error
                      ? error.message
                      : "Terminal input rejected",
                  },
                }),
              );
            }
          }
        } else if (message.type === "resize") {
          // Terminal resize request
          const cols = Number(message.cols);
          const rows = Number(message.rows);
          if (Number.isFinite(cols) && Number.isFinite(rows)) {
            this.resizeSession(sessionId, cols, rows);
          }
        } else if (message.type === "signal" && message.name === "SIGINT") {
          // Ctrl+C signal
          try {
            this.sendInput(sessionId, "\x03");
          } catch (error) {
            baseLogger.warn("Failed to send SIGINT to terminal", {
              error: JSON.stringify(error),
            });
          }
        }
      } catch {
        // If not valid JSON, treat as raw input
        if (typeof raw === "string" || Buffer.isBuffer(raw)) {
          try {
            this.sendInput(sessionId, raw.toString());
          } catch (inputError) {
            baseLogger.error(
              inputError instanceof Error
                ? inputError
                : new Error(String(inputError)),
              "Failed to send input to terminal",
              { sessionId, raw: raw.toString() },
            );
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  event: "error",
                  data: {
                    error: inputError instanceof Error
                      ? inputError.message
                      : "Terminal input rejected",
                  },
                }),
              );
            }
          }
        }
      }
    });
  }

  public attachWebSocket(
    sessionId: string,
    socket: WebSocket,
    options: {
      allowCreate?: boolean;
      defaultType?: TerminalSessionType;
    } = {},
  ): void {
    const session = this.sessions.get(sessionId) ||
      (options.allowCreate
        ? this.getOrCreateTerminalSession(
          sessionId,
          options.defaultType ?? "generic",
        )
        : undefined);

    if (!session) {
      baseLogger.warn(
        "Client connection rejected - terminal session not found",
        {
          sessionId,
          allowCreate: options.allowCreate,
          availableSessions: Array.from(this.sessions.keys()),
        },
      );
      const message = JSON.stringify({
        event: "error",
        data: { error: "Terminal session not found", sessionId },
      });
      try {
        socket.send(message);
      } catch (error) {
        baseLogger.warn("Failed to send error message to client", {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        socket.close(1008, "Terminal session not found");
      }
      return;
    }

    const clientId = uuidv4();
    const client: TerminalClient = {
      id: clientId,
      socket,
    };

    session.clients.set(clientId, client);

    const cleanup = (): void => {
      this.removeClient(session, clientId);
    };

    socket.on("close", (code: number, reason: Buffer) => {
      baseLogger.warn("WebSocket closed", {
        sessionId,
        clientId,
        code,
        reason: reason.toString(),
      });
      cleanup();
    });

    socket.on("error", (error: Error) => {
      baseLogger.warn("WebSocket error", {
        sessionId,
        clientId,
        error: error.message,
        stack: error.stack,
      });
      cleanup();
    });

    client.heartbeat = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        this.sendWebSocketMessage(
          client,
          "heartbeat",
          session,
          { timestamp: Date.now() },
          Date.now(),
        );
      } else {
        cleanup();
      }
    }, HEARTBEAT_INTERVAL_MS);

    this.sendWebSocketMessage(
      client,
      "status",
      session,
      this.buildSessionSnapshot(session),
      Date.now(),
    );

    for (const event of session.buffer) {
      this.sendWebSocketMessage(
        client,
        event.type,
        session,
        { ...event.payload },
        event.timestamp,
      );
    }
  }

  private sendWebSocketMessage(
    client: TerminalClient,
    eventType: TerminalEvent["type"] | "heartbeat",
    session: TerminalSession,
    payload: TerminalEventPayload,
    timestamp: number,
  ): void {
    try {
      const data = {
        ...payload,
        sessionId: session.id,
        state: session.state,
        timestamp,
      };
      const message = JSON.stringify({
        event: eventType,
        data,
      });
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(message);
      }
    } catch (error) {
      baseLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to send WebSocket message",
        { sessionId: session.id, eventType, error: JSON.stringify(error) },
      );
      this.removeClient(session, client.id);
    }
  }

  private finalizeEternalLog(sessionId: string): void {
    void this.eternalTerminalLogManager
      .finalizeSession(sessionId)
      .catch((error) => {
        baseLogger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to finalize eternal terminal log",
          { sessionId },
        );
      });
  }
}
