import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ChildProcess, execSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import {
  BuildAndDeployResponse,
  BuildLogEntry,
  BuildResponse,
  DeployResponse,
  DevServerStartResponse,
  DevServerStatus,
  DevServerStatusResponse,
  OperationStatus,
} from "../../types/BuildWorkerTypes.js";
import {
  installDependencies,
  PrototypeAssetInputWithContent,
  PrototypeFileInput,
  resolvePathWithinProject,
  uploadAllClaudeSessionsToSupabase,
  writeProjectFiles,
} from "../../utils/shared-utils.js";
import { ChatService } from "../chat/ChatService.js";
import { FileSyncService } from "../FileSyncService.js";
import { SupabaseClientService } from "../SupabaseClientService.js";
import { TerminalService } from "../terminals/TerminalService.js";

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
  public builtVersion: string | null = null;

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
    this.builtVersion = null;
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
  private readonly logger: SystemLogger;
  private s3: S3Client | undefined;
  private readonly terminalService: TerminalService;
  private readonly supabaseClientService: SupabaseClientService;
  private readonly fileSyncService: FileSyncService;
  private readonly chatService: ChatService;

  constructor(
    workDir: string = "/tmp/materialize-dev-server",
    s3Instance: S3Client | undefined,
    terminalService: TerminalService,
    logger: SystemLogger,
    supabaseClientService: SupabaseClientService,
    fileSyncService: FileSyncService,
    chatService: ChatService,
  ) {
    this.workDir = workDir;
    this.s3 = s3Instance;
    this.terminalService = terminalService;
    this.state.tunnelSubdomain = this.generateTunnelSubdomain();
    this.logger = logger;
    this.supabaseClientService = supabaseClientService;
    this.fileSyncService = fileSyncService;
    this.chatService = chatService;
  }

  public getState(): DevServerState {
    return this.state;
  }

  public setS3Client(s3Instance: S3Client): void {
    this.s3 = s3Instance;
  }

  // Start Expo dev server
  public async startDevServer(
    prototype_id: string,
    framework: string,
    log2: SystemLogger,
  ): Promise<DevServerStartResponse> {
    if (!prototype_id || !framework) {
      log2.error(
        new Error("Missing required parameters"),
        "Missing required parameters",
        {
          prototype_id,
          framework,
        },
      );
      return {
        success: false,
        status: DevServerStatus.ERROR,
        error: "prototype_id and framework are required",
      };
    }
    log2 = log2.child({
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
        };
      } else {
        log2.warn("Dev server already running for different prototype", {
          currentPrototype: this.state.prototypeId,
          requestedPrototype: prototype_id,
        });
        return {
          success: false,
          status: DevServerStatus.ERROR,
          error: `Dev server already running for different prototype: ${this.state.prototypeId}`,
        };
      }
    }

    try {
      // Use FileSyncService to fetch files and assets
      const { errors: fetchErrors } =
        await this.fileSyncService.fetchAllFilesAndAssetsFromSupabaseAndWriteToDisk(
          prototype_id,
        );

      if (fetchErrors.length > 0) {
        const errorMsg = fetchErrors.join("; ");
        return {
          success: false,
          status: DevServerStatus.ERROR,
          error: errorMsg,
        };
      }

      // Restore Claude session files from Supabase after fetching project files
      await this.restoreClaudeSessions(prototype_id, log2);

      // Handle file scope (fixed path per instance)
      const projectDir = this.workDir;

      // Install dependencies for new project
      try {
        await installDependencies(
          projectDir,
          log2,
          this.terminalService.getSession("dev-server")!,
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        log2.error(new Error(errorMessage), "Dependency installation failed", {
          stack: errorStack,
        });
      }

      // Initialize git repository (no-op if .git already exists)
      try {
        log2.consoleLogDevOnly("info", "Initializing git repository", {
          projectDir,
        });
        await this.initGitRepository(
          projectDir,
          this.terminalService.getSession("dev-server")!,
        );
        log2.consoleLogDevOnly(
          "info",
          "Git repository initialized successfully",
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log2.warn("Failed to initialize git repository", {
          error: errorMessage,
        });
        // Git init failure shouldn't block dev server
      }

      this.state.prototypeId = prototype_id;
      this.state.port = this.defaultPort;
      this.state.devServerStatus = DevServerStatus.STARTING;
      this.state.startTime = new Date();
      this.state.projectDir = projectDir;
      if (!this.state.tunnelSubdomain) {
        this.state.tunnelSubdomain = this.generateTunnelSubdomain();
      }
      log2.consoleLogDevOnly(
        "info",
        `Starting dev server for prototype ${prototype_id} (${projectDir})`,
      );

      // Start Expo dev server and wait for tunnel URL
      try {
        await this.startExpoProcess(
          this.state.projectDir,
          this.state.port,
          log2,
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        log2.error(new Error(errorMessage), "Failed to start Expo process", {
          stack: errorStack,
        });
        this.state.devServerStatus = DevServerStatus.ERROR;
        this.state.error = errorMessage;
      }

      // Clear operation state on success
      this.state.clearOperation();

      // The tunnel URL should be set by now since startExpoProcess waits for it
      return {
        success: this.state.devServerStatus !== DevServerStatus.ERROR,
        tunnelUrl: this.state.tunnelUrl || undefined,
        port: this.state.port,
        status: this.state.devServerStatus,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      log2.error(
        new Error(errorMessage),
        "Internal server error in startDevServer",
        { stack: errorStack },
      );
      this.state.devServerStatus = DevServerStatus.ERROR;
      this.state.error = errorMessage;
      this.state.clearOperation();

      return {
        success: false,
        status: DevServerStatus.ERROR,
        error: errorMessage,
      };
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

  public async startExpoProcessForMCPTool(log2: SystemLogger): Promise<void> {
    log2.consoleLogDevOnly(
      "info",
      "Starting Expo dev server using terminal session for MCP tool",
    );
    return this.startExpoProcess(this.workDir, this.defaultPort, log2);
  }

  private async startExpoProcess(
    projectDir: string,
    port: number,
    log2: SystemLogger,
  ): Promise<void> {
    log2.consoleLogDevOnly(
      "info",
      "Starting Expo dev server using terminal session",
      { port },
    );

    return new Promise((resolve, reject) => {
      const tunnelSubdomain = this.state.tunnelSubdomain!;

      // Get the dev-server terminal session
      this.state.process = null; // Not using ChildProcess anymore
      let resolved = false;
      let cleanup: (() => void) | null = null;

      const timeout = setTimeout(() => {
        if (!resolved) {
          log2.error(
            new Error("Timeout waiting for tunnel URL after 60 seconds"),
            "Timeout waiting for tunnel URL after 60 seconds",
          );
          resolved = true;
          cleanup?.();
          reject(new Error("Timeout waiting for tunnel URL"));
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
            this.state.tunnelUrl = tunnelCandidates[0];
            this.state.devServerStatus = DevServerStatus.RUNNING;
            log2.consoleLogDevOnly("info", "Tunnel URL found", {
              tunnelUrl: this.state.tunnelUrl,
            });
            clearTimeout(timeout);
            resolved = true;
            cleanup?.();
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
          // Match tunnel URLs while excluding ANSI escape codes
          const tunnelUrlPattern =
            /(?:tunnel\s+(?:url|URL):\s*|Your\s+tunnel\s+URL\s+is\s*)((?:https?|exp):\/\/[^\s\)\x1B]+)/i;
          const tunnelMatch = output.match(tunnelUrlPattern);

          if (tunnelMatch && tunnelMatch[1]) {
            // Clean any remaining ANSI codes from the captured URL
            this.state.tunnelUrl = tunnelMatch[1].replace(
              /\x1B\[[0-9;]*m/g,
              "",
            );
          } else {
            // Fallback: construct expected tunnel URL
            this.state.tunnelUrl = `https://${tunnelSubdomain}.ngrok.io`;
          }

          this.state.devServerStatus = DevServerStatus.RUNNING;
          log2.info("Expo App Tunnel URL ready detected", {
            tunnelUrl: this.state.tunnelUrl,
          });
          clearTimeout(timeout);
          resolved = true;
          cleanup?.();
          resolve();
        }
      };

      const listenerDisposer = this.terminalService.addOutputListener(
        "dev-server",
        processOutput,
      );

      if (!listenerDisposer) {
        clearTimeout(timeout);
        reject(
          new Error("dev-server terminal session not found or not running"),
        );
        return;
      }

      cleanup = listenerDisposer;

      // Build the command to run in the terminal
      const command = `cd ${projectDir} && EXPO_NO_TELEMETRY=1 EXPO_TUNNEL_SUBDOMAIN=${tunnelSubdomain} npx expo start --web --tunnel --port ${port} --clear\n`;

      log2.consoleLogDevOnly("info", "Sending Expo start command to terminal", {
        command: command.trim(),
        projectDir,
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
        reject(
          new Error("Failed to send Expo start command to terminal session"),
        );
      }
    });
  }

  public async killExpoProcess(log2: SystemLogger): Promise<void> {
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
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // If process is still running on the port, force kill it
      const port = this.state.port || this.defaultPort;
      try {
        const killCommand = `lsof -ti:${port} | xargs -r kill -9`;
        execSync(killCommand, { stdio: "pipe", timeout: 5000 });
        log2.consoleLogDevOnly(
          "info",
          "Force killed any remaining processes on port",
          {
            port,
          },
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log2.debug("No processes found on port", {
          port,
          error: errorMessage,
        });
      }

      this.state.process = null;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log2.error(
        new Error(errorMessage),
        "Failed to kill Expo process in terminal",
      );
    }
  }

  async restartDevServer(log2: SystemLogger): Promise<void> {
    if (!this.state.projectDir || !this.state.port) {
      throw new Error(
        "Cannot restart dev server: missing project directory or port",
      );
    }

    log2.consoleLogDevOnly(
      "info",
      "Restarting dev server. First killing existing dev server",
    );

    // Kill the current process
    this.state.currentOperation = OperationStatus.STOPPING;
    await this.killExpoProcess(log2);

    // Reset state but keep project directory and port
    const projectDir = this.state.projectDir;
    const port = this.state.port;
    const prototypeId = this.state.prototypeId;

    // Restart the dev server
    this.state.currentOperation = OperationStatus.STARTING_DEV_SERVER;
    this.state.devServerStatus = DevServerStatus.STARTING;
    this.state.startTime = new Date();
    log2.consoleLogDevOnly("info", "Restarting dev server for prototype", {
      prototypeId,
    });

    try {
      await this.startExpoProcess(projectDir, port, log2);
      this.state.clearOperation();
      log2.consoleLogDevOnly("info", "Dev server restarted successfully");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.state.devServerStatus = DevServerStatus.ERROR;
      this.state.error = errorMessage;
      this.state.clearOperation();
      log2.error(new Error(errorMessage), "Failed to restart dev server");
      throw error;
    }
  }

  private async initGitRepository(
    projectDir: string,
    terminalSession: { id: string },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let output = "";
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup?.();
          reject(new Error("git init timed out after 5 seconds"));
        }
      }, 5000);

      const processOutput = (chunk: string): void => {
        output += chunk;

        // Check for completion indicators
        if (
          output.includes("Initialized empty Git repository") ||
          output.includes("Reinitialized existing Git repository") ||
          output.includes("already exists")
        ) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            cleanup?.();
            resolve();
          }
        }
      };

      const listenerDisposer = this.terminalService.addOutputListener(
        terminalSession.id,
        processOutput,
      );

      if (!listenerDisposer) {
        clearTimeout(timeout);
        reject(new Error(`Terminal session ${terminalSession.id} not found`));
        return;
      }

      const cleanup = listenerDisposer;

      const gitignoreCommand =
        'printf "node_modules/\\ndist/\\n.expo/\\n.next/\\nbuild/\\n*.log\\n.DS_Store\\n" > .gitignore';

      // Combine gitignore creation, git init, and initial commit in one command
      const command = `cd ${projectDir} && ${gitignoreCommand} && git init && git add . && git commit -m "Initial commit"; echo "GIT_INIT_DONE"\n`;

      try {
        // Bypass validation for trusted internal command
        this.terminalService.sendInput(terminalSession.id, command, {
          bypassValidation: true,
        });

        // Also resolve when we see our marker
        const markerCheck = setInterval(() => {
          if (output.includes("GIT_INIT_DONE") && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            clearInterval(markerCheck);
            cleanup();
            resolve();
          }
        }, 100);

        // Clean up the interval after timeout
        setTimeout(() => clearInterval(markerCheck), 6000);
      } catch (error) {
        clearTimeout(timeout);
        cleanup();
        const message = error instanceof Error ? error.message : String(error);
        reject(new Error(`Failed to send git init command: ${message}`));
      }
    });
  }

  private async cleanup(log2: SystemLogger): Promise<void> {
    if (!this.state.projectDir) {
      return;
    }

    try {
      await this.cleanWorkspace(this.state.projectDir);
      log2.consoleLogDevOnly("info", "Workspace cleaned");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log2.warn("Failed to clean workspace directory", {
        projectDir: this.state.projectDir,
        error: errorMessage,
      });
    }
  }

  private async cleanWorkspace(targetDir: string): Promise<void> {
    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".keep") {
        continue;
      }
      const entryPath = path.join(targetDir, entry.name);
      try {
        await fs.rm(entryPath, { recursive: true, force: true });
      } catch (error) {
        this.logger.warn("Failed to remove workspace entry", {
          entry: entryPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Graceful shutdown method
  public async shutdown(log2: SystemLogger): Promise<void> {
    log2.consoleLogDevOnly("info", "Shutting down dev server service");

    this.state.setOperation(OperationStatus.STOPPING);
    await this.killExpoProcess(log2);
    await this.cleanup(log2);

    // Reset state which sets status to "stopped" and operation to "idle"
    this.state.reset();

    log2.consoleLogDevOnly("info", "Dev server service shutdown completed");
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

  createLogger(
    buildId: string,
    log2: SystemLogger,
  ): {
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
          log2.error(new Error(error), "Build step error", {
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
    log2: SystemLogger,
    prototype_id: string,
    files: PrototypeFileInput[],
    assets: PrototypeAssetInputWithContent[],
    buildId?: string,
  ): Promise<BuildResponse> {
    const actualBuildId = buildId || uuidv4();
    const logger = this.createLogger(actualBuildId, log2);

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

      // Get the build terminal session for installing dependencies
      const buildSession = this.terminalService.getSession("build");
      if (!buildSession) {
        throw new Error("build terminal session not found");
      }

      const installStartTime = Date.now();
      await installDependencies(buildDir, log2, buildSession);
      const installDuration = Date.now() - installStartTime;
      logger.log(
        "Dependency installation completed",
        true,
        `Duration: ${Math.floor(installDuration / 1000)}s`,
      );

      const buildStartTime = Date.now();
      const outputPath = await this.buildExpoProject(
        log2,
        buildDir,
        logger,
        prototype_id,
      );
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
    log2: SystemLogger,
    prototype_id: string,
    buildPath: string,
    deployId?: string,
  ): Promise<DeployResponse> {
    const actualDeployId = deployId || uuidv4();
    const logger = this.createLogger(actualDeployId, log2);
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
        log2,
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
        uploadedFiles: uploadedFiles.uploadResults,
        version: uploadedFiles.version,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.log("S3 Deploy failed", false, "", errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async buildAndDeployProjectCore(
    log2: SystemLogger,
    prototypeId?: string,
    jobId?: string,
  ): Promise<BuildAndDeployResponse> {
    const actualJobId = jobId || uuidv4();
    const logger = this.createLogger(actualJobId, log2);

    // Set operation state only if not already set (to preserve operation start time)
    if (
      this.state.currentOperation !== OperationStatus.BUILDING_AND_DEPLOYING
    ) {
      this.state.setOperation(
        OperationStatus.BUILDING_AND_DEPLOYING,
        actualJobId,
      );
    }
    const resolvedPrototypeId = prototypeId ?? this.state.prototypeId ?? null;
    if (!resolvedPrototypeId) {
      const errorMessage = "Cannot build and deploy without a prototype ID";
      logger.log("Build and deploy failed", false, "", errorMessage);
      this.state.clearOperation();
      return {
        success: false,
        error: errorMessage,
        buildLog: logger.getBuildLog(),
      };
    }

    if (!this.state.prototypeId) {
      this.state.prototypeId = resolvedPrototypeId;
    } else if (this.state.prototypeId !== resolvedPrototypeId) {
      log2.warn("Prototype ID mismatch during build", {
        statePrototypeId: this.state.prototypeId,
        requestedPrototypeId: resolvedPrototypeId,
      });
      this.state.prototypeId = resolvedPrototypeId;
    }
    // Use the fixed project directory created by the dev server
    const buildDir = this.workDir;

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
      const outputPath = await this.buildExpoProject(
        log2,
        buildDir,
        logger,
        resolvedPrototypeId,
      );

      // Log memory after expo build (likely peak memory usage)
      const memUsageAfterBuild = process.memoryUsage();
      logger.log(
        "Memory after expo build",
        true,
        `Heap: ${Math.round(memUsageAfterBuild.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsageAfterBuild.heapTotal / 1024 / 1024)}MB, RSS: ${Math.round(memUsageAfterBuild.rss / 1024 / 1024)}MB`,
      );

      const s3KeyPrefix = `${resolvedPrototypeId}`;
      const uploadResult = await this.uploadDirectoryToS3(
        log2,
        outputPath,
        s3KeyPrefix,
      );

      // Log memory after S3 upload
      const memUsageAfterUpload = process.memoryUsage();
      logger.log(
        "Memory after S3 upload",
        true,
        `Heap: ${Math.round(memUsageAfterUpload.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsageAfterUpload.heapTotal / 1024 / 1024)}MB, RSS: ${Math.round(memUsageAfterUpload.rss / 1024 / 1024)}MB`,
      );

      const buildUrl = `https://${resolvedPrototypeId}.render.materializeui.com`;
      this.state.builtVersion = uploadResult.version;
      return {
        success: true,
        buildUrl,
        buildLog: logger.getBuildLog(),
        uploadedFiles: uploadResult.uploadResults,
        version: uploadResult.version,
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
      await this.killExpoProcess(log2);
      this.state.devServerStatus = DevServerStatus.STOPPED;
      log2.consoleLogDevOnly(
        "info",
        "Dev server stopped after build and deploy completion",
      );
    }
  }

  async updateDevServerFiles(
    log2: SystemLogger,
    files: PrototypeFileInput[],
    assets: PrototypeAssetInputWithContent[],
    deletedFiles: string[] = [],
  ): Promise<{
    success: boolean;
    tunnelUrl?: string;
  }> {
    // Validate that we have an active dev server
    if (
      this.state.devServerStatus === DevServerStatus.STOPPED ||
      !this.state.prototypeId ||
      !this.state.projectDir
    ) {
      const errorMsg = "Cannot update files: No active dev server running";
      log2.error(new Error(errorMsg), "Cannot update files");
      return {
        success: false,
        tunnelUrl: this.state.tunnelUrl || undefined,
      };
    }

    // Set operation state
    this.state.setOperation(
      OperationStatus.UPDATING_FILES,
      this.state.prototypeId,
    );

    // Use the state's project directory as the source of truth
    const actualProjectDir = this.state.projectDir;

    log2.consoleLogDevOnly("info", "Updating project files", {
      filesCount: files.length,
      assetsCount: assets.length,
      projectDirectory: actualProjectDir,
    });

    // Log which files are being updated
    const fileNames = files.map((f) => f.name);
    log2.debug("Files being updated", { files: fileNames });

    // Log which files are being deleted
    if (deletedFiles.length > 0) {
      log2.debug("Files being deleted", { files: deletedFiles });
    }

    // Verify project directory exists and is accessible
    try {
      const stats = await fs.stat(actualProjectDir);
      if (!stats.isDirectory()) {
        const errorMsg = `Project path exists but is not a directory: ${actualProjectDir}`;
        log2.error(new Error(errorMsg), "Project path validation failed");
        return {
          success: false,
          tunnelUrl: this.state.tunnelUrl || undefined,
        };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // Project directory doesn't exist - this shouldn't happen in update mode
      log2.error(
        new Error(errorMessage),
        "Project directory missing during update",
        {
          projectDir: actualProjectDir,
          prototypeId: this.state.prototypeId,
        },
      );
      return {
        success: false,
        tunnelUrl: this.state.tunnelUrl || undefined,
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
          log2.consoleLogDevOnly(
            "info",
            "Found existing package.json for diffing.",
          );
        } catch (error) {
          log2.warn("Could not read old package.json, assuming new file.", {
            error,
          });
          oldPackageJsonContent = "{}";
        }
      }

      // 2) Delete files that need to be removed
      if (deletedFiles.length > 0) {
        log2.consoleLogDevOnly("info", "Deleting files", {
          files: deletedFiles,
        });
        for (const filePath of deletedFiles) {
          try {
            const fullPath = resolvePathWithinProject(
              actualProjectDir,
              filePath,
            );
            await fs.rm(fullPath, { recursive: true, force: true });
            log2.debug("Successfully deleted file", { filePath });
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            log2.warn("Failed to delete file", {
              filePath,
              error: errorMessage,
            });
          }
        }
      }

      // 3) Write incoming files to disk
      await writeProjectFiles(files, assets, actualProjectDir);
      log2.consoleLogDevOnly(
        "info",
        "Successfully wrote files to project directory",
        {
          projectDir: actualProjectDir,
        },
      );

      // 4) Monitor for Metro bundler errors after file updates
      log2.consoleLogDevOnly(
        "info",
        "Monitoring Metro output for compilation errors",
      );

      // 5) If package.json changed, diff dependencies and conditionally reinstall/restart
      if (packageJsonUpdate && oldPackageJsonContent) {
        const newPackageJsonContent =
          packageJsonUpdate.contents as unknown as string;
        const dependenciesHaveChanged = await this.haveDependenciesChanged(
          log2,
          oldPackageJsonContent,
          newPackageJsonContent,
        );

        if (dependenciesHaveChanged) {
          log2.consoleLogDevOnly(
            "info",
            "Dependency changes detected in package.json. Stopping dev server, reinstalling dependencies, and restarting.",
          );
          try {
            // Step 1: Stop the dev server
            log2.consoleLogDevOnly("info", "Stopping dev server...");
            await this.killExpoProcess(log2);
            log2.consoleLogDevOnly("info", "Dev server stopped successfully");

            // Step 2: Install dependencies in dev-server terminal
            log2.consoleLogDevOnly("info", "Installing dependencies...");
            await installDependencies(
              actualProjectDir,
              log2,
              this.terminalService.getSession("dev-server")!,
            );
            log2.consoleLogDevOnly(
              "info",
              "Dependencies reinstalled successfully",
            );

            // Step 3: Restart the dev server
            log2.consoleLogDevOnly("info", "Starting dev server...");
            const port = this.state.port || this.defaultPort;
            this.state.devServerStatus = DevServerStatus.STARTING;
            this.state.startTime = new Date();
            await this.startExpoProcess(actualProjectDir, port, log2);
            log2.consoleLogDevOnly(
              "info",
              "Dev server restarted successfully with new dependencies.",
            );
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            log2.error(
              new Error(errorMessage),
              "Dependency update or dev server restart failed for package.json change",
            );
          }
        } else {
          log2.consoleLogDevOnly(
            "info",
            "package.json was updated, but no dependency changes were found. Skipping reinstall and restart.",
          );
        }
      } else {
        log2.debug(
          "No package.json changes detected, skipping dependency diff.",
        );
      }

      // Clear operation state on success
      this.state.clearOperation();

      return {
        success: true,
        tunnelUrl: this.state.tunnelUrl || undefined,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      log2.error(new Error(errorMessage), "File writing failed during update", {
        stack: errorStack,
      });
      // Clear operation state on error
      this.state.clearOperation();
      return {
        success: false,
        tunnelUrl: this.state.tunnelUrl || undefined,
      };
    }
  }

  private async haveDependenciesChanged(
    log2: SystemLogger,
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
      log2.error(
        error as Error,
        "Failed to parse package.json for diffing. Assuming dependencies have changed as a precaution.",
      );
      return true;
    }
  }

  private generateVersion(): string {
    return "v" + Date.now().toString();
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
    log2: SystemLogger,
    localPath: string,
    prototypeId: string,
    version: string,
  ): Promise<{
    uploadResults: Array<{ key: string; location: string }>;
    version: string;
  }> {
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
            log2.warn("Skipping empty file during upload", {
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

    const versionedPrefix = `${prototypeId}/${version}`;
    const latestPrefix = `${prototypeId}/latest`;

    await uploadDirectory(localPath, versionedPrefix, latestPrefix);
    return { uploadResults, version };
  }

  private async deleteOldVersions(
    log2: SystemLogger,
    prototypeId: string,
    currentVersion: string,
  ): Promise<void> {
    if (!this.s3) {
      throw new Error("S3 client not set");
    }

    try {
      // List all objects under the prototype's versioned folders
      const listCommand = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: `${prototypeId}/v`,
      });

      const listResponse = await this.s3.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        log2.debug("No old versions found to delete", { prototypeId });
        return;
      }

      // Filter out objects from the current version
      const currentVersionPrefix = `${prototypeId}/${currentVersion}/`;
      const objectsToDelete = listResponse.Contents.filter(
        (obj) => obj.Key && !obj.Key.startsWith(currentVersionPrefix),
      );

      if (objectsToDelete.length === 0) {
        log2.debug("No old versions to delete", {
          prototypeId,
          currentVersion,
        });
        return;
      }

      // Delete old version objects
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: S3_BUCKET,
        Delete: {
          Objects: objectsToDelete.map((obj) => ({ Key: obj.Key! })),
          Quiet: true,
        },
      });

      await this.s3.send(deleteCommand);

      log2.consoleLogDevOnly(
        "info",
        "Successfully deleted old versions in S3",
        {
          prototypeId,
          currentVersion,
          deletedCount: objectsToDelete.length,
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log2.error(
        error instanceof Error ? error : new Error(errorMessage),
        "Failed to delete old versions",
        { prototypeId, currentVersion },
      );
      // Don't throw - we don't want cleanup failure to fail the build
    }
  }

  private async uploadDirectoryToS3(
    log2: SystemLogger,
    localPath: string,
    s3KeyPrefix: string,
  ): Promise<{
    uploadResults: Array<{ key: string; location: string }>;
    version: string;
  }> {
    // Extract prototype ID and version from s3KeyPrefix
    const parts = s3KeyPrefix.split("/");
    const prototypeId = parts[0];
    const version = this.generateVersion();

    // Use the dual upload method
    const uploadResult = await this.uploadToVersionedAndLatest(
      log2,
      localPath,
      prototypeId,
      version,
    );
    await this.deleteOldVersions(log2, prototypeId, version);
    return uploadResult;
  }

  private async syncProjectFilesToSupabase(
    prototypeId: string | undefined,
    projectDir: string,
    log2: SystemLogger,
    logger: {
      log: (
        step: string,
        success?: boolean,
        output?: string,
        error?: string,
      ) => void;
    },
  ): Promise<void> {
    if (!prototypeId) {
      const message = "Prototype ID missing, skipping Supabase sync";
      log2.warn(message);
      logger.log("Supabase sync before Expo build", false, "", message);
      return;
    }

    log2.consoleLogDevOnly(
      "info",
      "Syncing project files to Supabase before Expo build",
      {
        prototypeId,
        projectDir,
      },
    );

    try {
      const syncResult = await this.fileSyncService.syncFilesToSupabase(
        prototypeId,
        "all",
      );
      const summary = `Files updated: ${syncResult.filesUpdated}, assets updated: ${syncResult.assetsUpdated}, errors: ${syncResult.errors.length}`;
      logger.log(
        "Supabase sync before Expo build",
        syncResult.success,
        summary,
        syncResult.errors.join("; "),
      );

      if (!syncResult.success) {
        log2.warn("Supabase sync before Expo build completed with errors", {
          prototypeId,
          errors: syncResult.errors,
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log2.warn("Supabase sync before Expo build failed", {
        prototypeId,
        error: errorMessage,
      });
      logger.log("Supabase sync before Expo build", false, "", errorMessage);
    }
  }

  private async buildExpoProject(
    log2: SystemLogger,
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
    prototypeId?: string,
  ): Promise<string> {
    logger.log(
      "Building Expo project",
      true,
      `Starting build in ${projectDir}`,
    );

    const resolvedPrototypeId = prototypeId ?? this.state.prototypeId ?? null;
    if (resolvedPrototypeId) {
      try {
        await this.syncProjectFilesToSupabase(
          resolvedPrototypeId,
          projectDir,
          log2,
          logger,
        );
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log2.warn("Proceeding with Expo build despite Supabase sync failure", {
          prototypeId: resolvedPrototypeId,
          error: errorMessage,
        });
        logger.log(
          "Supabase sync before Expo build",
          false,
          "",
          `Skipped due to error: ${errorMessage}`,
        );
      }

      // Upload all Claude session files to Supabase before build
      try {
        const uploadResult = await uploadAllClaudeSessionsToSupabase(
          resolvedPrototypeId,
          this.supabaseClientService.getClient(),
          log2,
        );

        log2.info(
          "Claude session upload before Expo build, " +
            `Uploaded ${uploadResult.uploadedCount} session files`,
          {
            success: uploadResult.success,
            errorCount: uploadResult.errors.length,
            errors: uploadResult.errors,
          },
        );

        if (!uploadResult.success) {
          log2.warn("Claude session upload had errors", {
            prototypeId: resolvedPrototypeId,
            errorCount: uploadResult.errors.length,
            errors: uploadResult.errors,
          });
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        log2.warn("Proceeding with Expo build despite session upload failure", {
          prototypeId: resolvedPrototypeId,
          error: errorMessage,
        });
        logger.log(
          "Claude session upload before Expo build",
          false,
          "",
          `Skipped due to error: ${errorMessage}`,
        );
      }
    }

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
    log2.consoleLogDevOnly("info", "Running Expo export command", {
      command: "npx expo export --platform web",
      projectDir,
    });
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
      const commandString = `${envString}cd ${projectDir} && npx expo export --platform web; echo "EXIT_CODE=$?"\n`;

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
          { projectDir },
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

  /**
   * Restores Claude session .jsonl files from Supabase Storage to ~/.claude/projects/
   */
  private async restoreClaudeSessions(
    prototypeId: string,
    log2: SystemLogger,
  ): Promise<void> {
    try {
      // Import utility function
      const { restoreClaudeSessionsFromSupabase } = await import(
        "../../utils/shared-utils.js"
      );

      // Restore all session files from Storage
      const result = await restoreClaudeSessionsFromSupabase(
        prototypeId,
        this.supabaseClientService.getClient(),
        log2,
      );

      // Register restored session IDs with ChatService for validation
      if (result.restoredSessionIds.length > 0) {
        this.chatService.registerValidSessionIds(result.restoredSessionIds);
        log2.consoleLogDevOnly(
          "info",
          "Registered restored Claude sessions with ChatService",
          {
            prototypeId,
            restoredCount: result.restoredSessionIds.length,
          },
        );
      }

      // Log any errors but don't fail the dev server start
      if (result.errors.length > 0) {
        log2.warn("Claude session restoration had errors", {
          prototypeId,
          errorCount: result.errors.length,
          errors: result.errors,
        });
      }
    } catch (error) {
      log2.error(
        error instanceof Error ? error : new Error(String(error)),
        "Error restoring Claude sessions",
        { prototypeId },
      );
    }
  }
}
