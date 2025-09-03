import { ChildProcess, spawn } from "child_process";
import { FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import { customlog } from "./logger.js";
import {
  installDependencies,
  PrototypeAssetInputWithContent,
  PrototypeFileInput,
  writeProjectFiles,
} from "./shared-utils.js";
import {
  CodeError,
  CodeWarning,
  PublicDevServerStartRequest,
} from "./types/BuildWorkerTypes.js";

interface DevServerStartResponse {
  success: boolean;
  tunnelUrl?: string;
  port?: number;
  status: "starting" | "running" | "error";
  error?: string;
  build_errors?: CodeError[];
  build_warnings?: CodeWarning[];
}

interface DevServerStatusResponse {
  status: "stopped" | "starting" | "running" | "error";
  tunnelUrl?: string;
  port?: number;
  uptime?: number;
  logs?: string[];
  prototypeId?: string;
}

interface DevServerStopResponse {
  success: boolean;
  message: string;
}

interface DevServerRestartResponse {
  success: boolean;
  tunnelUrl?: string;
  message: string;
}

interface DevServerLogsResponse {
  logs: string[];
  timestamp: string;
}

// --- Dev Server State ---
class DevServerState {
  public prototypeId: string | null = null;
  public process: ChildProcess | null = null;
  public projectDir: string | null = null;
  public tunnelUrl: string | null = null;
  public port: number | null = null;
  public status: "stopped" | "starting" | "running" | "error" = "stopped";
  public startTime: Date | null = null;
  public logs: string[] = [];
  public error: string | null = null;

  public addLog(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.logs.push(logEntry);

    // Keep only last 100 log entries
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100);
    }

    console.log(`[DEV-SERVER] ${logEntry}`);
  }

  public getUptime(): number | null {
    if (!this.startTime) return null;
    return Date.now() - this.startTime.getTime();
  }

  public reset(): void {
    this.prototypeId = null;
    this.process = null;
    this.projectDir = null;
    this.tunnelUrl = null;
    this.port = null;
    this.status = "stopped";
    this.startTime = null;
    this.logs = [];
    this.error = null;
  }
}

// --- ExpoDevServerService Class ---
export class ExpoDevServerService {
  private state = new DevServerState();
  private readonly workDir: string;
  private readonly defaultPort: number = 19006;

  constructor(workDir: string = "/tmp/expo-dev") {
    this.workDir = workDir;
  }

  // Start Expo dev server
  public async startDevServer(
    request: FastifyRequest<{ Body: PublicDevServerStartRequest }>,
    reply: FastifyReply,
  ): Promise<DevServerStartResponse> {
    const { prototype_id, framework, files, assets, file_scope } = request.body;

    if (!prototype_id || !framework || !files || !file_scope) {
      customlog("error", "Missing required parameters:", {
        prototype_id,
        framework,
        files: files?.length,
        file_scope,
      });
      return reply.code(400).send({
        success: false,
        status: "error",
        error: "prototype_id, framework, files, and file_scope are required",
        build_errors: [
          {
            message:
              "prototype_id, framework, files, and file_scope are required",
            type: "build",
          },
        ],
        build_warnings: [],
      });
    }

    // Check if dev server is already running
    if (this.state.status === "running" || this.state.status === "starting") {
      if (this.state.prototypeId === prototype_id) {
        return {
          success: true,
          tunnelUrl: this.state.tunnelUrl || undefined,
          port: this.state.port || undefined,
          status: this.state.status,
          build_errors: [],
          build_warnings: [],
        };
      } else {
        customlog(
          "warn",
          "Dev server already running for different prototype:",
          {
            currentPrototype: this.state.prototypeId,
            requestedPrototype: prototype_id,
          },
        );
        return reply.code(409).send({
          success: false,
          status: "error",
          error: `Dev server already running for different prototype: ${this.state.prototypeId}`,
          build_errors: [
            {
              message: `Dev server already running for different prototype: ${this.state.prototypeId}`,
              type: "build",
            },
          ],
          build_warnings: [],
        });
      }
    }

    try {
      const buildErrors: CodeError[] = [];
      const buildWarnings: CodeWarning[] = [];

      // Handle file scope
      const projectDir = path.join(this.workDir, prototype_id);

      if (file_scope === "complete") {
        // Remove existing directory if it exists
        try {
          await fs.rm(projectDir, { recursive: true, force: true });
        } catch (error: any) {
          customlog(
            "debug",
            "Directory removal failed (expected for new projects):",
            error.message,
          );
        }
        // Create new directory and write all files
        await fs.mkdir(projectDir, { recursive: true });
        await writeProjectFiles(files, assets, projectDir);

        // Install dependencies for new project
        try {
          await this.installDependenciesWithErrorParsing(
            projectDir,
            buildErrors,
            buildWarnings,
          );
        } catch (error: any) {
          customlog(
            "error",
            "Dependency installation failed for complete scope:",
            error.message,
            error.stack,
          );
          buildErrors.push({
            message: `Dependency installation failed: ${error.message}`,
            type: "dependency",
          });
        }
      } else if (file_scope === "updates") {
        await this.updateDevServerFiles(
          files,
          assets,
          buildErrors,
          buildWarnings,
        );
      }

      this.state.prototypeId = prototype_id;
      this.state.port = this.defaultPort;
      this.state.status = "starting";
      this.state.startTime = new Date();
      this.state.projectDir = projectDir;
      this.state.addLog(`Starting dev server for prototype ${prototype_id}`);
      this.state.addLog(`Wrote ${files.length} files to project directory`);

      // Start Expo dev server and wait for tunnel URL
      try {
        await this.startExpoProcess(this.state.projectDir, this.state.port);
      } catch (error: any) {
        customlog(
          "error",
          "Failed to start Expo process:",
          error.message,
          error.stack,
        );
        this.state.status = "error";
        this.state.error = error.message;
        this.state.addLog(`Failed to start Expo process: ${error.message}`);
        buildErrors.push({
          message: `Failed to start dev server: ${error.message}`,
          type: "runtime",
        });
      }

      // The tunnel URL should be set by now since startExpoProcess waits for it
      return {
        success: buildErrors.length === 0,
        tunnelUrl: this.state.tunnelUrl || undefined,
        port: this.state.port,
        status: buildErrors.length > 0 ? "error" : this.state.status,
        build_errors: buildErrors,
        build_warnings: buildWarnings,
      };
    } catch (error: any) {
      customlog(
        "error",
        "Internal server error in startDevServer:",
        error.message,
        error.stack,
      );
      this.state.status = "error";
      this.state.error = error.message;
      this.state.addLog(`Internal server error: ${error.message}`);

      return reply.code(500).send({
        success: false,
        status: "error",
        error: error.message,
        build_errors: [
          {
            message: `Internal server error: ${error.message}`,
            type: "build",
          },
        ],
        build_warnings: [],
      });
    }
  }

  // Get dev server status
  private async getStatus(
    _request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<DevServerStatusResponse> {
    return {
      status: this.state.status,
      tunnelUrl: this.state.tunnelUrl || undefined,
      port: this.state.port || undefined,
      uptime: this.state.getUptime() || undefined,
      logs: this.state.logs.slice(-10), // Last 10 logs
      prototypeId: this.state.prototypeId || undefined,
    };
  }

  // Stop dev server
  private async stopDevServer(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<DevServerStopResponse> {
    if (this.state.status === "stopped") {
      return {
        success: true,
        message: "Dev server was already stopped",
      };
    }

    try {
      await this.killExpoProcess();
      await this.cleanup();

      this.state.addLog("Dev server stopped successfully");
      this.state.reset();

      return {
        success: true,
        message: "Dev server stopped successfully",
      };
    } catch (error: any) {
      customlog(
        "error",
        "Failed to stop dev server:",
        error.message,
        error.stack,
      );
      this.state.addLog(`Failed to stop dev server: ${error.message}`);

      return reply.code(500).send({
        success: false,
        message: `Failed to stop dev server: ${error.message}`,
      });
    }
  }

  // Restart dev server
  private async restartDevServer(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<DevServerRestartResponse> {
    if (
      this.state.status === "stopped" ||
      !this.state.prototypeId ||
      !this.state.projectDir
    ) {
      customlog("error", "Cannot restart - no dev server running:", {
        status: this.state.status,
        hasPrototypeId: !!this.state.prototypeId,
        hasProjectDir: !!this.state.projectDir,
      });
      return reply.code(409).send({
        success: false,
        message: "No dev server running to restart",
      });
    }

    try {
      const projectDir = this.state.projectDir;
      const port = this.state.port || this.defaultPort;

      this.state.addLog("Restarting dev server...");

      // Kill current process
      await this.killExpoProcess();

      // Start new process
      await this.startExpoProcess(projectDir, port);

      return {
        success: true,
        tunnelUrl: this.state.tunnelUrl || undefined,
        message: "Dev server restarted successfully",
      };
    } catch (error: any) {
      customlog(
        "error",
        "Failed to restart dev server:",
        error.message,
        error.stack,
      );
      this.state.status = "error";
      this.state.error = error.message;
      this.state.addLog(`Failed to restart dev server: ${error.message}`);

      return reply.code(500).send({
        success: false,
        message: `Failed to restart dev server: ${error.message}`,
      });
    }
  }

  private async startExpoProcess(
    projectDir: string,
    port: number,
  ): Promise<void> {
    this.state.addLog(`Starting Expo dev server on port ${port}...`);

    return new Promise((resolve, reject) => {
      // Create tunnel subdomain from prototype ID
      const tunnelSubdomain = this.state
        .prototypeId!.toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .substring(0, 20);

      this.state.addLog(
        `Starting Expo with args: ["expo", "start", "--web", "--tunnel", "--port", "${port}"]`,
      );
      this.state.addLog(`Working directory: ${projectDir}`);
      this.state.addLog(`Tunnel subdomain: ${tunnelSubdomain}`);

      this.state.process = spawn(
        "npx",
        [
          "expo",
          "start",
          "--web",
          "--tunnel",
          "--port",
          port.toString(),
          "--clear",
        ],
        {
          cwd: projectDir,
          env: {
            ...process.env,
            EXPO_NO_TELEMETRY: "1",
            EXPO_TUNNEL_SUBDOMAIN: tunnelSubdomain,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          customlog("error", "Timeout waiting for tunnel URL after 60 seconds");
          resolved = true;
          reject(new Error("Timeout waiting for tunnel URL"));
        }
      }, 60000); // 60 second timeout

      const processOutput = (data: Buffer, source: string) => {
        const output = data.toString();
        this.state.addLog(`Expo ${source}: ${output.trim()}`);

        // Look for file watching status
        if (
          output.includes("watching for file changes") ||
          output.includes("Fast Refresh") ||
          output.includes("Metro") ||
          output.includes("Bundler ready")
        ) {
          this.state.addLog(
            `File watching appears to be active: ${output.trim()}`,
          );
        }

        // Look for tunnel URL with improved pattern matching
        const urlMatch = output.match(/https?:\/\/[^\s\)]+/g);
        if (urlMatch && !resolved) {
          this.state.addLog(`Found URLs in output: ${urlMatch.join(", ")}`);

          const tunnelCandidates = urlMatch.filter(
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
            this.state.tunnelUrl = tunnelCandidates[0];
            this.state.status = "running";
            this.state.addLog(`Tunnel URL found: ${this.state.tunnelUrl}`);
            clearTimeout(timeout);
            resolved = true;
            resolve();
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

        if (isTunnelReady && !this.state.tunnelUrl && !resolved) {
          // Try to extract tunnel URL from output first
          const tunnelUrlPattern =
            /(?:tunnel\s+(?:url|URL):\s*|Your\s+tunnel\s+URL\s+is\s*)(https?:\/\/[^\s\)]+)/i;
          const tunnelMatch = output.match(tunnelUrlPattern);

          if (tunnelMatch && tunnelMatch[1]) {
            this.state.tunnelUrl = tunnelMatch[1];
          } else {
            // Fallback: construct expected tunnel URL
            this.state.tunnelUrl = `https://${tunnelSubdomain}.ngrok.io`;
          }

          this.state.status = "running";
          this.state.addLog(
            `Tunnel ready detected, URL: ${this.state.tunnelUrl}`,
          );
          clearTimeout(timeout);
          resolved = true;
          resolve();
        }
      };

      if (this.state.process) {
        this.state.process.stdout?.on("data", (data: Buffer) =>
          processOutput(data, "stdout"),
        );
        this.state.process.stderr?.on("data", (data: Buffer) =>
          processOutput(data, "stderr"),
        );

        this.state.process.on("close", (code) => {
          this.state.addLog(`Expo process exited with code ${code}`);
          if (!resolved) {
            customlog("error", "Expo process exited before tunnel URL found:", {
              code,
            });
            this.state.status = "error";
            clearTimeout(timeout);
            resolved = true;
            reject(new Error(`Expo dev server exited with code ${code}`));
          } else if (code !== 0) {
            customlog("warn", "Expo process exited with non-zero code:", {
              code,
            });
            this.state.status = "error";
          }
        });

        this.state.process.on("error", (error) => {
          customlog("error", "Expo process error:", error.message, error.stack);
          this.state.addLog(`Expo process error: ${error.message}`);
          if (!resolved) {
            this.state.status = "error";
            clearTimeout(timeout);
            resolved = true;
            reject(error);
          }
        });
      }
    });
  }

  private async killExpoProcess(): Promise<void> {
    if (this.state.process) {
      this.state.addLog("Killing Expo process...");

      this.state.process.kill("SIGTERM");

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.state.process && !this.state.process.killed) {
          this.state.process.kill("SIGKILL");
        }
      }, 5000);

      this.state.process = null;
    }
  }

  private async cleanup(): Promise<void> {
    if (this.state.projectDir) {
      try {
        await fs.rm(this.state.projectDir, { recursive: true, force: true });
        this.state.addLog("Cleaned up project directory");
      } catch (error: any) {
        customlog(
          "warn",
          "Failed to cleanup project directory:",
          this.state.projectDir,
          error.message,
        );
        this.state.addLog(
          `Failed to cleanup project directory: ${error.message}`,
        );
      }
    }
  }

  // Graceful shutdown method
  public async shutdown(): Promise<void> {
    this.state.addLog("Shutting down dev server service...");
    await this.killExpoProcess();
    await this.cleanup();
    this.state.reset();
  }

  private async installDependenciesWithErrorParsing(
    projectDir: string,
    buildErrors: CodeError[],
    buildWarnings: CodeWarning[],
  ): Promise<void> {
    // Create a simple logger that captures output
    const logger = {
      addLog: (message: string) => {
        this.state.addLog(message);
      },
      log: (
        message: string,
        success: boolean = true,
        output: string = "",
        error: string = "",
      ) => {
        if (!success) {
          const outputToProcess = error || output || "";
          this.parseNpmOutput(outputToProcess, buildErrors, buildWarnings);
        }
      },
      getBuildLog: () => [],
      getElapsedTime: () => 0,
    };

    // Use shared installDependencies function
    await installDependencies(projectDir, logger);
  }

  async updateDevServerFiles(
    files: PrototypeFileInput[],
    assets: PrototypeAssetInputWithContent[],
    buildErrors: CodeError[] = [],
    buildWarnings: CodeWarning[] = [],
  ): Promise<{
    success: boolean;
    tunnelUrl?: string;
    build_errors: CodeError[];
    build_warnings: CodeWarning[];
  }> {
    // Validate that we have an active dev server
    if (
      this.state.status === "stopped" ||
      !this.state.prototypeId ||
      !this.state.projectDir
    ) {
      const errorMsg = "Cannot update files: No active dev server running";
      this.state.addLog(errorMsg);
      buildErrors.push({
        message: errorMsg,
        type: "build",
      });
      return {
        success: false,
        tunnelUrl: this.state.tunnelUrl || undefined,
        build_errors: buildErrors,
        build_warnings: buildWarnings,
      };
    }

    // Use the state's project directory as the source of truth
    const actualProjectDir = this.state.projectDir;

    this.state.addLog(
      `Updating ${files.length} files and ${assets.length} assets in project directory: ${actualProjectDir}`,
    );

    // Log which files are being updated
    const fileNames = files.map((f) => f.name);
    this.state.addLog(`Files being updated: ${fileNames.join(", ")}`);

    // Verify project directory exists and is accessible
    try {
      const stats = await fs.stat(actualProjectDir);
      if (!stats.isDirectory()) {
        const errorMsg = `Project path exists but is not a directory: ${actualProjectDir}`;
        this.state.addLog(errorMsg);
        buildErrors.push({
          message: errorMsg,
          type: "build",
        });
        return {
          success: false,
          tunnelUrl: this.state.tunnelUrl || undefined,
          build_errors: buildErrors,
          build_warnings: buildWarnings,
        };
      }
    } catch (error: any) {
      // Project directory doesn't exist - this shouldn't happen in update mode
      const errorMsg = `Project directory does not exist: ${actualProjectDir}. Cannot perform file update.`;
      this.state.addLog(errorMsg);
      customlog("error", "Project directory missing during update:", {
        projectDir: actualProjectDir,
        prototypeId: this.state.prototypeId,
        error: error.message,
      });
      buildErrors.push({
        message: errorMsg,
        type: "build",
      });
      return {
        success: false,
        tunnelUrl: this.state.tunnelUrl || undefined,
        build_errors: buildErrors,
        build_warnings: buildWarnings,
      };
    }

    try {
      // Update only the provided files
      await writeProjectFiles(files, assets, actualProjectDir);
      this.state.addLog(`Successfully wrote files to ${actualProjectDir}`);

      // Check if package.json was updated and reinstall if needed
      const packageJsonUpdated = files.some(
        (file) => file.name === "package.json",
      );
      if (packageJsonUpdated) {
        this.state.addLog(
          "package.json was updated, reinstalling dependencies...",
        );
        try {
          await this.installDependenciesWithErrorParsing(
            actualProjectDir,
            buildErrors,
            buildWarnings,
          );
          this.state.addLog("Dependencies reinstalled successfully");
        } catch (error: any) {
          customlog(
            "error",
            "Dependency update failed for package.json change:",
            error.message,
            error.stack,
          );
          this.state.addLog(`Dependency update failed: ${error.message}`);
          buildErrors.push({
            message: `Dependency update failed: ${error.message}`,
            type: "dependency",
          });
          // Don't return failure here - file updates succeeded even if deps failed
        }
      } else {
        this.state.addLog(
          "No package.json changes detected, skipping dependency reinstall",
        );
      }

      return {
        success: true,
        tunnelUrl: this.state.tunnelUrl || undefined,
        build_errors: buildErrors,
        build_warnings: buildWarnings,
      };
    } catch (error: any) {
      const errorMsg = `Failed to write files to project directory: ${error.message}`;
      customlog(
        "error",
        "File writing failed during update:",
        error.message,
        error.stack,
      );
      this.state.addLog(errorMsg);
      buildErrors.push({
        message: errorMsg,
        type: "build",
      });
      return {
        success: false,
        tunnelUrl: this.state.tunnelUrl || undefined,
        build_errors: buildErrors,
        build_warnings: buildWarnings,
      };
    }
  }

  private parseNpmOutput(
    output: string,
    buildErrors: CodeError[],
    buildWarnings: CodeWarning[],
  ): void {
    if (!output || typeof output !== "string") {
      return;
    }
    const lines = output.split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Parse npm errors
      if (trimmedLine.includes("npm ERR!") || trimmedLine.includes("ERROR")) {
        buildErrors.push({
          message: trimmedLine.replace(/^npm ERR!\s*/, ""),
          type: "dependency",
        });
      }

      // Parse npm warnings
      if (trimmedLine.includes("npm WARN") || trimmedLine.includes("WARNING")) {
        buildWarnings.push({
          message: trimmedLine.replace(/^npm WARN\s*/, ""),
          type: "deprecation",
        });
      }
    }
  }
}
