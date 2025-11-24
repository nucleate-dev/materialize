import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { existsSync, mkdirSync } from "fs";
import { IPty, IPtyForkOptions, spawn as spawnPty } from "node-pty";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import { SystemLogger } from "../loggers/SystemLogger.js";
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
} from "../types/BuildWorkerTypes.js";
// import { TerminalCommandValidator } from "./TerminalCommandValidationUtils.js";
import { randomUUID } from "crypto";
import {
  TerminalUserIdentity,
  resolveTerminalUserIdentity,
} from "../utils/TerminalUserUtils.js";
// import type { fastifyWebsocket } from "@fastify/websocket";

const TERMINAL_BUFFER_LIMIT = 5000;
const HEARTBEAT_INTERVAL_MS = 15000;
const LAUNCH_TERMINALS_AS_ROOT = true;

export type TerminalRuntimeState = "running" | "exited" | "closed";

export interface TerminalEventPayload {
  [key: string]: unknown;
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
  // private readonly commandValidator: TerminalCommandValidator;
  private logger: SystemLogger;
  private readonly fastifyApp: FastifyInstance;
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly terminalUserIdentity: TerminalUserIdentity | null;

  constructor(
    fastifyApp: FastifyInstance,
    workDir: string,
    logger: SystemLogger,
  ) {
    this.allowedRoot = path.resolve("/tmp/materialize-dev-server");
    // this.commandValidator = new TerminalCommandValidator(this.allowedRoot);
    const normalizedWorkDir = path.resolve(workDir);
    this.workDir = normalizedWorkDir;
    // this.workDir = this.commandValidator.isPathInsideAllowedRoot(
    //   normalizedWorkDir,
    // )
    //   ? normalizedWorkDir
    //   : this.allowedRoot;
    this.fastifyApp = fastifyApp;
    this.logger = logger;

    // Always resolve the terminal user identity for non-test terminals
    const terminalUsername = process.env.TERMINAL_USER ?? "materialize-user";
    this.terminalUserIdentity = resolveTerminalUserIdentity(
      this.logger,
      terminalUsername,
      process.env.TERMINAL_GROUP,
    );
    if (this.terminalUserIdentity) {
      this.logger.consoleLogDevOnly(
        "info",
        "Terminal sessions configured to drop privileges (except test terminal if LAUNCH_TERMINALS_AS_ROOT=true)",
        {
          username: this.terminalUserIdentity.username,
          uid: this.terminalUserIdentity.uid,
          gid: this.terminalUserIdentity.gid,
          homeDir: this.terminalUserIdentity.homeDir,
          testTerminalAsRoot: LAUNCH_TERMINALS_AS_ROOT,
        },
      );
    } else {
      this.logger.warn(
        "Falling back to root for terminal sessions (terminal user not found)",
        { terminalUsername },
      );
    }

    if (LAUNCH_TERMINALS_AS_ROOT) {
      this.logger.warn(
        "Test terminal will run as root (LAUNCH_TERMINALS_AS_ROOT=true)",
      );
    }

    // if (!this.commandValidator.isPathInsideAllowedRoot(normalizedWorkDir)) {
    //   this.logger.warn("WorkDir is outside the allowed root for terminals", {
    //     workDir: normalizedWorkDir,
    //     allowedRoot: this.allowedRoot,
    //   });
    // }

    // Make sure work directory exists
    try {
      if (!existsSync(this.workDir)) {
        this.logger.warn("workDir does not exist; creating it", {
          workDir: this.workDir,
        });
        mkdirSync(this.workDir, { recursive: true });
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to ensure workDir exists",
        { workDir: this.workDir },
      );
      throw error;
    }

    // Every build worker is instantiated with three pre-configured terminals.
    // These terminals live throughout the entire lifecycle of the container.
    this.logger.consoleLogDevOnly(
      "info",
      "Creating pre-configured terminal sessions",
    );

    try {
      // Use -i for interactive mode to keep bash alive
      this.getOrCreateTerminalSession("dev-server", "dev-server", {
        args: ["-i"],
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to create dev-server terminal",
      );
    }

    try {
      this.getOrCreateTerminalSession("build", "build", {
        args: ["-i"],
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to create build terminal",
      );
    }

    try {
      this.getOrCreateTerminalSession("test", "test", {
        args: ["-i"],
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to create test terminal",
      );
    }

    this.logger.consoleLogDevOnly(
      "info",
      "TerminalService initialization complete",
      {
        sessionsCreated: this.sessions.size,
        sessionIds: Array.from(this.sessions.keys()),
      },
    );
  }

  public registerRoutes(): void {
    // POST /terminal/create - Create a new terminal session
    this.fastifyApp.post<{ Body: TerminalCreateRequest }>(
      "/terminal/create",
      this.handleTerminalCreateRoute.bind(this),
    );

    // GET /terminal/:sessionId - Get terminal session info
    this.fastifyApp.get<{ Params: { sessionId: string } }>(
      "/terminal/:sessionId",
      this.handleTerminalInfoRoute.bind(this),
    );

    // DELETE /terminal/:sessionId - Close a terminal session
    this.fastifyApp.delete<{ Params: { sessionId: string } }>(
      "/terminal/:sessionId",
      this.handleTerminalCloseRoute.bind(this),
    );

    // POST /terminal/:sessionId/input - Send input to terminal
    this.fastifyApp.post<{
      Params: { sessionId: string };
      Body: TerminalInputRequest;
    }>("/terminal/:sessionId/input", this.handleTerminalInputRoute.bind(this));

    // POST /terminal/:sessionId/resize - Resize terminal
    this.fastifyApp.post<{
      Params: { sessionId: string };
      Body: TerminalResizeRequest;
    }>(
      "/terminal/:sessionId/resize",
      this.handleTerminalResizeRoute.bind(this),
    );

    // WebSocket /terminal/:sessionId/ws - WebSocket connection
    this.fastifyApp.get(
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
    // const { resolvedPath: normalizedCwd, withinRoot } =
    //   this.commandValidator.normalizePathToAllowedRoot(requestedCwd);
    // const cwd = withinRoot ? normalizedCwd : this.allowedRoot;
    const cwd = path.resolve(requestedCwd);
    // if (!withinRoot) {
    //   this.logger.warn("Requested terminal cwd outside allowed root; clamped", {
    //     sessionId,
    //     requestedCwd,
    //     normalizedCwd,
    //     allowedRoot: this.allowedRoot,
    //   });
    // }
    const defaultShell = process.env.SHELL ?? "/bin/bash";
    const requestedCommand = options.command ?? defaultShell;
    const command =
      path.resolve(requestedCommand) === path.resolve(defaultShell)
        ? requestedCommand
        : defaultShell;
    if (command !== requestedCommand) {
      this.logger.warn("Terminal command overridden to default shell", {
        sessionId,
        requestedCommand,
        command,
      });
    }

    // Default to interactive mode for bash to prevent immediate exit
    const requestedArgs = options.args ?? ["-i"];
    const argsUnsafe =
      requestedArgs.length === 0 ||
      requestedArgs.some(
        (arg) => ["-c", "--command"].includes(arg) || arg.includes("-c"),
      );
    const args = argsUnsafe ? ["-i"] : requestedArgs;
    if (argsUnsafe) {
      this.logger.warn("Terminal args reset to safe defaults", {
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
      const shouldDropPrivileges =
        this.terminalUserIdentity &&
        (sessionId !== "test" || !LAUNCH_TERMINALS_AS_ROOT);

      if (shouldDropPrivileges) {
        const unixOptions = spawnOptions as IPtyForkOptions;
        unixOptions.uid = this.terminalUserIdentity.uid;
        unixOptions.gid = this.terminalUserIdentity.gid;
      } else if (sessionId === "test" && LAUNCH_TERMINALS_AS_ROOT) {
        this.logger.info(
          "Launching test terminal as root (LAUNCH_TERMINALS_AS_ROOT=true)",
          {
            sessionId,
            type,
          },
        );
      }

      pty = spawnPty(command, args, spawnOptions);
    } catch (error) {
      this.logger.error(
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

  public sendInput(sessionId: string, input: string): void {
    const session = this.requireSession(sessionId);
    if (!session.pty) {
      this.logger.error(
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

    // const currentBuffer = this.sessionInputBuffers.get(session.id) ?? "";
    // const { outputToWrite, newBuffer, error } =
    //   this.commandValidator.processAndValidateInput(
    //     session.id,
    //     session.cwd,
    //     input,
    //     currentBuffer,
    //     (newCwd) => {
    //       session.cwd = newCwd;
    //     },
    //   );

    // this.sessionInputBuffers.set(session.id, newBuffer);

    // if (error) {
    //   this.abortCurrentLine(session);
    //   this.logger.warn("Terminal input blocked by policy", {
    //     sessionId,
    //     reason: error.message,
    //     inputPreview: input.slice(0, 200),
    //   });
    //   this.emitTerminalEvent(session, "error", { reason: error.message });
    //   throw error;
    // }

    // if (outputToWrite.length === 0) {
    //   return;
    // }

    session.updatedAt = Date.now();
    try {
      session.pty.write(input);
    } catch (error) {
      this.logger.error(
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

  public async asyncSendInputWithCompletionDetectionOrTimeout(
    sessionId: string,
    input: string,
    options: { timeout?: number } = {},
  ): Promise<{ output: string; exitCode: number }> {
    const session = this.requireSession(sessionId);

    // 1. Create a unique sentinel
    const token = randomUUID().replace(/-/g, "");
    const startMarker = `__START_${token}__`;
    const endMarker = `__END_${token}__`;

    // 2. Wrap the command
    // We print a start marker to help chop off the command echo at the top,
    // and an end marker with the exit code at the bottom.
    // checks for shell (bash/sh/zsh) compatibility
    const wrappedInput = `echo "${startMarker}"; ${input}; echo "${endMarker}:$?"`;

    return new Promise((resolve, reject) => {
      let buffer = "";
      const timeout = options.timeout ?? 30000;

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
        const endIdx = buffer.indexOf(endMarker);
        if (endIdx !== -1) {
          // We found the end!

          // Extract the rest of the line to get exit code: __END_XYZ__:0
          const restOfLine = buffer.substring(endIdx + endMarker.length);
          const match = restOfLine.match(/^:(\d+)/);

          if (match) {
            cleanup();

            const exitCode = parseInt(match[1], 10);

            // Clean up the output:
            // 1. Remove the command echo and start marker
            // 2. Remove the end marker and exit code
            let cleanOutput = buffer.substring(0, endIdx);
            const startIdx = cleanOutput.indexOf(startMarker);
            if (startIdx !== -1) {
              // +1 for newline usually following echo
              cleanOutput = cleanOutput
                .substring(startIdx + startMarker.length)
                .trim();
            }

            resolve({
              output: cleanOutput,
              exitCode: exitCode,
            });
          }
        }
      });

      // 5. Send the wrapped command
      // Add \r to ensure it executes
      try {
        session.pty.write(wrappedInput + "\r");
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
      this.logger.warn("Failed to abort terminal line after validation error", {
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
      this.logger.error(
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
    }
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
    ];

    const env: NodeJS.ProcessEnv = {};
    for (const key of safeKeys) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }

    const username =
      this.terminalUserIdentity?.username ?? process.env.USER ?? "root";

    env.PATH =
      env.PATH ??
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
          this.logger.warn(
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
            this.logger.error(
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
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.warn("Failed to kill terminal process cleanly", {
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
      const sessionType: TerminalSessionType =
        request.body.session_type ?? "generic";

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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
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
      this.logger.error(
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isNotFound = errorMessage.includes("not found");
      const isValidationError =
        error instanceof Error &&
        (error.name === "TerminalInputValidationError" ||
          errorMessage.toLowerCase().includes("rejected"));

      if (isNotFound) {
        this.logger.warn("Terminal session not found", { sessionId });
        reply.code(404);
      } else if (isValidationError) {
        this.logger.warn("Terminal input rejected by policy", {
          sessionId,
          error: errorMessage,
        });
        reply.code(400);
      } else {
        this.logger.error(
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
      this.logger.error(
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isNotFound = errorMessage.includes("not found");

      if (isNotFound) {
        this.logger.warn("Terminal session not found", { sessionId });
        reply.code(404);
      } else {
        this.logger.error(
          new Error(errorMessage),
          "Failed to resize terminal",
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

  private handleWebSocketConnection(
    socket: WebSocket,
    req: FastifyRequest,
  ): void {
    const { sessionId } = req.params as { sessionId: string };
    this.logger.consoleLogDevOnly("info", "handleWebSocketConnection", {
      sessionId,
    });
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
            this.logger.warn("Failed to handle WebSocket terminal input", {
              error: JSON.stringify(error),
              sessionId,
            });
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  event: "error",
                  data: {
                    error:
                      error instanceof Error
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
            this.logger.warn("Failed to send SIGINT to terminal", {
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
            this.logger.error(
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
                    error:
                      inputError instanceof Error
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
    const session =
      this.sessions.get(sessionId) ||
      (options.allowCreate
        ? this.getOrCreateTerminalSession(
            sessionId,
            options.defaultType ?? "generic",
          )
        : undefined);

    if (!session) {
      this.logger.warn(
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
        this.logger.warn("Failed to send error message to client", {
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
      this.logger.warn("WebSocket closed", {
        sessionId,
        clientId,
        code,
        reason: reason.toString(),
      });
      cleanup();
    });

    socket.on("error", (error: Error) => {
      this.logger.warn("WebSocket error", {
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
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to send WebSocket message",
        { sessionId: session.id, eventType, error: JSON.stringify(error) },
      );
      this.removeClient(session, client.id);
    }
  }
}
