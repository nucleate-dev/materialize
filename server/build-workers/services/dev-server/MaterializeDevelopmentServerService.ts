// PublicApiService.ts
import { S3Client } from "@aws-sdk/client-s3";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import {
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
  PublicUpdateFilesV2Request,
  PublicUpdateFilesV2SuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../types/BuildWorkerTypes.js";
import { PrototypeFileInput } from "../../utils/shared-utils.js";
import { baseLogger } from "../../worker.js";
import { CloudflareTunnelManagementService } from "../CloudflareTunnelManagementService.js";
import { SandboxService } from "../SandboxService.js";
import { SupabaseClientService } from "../SupabaseClientService.js";
import { ChatService } from "../chat/ChatService.js";
import { ExpoDevServerService } from "./ExpoDevServerService.js";
import { FileSyncService } from "../FileSyncService.js";
import { checkUserHasPrototypeEditAccess } from "../../utils/prototypeAuth.js";
import { fetchUserPlan } from "../chat/credit-checks.js";

export class MaterializeDevelopmentServerService {
  private readonly expoDevServerService: ExpoDevServerService;
  private readonly sandboxService: SandboxService;
  private readonly cloudflareTunnelManagementService: CloudflareTunnelManagementService;
  private readonly codeService: ChatService;
  private readonly workDir: string;
  private readonly supabaseClientService: SupabaseClientService;

  constructor(
    expoDevServerService: ExpoDevServerService,
    sandboxService: SandboxService,
    cloudflareTunnelManagementService: CloudflareTunnelManagementService,
    codeService: ChatService,
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

    // POST /update-files-v2
    app.post<{ Body: PublicUpdateFilesV2Request }>(
      "/update-files-v2",
      this.handleUpdateFilesV2.bind(this),
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
    SandboxAPIResponse<PublicAllocateSuccessResponse, StandardErrorResponse>
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
    const { setWorkerContext } = await import("../../worker.js");

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
    SandboxAPIResponse<
      PublicDevServerStartSuccessResponse,
      StandardErrorResponse
    >
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
    SandboxAPIResponse<
      PublicDevServerStartSuccessResponse,
      StandardErrorResponse
    >
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

  private async handleUpdateFilesV2(
    request: FastifyRequest<{ Body: PublicUpdateFilesV2Request }>,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<
      PublicUpdateFilesV2SuccessResponse,
      StandardErrorResponse
    >
  > {
    const {
      prototype_id,
      file_names,
      asset_names,
      deleted_file_names,
      deleted_asset_names,
    } = request.body;

    try {
      // Step 1: Extract JWT token from Authorization header
      const authHeader = request.headers.authorization;
      let jwtToken: string | undefined;

      if (authHeader) {
        if (authHeader.startsWith("Bearer ")) {
          jwtToken = authHeader.substring(7);
        } else {
          jwtToken = authHeader;
        }
      }

      // Step 2: Validate user has edit access to prototype
      const authResult = await checkUserHasPrototypeEditAccess(
        prototype_id,
        jwtToken,
        request.log2,
      );

      if (!authResult || !authResult.user || !authResult.canEdit) {
        request.log2.error(
          new Error("User not authorized to edit prototype"),
          "Authorization failed",
          {
            prototypeId: prototype_id,
            hasAuthResult: !!authResult,
            hasUser: !!authResult?.user,
            canEdit: authResult?.canEdit,
          },
        );
        reply.code(401);
        return {
          data: null,
          error: {
            error: "Unauthorized",
            message: "You do not have permission to edit this prototype",
          },
        };
      }

      // Step 3: Paywall check - ensure user is NOT on free plan
      const userPlan = await fetchUserPlan(
        this.supabaseClientService.getClient(),
        authResult.user.id,
        request.log2,
      );

      if (userPlan === "free") {
        request.log2.warn("Free tier user attempted to use update-files-v2", {
          userId: authResult.user.id,
          prototypeId: prototype_id,
        });
        reply.code(403);
        return {
          data: null,
          error: {
            error: "Forbidden",
            message:
              "This feature is not available on the free plan. Please upgrade to access hot-reloading.",
          },
        };
      }

      // Step 4: Check if package.json is in the updated files
      const packageJsonUpdated = file_names.includes("package.json");
      let hasPackageJsonChanges = false;

      if (packageJsonUpdated) {
        try {
          // Read current package.json from disk
          const packageJsonPath = path.join(this.workDir, "package.json");
          const currentPackageJson = await fs.readFile(
            packageJsonPath,
            "utf-8",
          );

          // Fetch new package.json from Supabase
          const { data: newPackageJsonData, error: fetchError } =
            await this.supabaseClientService
              .getClient()
              .from("prototype_files")
              .select("contents")
              .eq("prototype_id", prototype_id)
              .eq("name", "package.json")
              .single();

          if (fetchError) {
            request.log2.warn("Failed to fetch new package.json", {
              error: fetchError.message,
            });
          } else if (newPackageJsonData) {
            // Compare contents
            hasPackageJsonChanges =
              currentPackageJson.trim() !== newPackageJsonData.contents.trim();
            request.log2.consoleLogDevOnly(
              "info",
              "package.json change detection",
              {
                hasChanges: hasPackageJsonChanges,
              },
            );
          }
        } catch (error) {
          // If file doesn't exist, that's fine - it will be created
          if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          ) {
            hasPackageJsonChanges = true;
            request.log2.consoleLogDevOnly(
              "info",
              "package.json does not exist on disk, will be created",
            );
          } else {
            request.log2.warn("Error reading package.json for comparison", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Step 5: Sync files from Supabase
      const fileSyncService = new FileSyncService(
        this.workDir,
        this.supabaseClientService,
        request.log2,
      );

      const syncResult = await fileSyncService.syncSpecificFilesFromSupabase(
        prototype_id,
        file_names,
        asset_names,
        deleted_file_names || [],
        deleted_asset_names || [],
      );

      if (!syncResult.success) {
        request.log2.error(
          new Error("File sync failed"),
          "Failed to sync files from Supabase",
          {
            errors: syncResult.errors,
          },
        );
        reply.code(500);
        return {
          data: null,
          error: {
            error: "File sync failed",
            message: "Failed to sync files from Supabase",
            details: syncResult.errors.join(", "),
          },
        };
      }

      request.log2.consoleLogDevOnly("info", "Files synced successfully", {
        filesUpdated: syncResult.filesUpdated,
        assetsUpdated: syncResult.assetsUpdated,
        filesDeleted: syncResult.filesDeleted,
        assetsDeleted: syncResult.assetsDeleted,
      });

      // Step 6: If package.json changed, run npm install and restart dev server
      if (hasPackageJsonChanges) {
        try {
          request.log2.consoleLogDevOnly(
            "info",
            "package.json changed, running npm install and restarting dev server",
          );

          // Run npm install
          const npmInstallResult = await this.sandboxService.runCommandInternal(
            {
              command: "npm",
              args: ["install"],
              cwd: this.workDir,
              session_id: "test",
              timeout_ms: 60000,
              strip_ansi: true,
            },
          );

          if (
            npmInstallResult.response.error ||
            npmInstallResult.response.data?.status !== "success"
          ) {
            request.log2.error(
              new Error("npm install failed"),
              "npm install failed",
              {
                error: npmInstallResult.response.error,
                stdout: npmInstallResult.response.data?.stdout,
              },
            );
            reply.code(500);
            return {
              data: null,
              error: {
                error: "npm install failed",
                message: "Failed to install dependencies",
                details: npmInstallResult.response.error?.message,
              },
            };
          }

          request.log2.consoleLogDevOnly(
            "info",
            "npm install completed successfully",
          );

          // Restart dev server
          await this.expoDevServerService.restartDevServer(request.log2);
          request.log2.consoleLogDevOnly(
            "info",
            "Dev server restarted successfully",
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          request.log2.error(
            new Error(errorMessage),
            "Error during npm install or dev server restart",
          );
          reply.code(500);
          return {
            data: null,
            error: {
              error: "Post-sync operation failed",
              message: "Error during npm install or dev server restart",
              details: errorMessage,
            },
          };
        }
      }

      // Step 7: Return success response
      reply.status(200);
      return {
        data: {
          dev_server_restarted: packageJsonUpdated,
        },
        error: null,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      request.log2.error(
        new Error(errorMessage),
        "Internal server error in handleUpdateFilesV2",
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
    SandboxAPIResponse<
      PublicDevServerStartSuccessResponse,
      StandardErrorResponse
    >
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
    SandboxAPIResponse<
      PublicDevServerRestartSuccessResponse,
      StandardErrorResponse
    >
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
    SandboxAPIResponse<
      PublicDevServerStopSuccessResponse,
      StandardErrorResponse
    >
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
      reply.code(200);
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
        reply.code(200);
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
      reply.code(200);
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
    SandboxAPIResponse<
      PublicBuildAndDeploySuccessResponse,
      StandardErrorResponse
    >
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
        "../../utils/shared-utils.js"
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
