import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ChildProcess, execSync, spawn, SpawnOptions } from "child_process";
import { FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { SystemLogger } from "../loggers/SystemLogger.js";
import {
  BuildAndDeployResponse,
  BuildLogEntry,
  BuildResponse,
  CodeError,
  CodeWarning,
  DeployResponse,
  DevServerStartResponse,
  DevServerStatus,
  DevServerStatusResponse,
  OperationStatus,
  PublicDevServerStartRequest,
} from "../types/BuildWorkerTypes.js";
import {
  installDependencies,
  PrototypeAssetInputWithContent,
  PrototypeFileInput,
  writeProjectFiles,
} from "../utils/shared-utils.js";
import { baseLogger } from "../worker.js";

const S3_BUCKET = process.env.S3_BUCKET || "materialize-sites";

// --- Dev Server State ---
class DevServerState {
  public prototypeId: string | null = null;
  public process: ChildProcess | null = null;
  public projectDir: string | null = null;
  public tunnelUrl: string | null = null;
  public tunnelSubdomain: string | null = null;
  public port: number | null = null;
  public devServerStatus: DevServerStatus = DevServerStatus.STOPPED;
  public startTime: Date | null = null;
  public error: string | null = null;
  public currentOperation: OperationStatus = OperationStatus.IDLE;
  public operationStartTime: Date | null = null;
  public operationId: string | null = null;

  public getUptime(): number | null {
    if (!this.startTime) return null;
    return Date.now() - this.startTime.getTime();
  }

  public reset(): void {
    this.prototypeId = null;
    this.process = null;
    this.projectDir = null;
    this.tunnelUrl = null;
    this.tunnelSubdomain = null;
    this.port = null;
    this.devServerStatus = DevServerStatus.STOPPED;
    this.startTime = null;
    this.error = null;
    this.currentOperation = OperationStatus.IDLE;
    this.operationStartTime = null;
    this.operationId = null;
  }

  public setOperation(operation: OperationStatus, operationId?: string): void {
    this.currentOperation = operation;
    this.operationStartTime = new Date();
    this.operationId = operationId || null;
  }

  public clearOperation(): void {
    this.currentOperation = OperationStatus.IDLE;
    this.operationStartTime = null;
    this.operationId = null;
  }

  public getOperationDuration(): number | null {
    if (!this.operationStartTime) return null;
    return Date.now() - this.operationStartTime.getTime();
  }

  public isOperationInProgress(): boolean {
    return this.currentOperation !== OperationStatus.IDLE;
  }

  public getOperationStatus(): {
    operation: string;
    duration: number | null;
    operationId: string | null;
  } {
    return {
      operation: this.currentOperation,
      duration: this.getOperationDuration(),
      operationId: this.operationId,
    };
  }
}

// --- ExpoDevServerService Class ---
export class ExpoDevServerService {
  private state = new DevServerState();
  private readonly workDir: string;
  private readonly defaultPort: number = 19006;
  private s3: S3Client | undefined;
  private log2: SystemLogger;

  constructor(workDir: string = "/tmp/expo-dev", s3Instance?: S3Client) {
    this.workDir = workDir;
    this.s3 = s3Instance;
    this.state.tunnelSubdomain = this.generateTunnelSubdomain();
    this.log2 = baseLogger.child({
      route: "ExpoDevServerService",
    });
  }

  public getState(): DevServerState {
    return this.state;
  }

  public setS3Client(s3Instance: S3Client): void {
    this.s3 = s3Instance;
  }

  // Start Expo dev server
  public async startDevServer(
    request: FastifyRequest<{ Body: PublicDevServerStartRequest }>,
    reply: FastifyReply,
  ): Promise<DevServerStartResponse> {
    const { prototype_id, framework, files, assets, file_scope } = request.body;

    if (!prototype_id || !framework || !files || !file_scope) {
      request.log2.error(
        new Error("Missing required parameters"),
        "Missing required parameters",
        {
          prototype_id,
          framework,
          files: files?.length,
          file_scope,
        },
      );
      return reply.code(400).send({
        success: false,
        status: DevServerStatus.ERROR,
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
    this.log2 = request.log2.child({
      function: "startDevServer",
    });

    // Check if dev server is already running
    if (
      this.state.devServerStatus === DevServerStatus.RUNNING ||
      this.state.devServerStatus === DevServerStatus.STARTING
    ) {
      if (this.state.prototypeId === prototype_id) {
        return {
          success: true,
          tunnelUrl: this.state.tunnelUrl || undefined,
          port: this.state.port || undefined,
          status: this.state.devServerStatus,
          build_errors: [],
          build_warnings: [],
        };
      } else {
        this.log2.warn("Dev server already running for different prototype", {
          currentPrototype: this.state.prototypeId,
          requestedPrototype: prototype_id,
        });
        return reply.code(409).send({
          success: false,
          status: DevServerStatus.ERROR,
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

      // Handle file scope (fixed path per instance)
      const projectDir = path.join(this.workDir, "project");

      if (file_scope === "complete") {
        // Remove existing directory if it exists
        try {
          await fs.rm(projectDir, { recursive: true, force: true });
        } catch (error: unknown) {
          request.log2.error(
            error,
            "Directory removal failed (expected for new projects)",
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
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          request.log2.error(
            new Error(errorMessage),
            "Dependency installation failed for complete scope",
            { stack: errorStack },
          );
          buildErrors.push({
            message: `Dependency installation failed: ${errorMessage}`,
            type: "dependency",
          });
        }
      } else if (file_scope === "updates") {
        await this.updateDevServerFiles(
          files,
          assets,
          [],
          buildErrors,
          buildWarnings,
        );
      }

      this.state.prototypeId = prototype_id;
      this.state.port = this.defaultPort;
      this.state.devServerStatus = DevServerStatus.STARTING;
      this.state.startTime = new Date();
      this.state.projectDir = projectDir;
      this.log2.consoleLogDevOnly(
        "info",
        `Starting dev server for prototype ${prototype_id}`,
      );
      this.log2.consoleLogDevOnly(
        "info",
        `Wrote ${files.length} files to project directory`,
      );
      this.log2.consoleLogDevOnly("info", `Project directory: ${projectDir}`);

      // Start Expo dev server and wait for tunnel URL
      try {
        await this.startExpoProcess(this.state.projectDir, this.state.port);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        request.log2.error(
          new Error(errorMessage),
          "Failed to start Expo process",
          { stack: errorStack },
        );
        this.state.devServerStatus = DevServerStatus.ERROR;
        this.state.error = errorMessage;
        this.log2.error(
          new Error(errorMessage),
          "Failed to start Expo process",
        );
        buildErrors.push({
          message: `Failed to start dev server: ${errorMessage}`,
          type: "runtime",
        });
      }

      // Clear operation state on success
      this.state.clearOperation();

      // The tunnel URL should be set by now since startExpoProcess waits for it
      return {
        success: buildErrors.length === 0,
        tunnelUrl: this.state.tunnelUrl || undefined,
        port: this.state.port,
        status:
          buildErrors.length > 0
            ? DevServerStatus.ERROR
            : this.state.devServerStatus,
        build_errors: buildErrors,
        build_warnings: buildWarnings,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      request.log2.error(
        new Error(errorMessage),
        "Internal server error in startDevServer",
        { stack: errorStack },
      );
      this.state.devServerStatus = DevServerStatus.ERROR;
      this.state.error = errorMessage;
      this.log2.error(
        new Error(errorMessage),
        "Internal server error in startDevServer",
      );
      this.state.clearOperation();

      return reply.code(500).send({
        success: false,
        status: DevServerStatus.ERROR,
        error: errorMessage,
        build_errors: [
          {
            message: `Internal server error: ${errorMessage}`,
            type: "build",
          },
        ],
        build_warnings: [],
      });
    }
  }

  // Get dev server status
  private async getStatus(): Promise<DevServerStatusResponse> {
    return {
      status: this.state.devServerStatus,
      tunnelUrl: this.state.tunnelUrl || undefined,
      port: this.state.port || undefined,
      uptime: this.state.getUptime() || undefined,
      // logs removed - using SystemLogger now
      prototypeId: this.state.prototypeId || undefined,
      currentOperation: this.state.currentOperation,
      operationDuration: this.state.getOperationDuration() || undefined,
      operationId: this.state.operationId || undefined,
    };
  }

  // Get current operation status
  public getCurrentOperationStatus(): {
    operation: string;
    duration: number | null;
    operationId: string | null;
  } {
    return this.state.getOperationStatus();
  }

  private generateTunnelSubdomain(): string {
    const randomId = uuidv4().replace(/[^a-z0-9]/g, "");
    return `mat-${randomId.substring(0, 20)}`;
  }

  private async startExpoProcess(
    projectDir: string,
    port: number,
    buildErrors: CodeError[] = [],
    buildWarnings: CodeWarning[] = [],
  ): Promise<void> {
    this.log2.info("Starting Expo dev server", { port });

    return new Promise((resolve, reject) => {
      const tunnelSubdomain = this.state.tunnelSubdomain!;

      this.log2.info("Starting Expo with configuration", {
        args: ["expo", "start", "--web", "--tunnel", "--port", port.toString()],
        workingDirectory: projectDir,
        tunnelSubdomain,
      });

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
          this.log2.error(
            new Error("Timeout waiting for tunnel URL after 60 seconds"),
            "Timeout waiting for tunnel URL after 60 seconds",
          );
          resolved = true;
          reject(new Error("Timeout waiting for tunnel URL"));
        }
      }, 60000); // 60 second timeout

      const processOutput = (data: Buffer, source: string): void => {
        const output = data.toString();
        this.log2.debug("startExpoProcess expo output", {
          source,
          output: output.trim(),
        });

        // Parse Metro/Expo output for rendering errors
        this.parseMetroErrors(output, buildErrors, buildWarnings);

        // Look for file watching status
        if (
          output.includes("watching for file changes") ||
          output.includes("Fast Refresh") ||
          output.includes("Metro") ||
          output.includes("Bundler ready")
        ) {
          this.log2.info("File watching detected", {
            output: output.trim(),
          });
        }

        // Look for tunnel URL with improved pattern matching
        const urlMatch = output.match(/https?:\/\/[^\s\)]+/g);
        if (urlMatch && !resolved) {
          this.log2.debug("URLs found in output", {
            urls: urlMatch.join(", "),
          });

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
            this.state.devServerStatus = DevServerStatus.RUNNING;
            this.log2.info("Tunnel URL found", {
              tunnelUrl: this.state.tunnelUrl,
            });
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

          this.state.devServerStatus = DevServerStatus.RUNNING;
          this.log2.info("Tunnel ready detected", {
            tunnelUrl: this.state.tunnelUrl,
          });
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
          this.log2.info("Expo process exited", { code });
          if (!resolved) {
            this.log2.error(
              new Error("Expo process exited before tunnel URL found"),
              "Expo process exited before tunnel URL found",
              { code },
            );
            this.state.devServerStatus = DevServerStatus.ERROR;
            clearTimeout(timeout);
            resolved = true;
            reject(new Error(`Expo dev server exited with code ${code}`));
          } else if (code !== 0) {
            this.log2.warn("Expo process exited with non-zero code", { code });
            this.state.devServerStatus = DevServerStatus.ERROR;
          }
        });

        this.state.process.on("error", (error) => {
          this.log2.error(error, "Expo process error");
          if (!resolved) {
            this.state.devServerStatus = DevServerStatus.ERROR;
            clearTimeout(timeout);
            resolved = true;
            reject(error);
          }
        });
      }
    });
  }

  private async killExpoProcess(): Promise<void> {
    this.log2.info("Killing processes on default port");

    try {
      // Kill any process running on port 19006 (Expo's default port)
      const port = this.state.port || this.defaultPort;

      // Find and kill processes using the port on Alpine Linux
      const killCommand = `lsof -ti:${port} | xargs -r kill -9`;

      execSync(killCommand, { stdio: "pipe" });
      this.log2.info("Successfully killed processes on port", { port });
    } catch {
      // It's okay if no processes were found on the port
      this.log2.debug("No processes found on port", {
        port: this.state.port || this.defaultPort,
        message: "Normal if nothing was running",
      });
    }

    // Also kill the specific process if it exists
    if (this.state.process) {
      this.log2.info("Killing tracked Expo process");

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

  async restartDevServer(): Promise<void> {
    if (!this.state.projectDir || !this.state.port) {
      throw new Error(
        "Cannot restart dev server: missing project directory or port",
      );
    }

    this.log2.info("Restarting dev server after dependency changes");

    // Kill the current process
    this.state.currentOperation = OperationStatus.STOPPING;
    await this.killExpoProcess();

    // Reset state but keep project directory and port
    const projectDir = this.state.projectDir;
    const port = this.state.port;
    const prototypeId = this.state.prototypeId;

    // Restart the dev server
    this.state.currentOperation = OperationStatus.STARTING_DEV_SERVER;
    this.state.devServerStatus = DevServerStatus.STARTING;
    this.state.startTime = new Date();
    this.log2.info("Restarting dev server for prototype", {
      prototypeId,
    });

    try {
      await this.startExpoProcess(projectDir, port);
      this.log2.info("Dev server restarted successfully");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.state.devServerStatus = DevServerStatus.ERROR;
      this.state.error = errorMessage;
      this.log2.error(new Error(errorMessage), "Failed to restart dev server");
      throw error;
    }
  }

  private async cleanup(): Promise<void> {
    if (this.state.projectDir) {
      try {
        await fs.rm(this.state.projectDir, { recursive: true, force: true });
        this.log2.info("Cleaned up project directory");
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.log2.warn("Failed to cleanup project directory", {
          projectDir: this.state.projectDir,
          error: errorMessage,
        });
        this.log2.warn("Failed to cleanup project directory", {
          projectDir: this.state.projectDir,
          error: errorMessage,
        });
      }
    }
  }

  // Graceful shutdown method
  public async shutdown(): Promise<void> {
    this.log2.info("Shutting down dev server service");

    this.state.setOperation(OperationStatus.STOPPING);
    await this.killExpoProcess();
    await this.cleanup();

    // Reset state which sets status to "stopped" and operation to "idle"
    this.state.reset();

    this.log2.info("Dev server service shutdown completed");
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
    } catch {
      return {
        disk: "Unable to check",
        memory: "Unable to check",
        processes: "Unable to check",
      };
    }
  }

  createLogger(buildId: string): {
    log: (
      step: string,
      success?: boolean,
      output?: string,
      error?: string,
    ) => void;
    getBuildLog: () => BuildLogEntry[];
    getElapsedTime: () => number;
  } {
    const buildLog: BuildLogEntry[] = [];
    const startTime = Date.now();

    return {
      log: (
        step: string,
        success: boolean = true,
        output: string = "",
        error: string = "",
      ): void => {
        const entry: BuildLogEntry = {
          step,
          success,
          timestamp: new Date().toISOString(),
          output: output.toString().trim(),
          error: error.toString().trim(),
        };
        buildLog.push(entry);

        if (error) {
          this.log2.error(new Error(error), "Build step error", {
            buildId,
            step,
          });
        }
      },
      getBuildLog: (): BuildLogEntry[] => buildLog,
      getElapsedTime: (): number => Date.now() - startTime,
    };
  }

  async buildProjectCore(
    prototype_id: string,
    files: PrototypeFileInput[],
    assets: PrototypeAssetInputWithContent[],
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
      try {
        const resources = await this.checkSystemResources();
        logger.log(
          "System resources",
          true,
          `Disk: ${resources.disk.split("\n")[1]}, Memory: ${
            resources.memory.split("\n")[1]
          }, Node processes: ${resources.processes}`,
        );
      } catch (error) {
        logger.log(
          "System resources check",
          false,
          "",
          `Failed to check resources: ${error}`,
        );
      }

      await writeProjectFiles(files, assets, buildDir);
      logger.log("Project files written", true, `Build directory: ${buildDir}`);

      const installStartTime = Date.now();
      await installDependencies(buildDir, this.log2);
      const installDuration = Date.now() - installStartTime;
      logger.log(
        "Dependency installation completed",
        true,
        `Duration: ${Math.floor(installDuration / 1000)}s`,
      );

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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.log("Build failed", false, "", errorMessage);
      return {
        success: false,
        error: errorMessage,
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
        version,
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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.log("Deploy failed", false, "", errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async buildAndDeployProjectCore(
    jobId?: string,
  ): Promise<BuildAndDeployResponse> {
    const actualJobId = jobId || uuidv4();
    const logger = this.createLogger(actualJobId);

    // Set operation state
    this.state.setOperation(
      OperationStatus.BUILDING_AND_DEPLOYING,
      actualJobId,
    );
    const prototype_id = this.state.prototypeId;
    // Use the fixed project directory created by the dev server
    const buildDir = path.join(this.workDir, "project");

    try {
      // Check if project directory exists
      try {
        await fs.stat(buildDir);
      } catch {
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

      const s3KeyPrefix = `${prototype_id}`;
      const uploadedFiles = await this.uploadDirectoryToS3(
        outputPath,
        s3KeyPrefix,
      );

      const buildUrl = `https://${prototype_id}.render.materializeui.com`;
      return {
        success: true,
        buildUrl,
        buildLog: logger.getBuildLog(),
        uploadedFiles,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.log("Build and deploy failed", false, "", errorMessage);
      // Clear operation state on error
      this.state.clearOperation();

      logger.log(
        "Build and deploy failed, ready for shutdown",
        false,
        "",
        errorMessage,
      );

      return {
        success: false,
        error: errorMessage,
        buildLog: logger.getBuildLog(),
      };
    } finally {
      this.state.currentOperation = OperationStatus.STOPPING;
      await this.killExpoProcess();
      this.state.devServerStatus = DevServerStatus.STOPPED;
      this.log2.info("Dev server stopped after build and deploy completion");
    }
  }

  private async installDependenciesWithErrorParsing(
    projectDir: string,
    buildErrors: CodeError[],
    buildWarnings: CodeWarning[],
  ): Promise<void> {
    try {
      // Use shared installDependencies function with SystemLogger
      await installDependencies(projectDir, this.log2);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Parse npm errors for build errors/warnings
      this.parseNpmOutput(errorMessage, buildErrors, buildWarnings);
      throw error;
    }
  }

  async updateDevServerFiles(
    files: PrototypeFileInput[],
    assets: PrototypeAssetInputWithContent[],
    deletedFiles: string[] = [],
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
      this.state.devServerStatus === DevServerStatus.STOPPED ||
      !this.state.prototypeId ||
      !this.state.projectDir
    ) {
      const errorMsg = "Cannot update files: No active dev server running";
      this.log2.error(new Error(errorMsg), "Cannot update files");
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

    // Set operation state
    this.state.setOperation(
      OperationStatus.UPDATING_FILES,
      this.state.prototypeId,
    );

    // Use the state's project directory as the source of truth
    const actualProjectDir = this.state.projectDir;

    this.log2.info("Updating project files", {
      filesCount: files.length,
      assetsCount: assets.length,
      projectDirectory: actualProjectDir,
    });

    // Log which files are being updated
    const fileNames = files.map((f) => f.name);
    this.log2.debug("Files being updated", { files: fileNames });

    // Log which files are being deleted
    if (deletedFiles.length > 0) {
      this.log2.debug("Files being deleted", { files: deletedFiles });
    }

    // Verify project directory exists and is accessible
    try {
      const stats = await fs.stat(actualProjectDir);
      if (!stats.isDirectory()) {
        const errorMsg = `Project path exists but is not a directory: ${actualProjectDir}`;
        this.log2.error(new Error(errorMsg), "Project path validation failed");
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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Project directory doesn't exist - this shouldn't happen in update mode
      const errorMsg = `Project directory does not exist: ${actualProjectDir}. Cannot perform file update.`;
      this.log2.error(
        new Error(errorMessage),
        "Project directory missing during update",
        {
          projectDir: actualProjectDir,
          prototypeId: this.state.prototypeId,
        },
      );
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
      // 1) If package.json is included, read its current contents before overwrite
      const packageJsonUpdate = files.find(
        (file) => file.name === "package.json",
      );
      let oldPackageJsonContent = "";
      if (packageJsonUpdate) {
        try {
          const packageJsonPath = path.join(actualProjectDir, "package.json");
          oldPackageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
          this.log2.info("Found existing package.json for diffing.");
        } catch (error) {
          this.log2.warn(
            "Could not read old package.json, assuming new file.",
            { error },
          );
          oldPackageJsonContent = "{}";
        }
      }

      // 2) Delete files that need to be removed
      if (deletedFiles.length > 0) {
        this.log2.info("Deleting files", { files: deletedFiles });
        for (const filePath of deletedFiles) {
          try {
            const fullPath = path.join(actualProjectDir, filePath);
            await fs.rm(fullPath, { recursive: true, force: true });
            this.log2.debug("Successfully deleted file", { filePath });
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            this.log2.warn("Failed to delete file", {
              filePath,
              error: errorMessage,
            });
            // Add warning but don't fail the entire operation
            buildWarnings.push({
              message: `Failed to delete file ${filePath}: ${errorMessage}`,
              type: "build",
            });
          }
        }
      }

      // 3) Write incoming files to disk
      await writeProjectFiles(files, assets, actualProjectDir);
      this.log2.info("Successfully wrote files to project directory", {
        projectDir: actualProjectDir,
      });

      // 4) Monitor for Metro bundler errors after file updates
      this.log2.info("Monitoring Metro output for compilation errors");
      await this.monitorMetroForErrors(buildErrors, buildWarnings, 8000);

      // 5) If package.json changed, diff dependencies and conditionally reinstall/restart
      if (packageJsonUpdate && oldPackageJsonContent) {
        const newPackageJsonContent =
          packageJsonUpdate.contents as unknown as string;
        const dependenciesHaveChanged = await this._haveDependenciesChanged(
          oldPackageJsonContent,
          newPackageJsonContent,
        );

        if (dependenciesHaveChanged) {
          this.log2.info(
            "Dependency changes detected in package.json. Reinstalling dependencies and restarting dev server.",
          );
          try {
            await this.installDependenciesWithErrorParsing(
              actualProjectDir,
              buildErrors,
              buildWarnings,
            );
            this.log2.info("Dependencies reinstalled successfully");

            this.log2.info("Restarting dev server...");
            await this.restartDevServer();
            this.log2.info(
              "Dev server restarted successfully with new dependencies.",
            );
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            this.log2.error(
              new Error(errorMessage),
              "Dependency update or dev server restart failed for package.json change",
            );
            buildErrors.push({
              message: `Dependency update or restart failed: ${errorMessage}`,
              type: "dependency",
            });
          }
        } else {
          this.log2.info(
            "package.json was updated, but no dependency changes were found. Skipping reinstall and restart.",
          );
        }
      } else {
        this.log2.debug(
          "No package.json changes detected, skipping dependency diff.",
        );
      }

      // Clear operation state on success
      this.state.clearOperation();

      return {
        success: true,
        tunnelUrl: this.state.tunnelUrl || undefined,
        build_errors: buildErrors,
        build_warnings: buildWarnings,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorMsg = `Failed to write files to project directory: ${errorMessage}`;
      this.log2.error(
        new Error(errorMessage),
        "File writing failed during update",
        { stack: errorStack },
      );
      buildErrors.push({
        message: errorMsg,
        type: "build",
      });
      // Clear operation state on error
      this.state.clearOperation();
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
      this.log2.debug("No Metro process available for error monitoring");
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
          this.log2.info("Metro error monitoring completed", {
            newErrors,
            newWarnings,
          });
          resolve();
        }
      }, timeoutMs);

      // Create a temporary data handler to monitor for errors
      const errorMonitor = (data: Buffer): void => {
        const output = data.toString();
        const beforeErrors = buildErrors.length;
        this.parseMetroErrors(output, buildErrors, buildWarnings);

        // If we found new errors, resolve early
        if (buildErrors.length > beforeErrors && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          const newErrors = buildErrors.length - originalErrorCount;
          const newWarnings = buildWarnings.length - originalWarningCount;
          this.log2.warn("Metro errors detected early", {
            newErrors,
            newWarnings,
          });
          resolve();
        }
      };

      // Add temporary listeners that will parse errors into our arrays
      if (this.state.process) {
        this.state.process.stdout?.on("data", errorMonitor);
        this.state.process.stderr?.on("data", errorMonitor);
      }

      // Clean up the monitors after timeout or early resolution
      const cleanup = (): void => {
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

      // Parse Metro compilation errors (format: "ERROR Error: /path/file.tsx: Unexpected token...")
      else if (
        trimmedLine.includes("ERROR Error:") ||
        (trimmedLine.includes("ERROR ") &&
          trimmedLine.includes("Unexpected token"))
      ) {
        buildErrors.push({
          message: trimmedLine
            .replace(/^.*ERROR\s+Error:\s*/, "")
            .replace(/^.*ERROR\s+/, ""),
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

  private async _haveDependenciesChanged(
    oldContent: string,
    newContent: string,
  ): Promise<boolean> {
    try {
      const oldPkg = JSON.parse(oldContent || "{}");
      const newPkg = JSON.parse(newContent || "{}");

      const oldDeps = oldPkg.dependencies || {};
      const newDeps = newPkg.dependencies || {};
      const oldDevDeps = oldPkg.devDependencies || {};
      const newDevDeps = newPkg.devDependencies || {};

      if (
        Object.keys(oldDeps).length !== Object.keys(newDeps).length ||
        Object.keys(oldDevDeps).length !== Object.keys(newDevDeps).length
      ) {
        return true;
      }

      for (const key in newDeps) {
        if (oldDeps[key] !== newDeps[key]) {
          return true;
        }
      }

      for (const key in newDevDeps) {
        if (oldDevDeps[key] !== newDevDeps[key]) {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.log2.error(
        error as Error,
        "Failed to parse package.json for diffing. Assuming dependencies have changed as a precaution.",
      );
      return true;
    }
  }

  private generateVersion(): string {
    return Date.now().toString();
  }

  private getCacheControlHeader(filename: string): string {
    const ext = path.extname(filename).toLowerCase();

    switch (ext) {
      case ".html":
        return "public, max-age=300, s-maxage=300"; // 5 minutes
      case ".js":
      case ".css":
        return "public, max-age=31536000, s-maxage=31536000"; // 1 year for versioned assets
      case ".png":
      case ".jpg":
      case ".jpeg":
      case ".gif":
      case ".svg":
      case ".ico":
        return "public, max-age=31536000, s-maxage=31536000"; // 1 year
      default:
        return "public, max-age=3600, s-maxage=3600"; // 1 hour default
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
    if (!this.s3) {
      throw new Error("S3 client not set");
    }
    const uploadResults: Array<{ key: string; location: string }> = [];

    const uploadDirectory = async (
      dirPath: string,
      versionedPrefix: string,
      latestPrefix: string,
    ): Promise<void> => {
      if (!this.s3) {
        throw new Error("S3 client not set");
      }
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stats = await fs.stat(fullPath);

        if (stats.isDirectory()) {
          await uploadDirectory(
            fullPath,
            `${versionedPrefix}/${item}`,
            `${latestPrefix}/${item}`,
          );
        } else if (stats.isFile()) {
          const fileContent = await fs.readFile(fullPath);

          if (!fileContent || fileContent.length === 0) {
            this.log2.warn("Skipping empty file during upload", {
              fileName: item,
            });
            continue;
          }

          const uploadParams = {
            Body: fileContent,
            ContentType: this.getContentType(item),
            CacheControl: this.getCacheControlHeader(item),
          };

          // Upload to versioned location
          const versionedKey = `${versionedPrefix}/${item}`;
          const versionedCommand = new PutObjectCommand({
            ...uploadParams,
            Bucket: S3_BUCKET,
            Key: versionedKey,
          });
          await this.s3.send(versionedCommand);

          // Upload to latest location
          const latestKey = `${latestPrefix}/${item}`;
          const latestCommand = new PutObjectCommand({
            ...uploadParams,
            Bucket: S3_BUCKET,
            Key: latestKey,
            // Shorter cache for latest folder to pick up updates faster
            CacheControl: item.endsWith(".html")
              ? "public, max-age=300"
              : uploadParams.CacheControl,
          });
          await this.s3.send(latestCommand);

          uploadResults.push({
            key: versionedKey,
            location: `https://${S3_BUCKET}.s3.amazonaws.com/${versionedKey}`,
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
    const parts = s3KeyPrefix.split("/");
    const prototypeId = parts[0];
    const version = this.generateVersion();

    // Use the dual upload method
    return await this.uploadToVersionedAndLatest(
      localPath,
      prototypeId,
      version,
    );
  }

  private async deleteS3Prefix(prefix: string): Promise<void> {
    if (!this.s3) {
      throw new Error("S3 client not set");
    }
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
      });

      const objects = await this.s3.send(listCommand);
      if (objects.Contents && objects.Contents.length > 0) {
        this.log2.info("Deleting existing S3 objects", {
          count: objects.Contents.length,
          prefix,
        });

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: S3_BUCKET,
          Delete: {
            Objects: objects.Contents.map((obj) => ({ Key: obj.Key! })),
          },
        });
        await this.s3.send(deleteCommand);
        this.log2.info("Successfully deleted S3 objects", {
          count: objects.Contents.length,
        });
      } else {
        this.log2.debug("No existing S3 objects found", { prefix });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log2.warn("Failed to delete S3 objects", {
        prefix,
        error: errorMessage,
      });
      // Don't throw - continue with upload even if delete fails
    }
  }

  private runCommandInternal(
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
              `Command timed out after ${timeoutMs}ms: ${command} ${args.join(
                " ",
              )}`,
            ),
          );
        }
      }, timeoutMs);

      // Handle stdout
      childProcess.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        // Log real-time output
        this.log2.debug("Command stdout", {
          command,
          output: output.trim(),
        });
      });

      // Handle stderr
      childProcess.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        // Log real-time output
        this.log2.debug("Command stderr", {
          command,
          output: output.trim(),
        });
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

  public async runCommand(
    command: string,
    args: string[] = [],
    cwd?: string,
    env?: Record<string, string>,
    timeoutMs: number = 120000,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const workingDirectory = cwd || this.state.projectDir || this.workDir;

    this.log2.info("Running command", {
      command,
      args,
      workingDirectory,
      timeout: timeoutMs,
    });

    return this.runCommandInternal(
      command,
      args,
      workingDirectory,
      env,
      timeoutMs,
    );
  }

  private async buildExpoProject(
    projectDir: string,
    logger: {
      log: (
        step: string,
        success?: boolean,
        output?: string,
        error?: string,
      ) => void;
      getBuildLog: () => BuildLogEntry[];
      getElapsedTime: () => number;
    },
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
        `Project: ${config.expo?.name || "Unknown"}, Platform: ${
          config.expo?.platforms?.join(", ") || "Unknown"
        }`,
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
    this.log2.info("Running Expo export command", {
      command: "npx expo export --platform web",
      projectDir,
    });
    const result = await this.runCommandInternal(
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
