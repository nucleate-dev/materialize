// PublicApiService.ts
import { S3Client } from "@aws-sdk/client-s3";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import {
  CodeError,
  CodeWarning,
  DevServerStatus,
  OperationStatus,
  PrototypeAssetInputWithContent,
  PublicAllocateRequest,
  PublicAllocateResponse,
  PublicBuildAndDeployRequest,
  PublicBuildAndDeployResponse,
  PublicDevServerRestartResponse,
  PublicDevServerStartRequest,
  PublicDevServerStartResponse,
  PublicDevServerStopRequest,
  PublicDevServerStopResponse,
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
import { PrototypeFileInput } from "../utils/shared-utils.js";
import { baseLogger } from "../worker.js";
import { ExpoDevServerService } from "./ExpoDevServerService.js";
import { SandboxService } from "./SandboxService.js";

export class PublicApiService {
  private readonly expoDevServerService: ExpoDevServerService;
  private readonly sandboxService: SandboxService;
  private readonly workDir: string;

  constructor(
    expoDevServerService: ExpoDevServerService,
    sandboxService: SandboxService,
    workDir: string,
  ) {
    this.expoDevServerService = expoDevServerService;
    this.sandboxService = sandboxService;
    this.workDir = workDir;
  }

  public registerRoutes(app: FastifyInstance): void {
    // POST /dev-server
    app.post<{ Body: PublicDevServerStartRequest }>(
      "/dev-server",
      this.startDevServer.bind(this),
    );

    // DELETE /dev-server
    app.delete<{ Body: PublicDevServerStopRequest }>(
      "/dev-server",
      this.stopDevServer.bind(this),
    );

    app.post("/dev-server/restart", this.restartDevServer.bind(this));

    // POST /build-and-deploy
    app.post<{ Body: PublicBuildAndDeployRequest }>(
      "/build-and-deploy",
      this.buildAndDeploy.bind(this),
    );

    // POST /run-command
    app.post<{ Body: PublicRunCommandRequest }>(
      "/run-command",
      this.runCommand.bind(this),
    );

    app.post("/allocate", this.allocate.bind(this));

    // Sandbox API routes
    app.post<{ Body: SandboxMakeDirRequest }>(
      "/sandbox/make-dir",
      this.sandboxMakeDir.bind(this),
    );

    app.post<{ Body: SandboxReadFileRequest }>(
      "/sandbox/read-file",
      this.sandboxReadFile.bind(this),
    );

    app.post<{ Body: SandboxWriteFileRequest }>(
      "/sandbox/write-file",
      this.sandboxWriteFile.bind(this),
    );

    app.post<{ Body: SandboxGitCheckoutRequest }>(
      "/sandbox/git-checkout",
      this.sandboxGitCheckout.bind(this),
    );
  }

  private async allocate(
    request: FastifyRequest<{ Body: PublicAllocateRequest }>,
    reply: FastifyReply,
  ): Promise<PublicAllocateResponse> {
    const { accessKeyId, secretAccessKey, sessionToken, prototypeId, userId } =
      request.body;

    // Import the setWorkerContext function dynamically to avoid circular dependency
    const { setWorkerContext } = await import("../worker.js");

    // Set worker context so all future requests include userId and prototypeId in logs
    setWorkerContext(userId, prototypeId);

    // Also update current request's logger
    request.log2 = request.log2.child({
      userId,
      prototypeId,
    });

    try {
      const scopedS3 = new S3Client({
        region: process.env.AWS_REGION!,
        credentials: { accessKeyId, secretAccessKey, sessionToken },
      });
      this.expoDevServerService.setS3Client(scopedS3);
      request.log2.info("Allocated worker to prototype for S3 access");
      return reply.status(200).send({ status: "ok" });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      request.log2.error(error, "Failed to allocate worker to prototype", {
        errorMessage,
      });
      return reply.code(500).send({
        status: "error",
        error: "Failed to create scoped S3 client",
        details: errorMessage,
      });
    }
  }

  private async startDevServer(
    request: FastifyRequest<{ Body: PublicDevServerStartRequest }>,
    reply: FastifyReply,
  ): Promise<PublicDevServerStartResponse> {
    try {
      if (request.body.file_scope === "complete") {
        const startResponse = await this.expoDevServerService.startDevServer(
          request,
          reply,
        );

        // Convert response format from ExpoDevServerService to PublicApiService format
        return {
          status: startResponse.success ? "success" : "error",
          tunnel_url: startResponse.tunnelUrl,
          build_errors: startResponse.build_errors || [],
          build_warnings: startResponse.build_warnings || [],
        };
      } else if (request.body.file_scope === "updates") {
        const startResponse =
          await this.expoDevServerService.updateDevServerFiles(
            request.body.files,
            request.body.assets,
            request.body?.deleted_files || [],
          );
        return {
          status: startResponse.success ? "success" : "error",
          tunnel_url: startResponse.tunnelUrl,
          build_errors: startResponse.build_errors || [],
          build_warnings: startResponse.build_warnings || [],
        };
      }
      // Direct call to ExpoDevServerService with the same request
      return {
        status: "error",
        build_errors: [
          {
            message: "Invalid file scope",
            type: "build",
          },
        ],
        build_warnings: [],
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
      reply.code(500);
      return {
        status: "error",
        build_errors: [
          {
            message: `Internal server error: ${errorMessage}`,
            type: "build",
          },
        ],
        build_warnings: [],
      };
    }
  }

  private async restartDevServer(
    _request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<PublicDevServerRestartResponse> {
    await this.expoDevServerService.restartDevServer();
    return { status: "success" } as PublicDevServerRestartResponse;
  }

  private async stopDevServer(
    request: FastifyRequest<{ Body: PublicDevServerStopRequest }>,
    reply: FastifyReply,
  ): Promise<PublicDevServerStopResponse> {
    // Log memory usage for monitoring
    const memUsage = process.memoryUsage();
    request.log2.info("Memory usage at stopDevServer", {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    });

    const devServerState = this.expoDevServerService.getState();
    if (devServerState.devServerStatus === DevServerStatus.STOPPED) {
      return {
        status: "success",
        build_errors: [],
        build_warnings: [],
        server_operation_status: devServerState.currentOperation,
        server_status: devServerState.devServerStatus,
        prototypeId: devServerState.prototypeId,
        version: devServerState.builtVersion,
      } as PublicDevServerStopResponse;
    }

    if (
      devServerState.currentOperation === OperationStatus.BUILDING ||
      devServerState.currentOperation === OperationStatus.DEPLOYING ||
      devServerState.currentOperation ===
        OperationStatus.BUILDING_AND_DEPLOYING ||
      devServerState.currentOperation === OperationStatus.STOPPING
    ) {
      return {
        status: "error",
        build_errors: [],
        build_warnings: [],
        server_operation_status: devServerState.currentOperation,
        server_status: devServerState.devServerStatus,
        prototypeId: devServerState.prototypeId,
      } as PublicDevServerStopResponse;
    }

    try {
      // Double-check operation status to catch any edge cases
      if (this.expoDevServerService.getState().isOperationInProgress()) {
        return {
          status: "error",
          build_errors: [],
          build_warnings: [],
          server_operation_status:
            this.expoDevServerService.getState().currentOperation,
          server_status: this.expoDevServerService.getState().devServerStatus,
        };
      }

      // Set operation status IMMEDIATELY to prevent race condition
      // This must happen synchronously before any async work begins
      this.expoDevServerService
        .getState()
        .setOperation(OperationStatus.BUILDING_AND_DEPLOYING);

      // Start build/deploy asynchronously - don't await
      this.startBackgroundBuildAndDeploy();

      // Return error response because the server cannot be killed yet.
      return {
        status: "error",
        build_errors: [],
        build_warnings: [],
        // Get new operation statuses (should now be BUILDING_AND_DEPLOYING)
        server_operation_status:
          this.expoDevServerService.getState().currentOperation,
        server_status: this.expoDevServerService.getState().devServerStatus,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      request.log2.error(
        new Error(errorMessage),
        "Internal server error in stopDevServer",
        { stack: errorStack },
      );
      reply.code(500);
      return {
        status: "error",
        build_errors: [
          {
            message: `Internal server error: ${errorMessage}`,
            type: "build",
          },
        ],
        build_warnings: [],
        server_operation_status: devServerState.currentOperation,
        server_status: this.expoDevServerService.getState().devServerStatus,
      };
    }
  }

  /**
   * Kick off a one-shot build for the requesting prototype using the assets currently on disk.
   *
   * The handler intentionally:
   *   1. Validates that the caller specified both the prototype id and framework.
   *   2. Reads the worker's "project" directory to confirm the dev server has hydrated files.
   *   3. Invokes ExpoDevServerService.buildAndDeployProjectCore with the caller-provided prototype id
   *      (rather than relying on mutable worker state) so the build uploads to the expected S3 prefix.
   *   4. Parses the build log for structured errors/warnings that align with the public API schema.
   */
  private async buildAndDeploy(
    request: FastifyRequest<{ Body: PublicBuildAndDeployRequest }>,
    reply: FastifyReply,
  ): Promise<PublicBuildAndDeployResponse> {
    const { prototype_id, framework } = request.body;

    if (!prototype_id || !framework) {
      baseLogger.error(
        new Error("Missing required parameters"),
        "Missing required parameters",
        { prototype_id, framework },
      );
      reply.code(400);
      return {
        status: "error",
        build_errors: [
          {
            message: "prototype_id and framework are required",
            type: "build",
          },
        ],
        build_warnings: [],
        version: undefined,
      };
    }

    try {
      const buildErrors: CodeError[] = [];
      const buildWarnings: CodeWarning[] = [];
      let version: string | undefined;

      // Check if project directory exists and read files from disk (fixed path)
      const projectDir = path.join(this.workDir, "project");

      try {
        await fs.stat(projectDir);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        request.log2.error(
          new Error(errorMessage),
          "Project directory not found",
          { projectDir },
        );
        return reply.code(404).send({
          status: "error",
          build_errors: [
            {
              message:
                "Project not found. Please start dev server first to create project files.",
              type: "build",
            },
          ],
          build_warnings: [],
          version: undefined,
        });
      }

      // Read all files from the project directory
      const { files } = await this.readAllFilesFromDirectory(projectDir);

      if (files.length === 0) {
        request.log2.error(
          new Error("No files found in project directory"),
          "No files found in project directory",
          { projectDir },
        );
        return reply.code(400).send({
          status: "error",
          build_errors: [
            {
              message: "No files found in project directory",
              type: "build",
            },
          ],
          build_warnings: [],
          version: undefined,
        });
      }

      // Use ExpoDevServerService to build and deploy
      let buildUrl: string | undefined;

      try {
        const buildResponse =
          await this.expoDevServerService.buildAndDeployProjectCore(
            prototype_id,
          );

        if (buildResponse.success && buildResponse.buildUrl) {
          buildUrl = buildResponse.buildUrl;
          version = buildResponse.version;

          // Parse build log for errors and warnings
          if (buildResponse.buildLog) {
            this.parseBuildLogForErrors(
              buildResponse.buildLog,
              buildErrors,
              buildWarnings,
            );
          }
        } else if (buildResponse.error) {
          request.log2.error(
            new Error(buildResponse.error),
            "Build and deploy failed",
            { buildLog: buildResponse.buildLog },
          );
          buildErrors.push({
            message: `Build and deploy failed: ${buildResponse.error}`,
            type: "build",
          });

          // Parse build log for additional context
          if (buildResponse.buildLog) {
            this.parseBuildLogForErrors(
              buildResponse.buildLog,
              buildErrors,
              buildWarnings,
            );
          }
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        request.log2.error(
          new Error(errorMessage),
          "Build and deploy process failed",
          { stack: errorStack },
        );
        buildErrors.push({
          message: `Build and deploy process failed: ${errorMessage}`,
          type: "build",
        });
      }

      return {
        status: buildErrors.length > 0 ? "error" : "success",
        build_url: buildUrl,
        build_errors: buildErrors,
        build_warnings: buildWarnings,
        version: version,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      request.log2.error(
        new Error(errorMessage),
        "Internal server error in buildAndDeploy",
        { stack: errorStack },
      );
      reply.code(500);
      return {
        status: "error",
        build_errors: [
          {
            message: `Internal server error: ${errorMessage}`,
            type: "build",
          },
        ],
        build_warnings: [],
        version: undefined,
      };
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
      const result = await this.expoDevServerService.runCommand(
        command,
        args || [],
        cwd,
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

  // Start background build and deploy process
  private async startBackgroundBuildAndDeploy(): Promise<void> {
    try {
      // Log memory at start of background build
      const memUsage = process.memoryUsage();
      baseLogger.info("Memory usage at background build start", {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
      });

      const buildErrors: CodeError[] = [];
      const buildWarnings: CodeWarning[] = [];
      const projectDir = path.join(this.workDir, "project");
      try {
        // Read all files from the project directory
        const { files } = await this.readAllFilesFromDirectory(projectDir);

        if (files.length === 0) {
          baseLogger.error(
            new Error("No files found in project directory"),
            "No files found in project directory",
            { projectDir },
          );
          buildErrors.push({
            message: "No files found in project directory",
            type: "build",
          });
        } else {
          const activePrototypeId =
            this.expoDevServerService.getState().prototypeId;

          if (!activePrototypeId) {
            const errorMessage =
              "Cannot build and deploy: prototype ID is not set";
            baseLogger.error(
              new Error(errorMessage),
              "Background build failed",
              { projectDir },
            );
            buildErrors.push({
              message: errorMessage,
              type: "build",
            });
          } else {
            // Use ExpoDevServerService to build and deploy
            const buildResponse =
              await this.expoDevServerService.buildAndDeployProjectCore(
                activePrototypeId,
              );

            if (buildResponse.success && buildResponse.buildUrl) {
              // Parse build log for errors and warnings
              if (buildResponse.buildLog) {
                this.parseBuildLogForErrors(
                  buildResponse.buildLog,
                  buildErrors,
                  buildWarnings,
                );
              }
            } else if (buildResponse.error) {
              baseLogger.error(
                new Error(buildResponse.error),
                "Background build failed",
                { buildLog: buildResponse.buildLog },
              );
              buildErrors.push({
                message: `Build failed: ${buildResponse.error}`,
                type: "build",
              });

              // Parse build log for additional context
              if (buildResponse.buildLog) {
                this.parseBuildLogForErrors(
                  buildResponse.buildLog,
                  buildErrors,
                  buildWarnings,
                );
              }
            }
          }
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        baseLogger.error(
          new Error(errorMessage),
          "Background build process failed",
          { stack: errorStack },
        );
        buildErrors.push({
          message: `Build process failed: ${errorMessage}`,
          type: "build",
        });
      }

      // Always stop the dev server after build completes (success or failure)
      // Preserve the built version before shutdown (shutdown resets it to null)
      const builtVersion = this.expoDevServerService.getState().builtVersion;

      try {
        await this.expoDevServerService.shutdown();
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        baseLogger.error(
          new Error(errorMessage),
          "Failed to stop dev server after background build",
          { stack: errorStack },
        );
      }

      // Log memory after shutdown
      const memUsageAfterShutdown = process.memoryUsage();
      baseLogger.info("Memory usage after shutdown", {
        heapUsed: `${Math.round(memUsageAfterShutdown.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsageAfterShutdown.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsageAfterShutdown.rss / 1024 / 1024)}MB`,
        external: `${Math.round(memUsageAfterShutdown.external / 1024 / 1024)}MB`,
      });

      // Restore the built version after shutdown
      if (builtVersion) {
        this.expoDevServerService.getState().builtVersion = builtVersion;
      }

      // Clear operation state on success
      this.expoDevServerService.getState().clearOperation();

      // Log memory at end of background build
      const memUsageEnd = process.memoryUsage();
      baseLogger.info("Memory usage at end of background build", {
        heapUsed: `${Math.round(memUsageEnd.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsageEnd.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsageEnd.rss / 1024 / 1024)}MB`,
        external: `${Math.round(memUsageEnd.external / 1024 / 1024)}MB`,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      baseLogger.error(
        new Error(errorMessage),
        "Critical error in background build and deploy",
        { stack: errorStack },
      );

      // Ensure dev server is stopped even on critical failures
      // Preserve the built version before shutdown (shutdown resets it to null)
      const builtVersion = this.expoDevServerService.getState().builtVersion;

      try {
        await this.expoDevServerService.shutdown();
      } catch (shutdownError: unknown) {
        const errorMessage =
          shutdownError instanceof Error
            ? shutdownError.message
            : String(shutdownError);
        baseLogger.error(
          new Error(errorMessage),
          "Failed to shutdown dev server after critical error",
        );
      }

      // Restore the built version after shutdown
      if (builtVersion) {
        this.expoDevServerService.getState().builtVersion = builtVersion;
      }
    }
  }

  // Helper methods
  private async readAllFilesFromDirectory(directoryPath: string): Promise<{
    assets: PrototypeAssetInputWithContent[];
    files: PrototypeFileInput[];
  }> {
    const assets: PrototypeAssetInputWithContent[] = [];
    const files: PrototypeFileInput[] = [];

    const readDirectory = async (
      currentPath: string,
      relativePath: string = "",
    ): Promise<void> => {
      try {
        const items = await fs.readdir(currentPath);

        for (const item of items) {
          // Skip node_modules and other build artifacts
          if (
            ["node_modules", "dist", ".expo", ".git", ".next"].includes(item)
          ) {
            continue;
          }

          const fullPath = path.join(currentPath, item);
          const itemRelativePath = path.join(relativePath, item);
          const stats = await fs.stat(fullPath);

          if (stats.isDirectory()) {
            await readDirectory(fullPath, itemRelativePath);
          } else if (stats.isFile()) {
            // Detect if file is binary and handle accordingly
            const isBinary = this.detectBinaryFile(fullPath, item);

            if (isBinary) {
              const binaryContent = await fs.readFile(fullPath);
              assets.push({
                name: itemRelativePath,
                contents: binaryContent.toString("base64"),
                storage_url: "",
                prototype_id: "",
                created_at: "",
                updated_at: "",
                id: "",
              });
            } else {
              const content = await fs.readFile(fullPath, "utf8");
              files.push({
                name: itemRelativePath,
                contents: content,
              });
            }
          }
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        baseLogger.warn("Failed to read directory", {
          currentPath,
          error: errorMessage,
        });
      }
    };

    await readDirectory(directoryPath);
    return {
      files,
      assets,
    };
  }

  private parseBuildLogForErrors(
    buildLog: Array<{
      step: string;
      success: boolean;
      timestamp: string;
      output: string;
      error: string;
    }>,
    buildErrors: CodeError[],
    buildWarnings: CodeWarning[],
  ): void {
    for (const entry of buildLog) {
      if (!entry.success && entry.error) {
        // Try to parse TypeScript/JavaScript errors
        const errorMatch = entry.error.match(
          /(.+\.tsx?):(\d+):(\d+)\s*-\s*error\s*TS(\d+):\s*(.+)/,
        );
        if (errorMatch) {
          buildErrors.push({
            message: errorMatch[5],
            file: errorMatch[1],
            line: parseInt(errorMatch[2]),
            column: parseInt(errorMatch[3]),
            type: "syntax",
          });
        } else {
          buildErrors.push({
            message: entry.error,
            type: "build",
          });
        }
      }

      // Parse warnings from output
      if (entry.output && entry.output.includes("warning")) {
        const lines = entry.output.split("\n");
        for (const line of lines) {
          if (line.toLowerCase().includes("warning")) {
            buildWarnings.push({
              message: line.trim(),
              type: "build",
            });
          }
        }
      }
    }
  }

  private detectBinaryFile(_filePath: string, fileName: string): boolean {
    // Define common binary file extensions
    const binaryExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".ico",
      ".svg",
      ".webp",
      ".bmp",
      ".tiff",
      ".woff",
      ".woff2",
      ".ttf",
      ".otf",
      ".eot",
      ".mp4",
      ".webm",
      ".mov",
      ".avi",
      ".mkv",
      ".mp3",
      ".wav",
      ".ogg",
      ".m4a",
      ".flac",
      ".pdf",
      ".zip",
      ".tar",
      ".gz",
      ".7z",
      ".rar",
      ".exe",
      ".dll",
      ".so",
      ".dylib",
      ".bin",
      ".dat",
      ".db",
      ".sqlite",
    ];

    const ext = path.extname(fileName).toLowerCase();
    return binaryExtensions.includes(ext);
  }

  // ========== Sandbox API Handlers ==========

  private async sandboxMakeDir(
    request: FastifyRequest<{ Body: SandboxMakeDirRequest }>,
    reply: FastifyReply,
  ): Promise<SandboxMakeDirResponse> {
    const { path, recursive } = request.body;

    if (!path) {
      request.log2.error(
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
      const result = await this.sandboxService.makeDirectory(path, recursive);

      if (result.success) {
        return reply.code(200).send({ status: "success" });
      } else {
        request.log2.error(
          new Error(result.error),
          "Failed to create directory",
          { path, recursive },
        );
        reply.code(500);
        return {
          status: "error",
          error: result.error,
        };
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      request.log2.error(
        new Error(errorMessage),
        "Unexpected error in sandboxMakeDir",
        { path, recursive },
      );
      reply.code(500);
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private async sandboxReadFile(
    request: FastifyRequest<{ Body: SandboxReadFileRequest }>,
    reply: FastifyReply,
  ): Promise<SandboxReadFileResponse> {
    const { path } = request.body;

    if (!path) {
      request.log2.error(
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
      const result = await this.sandboxService.readFile(path);

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
          request.log2.warn("File not found", { path });
          reply.code(404);
        } else {
          request.log2.error(new Error(result.error), "Failed to read file", {
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
      request.log2.error(
        new Error(errorMessage),
        "Unexpected error in sandboxReadFile",
        { path },
      );
      reply.code(500);
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private async sandboxWriteFile(
    request: FastifyRequest<{ Body: SandboxWriteFileRequest }>,
    reply: FastifyReply,
  ): Promise<SandboxWriteFileResponse> {
    const { path, filename, contents } = request.body;

    if (!path || !filename || contents === undefined) {
      request.log2.error(
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
      const result = await this.sandboxService.writeFile(
        path,
        filename,
        contents,
      );

      if (result.success) {
        return reply.code(200).send({ status: "success" });
      } else {
        request.log2.error(new Error(result.error), "Failed to write file", {
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
      request.log2.error(
        new Error(errorMessage),
        "Unexpected error in sandboxWriteFile",
        { path, filename },
      );
      reply.code(500);
      return {
        status: "error",
        error: errorMessage,
      };
    }
  }

  private async sandboxGitCheckout(
    request: FastifyRequest<{ Body: SandboxGitCheckoutRequest }>,
    reply: FastifyReply,
  ): Promise<SandboxGitCheckoutResponse> {
    const { git_url, target_path } = request.body;

    if (!git_url) {
      request.log2.error(
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
      const result = await this.sandboxService.gitCheckout(
        git_url,
        target_path,
      );

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
          request.log2.warn("Git checkout validation failed", {
            git_url,
            error: result.error,
          });
          reply.code(400);
        } else {
          request.log2.error(new Error(result.error), "Git checkout failed", {
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
      request.log2.error(
        new Error(errorMessage),
        "Unexpected error in sandboxGitCheckout",
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
