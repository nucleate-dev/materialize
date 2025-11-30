import {
  existsSync,
  mkdirSync,
  createWriteStream,
  WriteStream,
  fsync,
} from "fs";
import { promises as fsPromises } from "fs";
import { promisify } from "util";

const fsyncAsync = promisify(fsync);
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import type { TerminalEvent, TerminalSession } from "./TerminalService.js";
import { stripAnsiSequences } from "./TerminalAnsiUtils.js";

type EternalTerminalLogTracker = {
  sessionId: string;
  filePath: string;
  stream: WriteStream | null;
  createdAt: number;
  lastEventAt: number;
  bytesWritten: number;
  closed: boolean;
  pendingBuffer?: string;
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
  public static readonly DEFAULT_LOG_ROOT =
    "/tmp/materialize-eternal-terminal-logs";
  private readonly logRoot: string;
  private readonly trackedSessionIds: Set<string>;
  private readonly logger: SystemLogger;
  private readonly sessionLogs = new Map<string, EternalTerminalLogTracker>();
  private readonly completedTrackers: EternalTerminalLogTracker[] = [];
  private readonly pendingSnapshots = new Map<
    string,
    EternalTerminalLogArtifact[]
  >();
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
    const existingTracker = this.sessionLogs.get(session.id);
    if (existingTracker && existingTracker.stream) {
      return;
    }

    // Allow re-registration even if a previous tracker exists but is inactive

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

    const line = this.formatEvent(event);
    if (!line) {
      return;
    }

    if (!tracker) {
      this.logger.warn("Eternal log tracker missing after registration", {
        sessionId: session.id,
      });
      return;
    }

    tracker.lastEventAt = event.timestamp;

    if (!tracker.stream) {
      tracker.pendingBuffer = (tracker.pendingBuffer ?? "") + line;
      return;
    }

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
        tracker.pendingBuffer = undefined;
        resolve();
      });
    });

    const completedPath = `${tracker.filePath}.${tracker.createdAt}.completed`;
    try {
      await fsPromises.rename(tracker.filePath, completedPath);
      tracker.filePath = completedPath;
    } catch (error) {
      this.logger.warn("Failed to rotate completed terminal log", {
        sessionId,
        filePath: tracker.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.completedTrackers.push(tracker);
    this.sessionLogs.delete(sessionId);
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

    const carryoverSnapshots = this.collectPendingSnapshots();
    const activeSnapshots = await this.rotateActiveTrackers();
    const artifacts = [
      ...carryoverSnapshots,
      ...activeSnapshots,
      ...this.completedTrackers,
    ];

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
              });

            if (error) {
              throw error;
            }

            result.uploaded.push({
              sessionId: artifact.sessionId,
              storagePath,
            });
            const pendingSnapshot = this.removePendingSnapshot(
              artifact.filePath,
            );
            if (pendingSnapshot) {
              await fsPromises.unlink(artifact.filePath);
            } else {
              this.removeCompletedTracker(artifact.sessionId);
              await fsPromises.unlink(artifact.filePath);
            }
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
      return stripAnsiSequences(chunk);
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

  private collectPendingSnapshots(): EternalTerminalLogArtifact[] {
    const artifacts: EternalTerminalLogArtifact[] = [];
    for (const snapshotList of this.pendingSnapshots.values()) {
      artifacts.push(...snapshotList);
    }
    return artifacts;
  }

  private addPendingSnapshot(artifact: EternalTerminalLogArtifact): void {
    const list = this.pendingSnapshots.get(artifact.sessionId) ?? [];
    list.push(artifact);
    this.pendingSnapshots.set(artifact.sessionId, list);
  }

  private removePendingSnapshot(
    filePath: string,
  ): EternalTerminalLogArtifact | null {
    for (const [sessionId, list] of this.pendingSnapshots.entries()) {
      const index = list.findIndex(
        (artifact) => artifact.filePath === filePath,
      );
      if (index >= 0) {
        const [removed] = list.splice(index, 1);
        if (list.length === 0) {
          this.pendingSnapshots.delete(sessionId);
        }
        return removed;
      }
    }
    return null;
  }

  private async rotateActiveTrackers(): Promise<EternalTerminalLogArtifact[]> {
    const snapshots: EternalTerminalLogArtifact[] = [];
    for (const tracker of this.sessionLogs.values()) {
      await this.flushTracker(tracker);
      const oldStream = tracker.stream;
      if (oldStream) {
        tracker.stream = null;
        await new Promise<void>((resolve, reject) => {
          oldStream.end(() => resolve());
          oldStream.once("error", reject);
        });
      }

      const snapshotPath = `${tracker.filePath}.${Date.now()}.snapshot`;
      await fsPromises.appendFile(tracker.filePath, "");
      await fsPromises.rename(tracker.filePath, snapshotPath);

      const newStream = createWriteStream(tracker.filePath, {
        flags: "a",
        encoding: "utf8",
      });
      newStream.on("error", (error) => {
        this.logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to create new eternal terminal log stream",
          { sessionId: tracker.sessionId, filePath: tracker.filePath },
        );
      });

      const snapshotArtifact: EternalTerminalLogArtifact = {
        sessionId: tracker.sessionId,
        filePath: snapshotPath,
        createdAt: tracker.createdAt,
        lastEventAt: tracker.lastEventAt,
        bytesWritten: tracker.bytesWritten,
      };
      this.addPendingSnapshot(snapshotArtifact);
      snapshots.push(snapshotArtifact);

      tracker.stream = newStream;
      tracker.bytesWritten = 0;
      tracker.createdAt = Date.now();
      tracker.lastEventAt = tracker.createdAt;

      if (tracker.pendingBuffer) {
        tracker.stream.write(tracker.pendingBuffer);
        tracker.bytesWritten += Buffer.byteLength(tracker.pendingBuffer);
        tracker.pendingBuffer = undefined;
      }
    }
    return snapshots;
  }

  private async flushTracker(
    tracker: EternalTerminalLogTracker,
  ): Promise<void> {
    const stream = tracker.stream;
    if (!stream) {
      return;
    }

    if (stream.writableNeedDrain) {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          stream.off("drain", onDrain);
          reject(error);
        };
        const onDrain = (): void => {
          stream.off("error", onError);
          resolve();
        };
        stream.once("drain", onDrain);
        stream.once("error", onError);
      });
    }

    const streamFd = (stream as { fd?: number }).fd;
    if (typeof streamFd === "number" && streamFd >= 0) {
      try {
        await fsyncAsync(streamFd);
      } catch (error) {
        this.logger.warn("Failed to fsync eternal terminal log stream", {
          sessionId: tracker.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private removeCompletedTracker(sessionId: string): void {
    const index = this.completedTrackers.findIndex(
      (tracker) => tracker.sessionId === sessionId,
    );
    if (index >= 0) {
      this.completedTrackers.splice(index, 1);
    }
  }
}
