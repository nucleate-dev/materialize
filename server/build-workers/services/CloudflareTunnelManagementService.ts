import { spawn as spawnPty, IPty } from "node-pty";
import { spawn } from "child_process";
import process from "process";
import { SystemLogger } from "../loggers/SystemLogger.js";

export type CloudflareTunnelStatus =
  | "connected"
  | "error"
  | "timeout"
  | "not_started";

export interface CloudflareTunnelResult {
  status: CloudflareTunnelStatus;
  message?: string;
}

const DEFAULT_TIMEOUT_MS = 15000;
const TERMINAL_COLS = 80;
const TERMINAL_ROWS = 24;

export class CloudflareTunnelManagementService {
  private readonly workDir: string;
  private readonly logger: SystemLogger;
  private pty: IPty | null = null;
  private readonly dataListeners = new Set<(chunk: string) => void>();
  private tunnelRunning = false;
  private tunnelStarting = false;

  constructor(workDir: string, logger: SystemLogger) {
    this.workDir = workDir;
    this.logger = logger;
    this.initializePty();
  }

  public async createTunnel(
    tunnelToken: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<CloudflareTunnelResult> {
    if (!tunnelToken) {
      return {
        status: "not_started",
        message: "Missing Cloudflare tunnel token",
      };
    }

    if (!this.pty) {
      // Attempt to recover the PTY if it unexpectedly exited.
      this.initializePty();
      if (!this.pty) {
        return {
          status: "error",
          message: "Cloudflare tunnel terminal is unavailable",
        };
      }
    }

    if (this.tunnelStarting) {
      return {
        status: "error",
        message: "Cloudflare tunnel startup already in progress",
      };
    }

    if (this.tunnelRunning) {
      await this.killTunnel();
    }

    this.tunnelStarting = true;

    const sanitizedBuffer: string[] = [];
    const maskSensitive = (input: string): string =>
      tunnelToken ? input.split(tunnelToken).join("[REDACTED]") : input;

    let resolved = false;

    const result = await new Promise<CloudflareTunnelResult>((resolve) => {
      const cleanup = (result: CloudflareTunnelResult): void => {
        if (resolved) {
          return;
        }
        resolved = true;
        this.dataListeners.delete(onData);
        clearInterval(intervalId);
        clearTimeout(timeoutId);

        this.tunnelRunning = result.status === "connected";
        this.tunnelStarting = false;

        resolve(result);
      };

      const onData = (chunk: string): void => {
        const sanitized = maskSensitive(chunk);
        sanitizedBuffer.push(sanitized);
        evaluateBuffer();
      };

      const evaluateBuffer = (): void => {
        const buffer = sanitizedBuffer.join("");
        const normalized = buffer.toLowerCase();

        if (
          normalized.includes("registered tunnel connection") ||
          normalized.includes("connection established") ||
          normalized.includes("registered connection")
        ) {
          cleanup({
            status: "connected",
            message: "Cloudflare tunnel connected successfully",
          });
          return;
        }

        const errorMessage = this.extractErrorMessage(buffer);
        if (errorMessage) {
          cleanup({
            status: "error",
            message: errorMessage,
          });
        }
      };

      const intervalId = setInterval(evaluateBuffer, 200);
      const timeoutId = setTimeout(() => {
        cleanup({
          status: "timeout",
          message: "Cloudflare tunnel connection timed out",
        });
      }, timeoutMs);

      this.dataListeners.add(onData);

      // Clear any pending input and start the tunnel.
      this.writeToPty("\u0003");
      this.writeToPty(
        `cloudflared tunnel --no-autoupdate run --token ${tunnelToken}\n`,
      );
    });

    if (result.status !== "connected") {
      await this.killTunnel();
    }

    return result;
  }

  public async killTunnel(): Promise<void> {
    this.tunnelRunning = false;
    this.tunnelStarting = false;

    if (!this.pty) {
      this.initializePty();
    }

    if (this.pty) {
      this.writeToPty("\u0003");
      await this.delay(250);
      this.writeToPty(
        "if pgrep -x cloudflared >/dev/null; then pkill -x cloudflared; fi\n",
      );
      await this.delay(250);
    } else {
      await this.killCloudflaredProcessesDirectly();
    }
  }

  private initializePty(): void {
    const shell = process.env.SHELL ?? "/bin/bash";

    try {
      const pty = spawnPty(shell, ["-i"], {
        name: "xterm-color",
        cols: TERMINAL_COLS,
        rows: TERMINAL_ROWS,
        cwd: this.workDir,
        env: process.env,
      });

      pty.onData((chunk) => {
        for (const listener of this.dataListeners) {
          try {
            listener(chunk);
          } catch (listenerError) {
            this.logger.error(
              listenerError instanceof Error
                ? listenerError
                : new Error(String(listenerError)),
              "Cloudflare tunnel data listener failed",
            );
          }
        }
      });

      pty.onExit(({ exitCode, signal }) => {
        this.logger.warn("Cloudflare tunnel PTY exited", {
          exitCode,
          signal,
        });
        this.tunnelRunning = false;
        this.tunnelStarting = false;
        this.pty = null;
        // Recreate PTY to ensure future tunnel operations still work.
        this.initializePty();
      });

      pty.write("unset HISTFILE\n");
      pty.write("set +o history\n");

      this.pty = pty;
      this.logger.info("Cloudflare tunnel PTY ready");
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to initialize Cloudflare tunnel PTY",
      );
      this.pty = null;
    }
  }

  private writeToPty(input: string): void {
    if (!this.pty) {
      this.logger.warn("Attempted to write to Cloudflare tunnel PTY before ready");
      return;
    }

    try {
      this.pty.write(input);
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to write to Cloudflare tunnel PTY",
      );
    }
  }

  private extractErrorMessage(buffer: string): string | undefined {
    const errorIndicators = [
      "error",
      "failed",
      "err:",
      "command not found",
      "no such file or directory",
      "authentication failed",
    ];

    const lines = buffer
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/\u001b\[[0-9;]*m/g, "")); // strip ANSI codes

    for (const line of lines.reverse()) {
      const lower = line.toLowerCase();
      if (errorIndicators.some((indicator) => lower.includes(indicator))) {
        return line;
      }
    }

    return undefined;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async killCloudflaredProcessesDirectly(): Promise<void> {
    await new Promise<void>((resolve) => {
      const killer = spawn("pkill", ["-x", "cloudflared"]);

      killer.on("error", (error) => {
        this.logger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to launch pkill for cloudflared",
        );
        resolve();
      });

      killer.on("close", (code, signal) => {
        this.logger.info("pkill cloudflared completed", {
          exitCode: code,
          signal,
        });
        resolve();
      });
    });
  }
}
