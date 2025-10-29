import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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

    this.logger.info("TerminalService initializing", {
      workDir,
      shell: process.env.SHELL,
      platform: process.platform,
      nodeVersion: process.version,
    });

    // Every build worker is instantiated with three pre-configured terminals.
    // These terminals live throughout the entire lifecycle of the container.
    this.logger.info("Creating pre-configured terminal sessions");

    try {
      // Use -i for interactive mode to keep bash alive
      this.getOrCreateTerminalSession("dev-server", "dev-server", {
        args: ["-i"],
      });
      this.logger.info("Pre-configured terminal created: dev-server");
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
      this.logger.info("Pre-configured terminal created: build");
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
      this.logger.info("Pre-configured terminal created: test");
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to create test terminal",
      );
    }

    this.logger.info("TerminalService initialization complete", {
      sessionsCreated: this.sessions.size,
      sessionIds: Array.from(this.sessions.keys()),
    });
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
    this.logger.info("creating terminal session initiated: ", {
      sessionId,
      type,
    });
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.logger.info("terminal session already exists: ", {
        sessionId,
        type,
      });
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
    // Default to interactive mode for bash to prevent immediate exit
    const args = options.args ?? [];
    const env = this.normalizeEnv(options.env);

    this.logger.info("About to spawn PTY process", {
      sessionId,
      type,
      command,
      args,
      cwd,
      cols,
      rows,
      shell: process.env.SHELL,
      envKeys: Object.keys(env),
    });

    let pty: IPty;
    try {
      pty = spawnPty(command, args, {
        name: "xterm-color",
        cols,
        rows,
        cwd,
        env,
      });

      this.logger.info("PTY spawned successfully", {
        sessionId,
        type,
        ptyPid: pty.pid,
        command,
        args,
      });
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

    this.logger.info("Creating session object and registering event handlers", {
      sessionId,
      type,
      ptyPid: pty.pid,
    });

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

    this.logger.info("Session registered, attaching PTY event handlers", {
      sessionId,
      ptyPid: pty.pid,
    });

    pty.onData((chunk) => {
      session.updatedAt = Date.now();
      this.logger.debug("Received PTY output data", {
        sessionId,
        chunkLength: chunk.length,
        chunkPreview: chunk.substring(0, 100),
        state: session.state,
        ptyPid: pty.pid,
      });
      this.emitTerminalEvent(session, "output", { chunk });
    });

    pty.onExit(({ exitCode, signal }) => {
      const timeSinceCreation = Date.now() - session.createdAt;
      this.logger.warn("PTY process exit event triggered", {
        sessionId,
        exitCode,
        signal,
        ptyPid: pty.pid,
        command,
        args,
        cwd,
        timeSinceCreationMs: timeSinceCreation,
        timeSinceCreationSeconds: (timeSinceCreation / 1000).toFixed(2),
        immediateExit: timeSinceCreation < 1000,
        state: session.state,
        clientsCount: session.clients.size,
      });
      this.handlePtyExit(session, exitCode ?? null, signal ?? null);
    });

    this.logger.info("PTY event handlers attached successfully", {
      sessionId,
      ptyPid: pty.pid,
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

    this.logger.info("terminal session started: ", { session });

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

    this.logger.info("Sending input to terminal", {
      sessionId,
      inputLength: input.length,
      inputPreview: input.substring(0, 100), // Log first 100 chars
      terminalType: session.type,
      state: session.state,
      ptyPid: session.pty.pid,
    });

    session.updatedAt = Date.now();
    try {
      session.pty.write(input);
      this.logger.debug("Input written to PTY successfully", {
        sessionId,
        ptyPid: session.pty.pid,
      });
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

  public resizeSession(sessionId: string, cols: number, rows: number): void {
    const session = this.requireSession(sessionId);
    if (!session.pty) {
      throw new Error(`Terminal session ${sessionId} is not running`);
    }

    this.logger.info("Resizing terminal", {
      sessionId,
      oldCols: session.cols,
      oldRows: session.rows,
      newCols: cols,
      newRows: rows,
      terminalType: session.type,
    });

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
      this.logger.debug("Close session requested for non-existent session", {
        sessionId,
        availableSessions: Array.from(this.sessions.keys()),
      });
      return {
        status: "error",
        error: "Terminal session not found",
      };
    }

    const previousState = session.state;
    const uptime = Date.now() - session.createdAt;

    this.logger.info("Closing terminal session", {
      sessionId,
      terminalType: session.type,
      previousState,
      clientsCount: session.clients.size,
      uptimeMs: uptime,
      uptimeSeconds: (uptime / 1000).toFixed(2),
      ptyPid: session.pty?.pid,
      hasPty: Boolean(session.pty),
    });

    this.killSessionProcess(session);
    session.state = "closed";
    session.updatedAt = Date.now();

    this.logger.debug("Session state updated to closed", {
      sessionId,
      previousState,
      newState: session.state,
    });

    this.emitTerminalEvent(
      session,
      "status",
      this.buildSessionSnapshot(session),
    );
    this.emitTerminalEvent(session, "close", { reason: "requested" });
    this.closeAllClients(session);

    this.sessions.delete(sessionId);

    this.logger.info("Terminal session closed and removed from registry", {
      sessionId,
      terminalType: session.type,
      finalState: session.state,
      remainingSessions: this.sessions.size,
    });

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

    this.logger.debug("Emitting terminal event", {
      sessionId: session.id,
      eventType,
      state: session.state,
      clientsCount: session.clients.size,
      bufferSize: session.buffer.length,
      payloadKeys: Object.keys(payload),
    });

    session.buffer.push(event);
    if (session.buffer.length > TERMINAL_BUFFER_LIMIT) {
      const removed = session.buffer.shift();
      this.logger.debug("Buffer limit reached, removed oldest event", {
        sessionId: session.id,
        removedEventType: removed?.type,
        newBufferSize: session.buffer.length,
      });
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
      this.logger.debug("Event emitted but no clients connected", {
        sessionId: session.id,
        eventType,
      });
    }
  }

  private removeClient(session: TerminalSession, clientId: string): void {
    const client = session.clients.get(clientId);
    if (!client) {
      return;
    }

    this.logger.info("Removing client from terminal session", {
      sessionId: session.id,
      clientId,
      terminalType: session.type,
      remainingClients: session.clients.size - 1,
      socketState: client.socket.readyState,
    });

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
    const previousState = session.state;
    session.state = "exited";
    session.updatedAt = Date.now();

    this.logger.warn("PTY process exited - handling cleanup", {
      sessionId: session.id,
      terminalType: session.type,
      exitCode,
      signal,
      previousState,
      newState: session.state,
      hasClients: session.clients.size > 0,
      clientsCount: session.clients.size,
      uptimeMs: timeSinceCreation,
      uptimeSeconds: (timeSinceCreation / 1000).toFixed(2),
      immediateExit: timeSinceCreation < 1000,
      command: session.command,
      args: session.args,
      cwd: session.cwd,
      ptyPid: session.pty?.pid,
    });

    // Check if this is an abnormal exit
    if (timeSinceCreation < 1000) {
      this.logger.error(
        new Error(`PTY exited immediately after spawn (${timeSinceCreation}ms)`),
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
      this.logger.info("Terminal session removed (no clients after exit)", {
        sessionId: session.id,
        terminalType: session.type,
        exitCode,
        signal,
      });
      this.sessions.delete(session.id);
    } else {
      this.logger.info("Terminal session kept alive (has clients after exit)", {
        sessionId: session.id,
        terminalType: session.type,
        clientsCount: session.clients.size,
        exitCode,
        signal,
      });
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
      this.logger.debug("No PTY process to kill", {
        sessionId: session.id,
        terminalType: session.type,
        state: session.state,
      });
      return;
    }

    const ptyPid = session.pty.pid;

    this.logger.info("Killing terminal process with SIGTERM", {
      sessionId: session.id,
      terminalType: session.type,
      command: session.command,
      state: session.state,
      ptyPid,
    });

    try {
      session.pty.kill("SIGTERM");
      this.logger.debug("SIGTERM sent to PTY process", {
        sessionId: session.id,
        ptyPid,
      });

      setTimeout(() => {
        if (session.pty) {
          this.logger.warn("Process did not terminate after SIGTERM, sending SIGKILL", {
            sessionId: session.id,
            terminalType: session.type,
            ptyPid: session.pty.pid,
          });
          try {
            session.pty.kill("SIGKILL");
            this.logger.debug("SIGKILL sent to PTY process", {
              sessionId: session.id,
              ptyPid: session.pty.pid,
            });
          } catch (killError) {
            this.logger.error(
              killError instanceof Error ? killError : new Error(String(killError)),
              "Failed to send SIGKILL to PTY process",
              {
                sessionId: session.id,
                ptyPid: session.pty.pid,
              },
            );
          }
        } else {
          this.logger.debug("PTY already cleaned up before SIGKILL timeout", {
            sessionId: session.id,
            ptyPid,
          });
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
        { sessionId },
      );
      reply.code(400);
      return {
        status: "error",
        error: "input is required",
      };
    }

    this.logger.info("Received terminal input via API", {
      sessionId,
      inputLength: input.length,
      inputPreview: input.substring(0, 100),
    });

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

        this.logger.debug("Received WebSocket message", {
          sessionId,
          messageType: message.type,
        });

        // Handle different message types
        if (message.type === "input" && typeof message.data === "string") {
          // User input to terminal
          this.logger.info("Received input via WebSocket", {
            sessionId,
            inputLength: message.data.length,
            inputPreview: message.data.substring(0, 100),
          });
          this.sendInput(sessionId, message.data);
        } else if (message.type === "resize") {
          // Terminal resize request
          const cols = Number(message.cols);
          const rows = Number(message.rows);
          if (Number.isFinite(cols) && Number.isFinite(rows)) {
            this.logger.info("Received resize request via WebSocket", {
              sessionId,
              cols,
              rows,
            });
            this.resizeSession(sessionId, cols, rows);
          }
        } else if (message.type === "signal" && message.name === "SIGINT") {
          // Ctrl+C signal
          this.logger.info("Received SIGINT via WebSocket", { sessionId });
          this.sendInput(sessionId, "\x03");
        }
      } catch {
        // If not valid JSON, treat as raw input
        if (typeof raw === "string" || Buffer.isBuffer(raw)) {
          try {
            this.logger.debug("Treating WebSocket message as raw input", {
              sessionId,
              rawLength: raw.length,
            });
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

  public attachWebSocket(
    sessionId: string,
    socket: WebSocket,
    options: {
      allowCreate?: boolean;
      defaultType?: TerminalSessionType;
    } = {},
  ): void {
    this.logger.info("WebSocket attachment requested", {
      sessionId,
      allowCreate: options.allowCreate,
      defaultType: options.defaultType,
      socketReadyState: socket.readyState,
      existingSession: this.sessions.has(sessionId),
    });

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
        this.logger.debug("Error message sent to client", { sessionId });
      } catch (error) {
        this.logger.debug("Failed to send error message to client", {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        socket.close(1008, "Terminal session not found");
        this.logger.debug("Socket closed due to session not found", {
          sessionId,
        });
      }
      return;
    }

    const clientId = uuidv4();
    const client: TerminalClient = {
      id: clientId,
      socket,
    };

    session.clients.set(clientId, client);

    this.logger.info("New client connected to terminal session", {
      sessionId,
      clientId,
      terminalType: session.type,
      state: session.state,
      clientsCount: session.clients.size,
      ptyPid: session.pty?.pid,
      hasPty: Boolean(session.pty),
      bufferSize: session.buffer.length,
    });

    const cleanup = (): void => {
      this.logger.debug("WebSocket cleanup triggered", {
        sessionId,
        clientId,
        socketReadyState: socket.readyState,
      });
      this.removeClient(session, clientId);
    };

    socket.on("close", (code: number, reason: Buffer) => {
      this.logger.info("WebSocket closed", {
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

    this.logger.debug("Starting heartbeat for client", {
      sessionId,
      clientId,
      intervalMs: HEARTBEAT_INTERVAL_MS,
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
        this.logger.debug("Heartbeat found closed socket, cleaning up", {
          sessionId,
          clientId,
          socketReadyState: socket.readyState,
        });
        cleanup();
      }
    }, HEARTBEAT_INTERVAL_MS);

    this.logger.debug("Sending initial status to client", {
      sessionId,
      clientId,
      state: session.state,
    });

    this.sendWebSocketMessage(
      client,
      "status",
      session,
      this.buildSessionSnapshot(session),
      Date.now(),
    );

    this.logger.debug("Sending buffered events to client", {
      sessionId,
      clientId,
      bufferSize: session.buffer.length,
    });

    for (const event of session.buffer) {
      this.sendWebSocketMessage(
        client,
        event.type,
        session,
        { ...event.payload },
        event.timestamp,
      );
    }

    this.logger.info("Client setup complete - terminal buffer sent", {
      sessionId,
      clientId,
      bufferSize: session.buffer.length,
      state: session.state,
    });
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
}
