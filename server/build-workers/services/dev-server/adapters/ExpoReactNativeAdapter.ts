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
  HTTP_STATUS,
} from "../../../types/BuildWorkerTypes.js";
import { WORK_DIR } from "../../../worker.js";
import { DEV_SERVER_PORT } from "../MaterializeDevelopmentServerService.js";

/**
 * Adapter for Expo React Native development server.
 * Handles starting, restarting, building, and shutting down Expo dev servers.
 */
export class ExpoReactNativeAdapter implements IDevelopmentServerAdapter {
  readonly serverType: DevelopmentServerType = "expo-react-native";
  public readonly tunnelSubdomain: string;
  private readonly terminalService: TerminalService;

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
      "Starting Expo dev server using terminal session",
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
      const command = `cd ${WORK_DIR} && EXPO_NO_TELEMETRY=1 EXPO_TUNNEL_SUBDOMAIN=${tunnelSubdomain} npx expo start --web --tunnel --port ${DEV_SERVER_PORT} --clear\n`;

      log2.consoleLogDevOnly("info", "Sending Expo start command to terminal", {
        command: command.trim(),
        projectDir: WORK_DIR,
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
  async restartDevServer(): Promise<void> {
    // TODO: Implement Expo dev server restart logic
  }

  /**
   * Builds the Expo project.
   */
  async build(): Promise<void> {
    // TODO: Implement Expo project build logic
  }

  /**
   * Shuts down the Expo development server and cleans up resources.
   */
  async shutdown(): Promise<void> {
    // TODO: Implement Expo dev server shutdown logic
  }
}
