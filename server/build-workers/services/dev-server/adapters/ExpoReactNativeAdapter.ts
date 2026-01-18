import {
  IDevelopmentServerAdapter,
  DevelopmentServerType,
} from "./IDevelopmentServerAdapter.js";
import { TerminalService } from "../../terminals/TerminalService.js";
import { v4 as uuidv4 } from "uuid";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import {
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { WORK_DIR } from "../../../worker.js";
import { DEV_SERVER_PORT } from "../NucleateDevelopmentServerService.js";
import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import { cleanBuildOutput } from "../../terminals/TerminalAnsiUtils.js";

/**
 * Adapter for Expo React Native development server.
 * Handles starting, restarting, building, and shutting down Expo dev servers.
 */
export class ExpoReactNativeAdapter implements IDevelopmentServerAdapter {
  readonly serverType: DevelopmentServerType = "expo-react-native";
  public readonly tunnelSubdomain: string;
  private readonly terminalService: TerminalService;
  private readonly clientDir = path.join(WORK_DIR, "client");

  constructor(terminalService: TerminalService) {
    this.terminalService = terminalService;
    this.tunnelSubdomain = this.generateTunnelSubdomain();
  }

  private generateTunnelSubdomain(): string {
    const randomId = uuidv4().replace(/[^a-z0-9]/g, "");
    return `nucleate-${randomId.substring(0, 20)}`;
  }

  /**
   * Starts the Expo development server.
   */
  async startDevServer(
    log2: SystemLogger,
  ): Promise<
    SandboxAPIResponse<{ tunnel_url: string }, StandardErrorResponse>
  > {
    log2.consoleLogDevOnly(
      "info",
      "Starting Expo dev server in NEW ADAPTER using terminal session",
      { port: DEV_SERVER_PORT },
    );

    return new Promise((resolve, reject) => {
      const tunnelSubdomain = this.tunnelSubdomain;
      let resolved = false;
      let cleanup: (() => void) | null = null;
      let tunnelUrl: string | null = null;

      const timeout = setTimeout(() => {
        if (!resolved) {
          log2.error(
            new Error("Timeout waiting for tunnel URL after 60 seconds"),
            "Timeout waiting for tunnel URL after 60 seconds",
          );
          resolved = true;
          cleanup?.();
          reject({
            data: null,
            error: {
              error: "Timeout waiting for tunnel URL",
              message: "Timeout waiting for tunnel URL after 60 seconds",
            },
          });
        }
      }, 60000); // 60 second timeout

      const processOutput = (chunk: string): void => {
        const output = chunk.toString();

        // Look for tunnel URL with improved pattern matching
        // Exclude ANSI escape codes by not matching \x1B characters
        const urlMatch = output.match(/(?:https?|exp):\/\/[^\s\)\x1B]+/g);
        if (urlMatch && !resolved) {
          // Clean ANSI codes from all matched URLs
          const cleanedUrls = urlMatch.map((url) =>
            url.replace(/\x1B\[[0-9;]*m/g, ""),
          );

          log2.consoleLogDevOnly("debug", "URLs found in output", {
            urls: cleanedUrls.join(", "),
          });

          const tunnelCandidates = cleanedUrls.filter(
            (url) =>
              !url.includes("localhost") &&
              !url.includes("127.0.0.1") &&
              !url.includes("192.168.") &&
              !url.includes("10.0.") &&
              (url.includes(".ngrok.io") ||
                url.includes(".ngrok-free.app") ||
                url.includes(".tunnel.dev") ||
                url.includes(".exp.direct") ||
                url.includes(".loca.lt")),
          );

          if (tunnelCandidates.length > 0) {
            tunnelUrl = tunnelCandidates[0];
            log2.consoleLogDevOnly("info", "Tunnel URL found", {
              tunnelUrl,
            });
            clearTimeout(timeout);
            resolved = true;
            cleanup?.();
            resolve({
              data: {
                tunnel_url: tunnelUrl,
              },
              error: null,
            });
          }
        }

        // Check for various tunnel ready indicators
        const tunnelReadyPatterns = [
          "Tunnel ready",
          "tunnel is online",
          "tunnel URL:",
          "Your tunnel URL is",
          "Metro waiting on",
          "exp://",
        ];

        const isTunnelReady = tunnelReadyPatterns.some((pattern) =>
          output.toLowerCase().includes(pattern.toLowerCase()),
        );

        if (isTunnelReady && !tunnelUrl && !resolved) {
          // Try to extract tunnel URL from output first
          // Match tunnel URLs while excluding ANSI escape codes
          const tunnelUrlPattern =
            /(?:tunnel\s+(?:url|URL):\s*|Your\s+tunnel\s+URL\s+is\s*)((?:https?|exp):\/\/[^\s\)\x1B]+)/i;
          const tunnelMatch = output.match(tunnelUrlPattern);

          if (tunnelMatch && tunnelMatch[1]) {
            // Clean any remaining ANSI codes from the captured URL
            tunnelUrl = tunnelMatch[1].replace(/\x1B\[[0-9;]*m/g, "");
          } else {
            // Fallback: construct expected tunnel URL
            tunnelUrl = `https://${tunnelSubdomain}.ngrok.io`;
          }

          log2.info("Expo App Tunnel URL ready detected", {
            tunnelUrl,
          });
          clearTimeout(timeout);
          resolved = true;
          cleanup?.();
          resolve({
            data: {
              tunnel_url: tunnelUrl,
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

      // Build the command to run in the terminal
      const command = `cd ${this.clientDir} && EXPO_NO_TELEMETRY=1 EXPO_TUNNEL_SUBDOMAIN=${tunnelSubdomain} npx expo start --web --tunnel --port ${DEV_SERVER_PORT} --clear\n`;

      log2.consoleLogDevOnly("info", "Sending Expo start command to terminal", {
        command: command.trim(),
        projectDir: this.clientDir,
        tunnelSubdomain,
      });

      try {
        // Bypass validation for trusted internal command
        this.terminalService.sendInput("dev-server", command, {
          bypassValidation: true,
        });
      } catch (error) {
        clearTimeout(timeout);
        cleanup?.();
        const message = error instanceof Error ? error.message : String(error);
        log2.error(
          new Error(message),
          "Failed to send Expo start command to terminal",
        );
        reject({
          data: null,
          error: {
            error: "Failed to send Expo start command",
            message: "Failed to send Expo start command to terminal session",
          },
        });
      }
    });
  }

  /**
   * Restarts the Expo development server.
   */
  async restartDevServer(log2: SystemLogger): Promise<void> {
    await this.stopDevServer(log2);
    const command = `cd ${this.clientDir} && EXPO_NO_TELEMETRY=1 EXPO_TUNNEL_SUBDOMAIN=${this.tunnelSubdomain} npx expo start --web --tunnel --port ${DEV_SERVER_PORT} --clear\n`;
    this.terminalService.sendInput("dev-server", command, {
      bypassValidation: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  /**
   * Builds the Expo project.
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
    // TODO: Implement Expo project build logic
    const result = await new Promise<{
      stdout: string;
      stderr: string;
      code: number;
    }>((resolve, reject) => {
      let stdout = "";
      let commandComplete = false;
      let cleanup: (() => void) | null = null;
      let exitCodeCheckInterval: NodeJS.Timeout | null = null;
      let exitIntervalCleanupTimeout: NodeJS.Timeout | null = null;

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
          reject(new Error("Expo export command timed out after 900000ms"));
        }
      }, 900000);

      const processOutput = (chunk: string): void => {
        const output = chunk.toString();
        stdout += output;
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

      const envString = `EXPO_NO_TELEMETRY="1" NODE_OPTIONS="--max-old-space-size=2048" `;
      const commandString = `${envString} cd ${this.clientDir} && npx expo export --platform web; echo "EXIT_CODE=$?"\n`;

      try {
        // Bypass validation for trusted internal command
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
          "Failed to send Expo export command to terminal session",
          { projectDir: this.clientDir },
        );
        reject(
          new Error(
            `Failed to send Expo export command to terminal session: ${message}`,
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
        new Error(`Expo build failed with exit code ${result.code}`),
        "Build Expo project",
        { projectDir: this.clientDir },
      );
      return {
        data: {
          output_path: "",
          build_status: "failure",
          build_output: cleanBuildOutput(
            result.stdout || result.stderr || "Build failed with no output"
          ),
        },
        error: null,
      };
    }

    const distPath = path.join(this.clientDir, "dist");

    try {
      const distStats = await fs.stat(distPath);
      if (!distStats.isDirectory()) {
        return {
          data: {
            output_path: "",
            build_status: "failure",
            build_output: cleanBuildOutput(
              result.stdout || "Build output exists but is not a directory"
            ),
          },
          error: null,
        };
      }
    } catch (error) {
      log2.error(error, "Dist is not a directory");
      return {
        data: {
          output_path: "",
          build_status: "failure",
          build_output: cleanBuildOutput(
            result.stdout || "Build output directory not found"
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
          result.stdout || "Build completed successfully"
        ),
      },
      error: null,
    };
  }

  /**
   * Shuts down the Expo development server and cleans up resources.
   */
  async stopDevServer(log2: SystemLogger): Promise<void> {
    log2.consoleLogDevOnly(
      "info",
      "Stopping Expo dev server in terminal session",
    );

    try {
      // Get the dev-server terminal session
      const session = this.terminalService.getSession("dev-server");
      if (!session) {
        log2.warn("dev-server terminal session not found");
        return;
      }

      // Send Ctrl+C to interrupt the running process
      log2.consoleLogDevOnly("info", "Sending Ctrl+C to stop Expo process");
      try {
        // Bypass validation for trusted internal command
        this.terminalService.sendInput("dev-server", "\x03", {
          bypassValidation: true,
        }); // Ctrl+C
      } catch (inputError) {
        const message =
          inputError instanceof Error ? inputError.message : String(inputError);
        log2.error(
          new Error(message),
          "Failed to send Ctrl+C to terminal session",
        );
      }

      // Wait a moment for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // If process is still running on the port, force kill it
      try {
        const killCommand = `lsof -ti:${DEV_SERVER_PORT} | xargs -r kill -9`;
        execSync(killCommand, { stdio: "pipe", timeout: 5000 });
        log2.consoleLogDevOnly(
          "info",
          "Force killed any remaining processes on port",
          {
            port: DEV_SERVER_PORT,
          },
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log2.debug("No processes found on port", {
          port: DEV_SERVER_PORT,
          error: errorMessage,
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log2.error(
        new Error(errorMessage),
        "Failed to kill Expo process in terminal",
      );
    }
  }
}
