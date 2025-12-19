import { spawn as spawnPty, IPty } from "node-pty";
import { spawn } from "child_process";
import process from "process";
import { baseLogger } from "../loggers/index.js";
import { WORK_DIR } from "../worker.js";

export type CloudflareTunnelStatus =
  | "connected"
  | "error"
  | "timeout"
  | "not_started";

export interface CloudflareTunnelResult {
  status: CloudflareTunnelStatus;
  message?: string;
}

export interface CreateTunnelOptions {
  onOutput?: (output: string) => void;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;
const CHECK_INTERVAL_MS = 500;
const MAX_OUTPUT_CHARS = 16_384;

export class CloudflareTunnelManagementService {
  private readonly logger = baseLogger.child({
    service: "CloudflareTunnelManagementService",
  });
  private pty: IPty | null = null;
  private readonly dataListeners = new Set<(chunk: string) => void>();
  private createInProgress = false;
  private tunnelRunning = false;

  constructor() {
    // Initialize PTY asynchronously - it will be ready before first use due to ensurePty()
    this.initializePty().catch((error) => {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to initialize PTY in constructor",
      );
    });
  }

  public async createTunnel(
    tunnelToken: string,
    options: CreateTunnelOptions = {},
  ): Promise<CloudflareTunnelResult> {
    if (!tunnelToken) {
      return {
        status: "not_started",
        message: "Missing Cloudflare tunnel token",
      };
    }

    if (this.createInProgress) {
      return {
        status: "error",
        message: "Cloudflare tunnel startup already in progress",
      };
    }

    if (this.tunnelRunning) {
      await this.killTunnel();
    }

    if (!(await this.ensurePty())) {
      return {
        status: "error",
        message: "Cloudflare tunnel terminal is unavailable",
      };
    }

    this.createInProgress = true;

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let outputBuffer = "";
    let tunnelStatus: CloudflareTunnelStatus = "not_started";
    let tunnelMessage: string | undefined;

    const maskSensitive = (input: string): string =>
      tunnelToken ? input.split(tunnelToken).join("[REDACTED]") : input;

    const listener = (chunk: string): void => {
      const sanitized = maskSensitive(chunk);
      outputBuffer += sanitized;
      if (outputBuffer.length > MAX_OUTPUT_CHARS) {
        outputBuffer = outputBuffer.slice(-MAX_OUTPUT_CHARS);
      }
      options.onOutput?.(sanitized);
    };

    this.dataListeners.add(listener);

    try {
      // Run cloudflared in background
      // Output goes to PTY for connection detection
      // Process stays alive because PTY is persistent in this service
      const tunnelCommand = `cloudflared tunnel --no-autoupdate run --token ${tunnelToken} &`;
      this.writeToPty(`${tunnelCommand}\n`);
      this.logger.consoleLogDevOnly(
        "info",
        "Cloudflare tunnel command dispatched",
      );

      // Give the command a moment to start
      await this.delay(200);

      const startTime = Date.now();
      while (Date.now() - startTime < timeoutMs) {
        const lowerOutput = outputBuffer.toLowerCase();

        if (
          lowerOutput.includes("registered tunnel connection") ||
          lowerOutput.includes("connection established") ||
          lowerOutput.includes("registered connection")
        ) {
          tunnelStatus = "connected";
          tunnelMessage = "Cloudflare tunnel connected successfully";
          this.tunnelRunning = true;
          break;
        }

        // Check for actual fatal errors only
        // Be very specific - only catch messages that mean the tunnel definitely failed
        // Ignore warnings about buffers, ping permissions, etc.
        if (
          lowerOutput.includes(" err ") ||
          lowerOutput.includes("fatal") ||
          lowerOutput.includes("unable to connect") ||
          lowerOutput.includes("connection refused") ||
          lowerOutput.includes("authentication failed") ||
          lowerOutput.includes("invalid token") ||
          lowerOutput.includes("tunnel registration failed")
        ) {
          // Additional check: make sure it's not just a buffer/permission warning
          const hasRealError = outputBuffer.split("\n").some((line) => {
            const normalized = line.toLowerCase();
            // Skip known non-fatal warnings and errors
            if (
              normalized.includes("buffer size") ||
              normalized.includes("ping_group_range") ||
              normalized.includes("origincert") ||
              normalized.includes("origin certificate") ||
              normalized.includes(" wrn ")
            ) {
              return false;
            }
            // Look for actual errors
            return (
              normalized.includes(" err ") ||
              normalized.includes("fatal") ||
              normalized.includes("unable to connect") ||
              normalized.includes("connection refused") ||
              normalized.includes("authentication failed")
            );
          });

          if (hasRealError) {
            tunnelStatus = "error";
            const errorLines = outputBuffer.split("\n").filter((line) => {
              const normalized = line.toLowerCase();
              return (
                (normalized.includes(" err ") ||
                  normalized.includes("fatal")) &&
                !normalized.includes("buffer size") &&
                !normalized.includes("ping_group_range") &&
                !normalized.includes("origincert") &&
                !normalized.includes("origin certificate") &&
                !normalized.includes(" wrn ")
              );
            });
            tunnelMessage =
              errorLines[0]?.trim() || "Cloudflare tunnel failed to connect";
            break;
          }
        }

        await this.delay(CHECK_INTERVAL_MS);
      }

      if (tunnelStatus === "not_started") {
        tunnelStatus = "timeout";
        tunnelMessage = "Cloudflare tunnel connection timed out";
      }
    } catch (error) {
      tunnelStatus = "error";
      tunnelMessage =
        error instanceof Error
          ? error.message
          : "Failed to start Cloudflare tunnel";
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to start Cloudflare tunnel",
      );
    } finally {
      this.dataListeners.delete(listener);
      this.createInProgress = false;
    }

    if (tunnelStatus !== "connected") {
      this.tunnelRunning = false;
      this.logger.error(
        new Error("Cloudflare tunnel failed to connect"),
        "Cloudflare tunnel failed to connect",
        {
          tunnelStatus,
          tunnelMessage,
        },
      );
      await this.killTunnel().catch(() => {
        // best-effort cleanup
      });
    }

    return {
      status: tunnelStatus,
      message: tunnelMessage,
    };
  }

  public async killTunnel(): Promise<void> {
    if (!(await this.ensurePty())) {
      await this.killCloudflaredProcessesDirectly();
      return;
    }

    this.tunnelRunning = false;

    try {
      this.writeToPty("\u0003");
      await this.delay(250);
      this.writeToPty(
        "if pgrep -x cloudflared >/dev/null; then pkill -x cloudflared; fi\n",
      );
      await this.delay(250);
      this.writeToPty("sleep 0.1\n");
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to kill Cloudflare tunnel",
      );
    }
  }

  private async ensurePty(): Promise<boolean> {
    if (!this.pty) {
      await this.initializePty();
    }
    return Boolean(this.pty);
  }

  private async initializePty(): Promise<void> {
    if (this.pty) {
      return;
    }

    const shell = process.env.SHELL ?? "/bin/bash";

    try {
      const pty = spawnPty(shell, ["-i"], {
        name: "xterm-color",
        cols: 80,
        rows: 24,
        cwd: WORK_DIR,
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
        this.pty = null;
        // Attempt to recreate so future requests still work
        this.initializePty();
      });

      this.pty = pty;

      // Wait for shell to be ready before sending commands
      await this.delay(250);

      // Disable history to keep output clean
      pty.write("unset HISTFILE\n");
      pty.write("set +o history\n");

      // Wait a bit more for commands to execute
      await this.delay(200);

      this.logger.consoleLogDevOnly("info", "Cloudflare tunnel PTY ready");
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
      throw new Error("Cloudflare tunnel PTY is not initialized");
    }
    this.pty.write(input);
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

      killer.on("close", () => {
        resolve();
      });
    });
  }
}
