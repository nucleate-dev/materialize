import { existsSync, mkdirSync, createWriteStream } from "fs";
import { promises as fsPromises } from "fs";
import type { WriteStream } from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import type {
  TerminalEvent,
  TerminalSession,
} from "./TerminalService.js";

type EternalTerminalLogTracker = {
  sessionId: string;
  filePath: string;
  stream: WriteStream | null;
  createdAt: number;
  lastEventAt: number;
  bytesWritten: number;
  closed: boolean;
};

export type EternalTerminalLogArtifact = {
  sessionId: string;
  filePath: string;
  createdAt: number;
  lastEventAt: number;
  bytesWritten: number;
};

export type TerminalLogPersistenceResult = {
  uploaded: Array<{ sessionId: string; storagePath: string }>;
  failed: Array<{ sessionId: string; error: string }>;
  skippedReason?: string;
  prototypeId?: string;
};

export class EternalTerminalLogManager {
  private readonly logRoot: string;
  private readonly trackedSessionIds: Set<string>;
  private readonly logger: SystemLogger;
  private readonly sessionLogs = new Map<string, EternalTerminalLogTracker>();
  private static readonly UPLOAD_CONCURRENCY = 3;

  constructor(
    logRoot: string,
    logger: SystemLogger,
    trackedSessionIds: Set<string>,
  ) {
    this.logRoot = logRoot;
    this.logger = logger;
    this.trackedSessionIds = trackedSessionIds;
    this.ensureLogDir();
  }

  public registerSession(session: TerminalSession): void {
    if (!this.trackedSessionIds.has(session.id)) {
      return;
    }
    if (this.sessionLogs.has(session.id)) {
      return;
    }

    this.ensureLogDir();

    try {
      const filename = `${session.id}-${session.createdAt}.log`;
      const filePath = path.join(this.logRoot, filename);
      const stream = createWriteStream(filePath, {
        flags: "a",
        encoding: "utf8",
      });

      const tracker: EternalTerminalLogTracker = {
        sessionId: session.id,
        filePath,
        stream,
        createdAt: session.createdAt,
        lastEventAt: session.createdAt,
        bytesWritten: 0,
        closed: false,
      };

      this.sessionLogs.set(session.id, tracker);
      stream.write(
        `[${new Date(session.createdAt).toISOString()}] SESSION_START ${session.command} (cwd=${session.cwd})\n`,
      );
      this.logger.consoleLogDevOnly(
        "info",
        "[EternalTerminalLogManager] Tracking session output",
        {
          sessionId: session.id,
          filePath,
        },
      );
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to initialize eternal terminal log",
        { sessionId: session.id },
      );
    }
  }

  public recordEvent(session: TerminalSession, event: TerminalEvent): void {
    if (!this.trackedSessionIds.has(session.id)) {
      return;
    }

    let tracker = this.sessionLogs.get(session.id);
    if (!tracker) {
      this.registerSession(session);
      tracker = this.sessionLogs.get(session.id);
    }
    if (!tracker || !tracker.stream) {
      return;
    }

    const line = this.formatEvent(event);
    if (!line) {
      return;
    }

    tracker.lastEventAt = event.timestamp;
    tracker.bytesWritten += Buffer.byteLength(line);
    if (!tracker.stream.write(line)) {
      tracker.stream.once("drain", () => undefined);
    }
  }

  public async finalizeSession(sessionId: string): Promise<void> {
    const tracker = this.sessionLogs.get(sessionId);
    if (!tracker || tracker.closed || !tracker.stream) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const stream = tracker.stream!;
      let resolved = false;
      const handleError = (error: Error): void => {
        if (resolved) {
          return;
        }
        resolved = true;
        stream.off("error", handleError);
        reject(error);
      };
      stream.once("error", handleError);
      stream.end(() => {
        if (resolved) {
          return;
        }
        resolved = true;
        stream.off("error", handleError);
        tracker.stream = null;
        tracker.closed = true;
        resolve();
      });
    });
  }

  public async finalizeAllSessions(): Promise<void> {
    await Promise.all(
      Array.from(this.sessionLogs.keys()).map((sessionId) =>
        this.finalizeSession(sessionId),
      ),
    );
  }

  public getArtifacts(): EternalTerminalLogArtifact[] {
    return Array.from(this.sessionLogs.values()).map(
      ({ sessionId, filePath, createdAt, lastEventAt, bytesWritten }) => ({
        sessionId,
        filePath,
        createdAt,
        lastEventAt,
        bytesWritten,
      }),
    );
  }

  public async persistTrackedTerminalLogs(options: {
    prototypeId: string;
    supabaseClient: SupabaseClient;
    bucket: string;
    logger?: SystemLogger;
  }): Promise<TerminalLogPersistenceResult> {
    const activeLogger = options.logger ?? this.logger;
    const result: TerminalLogPersistenceResult = {
      uploaded: [],
      failed: [],
      prototypeId: options.prototypeId,
    };

    await this.finalizeAllSessions();
    const artifacts = this.getArtifacts();

    if (artifacts.length === 0) {
      result.skippedReason = "no-artifacts";
      activeLogger.consoleLogDevOnly(
        "info",
        "No eternal terminal logs to persist",
        {
          prototypeId: options.prototypeId,
        },
      );
      return result;
    }

    const artifactChunks = this.chunkArray(
      artifacts,
      EternalTerminalLogManager.UPLOAD_CONCURRENCY,
    );

    for (const chunk of artifactChunks) {
      await Promise.all(
        chunk.map(async (artifact) => {
          try {
            const logBuffer = await fsPromises.readFile(artifact.filePath);
            const folder = `${options.prototypeId}/${artifact.sessionId}_${artifact.createdAt}`;
            const storagePath = `${folder}/output.log`;
            const { error } = await options.supabaseClient.storage
              .from(options.bucket)
              .upload(storagePath, logBuffer, {
                contentType: "text/plain; charset=utf-8",
                upsert: true,
              });

            if (error) {
              throw error;
            }

            result.uploaded.push({ sessionId: artifact.sessionId, storagePath });
            activeLogger.consoleLogDevOnly(
              "info",
              "Uploaded eternal terminal log",
              {
                sessionId: artifact.sessionId,
                storagePath,
                prototypeId: options.prototypeId,
                bytes: logBuffer.byteLength,
              },
            );
          } catch (error) {
            const normalizedError =
              error instanceof Error ? error : new Error(String(error));
            result.failed.push({
              sessionId: artifact.sessionId,
              error: normalizedError.message,
            });
            activeLogger.error(
              normalizedError,
              "Failed to persist terminal log to Supabase Storage",
              {
                sessionId: artifact.sessionId,
                prototypeId: options.prototypeId,
                filePath: artifact.filePath,
              },
            );
          }
        }),
      );
    }

    return result;
  }

  private ensureLogDir(): void {
    try {
      if (!existsSync(this.logRoot)) {
        mkdirSync(this.logRoot, { recursive: true });
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to ensure eternal terminal log directory",
        { logRoot: this.logRoot },
      );
      throw error;
    }
  }

  private formatEvent(event: TerminalEvent): string {
    if (event.type === "output") {
      const chunk =
        typeof event.payload.chunk === "string"
          ? event.payload.chunk
          : String(event.payload.chunk ?? "");
      return chunk;
    }

    return `[${new Date(event.timestamp).toISOString()}] ${event.type.toUpperCase()} ${JSON.stringify(
      event.payload,
    )}\n`;
  }

  private chunkArray<T>(items: T[], chunkSize: number): T[][] {
    if (chunkSize <= 0) {
      return [items];
    }
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
