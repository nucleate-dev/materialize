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
  PublicStartDevServerRequest,
  PublicUpdateFilesRequest,
} from "../types/BuildWorkerTypes.js";
import { PrototypeFileInput } from "../utils/shared-utils.js";
import { baseLogger } from "../worker.js";
import { SystemLogger } from "../loggers/SystemLogger.js";
import { CloudflareTunnelManagementService } from "./CloudflareTunnelManagementService.js";
import { CodeService } from "./CodeService.js";
import { ExpoDevServerService } from "./ExpoDevServerService.js";
import { SandboxService } from "./SandboxService.js";
import { SupabaseClientService } from "./SupabaseClientService.js";

export class PublicApiService {
  private readonly expoDevServerService: ExpoDevServerService;
  private readonly sandboxService: SandboxService;
  private readonly cloudflareTunnelManagementService: CloudflareTunnelManagementService;
  private readonly codeService: CodeService;
  private readonly workDir: string;
  private readonly supabaseClientService: SupabaseClientService;

  constructor(
    expoDevServerService: ExpoDevServerService,
    sandboxService: SandboxService,
    cloudflareTunnelManagementService: CloudflareTunnelManagementService,
    codeService: CodeService,
    workDir: string,
    supabaseClientService: SupabaseClientService,
  ) {
    this.expoDevServerService = expoDevServerService;
    this.sandboxService = sandboxService;
    this.cloudflareTunnelManagementService = cloudflareTunnelManagementService;
    this.codeService = codeService;
    this.workDir = workDir;
    this.supabaseClientService = supabaseClientService;
  }

  public registerRoutes(app: FastifyInstance): void {
    // POST /start-dev-server
    app.post<{ Body: PublicStartDevServerRequest }>(
      "/start-dev-server",
      this.startDevServerNew.bind(this),
    );

    // POST /update-files
    app.post<{ Body: PublicUpdateFilesRequest }>(
      "/update-files",
      this.updateFiles.bind(this),
    );

    // POST /dev-server (legacy route - keeping for backward compatibility)
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

    app.post("/allocate", this.allocate.bind(this));
  }

  private async allocate(
    request: FastifyRequest<{ Body: PublicAllocateRequest }>,
    reply: FastifyReply,
  ): Promise<PublicAllocateResponse> {
    const {
      accessKeyId,
      secretAccessKey,
      sessionToken,
      prototypeId,
      userId,
      cloudflare_tunnel_token,
      orchestration_token,
    } = request.body;

    // Import setWorkerContext dynamically to avoid circular dependency
    const { setWorkerContext } = await import("../worker.js");

    // Set worker context so all future requests include userId and prototypeId in logs
    setWorkerContext(userId, prototypeId);

    // Also update current request's logger
    request.log2 = request.log2.child({
      userId,
      prototypeId,
    });

    // Extract JWT token from Authorization header
    const authHeader = request.headers.authorization;
    let jwtToken: string | undefined;

    if (authHeader) {
      // Support both "Bearer <token>" and raw token formats
      if (authHeader.startsWith("Bearer ")) {
        jwtToken = authHeader.substring(7);
      } else {
        jwtToken = authHeader;
      }
    }

    // JWT token is required - fail if not provided
    if (!jwtToken) {
      const errorMessage = "No JWT token provided in Authorization header";
      request.log2.error(new Error(errorMessage), "Allocation failed");
      return reply.code(401).send({
        status: "error",
        error: "Authentication required",
        details: errorMessage,
      });
    }

    // Create authenticated Supabase client - fail allocation if this fails
    try {
      this.supabaseClientService.refreshClientWithToken(jwtToken);
      request.log2.consoleLogDevOnly(
        "info",
        "Initialized authenticated Supabase client for worker",
      );
    } catch (supabaseError) {
      const errorMessage =
        supabaseError instanceof Error
          ? supabaseError.message
          : String(supabaseError);
      request.log2.error(
        supabaseError instanceof Error
          ? supabaseError
          : new Error(String(supabaseError)),
        "Failed to initialize Supabase client - allocation failed",
      );
      return reply.code(500).send({
        status: "error",
        error: "Failed to initialize Supabase client",
        details: errorMessage,
      });
    }

    try {
      // Only set up S3 client if credentials are provided
      if (accessKeyId && secretAccessKey && sessionToken) {
        const scopedS3 = new S3Client({
          region: process.env.AWS_REGION!,
          credentials: { accessKeyId, secretAccessKey, sessionToken },
        });
        this.expoDevServerService.setS3Client(scopedS3);
        request.log2.consoleLogDevOnly(
          "info",
          "Allocated worker to prototype for S3 access",
        );
      } else {
        request.log2.info(
          "No S3 credentials provided, skipping S3 client setup (dev mode)",
        );
      }

      // If cloudflare tunnel token is provided, start the tunnel
      let tunnelStatus: "connected" | "error" | "timeout" | "not_started" =
        "not_started";
      let tunnelMessage: string | undefined;

      if (cloudflare_tunnel_token) {
        request.log2.consoleLogDevOnly(
          "info",
          "Starting Cloudflare tunnel setup",
        );
        try {
          const result =
            await this.cloudflareTunnelManagementService.createTunnel(
              cloudflare_tunnel_token,
            );
          tunnelStatus = result.status;
          tunnelMessage = result.message;

          if (tunnelStatus === "connected") {
            request.log2.info("Cloudflare tunnel connected successfully");
          } else if (tunnelStatus === "timeout") {
            request.log2.warn("Cloudflare tunnel connection timed out");
          } else if (tunnelStatus === "error") {
            request.log2.error(
              new Error(tunnelMessage ?? "Cloudflare tunnel failed to connect"),
              "Cloudflare tunnel connection error",
            );
          }
        } catch (tunnelError) {
          tunnelStatus = "error";
          tunnelMessage =
            tunnelError instanceof Error
              ? tunnelError.message
              : "Failed to start Cloudflare tunnel";
          request.log2.error(tunnelError, "Failed to start Cloudflare tunnel");
        }
      }

      // Store orchestration token if provided
      if (orchestration_token) {
        this.codeService.setOrchestrationToken(orchestration_token);
        request.log2.consoleLogDevOnly(
          "info",
          "Orchestration token received and stored in CodeService",
        );
      } else {
        request.log2.error(
          new Error("No orchestration token provided"),
          "No orchestration token provided",
        );
      }

      // Restore Claude session files from Supabase for this prototype
      // TODO: move this to the file sync service initial sync functionality
      await this.restoreClaudeSessions(prototypeId, request.log2);

      return reply.status(200).send({
        status: "ok",
        tunnel_status: tunnelStatus,
        tunnel_message: tunnelMessage,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      request.log2.error(error, "Failed to allocate worker to prototype", {
        errorMessage,
      });
      return reply.code(500).send({
        status: "error",
        error: "Failed to allocate worker to prototype",
        details: errorMessage,
      });
    }
  }

  private async startDevServerNew(
    request: FastifyRequest<{ Body: PublicStartDevServerRequest }>,
    reply: FastifyReply,
  ): Promise<PublicDevServerStartResponse> {
    const { prototype_id, framework } = request.body;

    if (!prototype_id || !framework) {
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
      };
    }

    try {
      const startResponse = await this.expoDevServerService.startDevServer(
        prototype_id,
        framework,
        request.log2,
      );

      // Set appropriate status code based on response
      if (!startResponse.success) {
        reply.code(500);
      }

      // Convert response format from ExpoDevServerService to PublicApiService format
      return {
        status: startResponse.success ? "success" : "error",
        tunnel_url: startResponse.tunnelUrl,
        build_errors: startResponse.build_errors || [],
        build_warnings: startResponse.build_warnings || [],
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      request.log2.error(
        new Error(errorMessage),
        "Internal server error in startDevServerNew",
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

  private async updateFiles(
    request: FastifyRequest<{ Body: PublicUpdateFilesRequest }>,
    reply: FastifyReply,
  ): Promise<PublicDevServerStartResponse> {
    try {
      const startResponse =
        await this.expoDevServerService.updateDevServerFiles(
          request.log2,
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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      request.log2.error(
        new Error(errorMessage),
        "Internal server error in updateFiles",
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

  private async startDevServer(
    request: FastifyRequest<{ Body: PublicDevServerStartRequest }>,
    reply: FastifyReply,
  ): Promise<PublicDevServerStartResponse> {
    const { prototype_id, framework } = request.body;

    if (!prototype_id || !framework) {
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
      };
    }

    try {
      if (request.body.file_scope === "complete") {
        // For starting dev server, files will be fetched from Supabase directly in the ExpoDevServerService
        const startResponse = await this.expoDevServerService.startDevServer(
          prototype_id,
          framework,
          request.log2,
        );

        // Set appropriate status code based on response
        if (!startResponse.success) {
          reply.code(500);
        }

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
            request.log2,
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
      // Invalid file scope
      reply.code(400);
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
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<PublicDevServerRestartResponse> {
    await this.expoDevServerService.restartDevServer(request.log2);
    return { status: "success" } as PublicDevServerRestartResponse;
  }

  /**
   * Internal method to restart dev server (called by MCP tools, bypasses HTTP layer)
   */
  public async restartDevServerInternal(logger: SystemLogger): Promise<void> {
    await this.expoDevServerService.restartDevServer(logger);
  }

  private async stopDevServer(
    request: FastifyRequest<{ Body: PublicDevServerStopRequest }>,
    reply: FastifyReply,
  ): Promise<PublicDevServerStopResponse> {
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
      request.log2.info("Requested Cloudflare tunnel shutdown");
      await this.cloudflareTunnelManagementService.killTunnel();
    } catch (tunnelError) {
      request.log2.error(
        tunnelError instanceof Error
          ? tunnelError
          : new Error(String(tunnelError)),
        "Failed to stop Cloudflare tunnel during stopDevServer",
      );
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
   *   2. Reads the worker's directory to confirm the dev server has hydrated files.
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
      const projectDir = this.workDir;

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
            request.log2,
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

  // Start background build and deploy process
  private async startBackgroundBuildAndDeploy(): Promise<void> {
    try {
      const buildErrors: CodeError[] = [];
      const buildWarnings: CodeWarning[] = [];
      const projectDir = this.workDir;
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
                baseLogger,
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
        await this.expoDevServerService.shutdown(baseLogger);
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

      // Restore the built version after shutdown
      if (builtVersion) {
        this.expoDevServerService.getState().builtVersion = builtVersion;
      }

      // Clear operation state on success
      this.expoDevServerService.getState().clearOperation();
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
        await this.expoDevServerService.shutdown(baseLogger);
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
        "../utils/shared-utils.js"
      );

      // Restore all session files from Storage
      const result = await restoreClaudeSessionsFromSupabase(
        prototypeId,
        this.supabaseClientService.getClient(),
        log2,
      );

      // Register restored session IDs with CodeService for validation
      if (result.restoredSessionIds.length > 0) {
        this.codeService.registerValidSessionIds(result.restoredSessionIds);
        log2.consoleLogDevOnly(
          "info",
          "Registered restored Claude sessions with CodeService",
          {
            prototypeId,
            restoredCount: result.restoredSessionIds.length,
          },
        );
      }

      // Log any errors but don't fail the allocation
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
