import AWS from "aws-sdk";
import { ChildProcess, execSync, spawn, SpawnOptions } from "child_process";
import { FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { customlog } from "./logger.js";
import {
  installDependencies,
  PrototypeAssetInputWithContent,
  PrototypeFileInput,
  writeProjectFiles,
} from "./shared-utils.js";
import {
  BuildAndDeployResponse,
  BuildLogEntry,
  BuildResponse,
  CodeError,
  CodeWarning,
  DeployResponse,
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
  private readonly S3_BUCKET: string;
  private readonly s3: AWS.S3;

  constructor(
    workDir: string = "/tmp/expo-dev",
    s3Bucket: string,
    s3Instance: AWS.S3,
  ) {
    this.workDir = workDir;
    this.S3_BUCKET = s3Bucket;
    this.s3 = s3Instance;
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
      this.state.addLog(`Project directory: ${projectDir}`);

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
    buildErrors: CodeError[] = [],
    buildWarnings: CodeWarning[] = [],
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

        // Parse Metro/Expo output for rendering errors
        this.parseMetroErrors(output, buildErrors, buildWarnings);

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

  // Builder Service Methods
  async checkSystemResources(): Promise<{
    disk: string;
    memory: string;
    processes: string;
  }> {
    try {
      const disk = execSync("df -h /tmp", { encoding: "utf8" });
      const memory = execSync("free -h", { encoding: "utf8" });
      const processes = execSync(
        'ps aux | grep -E "(npm|node|expo)" | grep -v grep | wc -l',
        { encoding: "utf8" },
      );

      return {
        disk: disk.trim(),
        memory: memory.trim(),
        processes: processes.trim(),
      };
    } catch (error) {
      return {
        disk: "Unable to check",
        memory: "Unable to check",
        processes: "Unable to check",
      };
    }
  }

  createLogger(buildId: string) {
    const buildLog: BuildLogEntry[] = [];
    const startTime = Date.now();

    return {
      log: (
        step: string,
        success: boolean = true,
        output: string = "",
        error: string = "",
      ) => {
        const entry: BuildLogEntry = {
          step,
          success,
          timestamp: new Date().toISOString(),
          output: output.toString().trim(),
          error: error.toString().trim(),
        };
        buildLog.push(entry);

        const elapsed = Date.now() - startTime;
        const elapsedStr = `${Math.floor(elapsed / 1000)}s`;
        const status = success ? "✓" : "✗";
        const timestamp = new Date().toLocaleTimeString();

        console.log(
          `[${timestamp}] [${buildId}] ${status} ${step} (${elapsedStr})`,
        );
        if (output)
          console.log(`[${timestamp}] [${buildId}] Output: ${output}`);
        if (error) console.error(`[${timestamp}] [${buildId}] Error: ${error}`);
      },
      getBuildLog: () => buildLog,
      getElapsedTime: () => Date.now() - startTime,
    };
  }

  async buildProjectCore(
    prototype_id: string,
    files: any[],
    assets: any[],
    buildId?: string,
  ): Promise<BuildResponse> {
    const actualBuildId = buildId || uuidv4();
    const logger = this.createLogger(actualBuildId);

    logger.log(
      "Starting build",
      true,
      `Build ID: ${actualBuildId}, Prototype: ${prototype_id}, Files: ${files.length}`,
    );

    if (
      !prototype_id ||
      !files ||
      !Array.isArray(files) ||
      files.length === 0
    ) {
      return {
        success: false,
        error: "prototypeId and files array are required",
        buildLog: logger.getBuildLog(),
      };
    }

    const buildDir = path.join(this.workDir, actualBuildId);

    try {
      logger.log("Checking system resources");
      try {
        const resources = await this.checkSystemResources();
        logger.log(
          "System resources",
          true,
          `Disk: ${resources.disk.split("\n")[1]}, Memory: ${resources.memory.split("\n")[1]}, Node processes: ${resources.processes}`,
        );
      } catch (error) {
        logger.log(
          "System resources check",
          false,
          "",
          `Failed to check resources: ${error}`,
        );
      }

      logger.log("Writing project files");
      await writeProjectFiles(files, assets, buildDir);
      logger.log("Project files written", true, `Build directory: ${buildDir}`);

      logger.log("Starting dependency installation");
      const installStartTime = Date.now();
      await installDependencies(buildDir, logger);
      const installDuration = Date.now() - installStartTime;
      logger.log(
        "Dependency installation completed",
        true,
        `Duration: ${Math.floor(installDuration / 1000)}s`,
      );

      logger.log("Starting Expo build");
      const buildStartTime = Date.now();
      const outputPath = await this.buildExpoProject(buildDir, logger);
      const buildDuration = Date.now() - buildStartTime;
      logger.log(
        "Expo build completed",
        true,
        `Duration: ${Math.floor(buildDuration / 1000)}s`,
      );

      logger.log("Build completed", true, `Output available at: ${outputPath}`);

      return {
        success: true,
        buildLog: logger.getBuildLog(),
        outputPath,
      };
    } catch (error: any) {
      logger.log("Build failed", false, "", error.message);
      return {
        success: false,
        error: error.message,
        buildLog: logger.getBuildLog(),
      };
    }
  }

  async deployProjectCore(
    prototype_id: string,
    buildPath: string,
    deployId?: string,
  ): Promise<DeployResponse> {
    const actualDeployId = deployId || uuidv4();
    const logger = this.createLogger(actualDeployId);
    const version = this.generateVersion();

    logger.log(
      "Starting versioned deploy",
      true,
      `Deploy ID: ${actualDeployId}, Prototype: ${prototype_id}, Version: ${version}`,
    );

    if (!prototype_id || !buildPath) {
      return {
        success: false,
        error: "prototypeId and buildPath are required",
      };
    }

    try {
      await fs.stat(buildPath);

      logger.log("Uploading to both versioned and latest folders");
      const uploadedFiles = await this.uploadToVersionedAndLatest(
        buildPath,
        prototype_id,
        version
      );

      const buildUrl = `https://${prototype_id}.render.materializeui.com`;

      logger.log(
        "Versioned deploy completed",
        true,
        `Uploaded to both versioned (v${version}) and latest folders. URL: ${buildUrl}`,
      );

      return {
        success: true,
        buildUrl,
        uploadedFiles,
      };
    } catch (error: any) {
      logger.log("Deploy failed", false, "", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async buildAndDeployProjectCore(
    prototype_id: string,
    jobId?: string,
  ): Promise<BuildAndDeployResponse> {
    const actualJobId = jobId || uuidv4();
    const logger = this.createLogger(actualJobId);

    logger.log(
      "Starting build and deploy",
      true,
      `Job ID: ${actualJobId}, Prototype: ${prototype_id}`,
    );

    if (!prototype_id) {
      return {
        success: false,
        error: "prototypeId is required",
        buildLog: logger.getBuildLog(),
      };
    }

    // Use the existing project directory instead of creating a new one
    const buildDir = path.join(this.workDir, prototype_id);

    try {
      // Check if project directory exists
      try {
        await fs.stat(buildDir);
        logger.log(
          "Using existing project directory",
          true,
          `Directory: ${buildDir}`,
        );
      } catch (error) {
        return {
          success: false,
          error:
            "Project directory not found. Please start dev server first to create project files.",
          buildLog: logger.getBuildLog(),
        };
      }

      // No need to install dependencies again since they should already be installed
      // when the dev server was started
      const outputPath = await this.buildExpoProject(buildDir, logger);

      logger.log("Starting deploy phase");
      const s3KeyPrefix = `${prototype_id}`;
      const uploadedFiles = await this.uploadDirectoryToS3(
        outputPath,
        s3KeyPrefix,
      );

      const buildUrl = `https://${prototype_id}.render.materializeui.com`;

      logger.log(
        "Build and deploy completed",
        true,
        `Uploaded ${uploadedFiles.length} files. URL: ${buildUrl}`,
      );

      return {
        success: true,
        buildUrl,
        buildLog: logger.getBuildLog(),
        uploadedFiles,
      };
    } catch (error: any) {
      logger.log("Build and deploy failed", false, "", error.message);
      return {
        success: false,
        error: error.message,
        buildLog: logger.getBuildLog(),
      };
    } finally {
      // Don't cleanup the build directory since it contains the original project files
      // that might be needed for future operations
      logger.log(
        "Build and deploy completed, keeping project directory for future use",
      );
    }
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

      // Monitor for Metro bundler errors after file updates
      this.state.addLog("Monitoring Metro output for compilation errors...");
      await this.monitorMetroForErrors(buildErrors, buildWarnings, 3000);

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

  private async monitorMetroForErrors(
    buildErrors: CodeError[],
    buildWarnings: CodeWarning[],
    timeoutMs: number = 10000,
  ): Promise<void> {
    if (!this.state.process) {
      this.state.addLog("No Metro process available for error monitoring");
      return;
    }

    return new Promise((resolve) => {
      const originalErrorCount = buildErrors.length;
      const originalWarningCount = buildWarnings.length;
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const newErrors = buildErrors.length - originalErrorCount;
          const newWarnings = buildWarnings.length - originalWarningCount;
          this.state.addLog(
            `Metro error monitoring completed. Found ${newErrors} new errors, ${newWarnings} new warnings`,
          );
          resolve();
        }
      }, timeoutMs);

      // Create a temporary data handler to monitor for errors
      const errorMonitor = (data: Buffer) => {
        const output = data.toString();
        const beforeErrors = buildErrors.length;
        this.parseMetroErrors(output, buildErrors, buildWarnings);

        // If we found new errors, resolve early
        if (buildErrors.length > beforeErrors && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          const newErrors = buildErrors.length - originalErrorCount;
          const newWarnings = buildWarnings.length - originalWarningCount;
          this.state.addLog(
            `Metro errors detected early. Found ${newErrors} new errors, ${newWarnings} new warnings`,
          );
          resolve();
        }
      };

      // Clean up the monitors after timeout or early resolution
      const cleanup = () => {
        if (this.state.process) {
          this.state.process.stdout?.removeListener("data", errorMonitor);
          this.state.process.stderr?.removeListener("data", errorMonitor);
        }
      };

      setTimeout(() => {
        cleanup();
      }, timeoutMs);

      // Also clean up immediately when promise resolves
      setTimeout(() => {
        if (resolved) {
          cleanup();
        }
      }, 100);
    });
  }

  private parseMetroErrors(
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

      // Parse TypeScript compilation errors
      if (
        trimmedLine.includes("TS") &&
        (trimmedLine.includes("error") || /TS\d{4}/.test(trimmedLine))
      ) {
        const tsErrorMatch = trimmedLine.match(
          /(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/,
        );
        if (tsErrorMatch) {
          buildErrors.push({
            message: `${tsErrorMatch[4]}: ${tsErrorMatch[5]}`,
            file: tsErrorMatch[1],
            line: parseInt(tsErrorMatch[2]),
            column: parseInt(tsErrorMatch[3]),
            type: "syntax",
          });
        } else {
          buildErrors.push({
            message: trimmedLine,
            type: "syntax",
          });
        }
      }

      // Parse JavaScript syntax errors
      else if (
        trimmedLine.includes("SyntaxError") ||
        trimmedLine.includes("Unexpected token")
      ) {
        buildErrors.push({
          message: trimmedLine,
          type: "syntax",
        });
      }

      // Parse Metro bundler errors
      else if (
        trimmedLine.includes("Metro") &&
        (trimmedLine.includes("error") || trimmedLine.includes("Error"))
      ) {
        buildErrors.push({
          message: trimmedLine.replace(/^.*Metro.*?Error:\s*/, ""),
          type: "build",
        });
      }

      // Parse module resolution errors
      else if (
        trimmedLine.includes("Unable to resolve module") ||
        trimmedLine.includes("Module not found")
      ) {
        buildErrors.push({
          message: trimmedLine,
          type: "build",
        });
      }

      // Parse React errors
      else if (
        trimmedLine.includes("React") &&
        (trimmedLine.includes("Error") || trimmedLine.includes("Warning"))
      ) {
        if (trimmedLine.includes("Warning")) {
          buildWarnings.push({
            message: trimmedLine,
            type: "build",
          });
        } else {
          buildErrors.push({
            message: trimmedLine,
            type: "runtime",
          });
        }
      }

      // Parse general compilation failures
      else if (
        trimmedLine.includes("Failed to compile") ||
        trimmedLine.includes("Compilation failed")
      ) {
        buildErrors.push({
          message: trimmedLine,
          type: "build",
        });
      }

      // Parse warnings
      else if (
        trimmedLine.includes("warning") &&
        !trimmedLine.includes("error")
      ) {
        buildWarnings.push({
          message: trimmedLine,
          type: "build",
        });
      }
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

  private generateVersion(): string {
    return Date.now().toString();
  }

  private getCacheControlHeader(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    
    switch (ext) {
      case '.html':
        return 'public, max-age=300, s-maxage=300'; // 5 minutes
      case '.js':
      case '.css':
        return 'public, max-age=31536000, s-maxage=31536000'; // 1 year for versioned assets
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.gif':
      case '.svg':
      case '.ico':
        return 'public, max-age=31536000, s-maxage=31536000'; // 1 year
      default:
        return 'public, max-age=3600, s-maxage=3600'; // 1 hour default
    }
  }

  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".txt": "text/plain",
    };
    return contentTypes[ext] || "application/octet-stream";
  }

  private async uploadToVersionedAndLatest(
    localPath: string,
    prototypeId: string,
    version: string,
  ): Promise<Array<{ key: string; location: string }>> {
    const uploadResults: Array<{ key: string; location: string }> = [];

    const uploadDirectory = async (dirPath: string, versionedPrefix: string, latestPrefix: string) => {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stats = await fs.stat(fullPath);

        if (stats.isDirectory()) {
          await uploadDirectory(
            fullPath, 
            `${versionedPrefix}/${item}`, 
            `${latestPrefix}/${item}`
          );
        } else if (stats.isFile()) {
          const fileContent = await fs.readFile(fullPath);

          if (!fileContent || fileContent.length === 0) {
            console.warn(`Skipping empty file: ${item}`);
            continue;
          }

          const uploadParams = {
            Body: fileContent,
            ContentType: this.getContentType(item),
            CacheControl: this.getCacheControlHeader(item),
          };

          // Upload to versioned location
          const versionedKey = `${versionedPrefix}/${item}`;
          const versionedResult = await this.s3.upload({
            ...uploadParams,
            Bucket: this.S3_BUCKET,
            Key: versionedKey,
          }).promise();

          // Upload to latest location
          const latestKey = `${latestPrefix}/${item}`;
          await this.s3.upload({
            ...uploadParams,
            Bucket: this.S3_BUCKET,
            Key: latestKey,
            // Shorter cache for latest folder to pick up updates faster
            CacheControl: item.endsWith('.html') ? 'public, max-age=300' : uploadParams.CacheControl,
          }).promise();

          uploadResults.push({
            key: versionedResult.Key,
            location: versionedResult.Location,
          });
        }
      }
    };

    const versionedPrefix = `${prototypeId}/v${version}`;
    const latestPrefix = `${prototypeId}/latest`;

    await uploadDirectory(localPath, versionedPrefix, latestPrefix);
    return uploadResults;
  }

  private async uploadDirectoryToS3(
    localPath: string,
    s3KeyPrefix: string,
  ): Promise<Array<{ key: string; location: string }>> {
    // Extract prototype ID and version from s3KeyPrefix
    const parts = s3KeyPrefix.split('/');
    const prototypeId = parts[0];
    const version = this.generateVersion();

    // Use the dual upload method
    return await this.uploadToVersionedAndLatest(localPath, prototypeId, version);
  }

  private async deleteS3Prefix(prefix: string): Promise<void> {
    try {
      const listParams = {
        Bucket: this.S3_BUCKET,
        Prefix: prefix,
      };
      
      const objects = await this.s3.listObjectsV2(listParams).promise();
      if (objects.Contents && objects.Contents.length > 0) {
        console.log(`Deleting ${objects.Contents.length} existing objects with prefix: ${prefix}`);
        
        const deleteParams = {
          Bucket: this.S3_BUCKET,
          Delete: {
            Objects: objects.Contents.map(obj => ({ Key: obj.Key! })),
          },
        };
        await this.s3.deleteObjects(deleteParams).promise();
        console.log(`Successfully deleted ${objects.Contents.length} objects`);
      } else {
        console.log(`No existing objects found with prefix: ${prefix}`);
      }
    } catch (error) {
      console.error(`Failed to delete S3 objects with prefix ${prefix}:`, error);
      // Don't throw - continue with upload even if delete fails
    }
  }

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    env?: Record<string, string>,
    timeoutMs: number = 300000, // 5 minutes default
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let processExited = false;

      const spawnOptions: SpawnOptions = {
        cwd,
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      };

      const childProcess = spawn(command, args, spawnOptions);

      // Set up timeout
      const timeout = setTimeout(() => {
        if (!processExited) {
          processExited = true;
          childProcess.kill("SIGKILL");
          reject(
            new Error(
              `Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`,
            ),
          );
        }
      }, timeoutMs);

      // Handle stdout
      childProcess.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        // Log real-time output
        console.log(`[STDOUT] ${output.trim()}`);
      });

      // Handle stderr
      childProcess.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        // Log real-time output
        console.error(`[STDERR] ${output.trim()}`);
      });

      // Handle process exit
      childProcess.on("close", (code: number | null) => {
        if (!processExited) {
          processExited = true;
          clearTimeout(timeout);
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            code: code || 0,
          });
        }
      });

      // Handle process errors
      childProcess.on("error", (error: Error) => {
        if (!processExited) {
          processExited = true;
          clearTimeout(timeout);
          reject(new Error(`Failed to start command: ${error.message}`));
        }
      });

      // Handle unexpected termination
      process.on("exit", () => {
        if (!processExited) {
          processExited = true;
          clearTimeout(timeout);
          childProcess.kill("SIGKILL");
        }
      });
    });
  }

  private async buildExpoProject(
    projectDir: string,
    logger: any,
  ): Promise<string> {
    logger.log(
      "Building Expo project",
      true,
      `Starting build in ${projectDir}`,
    );

    try {
      const expoConfigPath = path.join(projectDir, "app.json");
      const expoConfig = await fs.readFile(expoConfigPath, "utf8");
      const config = JSON.parse(expoConfig);
      logger.log(
        "Expo config found",
        true,
        `Project: ${config.expo?.name || "Unknown"}, Platform: ${config.expo?.platforms?.join(", ") || "Unknown"}`,
      );
    } catch (error) {
      logger.log(
        "Expo config check",
        false,
        "",
        `Failed to read app.json: ${error}`,
      );
      throw new Error("app.json not found or invalid");
    }

    logger.log(
      "Starting Expo export",
      true,
      "Running: npx expo export --platform web",
    );
    console.log(
      "Running: npx expo export --platform web with projectDir: ",
      projectDir,
    );
    const result = await this.runCommand(
      "npx",
      ["expo", "export", "--platform", "web"],
      projectDir,
      {
        EXPO_NO_TELEMETRY: "1",
        NODE_OPTIONS: "--max-old-space-size=2048",
      },
      900000,
    );

    if (result.code !== 0) {
      logger.log("Build Expo project", false, result.stdout, result.stderr);
      throw new Error(`Expo build failed with exit code ${result.code}`);
    }

    const distPath = path.join(projectDir, "dist");

    try {
      const distStats = await fs.stat(distPath);
      if (!distStats.isDirectory()) {
        throw new Error("dist is not a directory");
      }

      const distContents = await fs.readdir(distPath);
      logger.log(
        "Build output verification",
        true,
        `dist folder created with ${distContents.length} items`,
      );

      const hasIndexHtml = distContents.includes("index.html");
      const hasAssets = distContents.some(
        (item) => item === "assets" || item === "static",
      );
      logger.log(
        "Build output check",
        true,
        `index.html: ${hasIndexHtml}, assets: ${hasAssets}`,
      );

      if (!hasIndexHtml) {
        logger.log(
          "Build output warning",
          false,
          "",
          "index.html not found in build output",
        );
      }
    } catch (error) {
      logger.log(
        "Verify build output",
        false,
        "",
        `Expo export did not create dist folder: ${error}`,
      );
      throw new Error("Expo export did not create dist folder");
    }

    logger.log(
      "Build Expo project",
      true,
      `Build completed successfully\n${result.stdout}`,
      result.stderr,
    );
    return distPath;
  }
}
