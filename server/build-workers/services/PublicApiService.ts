// PublicApiService.ts
import { S3Client } from "@aws-sdk/client-s3";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import {
  APIResponse,
  DevServerStatus,
  OperationStatus,
  PrototypeAssetInputWithContent,
  PublicAllocateRequest,
  PublicAllocateSuccessResponse,
  PublicBuildAndDeployRequest,
  PublicBuildAndDeploySuccessResponse,
  PublicDevServerRestartSuccessResponse,
  PublicDevServerStartRequest,
  PublicDevServerStartSuccessResponse,
  PublicDevServerStopRequest,
  PublicDevServerStopSuccessResponse,
  PublicStartDevServerRequest,
  PublicUpdateFilesRequest,
  StandardErrorResponse,
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
  ): Promise<
    APIResponse<PublicAllocateSuccessResponse, StandardErrorResponse>
  > {
    const {
      accessKeyId,
      secretAccessKey,
      sessionToken,
      prototypeId,
      userId,
      cloudflare_tunnel_token,
      orchestration_token,
      aak,
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
      reply.code(401);
      return {
        data: null,
        error: {
          error: "Authentication required",
          message: "No JWT token provided in Authorization header",
          details: errorMessage,
        },
      };
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
      reply.code(500);
      return {
        data: null,
        error: {
          error: "Failed to initialize Supabase client",
          message: "Failed to initialize Supabase client",
          details: errorMessage,
        },
      };
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

      if (aak) {
        this.codeService.setAak(aak);
        request.log2.consoleLogDevOnly(
          "info",
          "Anthropic API key received and stored in CodeService",
        );
      } else {
        request.log2.warn("No Anthropic API key provided");
      }

      // Restore Claude session files from Supabase for this prototype
      // TODO: move this to the file sync service initial sync functionality
      await this.restoreClaudeSessions(prototypeId, request.log2);

      reply.status(200);
      return {
        data: {
          tunnel_status: tunnelStatus,
          tunnel_message: tunnelMessage,
        },
        error: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      request.log2.error(error, "Failed to allocate worker to prototype", {
        errorMessage,
      });
      reply.code(500);
      return {
        data: null,
        error: {
          error: "Failed to allocate worker to prototype",
          message: "Failed to allocate worker to prototype",
          details: errorMessage,
        },
      };
    }
  }

  private async startDevServerNew(
    request: FastifyRequest<{ Body: PublicStartDevServerRequest }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<PublicDevServerStartSuccessResponse, StandardErrorResponse>
  > {
    const { prototype_id, framework } = request.body;

    if (!prototype_id || !framework) {
      reply.code(400);
      return {
        data: null,
        error: {
          error: "Missing required parameters",
          message: "prototype_id and framework are required",
        },
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
        return {
          data: null,
          error: {
            error: "Dev server start failed",
            message: "Failed to start dev server",
          },
        };
      }

      // Convert response format from ExpoDevServerService to PublicApiService format
      reply.status(200);
      return {
        data: {
          tunnel_url: startResponse.tunnelUrl,
        },
        error: null,
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
        data: null,
        error: {
          error: "Internal server error",
          message: errorMessage,
        },
      };
    }
  }

  private async updateFiles(
    request: FastifyRequest<{ Body: PublicUpdateFilesRequest }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<PublicDevServerStartSuccessResponse, StandardErrorResponse>
  > {
    try {
      const startResponse =
        await this.expoDevServerService.updateDevServerFiles(
          request.log2,
          request.body.files,
          request.body.assets,
          request.body?.deleted_files || [],
        );

      if (!startResponse.success) {
        reply.code(500);
        return {
          data: null,
          error: {
            error: "File update failed",
            message: "Failed to update files on dev server",
          },
        };
      }

      reply.status(200);
      return {
        data: {
          tunnel_url: startResponse.tunnelUrl,
        },
        error: null,
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
        data: null,
        error: {
          error: "Internal server error",
          message: errorMessage,
        },
      };
    }
  }

  private async startDevServer(
    request: FastifyRequest<{ Body: PublicDevServerStartRequest }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<PublicDevServerStartSuccessResponse, StandardErrorResponse>
  > {
    const { prototype_id, framework } = request.body;

    if (!prototype_id || !framework) {
      reply.code(400);
      return {
        data: null,
        error: {
          error: "Missing required parameters",
          message: "prototype_id and framework are required",
        },
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
          return {
            data: null,
            error: {
              error: "Dev server start failed",
              message: "Failed to start dev server",
            },
          };
        }

        // Convert response format from ExpoDevServerService to PublicApiService format
        reply.status(200);
        return {
          data: {
            tunnel_url: startResponse.tunnelUrl,
          },
          error: null,
        };
      } else if (request.body.file_scope === "updates") {
        const startResponse =
          await this.expoDevServerService.updateDevServerFiles(
            request.log2,
            request.body.files,
            request.body.assets,
            request.body?.deleted_files || [],
          );

        if (!startResponse.success) {
          reply.code(500);
          return {
            data: null,
            error: {
              error: "File update failed",
              message: "Failed to update files on dev server",
            },
          };
        }

        reply.status(200);
        return {
          data: {
            tunnel_url: startResponse.tunnelUrl,
          },
          error: null,
        };
      }
      // Invalid file scope
      reply.code(400);
      return {
        data: null,
        error: {
          error: "Invalid file scope",
          message: "file_scope must be either 'complete' or 'updates'",
        },
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
        data: null,
        error: {
          error: "Internal server error",
          message: errorMessage,
        },
      };
    }
  }

  private async restartDevServer(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    APIResponse<PublicDevServerRestartSuccessResponse, StandardErrorResponse>
  > {
    try {
      await this.expoDevServerService.restartDevServer(request.log2);
      reply.status(200);
      return {
        data: {
          message: "Dev server restarted successfully",
        },
        error: null,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      request.log2.error(
        new Error(errorMessage),
        "Internal server error in restartDevServer",
        { stack: errorStack },
      );
      reply.code(500);
      return {
        data: null,
        error: {
          error: "Dev server restart failed",
          message: errorMessage,
        },
      };
    }
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
  ): Promise<
    APIResponse<PublicDevServerStopSuccessResponse, StandardErrorResponse>
  > {
    const devServerState = this.expoDevServerService.getState();
    if (devServerState.devServerStatus === DevServerStatus.STOPPED) {
      reply.status(200);
      return {
        data: {
          server_operation_status: devServerState.currentOperation,
          server_status: devServerState.devServerStatus,
          prototypeId: devServerState.prototypeId ?? undefined,
          version: devServerState.builtVersion ?? undefined,
        },
        error: null,
      };
    }

    if (
      devServerState.currentOperation === OperationStatus.BUILDING ||
      devServerState.currentOperation === OperationStatus.DEPLOYING ||
      devServerState.currentOperation ===
        OperationStatus.BUILDING_AND_DEPLOYING ||
      devServerState.currentOperation === OperationStatus.STOPPING
    ) {
      reply.code(409);
      return {
        data: null,
        error: {
          error: "Operation in progress",
          message: "Cannot stop dev server while an operation is in progress",
          details: `Current operation: ${devServerState.currentOperation}`,
        },
      };
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
        reply.code(409);
        return {
          data: null,
          error: {
            error: "Operation in progress",
            message: "Cannot stop dev server while an operation is in progress",
            details: `Current operation: ${this.expoDevServerService.getState().currentOperation}`,
          },
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
      reply.code(409);
      return {
        data: null,
        error: {
          error: "Build and deploy started",
          message:
            "Dev server cannot be stopped yet, build and deploy has been started",
          details: `Current operation: ${this.expoDevServerService.getState().currentOperation}`,
        },
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
        data: null,
        error: {
          error: "Internal server error",
          message: errorMessage,
        },
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
  ): Promise<
    APIResponse<PublicBuildAndDeploySuccessResponse, StandardErrorResponse>
  > {
    const { prototype_id, framework } = request.body;

    if (!prototype_id || !framework) {
      baseLogger.error(
        new Error("Missing required parameters"),
        "Missing required parameters",
        { prototype_id, framework },
      );
      reply.code(400);
      return {
        data: null,
        error: {
          error: "Missing required parameters",
          message: "prototype_id and framework are required",
        },
      };
    }

    try {
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
        reply.code(404);
        return {
          data: null,
          error: {
            error: "Project directory not found",
            message: "Project directory does not exist",
            details: errorMessage,
          },
        };
      }

      // Read all files from the project directory
      const { files } = await this.readAllFilesFromDirectory(projectDir);

      if (files.length === 0) {
        request.log2.error(
          new Error("No files found in project directory"),
          "No files found in project directory",
          { projectDir },
        );
        reply.code(400);
        return {
          data: null,
          error: {
            error: "No files found",
            message: "No files found in project directory",
          },
        };
      }

      // Use ExpoDevServerService to build and deploy
      try {
        const buildResponse =
          await this.expoDevServerService.buildAndDeployProjectCore(
            request.log2,
            prototype_id,
          );

        if (buildResponse.success && buildResponse.buildUrl) {
          reply.status(200);
          return {
            data: {
              build_url: buildResponse.buildUrl,
              version: buildResponse.version,
            },
            error: null,
          };
        } else if (buildResponse.error) {
          request.log2.error(
            new Error(buildResponse.error),
            "Build and deploy failed",
            { buildLog: buildResponse.buildLog },
          );
          reply.code(500);
          return {
            data: null,
            error: {
              error: "Build and deploy failed",
              message: buildResponse.error,
            },
          };
        } else {
          reply.code(500);
          return {
            data: null,
            error: {
              error: "Build and deploy failed",
              message: "Build completed but no build URL was generated",
            },
          };
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
        reply.code(500);
        return {
          data: null,
          error: {
            error: "Build and deploy process failed",
            message: errorMessage,
          },
        };
      }
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
        data: null,
        error: {
          error: "Internal server error",
          message: errorMessage,
        },
      };
    }
  }

  // Start background build and deploy process
  private async startBackgroundBuildAndDeploy(): Promise<void> {
    try {
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
          } else {
            // Use ExpoDevServerService to build and deploy
            const buildResponse =
              await this.expoDevServerService.buildAndDeployProjectCore(
                baseLogger,
                activePrototypeId,
              );

            if (buildResponse.error) {
              baseLogger.error(
                new Error(buildResponse.error),
                "Background build failed",
                { buildLog: buildResponse.buildLog },
              );
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
