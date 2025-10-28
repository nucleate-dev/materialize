import { IPty, spawn as spawnPty } from "node-pty";
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
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
// import type { fastifyWebsocket } from "@fastify/websocket";

const TERMINAL_BUFFER_LIMIT = 200;
const HEARTBEAT_INTERVAL_MS = 15000;

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
      "/terminal/:sessionId/ws",
      { websocket: true },
      this.handleWebSocketConnection.bind(this),
    );

    this.logger.info("Terminal routes registered");
  }

  public setLogger(logger: SystemLogger): void {
    this.logger = logger;
  }

  public ensureSession(
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
    const cwd = options.cwd ?? this.workDir;
    const command = options.command ?? process.env.SHELL ?? "/bin/bash";
    const args = options.args ?? [];
    const env = this.normalizeEnv(options.env);

    const session: TerminalSession = {
      id: sessionId,
      type,
      pty: null, // Temporarily null, will be set immediately
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

    // Spawn PTY immediately
    const pty = spawnPty(command, args, {
      name: "xterm-color",
      cols,
      rows,
      cwd,
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
    return this.ensureSession(sessionId, type, options);
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
      const session = this.ensureSession(sessionId, sessionType, {
        command: request.body.command,
        args: request.body.args,
        cwd: request.body.cwd ?? this.workDir,
        env: request.body.env,
        cols: request.body.cols,
        rows: request.body.rows,
      });

      this.logger.info("Created terminal session", {
        sessionId: session.id,
        sessionType: session.type,
        command: session.command,
        cwd: session.cwd,
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
        this.logger.info("Closed terminal session", { sessionId });
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

      if (isNotFound) {
        this.logger.warn("Terminal session not found", { sessionId });
        reply.code(404);
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
}
