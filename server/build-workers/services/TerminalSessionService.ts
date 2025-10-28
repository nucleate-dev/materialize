import fs from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
import { IPty, IPtyForkOptions, spawn as spawnPty } from "node-pty";
import { SystemLogger } from "../loggers/SystemLogger.js";
import {
  TerminalSessionMetadata,
  TerminalSessionStatus,
} from "../types/BuildWorkerTypes.js";

export interface TerminalSessionOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  timeoutMs?: number;
}

export interface TerminalSessionCompletion {
  exitCode: number;
  signal?: string;
  reason: TerminalSessionStatus;
  error?: string;
}

interface InternalTerminalSession {
  id: string;
  pty: IPty;
  metadata: TerminalSessionMetadata;
  logPath: string;
  metaPath: string;
  pendingWrite: Promise<void>;
  timeoutHandle?: NodeJS.Timeout;
  completionResolve: (result: TerminalSessionCompletion) => void;
  completion: Promise<TerminalSessionCompletion>;
}

export interface TerminalSessionHandle {
  id: string;
  pty: IPty;
  metadata: TerminalSessionMetadata;
  completion: Promise<TerminalSessionCompletion>;
}

const LOG_DIR_NAME = "terminal-sessions";
const METADATA_SUFFIX = ".json";
const LOG_SUFFIX = ".log";
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;
const MAX_LOG_READ_BYTES = 256 * 1024; // 256KB per request
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class TerminalSessionService {
  private readonly workDir: string;
  private readonly sessionsDir: string;
  private readonly logger: SystemLogger;
  private readonly sessions = new Map<string, InternalTerminalSession>();

  constructor(workDir: string, logger: SystemLogger) {
    this.workDir = workDir;
    this.sessionsDir = path.join(this.workDir, LOG_DIR_NAME);
    this.logger = logger.child({ route: "TerminalSessionService" });
  }

  public async initialize(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  public async createSession(
    options: TerminalSessionOptions,
  ): Promise<TerminalSessionHandle> {
    await this.initialize();

    const id = randomUUID();
    const cwd = options.cwd || this.workDir;
    const cols = options.cols || DEFAULT_COLS;
    const rows = options.rows || DEFAULT_ROWS;
    const args = options.args ?? [];
    const command = options.command;
    const env = options.env ? { ...process.env, ...options.env } : { ...process.env };

    const logPath = path.join(this.sessionsDir, `${id}${LOG_SUFFIX}`);
    const metaPath = path.join(this.sessionsDir, `${id}${METADATA_SUFFIX}`);

    const metadata: TerminalSessionMetadata = {
      id,
      command,
      args,
      cwd,
      env: options.env,
      cols,
      rows,
      status: "running",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      log_path: logPath,
    };

    await fs.writeFile(logPath, "", { encoding: "utf8" });
    await this.persistMetadata(metaPath, metadata);

    const forkOptions: IPtyForkOptions = {
      cols,
      rows,
      cwd,
      env,
    };

    this.logger.info("Spawning terminal session", {
      sessionId: id,
      command,
      args,
      cwd,
    });

    let pty: IPty;
    try {
      pty = spawnPty(command, args, forkOptions);
    } catch (error) {
      this.logger.error(error, "Failed to spawn terminal session", {
        sessionId: id,
        command,
      });
      throw error;
    }

    const session: InternalTerminalSession = {
      id,
      pty,
      metadata,
      logPath,
      metaPath,
      pendingWrite: Promise.resolve(),
      completionResolve: () => undefined,
      completion: Promise.resolve({
        exitCode: 0,
        reason: "exited",
      }),
    } as unknown as InternalTerminalSession;

    session.completion = new Promise<TerminalSessionCompletion>((resolve) => {
      session.completionResolve = resolve;
    });

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (timeoutMs > 0) {
      session.timeoutHandle = setTimeout(() => {
        this.logger.warn("Terminal session timed out", {
          sessionId: id,
          timeoutMs,
        });
        this.updateSessionStatus(session, "timeout", {
          exitCode: -1,
        });
        try {
          session.pty.kill("SIGKILL");
        } catch (error) {
          this.logger.error(error, "Failed to kill timed-out session", {
            sessionId: id,
          });
        }
        session.completionResolve({
          exitCode: -1,
          reason: "timeout",
        });
      }, timeoutMs);
    }

    session.pendingWrite = Promise.resolve();

    pty.onData((data: string) => {
      void this.enqueueLogWrite(session, data);
      this.touchSession(session);
    });

    pty.onExit((event) => {
      if (session.timeoutHandle) {
        clearTimeout(session.timeoutHandle);
        session.timeoutHandle = undefined;
      }
      const reason: TerminalSessionStatus =
        session.metadata.status === "timeout" ? "timeout" : event.exitCode === 0 ? "exited" : "error";
      this.updateSessionStatus(session, reason, {
        exitCode: event.exitCode,
        signal: event.signal,
      });
      session.completionResolve({
        exitCode: event.exitCode,
        signal: event.signal,
        reason,
      });
      this.sessions.delete(id);
    });

    this.sessions.set(id, session);

    return {
      id,
      pty,
      metadata,
      completion: session.completion,
    };
  }

  public async runCommand(
    options: TerminalSessionOptions,
  ): Promise<{
    sessionId: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    completion: TerminalSessionCompletion;
  }> {
    const handle = await this.createSession(options);
    const completion = await handle.completion;

    const stdout = await fs.readFile(
      path.join(this.sessionsDir, `${handle.id}${LOG_SUFFIX}`),
      "utf8",
    );

    return {
      sessionId: handle.id,
      stdout,
      stderr: "",
      exitCode: completion.exitCode,
      completion,
    };
  }

  public async listSessions(): Promise<TerminalSessionMetadata[]> {
    await this.initialize();
    const files = await fs.readdir(this.sessionsDir);
    const metadata: TerminalSessionMetadata[] = [];

    for (const file of files) {
      if (!file.endsWith(METADATA_SUFFIX)) continue;
      const content = await fs.readFile(path.join(this.sessionsDir, file), "utf8");
      try {
        metadata.push(JSON.parse(content) as TerminalSessionMetadata);
      } catch (error) {
        this.logger.warn("Failed to parse terminal session metadata", {
          file,
          error,
        });
      }
    }
    metadata.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return metadata;
  }

  public async getSessionMetadata(id: string): Promise<TerminalSessionMetadata | null> {
    await this.initialize();
    const metaPath = path.join(this.sessionsDir, `${id}${METADATA_SUFFIX}`);
    try {
      const content = await fs.readFile(metaPath, "utf8");
      return JSON.parse(content) as TerminalSessionMetadata;
    } catch (error) {
      this.logger.warn("Failed to read terminal session metadata", {
        id,
        error,
      });
      return null;
    }
  }

  public async readLogs(
    id: string,
    offset = 0,
    limit: number = MAX_LOG_READ_BYTES,
  ): Promise<{ chunk: string; nextOffset: number; hasMore: boolean; size: number }> {
    await this.initialize();
    const logPath = path.join(this.sessionsDir, `${id}${LOG_SUFFIX}`);
    let handle;
    try {
      handle = await fs.open(logPath, "r");
    } catch (error) {
      this.logger.warn("Failed to open terminal log file", { id, error });
      return { chunk: "", nextOffset: 0, hasMore: false, size: 0 };
    }
    try {
      const stats = await handle.stat();
      if (offset >= stats.size) {
        return { chunk: "", nextOffset: stats.size, hasMore: false, size: stats.size };
      }
      const end = Math.min(stats.size, offset + limit);
      const buffer = Buffer.alloc(end - offset);
      await handle.read(buffer, 0, buffer.length, offset);
      const chunk = buffer.toString("utf8");
      return {
        chunk,
        nextOffset: end,
        hasMore: end < stats.size,
        size: stats.size,
      };
    } finally {
      await handle.close();
    }
  }

  public async writeInput(id: string, input: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }
    session.pty.write(input);
    this.touchSession(session);
  }

  public async resizeSession(id: string, cols: number, rows: number): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }
    session.pty.resize(cols, rows);
    session.metadata.cols = cols;
    session.metadata.rows = rows;
    await this.persistMetadata(session.metaPath, session.metadata);
  }

  public async terminateSession(id: string, signal: string = "SIGTERM"): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      const meta = await this.getSessionMetadata(id);
      if (!meta) {
        throw new Error(`Session ${id} not found`);
      }
      return;
    }
    this.updateSessionStatus(session, "killed");
    session.pty.kill(signal);
    if (session.timeoutHandle) {
      clearTimeout(session.timeoutHandle);
      session.timeoutHandle = undefined;
    }
  }

  private async enqueueLogWrite(
    session: InternalTerminalSession,
    data: string,
  ): Promise<void> {
    session.pendingWrite = session.pendingWrite.then(async () => {
      await fs.appendFile(session.logPath, data, { encoding: "utf8" });
    });

    try {
      await session.pendingWrite;
    } catch (error) {
      this.logger.error(error, "Failed to append terminal log", {
        sessionId: session.id,
      });
    }
  }

  private async persistMetadata(
    filePath: string,
    metadata: TerminalSessionMetadata,
  ): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), "utf8");
  }

  private updateSessionStatus(
    session: InternalTerminalSession,
    status: TerminalSessionStatus,
    details?: { exitCode?: number; signal?: string },
  ): void {
    session.metadata.status = status;
    session.metadata.updated_at = new Date().toISOString();
    if (details?.exitCode !== undefined) {
      session.metadata.exit_code = details.exitCode;
    }
    if (details?.signal !== undefined) {
      session.metadata.signal = details.signal;
    }
    if (status !== "running") {
      session.metadata.reason = status;
    }
    void this.persistMetadata(session.metaPath, session.metadata);
  }

  private touchSession(session: InternalTerminalSession): void {
    session.metadata.updated_at = new Date().toISOString();
    void this.persistMetadata(session.metaPath, session.metadata);
  }
}
