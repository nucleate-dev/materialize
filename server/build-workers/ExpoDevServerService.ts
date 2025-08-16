import { ChildProcess, spawn } from "child_process";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { customlog } from "./logger.js";

// --- Types ---
interface FileInput {
  path: string;
  content: string;
  isBase64?: boolean;
}

interface DevServerStartRequest {
  prototypeId: string;
  files: FileInput[];
  port?: number;
}

interface DevServerStartResponse {
  success: boolean;
  tunnelUrl?: string;
  port?: number;
  status: "starting" | "running" | "error";
  error?: string;
}

interface DevServerUpdateFilesRequest {
  files: FileInput[];
}

interface DevServerUpdateFilesResponse {
  success: boolean;
  updatedFiles?: string[];
  error?: string;
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

  // Register all dev server routes with Fastify
  public async register(app: FastifyInstance): Promise<void> {
    // Start dev server
    app.post<{ Body: DevServerStartRequest }>(
      "/dev-server/start",
      this.startDevServer.bind(this),
    );

    // Update files (hot reload)
    app.post<{ Body: DevServerUpdateFilesRequest }>(
      "/dev-server/update-files",
      this.updateFiles.bind(this),
    );

    // Get status
    app.get("/dev-server/status", this.getStatus.bind(this));

    // Stop dev server
    app.post("/dev-server/stop", this.stopDevServer.bind(this));

    // Restart dev server
    app.post("/dev-server/restart", this.restartDevServer.bind(this));

    // Get logs
    app.get<{ Querystring: { lines?: string } }>(
      "/dev-server/logs",
      this.getLogs.bind(this),
    );
  }

  // Start Expo dev server
  private async startDevServer(
    request: FastifyRequest<{ Body: DevServerStartRequest }>,
    reply: FastifyReply,
  ): Promise<DevServerStartResponse> {
    const { prototypeId, files, port } = request.body;

    if (!prototypeId || !files || !Array.isArray(files) || files.length === 0) {
      customlog("error", "Invalid startDevServer request:", {
        prototypeId,
        filesCount: files?.length,
      });
      return reply.code(400).send({
        success: false,
        status: "error",
        error: "prototypeId and files array are required",
      });
    }

    // Check if dev server is already running
    if (this.state.status === "running" || this.state.status === "starting") {
      if (this.state.prototypeId === prototypeId) {
        return {
          success: true,
          tunnelUrl: this.state.tunnelUrl || undefined,
          port: this.state.port || undefined,
          status: this.state.status,
        };
      } else {
        customlog(
          "warn",
          "Dev server already running for different prototype:",
          {
            currentPrototype: this.state.prototypeId,
            requestedPrototype: prototypeId,
          },
        );
        return reply.code(409).send({
          success: false,
          status: "error",
          error: `Dev server already running for different prototype: ${this.state.prototypeId}`,
        });
      }
    }

    try {
      this.state.prototypeId = prototypeId;
      this.state.port = port || this.defaultPort;
      this.state.status = "starting";
      this.state.startTime = new Date();
      this.state.addLog(`Starting dev server for prototype ${prototypeId}`);

      // Setup project directory
      const projectId = uuidv4();
      this.state.projectDir = path.join(this.workDir, projectId);
      await fs.mkdir(this.state.projectDir, { recursive: true });

      // Write project files
      await this.writeProjectFiles(files, this.state.projectDir);
      this.state.addLog(`Wrote ${files.length} files to project directory`);

      // Install dependencies
      await this.installDependencies(this.state.projectDir);

      // Start Expo dev server and wait for tunnel URL
      await this.startExpoProcess(this.state.projectDir, this.state.port);

      // The tunnel URL should be set by now since startExpoProcess waits for it
      return {
        success: true,
        tunnelUrl: this.state.tunnelUrl || undefined,
        port: this.state.port,
        status: this.state.status,
      };
    } catch (error: any) {
      customlog(
        "error",
        "Failed to start dev server:",
        error.message,
        error.stack,
      );
      this.state.status = "error";
      this.state.error = error.message;
      this.state.addLog(`Failed to start dev server: ${error.message}`);

      return reply.code(500).send({
        success: false,
        status: "error",
        error: error.message,
      });
    }
  }

  // Update files for hot reload
  private async updateFiles(
    request: FastifyRequest<{ Body: DevServerUpdateFilesRequest }>,
    reply: FastifyReply,
  ): Promise<DevServerUpdateFilesResponse> {
    const { files } = request.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      customlog("error", "Invalid updateFiles request - missing files array:", {
        filesCount: files?.length,
      });
      return reply.code(400).send({
        success: false,
        error: "files array is required",
      });
    }

    if (this.state.status !== "running" || !this.state.projectDir) {
      customlog("error", "Cannot update files - dev server not running:", {
        status: this.state.status,
        hasProjectDir: !!this.state.projectDir,
      });
      return reply.code(409).send({
        success: false,
        error: "No dev server currently running",
      });
    }

    try {
      const updatedFiles: string[] = [];

      for (const file of files) {
        const filePath = path.join(this.state.projectDir, file.path);
        const fileDir = path.dirname(filePath);

        // Ensure directory exists
        await fs.mkdir(fileDir, { recursive: true });

        // Write file content - handle binary vs text files
        if (file.isBase64) {
          // Handle binary files (images, fonts, etc.)
          const binaryContent = Buffer.from(file.content, "base64");
          await fs.writeFile(filePath, binaryContent);
          this.state.addLog(
            `Updated binary file: ${file.path} (${binaryContent.length} bytes)`,
          );
        } else {
          // Handle text files
          await fs.writeFile(filePath, file.content, "utf8");
          this.state.addLog(
            `Updated text file: ${file.path} (${file.content.length} chars)`,
          );
        }
        updatedFiles.push(file.path);
      }

      this.state.addLog(`Updated ${updatedFiles.length} files for hot reload`);

      return {
        success: true,
        updatedFiles,
      };
    } catch (error: any) {
      customlog("error", "Failed to update files:", error.message, error.stack);
      this.state.addLog(`Failed to update files: ${error.message}`);

      return reply.code(500).send({
        success: false,
        error: error.message,
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

  // Get logs
  private async getLogs(
    request: FastifyRequest<{ Querystring: { lines?: string } }>,
    _reply: FastifyReply,
  ): Promise<DevServerLogsResponse> {
    const lines = parseInt(request.query.lines || "50", 10);
    const logs = this.state.logs.slice(-lines);

    return {
      logs,
      timestamp: new Date().toISOString(),
    };
  }

  // --- Private Helper Methods ---

  private async writeProjectFiles(
    files: FileInput[],
    projectDir: string,
  ): Promise<void> {
    for (const file of files) {
      const filePath = path.join(projectDir, file.path);
      const fileDir = path.dirname(filePath);

      // Ensure directory exists
      await fs.mkdir(fileDir, { recursive: true });

      // Write file content - handle binary vs text files
      if (file.isBase64) {
        // Handle binary files (images, fonts, etc.)
        const binaryContent = Buffer.from(file.content, "base64");
        await fs.writeFile(filePath, binaryContent);
        this.state.addLog(
          `Wrote binary file: ${file.path} (${binaryContent.length} bytes)`,
        );
      } else {
        // Handle text files
        await fs.writeFile(filePath, file.content, "utf8");
        this.state.addLog(
          `Wrote text file: ${file.path} (${file.content.length} chars)`,
        );
      }
    }
  }

  private async installDependencies(projectDir: string): Promise<void> {
    this.state.addLog("Installing dependencies...");

    return new Promise((resolve, reject) => {
      const npmProcess = spawn(
        "npm",
        ["install", "--prefer-offline", "--no-audit", "--no-fund"],
        {
          cwd: projectDir,
          env: {
            ...process.env,
            CI: "1",
            NODE_OPTIONS: "--max-old-space-size=2048",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let stdout = "";
      let stderr = "";

      npmProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      npmProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      npmProcess.on("close", (code) => {
        if (code === 0) {
          this.state.addLog("Dependencies installed successfully");
          resolve();
        } else {
          const error = `npm install failed with exit code ${code}: ${stderr}`;
          customlog("error", "npm install failed:", { code, stderr, stdout });
          this.state.addLog(error);
          reject(new Error(error));
        }
      });

      npmProcess.on("error", (error) => {
        customlog(
          "error",
          "npm install process error:",
          error.message,
          error.stack,
        );
        this.state.addLog(`npm install process error: ${error.message}`);
        reject(error);
      });
    });
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

      this.state.process = spawn(
        "npx",
        ["expo", "start", "--web", "--tunnel", "--port", port.toString()],
        {
          cwd: projectDir,
          env: {
            ...process.env,
            CI: "1",
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
}
