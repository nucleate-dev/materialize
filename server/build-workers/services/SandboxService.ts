// SandboxService.ts
// Provides generic sandbox-level file and git operations
// These are not Expo-specific and can be used for any sandbox environment

import { spawn } from "child_process";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import { SystemLogger } from "../loggers/SystemLogger.js";
import {
  PublicRunCommandRequest,
  PublicRunCommandResponse,
  SandboxGitCheckoutRequest,
  SandboxGitCheckoutResponse,
  SandboxMakeDirRequest,
  SandboxMakeDirResponse,
  SandboxReadFileRequest,
  SandboxReadFileResponse,
  SandboxWriteFileRequest,
  SandboxWriteFileResponse,
} from "../types/BuildWorkerTypes.js";
import { resolvePathWithinProject } from "../utils/shared-utils.js";
import { TerminalService } from "./TerminalService.js";

// TODO: Add rate limiting to prevent abuse of sandbox operations
// Ideas:
// - Use a token bucket algorithm per prototype_id
// - Limit operations per minute (e.g., 60 file ops/min, 5 git clones/min)
// - Track operation counts in Redis with TTL
// - Return 429 Too Many Requests when limit exceeded
// - Consider different limits for different operation types (git clone is more expensive than mkdir)

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit for file reads

interface MakeDirResult {
  success: boolean;
  error?: string;
}

interface ReadFileResult {
  success: boolean;
  contents?: string;
  isBinary?: boolean;
  error?: string;
}

interface WriteFileResult {
  success: boolean;
  error?: string;
}

interface GitCheckoutResult {
  success: boolean;
  output?: string;
  error?: string;
}

export class SandboxService {
  private readonly workDir: string;
  private readonly log2: SystemLogger;
  private readonly fastifyApp: FastifyInstance;
  private readonly terminalService: TerminalService;

  constructor(
    fastifyApp: FastifyInstance,
    workDir: string,
    logger: SystemLogger,
    terminalService: TerminalService,
  ) {
    this.fastifyApp = fastifyApp;
    this.workDir = workDir;
    this.log2 = logger.child({ service: "SandboxService" });
    this.terminalService = terminalService;
  }

  public registerRoutes(): void {
    // POST /sandbox/make-dir
    this.fastifyApp.post<{ Body: SandboxMakeDirRequest }>(
      "/sandbox/make-dir",
      this.handleSandboxMakeDir.bind(this),
    );

    // POST /sandbox/read-file
    this.fastifyApp.post<{ Body: SandboxReadFileRequest }>(
      "/sandbox/read-file",
      this.handleSandboxReadFile.bind(this),
    );

    // POST /sandbox/write-file
    this.fastifyApp.post<{ Body: SandboxWriteFileRequest }>(
      "/sandbox/write-file",
      this.handleSandboxWriteFile.bind(this),
    );

    // POST /sandbox/git-checkout
    this.fastifyApp.post<{ Body: SandboxGitCheckoutRequest }>(
      "/sandbox/git-checkout",
      this.handleSandboxGitCheckout.bind(this),
    );

    // POST /run-command
    this.fastifyApp.post<{ Body: PublicRunCommandRequest }>(
      "/run-command",
      this.runCommand.bind(this),
    );
  }

  /**
   * Create a directory in the sandbox
   * @param relativePath - Path relative to workDir
   * @param recursive - Whether to create parent directories
   */
  public async makeDirectory(
    relativePath: string,
    recursive: boolean = false,
  ): Promise<MakeDirResult> {
    try {
      // Security: Validate path is within workDir
      const resolvedPath = resolvePathWithinProject(this.workDir, relativePath);

      this.log2.info("Creating directory", {
        path: relativePath,
        resolvedPath,
        recursive,
      });

      await fs.mkdir(resolvedPath, { recursive });

      this.log2.info("Directory created successfully", { path: relativePath });
      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log2.error(new Error(errorMessage), "Failed to create directory", {
        path: relativePath,
        recursive,
      });
      return { success: false, error: errorMessage };
    }
  }

  private async runCommand(
    request: FastifyRequest<{ Body: PublicRunCommandRequest }>,
    reply: FastifyReply,
  ): Promise<PublicRunCommandResponse> {
    const { command, args, cwd, env, timeout_ms } = request.body;

    if (!command) {
      request.log2.error(
        new Error("Missing required parameter: command"),
        "Missing required parameter: command",
        { command, args },
      );
      reply.code(400);
      return {
        status: "error",
        error: "command is required",
      };
    }

    try {
      const result = await this.runCommandInternal(
        command,
        args || [],
        cwd || this.workDir,
        env,
        timeout_ms || 120000,
      );

      return {
        status: result.code === 0 ? "success" : "error",
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.code,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      request.log2.error(new Error(errorMessage), "Command execution failed", {
        stack: errorStack,
        command,
        args,
      });
      reply.code(500);
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private runCommandInternal(
    command: string,
    args: string[],
    cwd: string,
    env?: Record<string, string>,
    timeoutMs: number = 300000, // 5 minutes default
    sessionId: string = "test",
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let commandComplete = false;
      let exitCode = 0;
      let cleanup: (() => void) | null = null;
      let exitCodeCheckInterval: NodeJS.Timeout | null = null;
      let exitIntervalCleanupTimeout: NodeJS.Timeout | null = null;

      const timeoutHandle = setTimeout(() => {
        if (!commandComplete) {
          commandComplete = true;
          const error = `Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`;
          this.log2.error(new Error(error), "Command timeout");
          if (exitCodeCheckInterval) {
            clearInterval(exitCodeCheckInterval);
            exitCodeCheckInterval = null;
          }
          cleanup?.();
          cleanup = null;
          reject(new Error(error));
        }
      }, timeoutMs);

      const processOutput = (chunk: string): void => {
        const output = chunk.toString();
        stdout += output;

        // Try to detect command completion by looking for shell prompt patterns
        // This is heuristic-based since we're running in a shell
        const lines = output.split("\n");
        for (const line of lines) {
          // Look for common error patterns
          if (
            line.includes("command not found") ||
            line.includes("No such file or directory") ||
            line.includes("permission denied")
          ) {
            if (!commandComplete) {
              commandComplete = true;
              exitCode = 1;
              clearTimeout(timeoutHandle);
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
              resolve({
                stdout: stdout.trim(),
                stderr: line,
                code: exitCode,
              });
            }
          }
        }
      };

      const listenerDisposer = this.terminalService.addOutputListener(
        sessionId,
        processOutput,
      );

      if (!listenerDisposer) {
        clearTimeout(timeoutHandle);
        reject(
          new Error(`Terminal session ${sessionId} not found or not running`),
        );
        return;
      }

      cleanup = (): void => {
        listenerDisposer();
        if (exitIntervalCleanupTimeout) {
          clearTimeout(exitIntervalCleanupTimeout);
          exitIntervalCleanupTimeout = null;
        }
      };

      // Build environment variables string
      let envString = "";
      if (env) {
        envString = Object.entries(env)
          .map(([key, value]) => `${key}="${value}"`)
          .join(" ");
      }

      // Build the full command with env vars, cd, and command with args
      const fullCommand = `${envString ? envString + " " : ""}cd ${cwd} && ${command} ${args.join(" ")}; echo "EXIT_CODE=$?"\n`;

      this.log2.info("Sending command to terminal", {
        command: fullCommand.trim(),
        sessionId,
        cwd,
      });

      try {
        this.terminalService.sendInput(sessionId, fullCommand);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        clearTimeout(timeoutHandle);
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
        commandComplete = true;
        this.log2.error(
          new Error(message),
          "Failed to send command to terminal session",
          { sessionId, cwd },
        );
        reject(
          new Error(
            `Failed to send command to terminal session ${sessionId}: ${message}`,
          ),
        );
        return;
      }

      // Set up a detection for the EXIT_CODE marker
      exitCodeCheckInterval = setInterval(() => {
        if (stdout.includes("EXIT_CODE=")) {
          const match = stdout.match(/EXIT_CODE=(\d+)/);
          if (match && !commandComplete) {
            commandComplete = true;
            exitCode = parseInt(match[1], 10);
            clearTimeout(timeoutHandle);
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

            // Remove the EXIT_CODE marker from stdout
            const cleanStdout = stdout.replace(/EXIT_CODE=\d+/, "").trim();

            this.log2.debug("Command completed", {
              command,
              exitCode,
              sessionId,
            });

            resolve({
              stdout: cleanStdout,
              stderr: exitCode !== 0 ? cleanStdout : "",
              code: exitCode,
            });
          }
        }
      }, 100);

      // Clean up interval if timeout occurs
      exitIntervalCleanupTimeout = setTimeout(() => {
        if (commandComplete && exitCodeCheckInterval) {
          clearInterval(exitCodeCheckInterval);
          exitCodeCheckInterval = null;
        }
      }, timeoutMs + 1000);
    });
  }

  /**
   * Read a file from the sandbox
   * Binary files are base64 encoded
   * @param relativePath - Path relative to workDir
   */
  public async readFile(relativePath: string): Promise<ReadFileResult> {
    try {
      // Security: Validate path is within workDir
      const resolvedPath = resolvePathWithinProject(this.workDir, relativePath);

      this.log2.info("Reading file", { path: relativePath, resolvedPath });

      // Check file size first to prevent memory exhaustion
      const stats = await fs.stat(resolvedPath);
      if (stats.size > MAX_FILE_SIZE_BYTES) {
        const errorMsg = `File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE_BYTES} bytes)`;
        this.log2.error(new Error(errorMsg), "File size limit exceeded", {
          path: relativePath,
          size: stats.size,
        });
        return { success: false, error: errorMsg };
      }

      // Read file as buffer first
      const buffer = await fs.readFile(resolvedPath);

      // Detect if file is binary
      const isBinary = this.isBinaryFile(buffer);

      let contents: string;
      if (isBinary) {
        // Base64 encode binary files
        contents = buffer.toString("base64");
        this.log2.info("File read successfully (binary)", {
          path: relativePath,
          size: stats.size,
        });
      } else {
        // Return text files as UTF-8
        contents = buffer.toString("utf-8");
        this.log2.info("File read successfully (text)", {
          path: relativePath,
          size: stats.size,
        });
      }

      return { success: true, contents, isBinary };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log2.error(new Error(errorMessage), "Failed to read file", {
        path: relativePath,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Write a file to the sandbox
   * Auto-creates parent directories if they don't exist
   * @param relativePath - Directory path relative to workDir
   * @param filename - Name of the file to write
   * @param contents - File contents (plain text or base64 for binary)
   */
  public async writeFile(
    relativePath: string,
    filename: string,
    contents: string,
  ): Promise<WriteFileResult> {
    try {
      // Combine path and filename
      const fullRelativePath = path.join(relativePath, filename);

      // Security: Validate path is within workDir
      const resolvedPath = resolvePathWithinProject(
        this.workDir,
        fullRelativePath,
      );

      this.log2.info("Writing file", {
        path: fullRelativePath,
        resolvedPath,
        contentLength: contents.length,
      });

      // Auto-create parent directory if it doesn't exist
      const parentDir = path.dirname(resolvedPath);
      await fs.mkdir(parentDir, { recursive: true });

      // Write file
      await fs.writeFile(resolvedPath, contents, "utf-8");

      this.log2.info("File written successfully", { path: fullRelativePath });
      return { success: true };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log2.error(new Error(errorMessage), "Failed to write file", {
        path: relativePath,
        filename,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Clone a git repository into the sandbox
   * Security: Only allows HTTPS URLs, blocks private IPs
   * @param gitUrl - HTTPS git repository URL
   * @param targetPath - Optional target path relative to workDir (defaults to repo name)
   */
  public async gitCheckout(
    gitUrl: string,
    targetPath?: string,
  ): Promise<GitCheckoutResult> {
    try {
      // Security: Validate HTTPS URL only
      if (!this.isValidGitUrl(gitUrl)) {
        const errorMsg =
          "Invalid git URL. Only HTTPS URLs are allowed (e.g., https://github.com/user/repo.git)";
        this.log2.error(new Error(errorMsg), "Invalid git URL", { gitUrl });
        return { success: false, error: errorMsg };
      }

      // Security: Check for private IP addresses in URL
      if (this.containsPrivateIp(gitUrl)) {
        const errorMsg =
          "Git URL contains private IP address. Only public repositories are allowed.";
        this.log2.error(new Error(errorMsg), "Private IP in git URL", {
          gitUrl,
        });
        return { success: false, error: errorMsg };
      }

      // Determine target directory
      let resolvedPath: string;
      if (targetPath) {
        resolvedPath = resolvePathWithinProject(this.workDir, targetPath);
      } else {
        // Extract repo name from URL and use as target path
        const repoName = this.extractRepoName(gitUrl);
        resolvedPath = resolvePathWithinProject(this.workDir, repoName);
      }

      this.log2.info("Cloning git repository", {
        gitUrl,
        targetPath: resolvedPath,
      });

      // Execute git clone with depth 1 to save bandwidth/time
      const result = await this.executeGitClone(gitUrl, resolvedPath);

      if (result.code === 0) {
        this.log2.info("Git clone successful", {
          gitUrl,
          targetPath: resolvedPath,
        });
        return { success: true, output: result.stdout };
      } else {
        this.log2.error(new Error(result.stderr), "Git clone failed", {
          gitUrl,
          targetPath: resolvedPath,
        });
        return { success: false, error: result.stderr, output: result.stdout };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log2.error(new Error(errorMessage), "Git checkout failed", {
        gitUrl,
        targetPath,
      });
      return { success: false, error: errorMessage };
    }
  }

  // ========== Private Helper Methods ==========

  /**
   * Detect if a buffer contains binary data
   * Simple heuristic: Check for null bytes in first 8KB
   */
  private isBinaryFile(buffer: Buffer): boolean {
    const chunkSize = Math.min(8192, buffer.length);
    for (let i = 0; i < chunkSize; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Validate git URL format
   * Only allow HTTPS URLs
   */
  private isValidGitUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      // Only allow https protocol
      if (parsedUrl.protocol !== "https:") {
        return false;
      }
      // Must have a hostname
      if (!parsedUrl.hostname) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if URL contains private IP addresses
   * Blocks localhost, 10.x.x.x, 172.16-31.x.x, 192.168.x.x
   */
  private containsPrivateIp(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;

      // Check for localhost variations
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.startsWith("127.")
      ) {
        return true;
      }

      // Check for private IP ranges
      const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      const match = hostname.match(ipv4Regex);
      if (match) {
        const first = parseInt(match[1]);
        const second = parseInt(match[2]);

        // 10.0.0.0/8
        if (first === 10) return true;

        // 172.16.0.0/12
        if (first === 172 && second >= 16 && second <= 31) return true;

        // 192.168.0.0/16
        if (first === 192 && second === 168) return true;
      }

      return false;
    } catch {
      // If URL parsing fails, err on the side of caution
      return true;
    }
  }

  /**
   * Extract repository name from git URL
   */
  private extractRepoName(gitUrl: string): string {
    try {
      const parsedUrl = new URL(gitUrl);
      const pathname = parsedUrl.pathname;
      // Get last segment and remove .git extension if present
      const segments = pathname.split("/").filter((s) => s.length > 0);
      const lastSegment = segments[segments.length - 1];
      return lastSegment.replace(/\.git$/, "");
    } catch {
      // Fallback to timestamp-based name if parsing fails
      return `repo-${Date.now()}`;
    }
  }

  /**
   * Execute git clone command
   */
  private executeGitClone(
    gitUrl: string,
    targetPath: string,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      const gitProcess = spawn(
        "git",
        ["clone", "--depth", "1", gitUrl, targetPath],
        {
          cwd: this.workDir,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        gitProcess.kill("SIGKILL");
        reject(new Error("Git clone timeout after 5 minutes"));
      }, 300000);

      gitProcess.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        this.log2.debug("Git clone stdout", { output: output.trim() });
      });

      gitProcess.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        this.log2.debug("Git clone stderr", { output: output.trim() });
      });

      gitProcess.on("close", (code: number | null) => {
        clearTimeout(timeout);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code: code || 0,
        });
      });

      gitProcess.on("error", (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // ========== Route Handlers ==========

  private async handleSandboxMakeDir(
    request: FastifyRequest<{ Body: SandboxMakeDirRequest }>,
    reply: FastifyReply,
  ): Promise<SandboxMakeDirResponse> {
    const { path, recursive } = request.body;

    if (!path) {
      this.log2.error(
        new Error("Missing required parameter: path"),
        "Missing required parameter: path",
      );
      reply.code(400);
      return {
        status: "error",
        error: "path is required",
      };
    }

    try {
      const result = await this.makeDirectory(path, recursive);

      if (result.success) {
        return reply.code(200).send({ status: "success" });
      } else {
        this.log2.error(new Error(result.error), "Failed to create directory", {
          path,
          recursive,
        });
        reply.code(500);
        return {
          status: "error",
          error: result.error,
        };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log2.error(
        new Error(errorMessage),
        "Unexpected error in handleSandboxMakeDir",
        { path, recursive },
      );
      reply.code(500);
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private async handleSandboxReadFile(
    request: FastifyRequest<{ Body: SandboxReadFileRequest }>,
    reply: FastifyReply,
  ): Promise<SandboxReadFileResponse> {
    const { path } = request.body;

    if (!path) {
      this.log2.error(
        new Error("Missing required parameter: path"),
        "Missing required parameter: path",
      );
      reply.code(400);
      return {
        status: "error",
        error: "path is required",
      };
    }

    try {
      const result = await this.readFile(path);

      if (result.success) {
        return reply.code(200).send({
          status: "success",
          contents: result.contents,
          is_binary: result.isBinary,
        });
      } else {
        // Check if it's a file not found error
        const isNotFound =
          result.error?.includes("ENOENT") ||
          result.error?.includes("no such file");

        if (isNotFound) {
          this.log2.warn("File not found", { path });
          reply.code(404);
        } else {
          this.log2.error(new Error(result.error), "Failed to read file", {
            path,
          });
          reply.code(500);
        }

        return {
          status: "error",
          error: result.error,
        };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log2.error(
        new Error(errorMessage),
        "Unexpected error in handleSandboxReadFile",
        { path },
      );
      reply.code(500);
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private async handleSandboxWriteFile(
    request: FastifyRequest<{ Body: SandboxWriteFileRequest }>,
    reply: FastifyReply,
  ): Promise<SandboxWriteFileResponse> {
    const { path, filename, contents } = request.body;

    if (!path || !filename || contents === undefined) {
      this.log2.error(
        new Error("Missing required parameters"),
        "Missing required parameters",
        {
          hasPath: !!path,
          hasFilename: !!filename,
          hasContents: contents !== undefined,
        },
      );
      reply.code(400);
      return {
        status: "error",
        error: "path, filename, and contents are required",
      };
    }

    try {
      const result = await this.writeFile(path, filename, contents);

      if (result.success) {
        return reply.code(200).send({ status: "success" });
      } else {
        this.log2.error(new Error(result.error), "Failed to write file", {
          path,
          filename,
        });
        reply.code(500);
        return {
          status: "error",
          error: result.error,
        };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log2.error(
        new Error(errorMessage),
        "Unexpected error in handleSandboxWriteFile",
        { path, filename },
      );
      reply.code(500);
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private async handleSandboxGitCheckout(
    request: FastifyRequest<{ Body: SandboxGitCheckoutRequest }>,
    reply: FastifyReply,
  ): Promise<SandboxGitCheckoutResponse> {
    const { git_url, target_path } = request.body;

    if (!git_url) {
      this.log2.error(
        new Error("Missing required parameter: git_url"),
        "Missing required parameter: git_url",
      );
      reply.code(400);
      return {
        status: "error",
        error: "git_url is required",
      };
    }

    try {
      const result = await this.gitCheckout(git_url, target_path);

      if (result.success) {
        return reply.code(200).send({
          status: "success",
          output: result.output,
        });
      } else {
        // Check if it's a validation error (invalid URL, private IP, etc.)
        const isValidationError =
          result.error?.includes("Invalid git URL") ||
          result.error?.includes("private IP");

        if (isValidationError) {
          this.log2.warn("Git checkout validation failed", {
            git_url,
            error: result.error,
          });
          reply.code(400);
        } else {
          this.log2.error(new Error(result.error), "Git checkout failed", {
            git_url,
            target_path,
          });
          reply.code(500);
        }

        return {
          status: "error",
          error: result.error,
          output: result.output,
        };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log2.error(
        new Error(errorMessage),
        "Unexpected error in handleSandboxGitCheckout",
        { git_url, target_path },
      );
      reply.code(500);
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }
}
