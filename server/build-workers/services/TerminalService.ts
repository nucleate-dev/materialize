import { IPty, spawn as spawnPty } from "node-pty";
import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import { SystemLogger } from "../loggers/SystemLogger.js";
import {
  TerminalCloseResponse,
  TerminalCreateRequest,
  TerminalCreateResponse,
  TerminalInfoResponse,
  TerminalSessionType,
} from "../types/BuildWorkerTypes.js";
import { FastifyInstance, FastifyRequest } from "fastify";
// import type { fastifyWebsocket } from "@fastify/websocket";

const TERMINAL_BUFFER_LIMIT = 200;
const HEARTBEAT_INTERVAL_MS = 15000;

export type TerminalRuntimeState = "idle" | "running" | "exited" | "closed";

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
  pty: IPty | null;
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
  private logger: SystemLogger;
  private readonly fastifyApp: FastifyInstance;
  private readonly sessions = new Map<string, TerminalSession>();

  constructor(
    fastifyApp: FastifyInstance,
    workDir: string,
    logger: SystemLogger,
  ) {
    this.workDir = workDir;
    this.fastifyApp = fastifyApp;
    this.logger = logger;
  }

  public setLogger(logger: SystemLogger): void {
    this.logger = logger;
  }

  public getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  public ensureSession(
    sessionId: string,
    type: TerminalSessionType,
  ): TerminalSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (existing.type !== type) {
        existing.type = type;
      }
      return existing;
    }
    return this.createEmptySession(sessionId, type);
  }

  public startProcess(
    sessionId: string,
    type: TerminalSessionType,
    options: {
      command: string;
      args: string[];
      cwd: string;
      env?: Record<string, string>;
      cols?: number;
      rows?: number;
    },
  ): TerminalSession {
    const session = this.ensureSession(sessionId, type);
    return this.spawnPtyForSession(session, options);
  }

  public createSession(
    request: TerminalCreateRequest,
    options: { defaultCwd?: string } = {},
  ): TerminalCreateResponse {
    try {
      const sessionType: TerminalSessionType =
        request.session_type ?? "generic";

      let sessionId = uuidv4();
      while (this.sessions.has(sessionId)) {
        sessionId = uuidv4();
      }

      const session = this.ensureSession(sessionId, sessionType);
      const cwd = request.cwd || options.defaultCwd || this.workDir;
      const command = request.command || process.env.SHELL || "/bin/bash";
      const args = request.args ?? [];
      const env = request.env;
      const cols = request.cols;
      const rows = request.rows;

      this.spawnPtyForSession(session, {
        command,
        args,
        cwd,
        env,
        cols,
        rows,
      });

      this.logger.info("Created terminal session in TerminalService", {
        sessionId,
        sessionType,
        command,
        cwd,
      });

      return {
        status: "success",
        session_id: session.id,
        session_type: session.type,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        new Error(message),
        "Failed to create terminal session",
      );
      return {
        status: "error",
        error: message,
      };
    }
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
        ? this.ensureSession(sessionId, options.defaultType ?? "generic")
        : undefined);

    if (!session) {
      const message = JSON.stringify({
        event: "error",
        data: { error: "Terminal session not found", sessionId },
      });
      try {
        socket.send(message);
      } catch {
        // ignore send errors on closing socket
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

    socket.on("close", cleanup);
    socket.on("error", cleanup);

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

  public sendInput(sessionId: string, input: string): void {
    const session = this.requireSession(sessionId);
    if (!session.pty) {
      throw new Error(`Terminal session ${sessionId} is not running`);
    }

    session.updatedAt = Date.now();
    session.pty.write(input);
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

  public killProcess(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    this.killSessionProcess(session);
  }

  public shutdownAllSessions(): void {
    for (const sessionId of this.getSessionIds()) {
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

  private createEmptySession(
    sessionId: string,
    type: TerminalSessionType,
  ): TerminalSession {
    const session: TerminalSession = {
      id: sessionId,
      type,
      pty: null,
      command: "",
      args: [],
      cwd: this.workDir,
      env: { ...process.env },
      cols: 80,
      rows: 24,
      state: "idle",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      buffer: [],
      clients: new Map(),
    };
    this.sessions.set(sessionId, session);
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
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.debug("Failed to send WebSocket message", {
        sessionId: session.id,
        eventType,
        error: message,
      });
      this.removeClient(session, client.id);
    }
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

    for (const client of session.clients.values()) {
      this.sendWebSocketMessage(
        client,
        event.type,
        session,
        { ...event.payload },
        event.timestamp,
      );
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
    session.pty = null;
    session.state = "exited";
    session.updatedAt = Date.now();

    this.emitTerminalEvent(session, "exit", {
      exitCode: exitCode ?? undefined,
      signal: signal ?? undefined,
    });
    this.emitTerminalEvent(
      session,
      "status",
      this.buildSessionSnapshot(session),
    );

    if (session.type !== "dev-server" && session.clients.size === 0) {
      this.sessions.delete(session.id);
    }
  }

  private normalizeEnv(env?: Record<string, string>): NodeJS.ProcessEnv {
    const merged: NodeJS.ProcessEnv = { ...process.env };
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        merged[key] = value;
      }
    }
    return merged;
  }

  private killSessionProcess(session: TerminalSession): void {
    if (!session.pty) {
      return;
    }

    try {
      session.pty.kill("SIGTERM");
      setTimeout(() => {
        if (session.pty) {
          session.pty.kill("SIGKILL");
        }
      }, 5000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.warn("Failed to kill terminal process cleanly", {
        sessionId: session.id,
        error: message,
      });
    }
  }

  private spawnPtyForSession(
    session: TerminalSession,
    options: {
      command: string;
      args: string[];
      cwd: string;
      env?: Record<string, string>;
      cols?: number;
      rows?: number;
    },
  ): TerminalSession {
    if (session.pty) {
      this.killSessionProcess(session);
    }

    const cols = options.cols ?? session.cols ?? 80;
    const rows = options.rows ?? session.rows ?? 24;
    const env = this.normalizeEnv(options.env);

    session.command = options.command;
    session.args = options.args;
    session.cwd = options.cwd;
    session.env = env;
    session.cols = cols;
    session.rows = rows;
    session.state = "running";
    session.updatedAt = Date.now();

    const pty = spawnPty(options.command, options.args, {
      name: "xterm-color",
      cols,
      rows,
      cwd: options.cwd,
      env,
    });

    session.pty = pty;

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

  public registerRoutes(): void {
    this.fastifyApp.get(
      "/terminal/:sessionId/ws",
      { websocket: true },
      this.handleWebSocketConnection.bind(this),
    );

    this.logger.info("Terminal WebSocket routes registered");
  }

  private handleWebSocketConnection(
    socket: WebSocket,
    req: FastifyRequest,
  ): void {
    const { sessionId } = req.params as { sessionId: string };

    this.logger.info("WebSocket connection requested", { sessionId });

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
          // User input to terminal
          this.sendInput(sessionId, message.data);
        } else if (message.type === "resize") {
          // Terminal resize request
          const cols = Number(message.cols);
          const rows = Number(message.rows);
          if (Number.isFinite(cols) && Number.isFinite(rows)) {
            this.resizeSession(sessionId, cols, rows);
          }
        } else if (message.type === "signal" && message.name === "SIGINT") {
          // Ctrl+C signal
          this.sendInput(sessionId, "\x03");
        }
      } catch {
        // If not valid JSON, treat as raw input
        if (typeof raw === "string" || Buffer.isBuffer(raw)) {
          try {
            this.sendInput(sessionId, raw.toString());
          } catch (inputError) {
            this.logger.debug("Failed to send input", {
              sessionId,
              error:
                inputError instanceof Error
                  ? inputError.message
                  : String(inputError),
            });
          }
        }
      }
    });
  }
}
