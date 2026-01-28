import {
  DevelopmentServerType,
  IDevelopmentServerAdapter,
} from "./IDevelopmentServerAdapter.js";
import { TerminalService } from "../../terminals/TerminalService.js";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import {
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { WORK_DIR } from "../../../worker.js";
import { DEV_SERVER_PORT } from "../NucleateDevelopmentServerService.js";
import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { cleanBuildOutput } from "../../terminals/TerminalAnsiUtils.js";

/**
 * Adapter for running Vite development servers inside the worker.
 * Mirrors the Next.js adapter behaviour but tailors the commands/build output
 * for Vite based projects.
 */
export class ViteReactAdapter implements IDevelopmentServerAdapter {
  public readonly serverType: DevelopmentServerType = "vite-web";
  private readonly terminalService: TerminalService;
  private readonly clientDir = path.join(WORK_DIR, "client");
  private readonly configuredTunnelUrl: string;

  constructor(terminalService: TerminalService, tunnelHostname: string) {
    this.terminalService = terminalService;
    this.configuredTunnelUrl = this.normalizeUrl(tunnelHostname);
  }

  /**
   * Starts the Vite development server on the dev terminal session.
   */
  async startDevServer(
    log2: SystemLogger,
  ): Promise<
    SandboxAPIResponse<{ tunnel_url: string }, StandardErrorResponse>
  > {
    log2.consoleLogDevOnly(
      "info",
      "Starting Vite dev server using terminal session",
      { port: DEV_SERVER_PORT },
    );

    return new Promise((resolve, reject) => {
      let resolved = false;
      let cleanup: (() => void) | null = null;

      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup?.();
        reject({
          data: null,
          error: {
            error: "Timeout waiting for Vite dev server",
            message: "Vite dev server did not emit a URL within 60 seconds",
          },
        });
      }, 60000);

      const processOutput = (chunk: string): void => {
        if (resolved) {
          return;
        }

        const output = chunk.toString();
        const cleanedOutput = output.replace(/\x1B\[[0-9;]*m/g, "");

        // Vite ready patterns - these indicate the server is ready
        const readyPatterns = [
          "Local:",
          "ready in",
          "VITE v",
          "➜  Local:",
          "Network:",
          "localhost:",
        ];

        const isReady = readyPatterns.some((pattern) =>
          cleanedOutput.includes(pattern)
        );

        if (isReady) {
          resolved = true;
          clearTimeout(timeout);
          cleanup?.();
          log2.consoleLogDevOnly("info", "Vite dev server ready", {
            configuredTunnelUrl: this.configuredTunnelUrl,
          });
          resolve({
            data: {
              tunnel_url: process.env.FARGATE_DEV_MODE === "true"
                ? `${this.configuredTunnelUrl}:${DEV_SERVER_PORT}`
                : `${this.configuredTunnelUrl}`,
            },
            error: null,
          });
        }
      };

      const listenerDisposer = this.terminalService.addOutputListener(
        "dev-server",
        processOutput,
      );

      if (!listenerDisposer) {
        clearTimeout(timeout);
        reject({
          data: null,
          error: {
            error: "Terminal session not found",
            message: "dev-server terminal session not found or not running",
          },
        });
        return;
      }

      cleanup = listenerDisposer;

      const command = this.buildStartCommand();

      log2.consoleLogDevOnly("info", "Dispatching Vite start command", {
        command,
        projectDir: this.clientDir,
      });

      try {
        this.terminalService.sendInput("dev-server", `${command}\n`, {
          bypassValidation: true,
        });
      } catch (error) {
        clearTimeout(timeout);
        cleanup?.();
        const message = error instanceof Error ? error.message : String(error);
        log2.error(
          new Error(message),
          "Failed to send Vite start command to terminal",
        );
        reject({
          data: null,
          error: {
            error: "Failed to send Vite start command",
            message: "Failed to send Vite start command to terminal session",
          },
        });
      }
    });
  }

  /**
   * Restarts the Vite development server.
   */
  async restartDevServer(log2: SystemLogger): Promise<void> {
    await this.stopDevServer(log2);
    const command = this.buildStartCommand();

    this.terminalService.sendInput("dev-server", `${command}\n`, {
      bypassValidation: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  /**
   * Builds the Vite project and returns the dist directory path.
   */
  async build(
    log2: SystemLogger,
  ): Promise<
    SandboxAPIResponse<
      {
        output_path: string;
        build_status: "in_progress" | "success" | "failure";
        build_output: string;
      },
      StandardErrorResponse
    >
  > {
    const result = await new Promise<{
      stdout: string;
      stderr: string;
      code: number;
    }>((resolve, reject) => {
      let stdout = "";
      let commandComplete = false;
      let cleanup: (() => void) | null = null;
      let exitCodeCheckInterval: ReturnType<typeof setInterval> | null = null;
      let exitIntervalCleanupTimeout: ReturnType<typeof setTimeout> | null =
        null;

      const timeoutHandle = setTimeout(() => {
        if (!commandComplete) {
          commandComplete = true;
          if (exitCodeCheckInterval) {
            clearInterval(exitCodeCheckInterval);
            exitCodeCheckInterval = null;
          }
          if (exitIntervalCleanupTimeout) {
            clearTimeout(exitIntervalCleanupTimeout);
            exitIntervalCleanupTimeout = null;
          }
          cleanup?.();
          cleanup = null;
          reject(new Error("Vite build command timed out after 900000ms"));
        }
      }, 900000);

      const processOutput = (chunk: string): void => {
        stdout += chunk.toString();
      };

      const listenerDisposer = this.terminalService.addOutputListener(
        "build",
        processOutput,
      );

      if (!listenerDisposer) {
        clearTimeout(timeoutHandle);
        reject(new Error("build terminal session not found or not running"));
        return;
      }

      cleanup = (): void => {
        listenerDisposer();
        if (exitIntervalCleanupTimeout) {
          clearTimeout(exitIntervalCleanupTimeout);
          exitIntervalCleanupTimeout = null;
        }
      };

      const commandString = `
cd ${this.clientDir} && \
NODE_ENV=production NODE_OPTIONS="--max-old-space-size=2048" \
bunx vite build && \
echo "EXIT_CODE=$?"
`;

      try {
        this.terminalService.sendInput("build", commandString, {
          bypassValidation: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        clearTimeout(timeoutHandle);
        cleanup?.();
        cleanup = null;
        commandComplete = true;
        log2.error(
          new Error(message),
          "Failed to send Vite build command to terminal session",
          { projectDir: this.clientDir },
        );
        reject(
          new Error(
            `Failed to send Vite build command to terminal session: ${message}`,
          ),
        );
        return;
      }

      exitCodeCheckInterval = setInterval(() => {
        const match = stdout.match(/EXIT_CODE=(\d+)/);
        if (match && !commandComplete) {
          commandComplete = true;
          clearTimeout(timeoutHandle);
          const code = parseInt(match[1], 10);

          if (exitCodeCheckInterval) {
            clearInterval(exitCodeCheckInterval);
            exitCodeCheckInterval = null;
          }
          if (exitIntervalCleanupTimeout) {
            clearTimeout(exitIntervalCleanupTimeout);
            exitIntervalCleanupTimeout = null;
          }
          cleanup?.();
          cleanup = null;

          const cleanStdout = stdout.replace(/EXIT_CODE=\d+/, "").trim();
          resolve({
            stdout: cleanStdout,
            stderr: code !== 0 ? cleanStdout : "",
            code,
          });
        }
      }, 100);

      exitIntervalCleanupTimeout = setTimeout(() => {
        if (commandComplete && exitCodeCheckInterval) {
          clearInterval(exitCodeCheckInterval);
          exitCodeCheckInterval = null;
        }
      }, 901000);
    });

    if (result.code !== 0) {
      log2.error(
        new Error(`Vite build failed with exit code ${result.code}`),
        "Build Vite project",
        { projectDir: this.clientDir },
      );
      return {
        data: {
          output_path: "",
          build_status: "failure",
          build_output: cleanBuildOutput(
            result.stdout || result.stderr || "Build failed with no output",
          ),
        },
        error: null,
      };
    }

    const distPath = path.join(this.clientDir, "dist");
    try {
      const stats = await fs.stat(distPath);
      if (!stats.isDirectory()) {
        throw new Error("Dist path is not a directory");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log2.error(
        error instanceof Error ? error : new Error(message),
        "Dist output missing after Vite build",
      );
      return {
        data: {
          output_path: "",
          build_status: "failure",
          build_output: cleanBuildOutput(
            result.stdout || "Build output directory not found",
          ),
        },
        error: null,
      };
    }

    return {
      data: {
        output_path: distPath,
        build_status: "success",
        build_output: cleanBuildOutput(
          result.stdout || "Build completed successfully",
        ),
      },
      error: null,
    };
  }

  /**
   * Stops the dev server by sending Ctrl+C and force killing any lingering processes.
   */
  async stopDevServer(log2: SystemLogger): Promise<void> {
    log2.consoleLogDevOnly("info", "Stopping Vite dev server");

    try {
      const session = this.terminalService.getSession("dev-server");
      if (!session) {
        log2.warn("dev-server terminal session not found");
        return;
      }

      log2.consoleLogDevOnly("info", "Sending Ctrl+C to Vite dev server");
      try {
        this.terminalService.sendInput("dev-server", "\x03", {
          bypassValidation: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log2.error(
          new Error(message),
          "Failed to send Ctrl+C to Vite dev server terminal",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        const killCommand = `lsof -ti:${DEV_SERVER_PORT} | xargs -r kill -9`;
        execSync(killCommand, { stdio: "pipe", timeout: 5000 });
        log2.consoleLogDevOnly("info", "Force killed processes on dev port", {
          port: DEV_SERVER_PORT,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log2.debug("No lingering Vite processes found on dev port", {
          port: DEV_SERVER_PORT,
          error: message,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log2.error(
        new Error(message),
        "Failed to stop Vite dev server via terminal session",
      );
    }
  }

  private normalizeUrl(url: string): string {
    const trimmed = url.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }

  private buildStartCommand(): string {
    const envVars = [
      "NODE_ENV=development",
      'NODE_OPTIONS="--max-old-space-size=2048"',
      "CHOKIDAR_USEPOLLING=1",
    ].join(" ");

    return `
cd ${this.clientDir} && \
${envVars} \
bunx vite --host 0.0.0.0 --port ${DEV_SERVER_PORT}
`.trim();
  }
}
