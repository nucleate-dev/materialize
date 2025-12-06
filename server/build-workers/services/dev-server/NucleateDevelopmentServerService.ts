// PublicApiService.ts
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
  PublicDevServerRestartSuccessResponse,
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
import { handleAllocateImpl } from "./handlers/handleAllocate.js";
import { handleUpdateFilesImpl } from "./handlers/handleUpdateFiles.js";
import { handleStartDevServerImpl } from "./handlers/handleStartDevServer.js";
import { handleCleanup } from "./handlers/handleCleanup.js";
import { handleRestartDevServerImpl } from "./handlers/handleRestartDevServer.js";
import { IDevelopmentServerAdapter } from "./adapters/IDevelopmentServerAdapter.js";
import { TerminalService } from "../terminals/TerminalService.js";
import { ExpoReactNativeAdapter } from "./adapters/ExpoReactNativeAdapter.js";
import { S3Client } from "@aws-sdk/client-s3";

export const S3_BUCKET = process.env.S3_BUCKET || "materialize-sites";
export const DEV_SERVER_PORT = 19006;

export class NucleateDevelopmentServerService {
  public readonly expoDevServerService: ExpoDevServerService;
  public readonly sandboxService: SandboxService;
  public readonly cloudflareTunnelManagementService: CloudflareTunnelManagementService;
  public readonly codeService: ChatService;
  public readonly workDir: string;
  public readonly supabaseClientService: SupabaseClientService;
  public readonly fileSyncService: FileSyncService;
  public readonly terminalService: TerminalService;
  public developmentServerAdapter: IDevelopmentServerAdapter;
  public s3Client: S3Client | undefined;
  public developmentServerState: {
    tunnelUrl: string;
    devServerStatus: DevServerStatus;
    buildIsValid: boolean;
    isBuilding: boolean;
    builtVersion: string;
  };

  constructor(
    expoDevServerService: ExpoDevServerService,
    sandboxService: SandboxService,
    cloudflareTunnelManagementService: CloudflareTunnelManagementService,
    codeService: ChatService,
    workDir: string,
    supabaseClientService: SupabaseClientService,
    fileSyncService: FileSyncService,
    terminalService: TerminalService,
  ) {
    this.expoDevServerService = expoDevServerService;
    this.sandboxService = sandboxService;
    this.cloudflareTunnelManagementService = cloudflareTunnelManagementService;
    this.codeService = codeService;
    this.workDir = workDir;
    this.supabaseClientService = supabaseClientService;
    this.fileSyncService = fileSyncService;
    this.terminalService = terminalService;
    this.developmentServerAdapter = new ExpoReactNativeAdapter(terminalService); // default adapter]
    this.developmentServerState = {
      tunnelUrl: "",
      devServerStatus: DevServerStatus.STOPPED,
      buildIsValid: false,
      isBuilding: false,
      builtVersion: "",
    };
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

    // DELETE /dev-server
    app.delete<{ Body: PublicDevServerStopRequest }>(
      "/dev-server",
      this.stopDevServer.bind(this),
    );

    app.post("/dev-server/restart", this.restartDevServer.bind(this));

    app.post("/allocate", this.allocate.bind(this));

    // ----------- V2 ENDPOINTS -----------
    app.post<{ Body: PublicUpdateFilesV2Request }>(
      "/update-files-v2",
      this.updateFilesV2.bind(this),
    );

    app.post<{ Body: PublicStartDevServerRequest }>(
      "/dev-server/start-v2",
      this.startDevServerV2.bind(this),
    );

    app.post("/dev-server/restart-v2", this.restartDevServerV2.bind(this));

    app.delete<{ Body: PublicDevServerStopRequest }>(
      "/cleanup",
      this.cleanup.bind(this),
    );
  }

  public setS3Client(s3Client: S3Client): void {
    this.s3Client = s3Client;
  }

  private async allocate(
    request: FastifyRequest<{ Body: PublicAllocateRequest }>,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<PublicAllocateSuccessResponse, StandardErrorResponse>
  > {
    return handleAllocateImpl(
      request,
      reply,
      this.supabaseClientService,
      this.expoDevServerService,
      this.cloudflareTunnelManagementService,
      this.codeService,
      this,
    );
  }

  private async startDevServerV2(
    request: FastifyRequest<{ Body: PublicStartDevServerRequest }>,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<
      PublicDevServerStartSuccessResponse,
      StandardErrorResponse
    >
  > {
    return handleStartDevServerImpl(request, reply, this);
  }

  private async updateFilesV2(
    request: FastifyRequest<{ Body: PublicUpdateFilesV2Request }>,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<
      PublicUpdateFilesV2SuccessResponse,
      StandardErrorResponse
    >
  > {
    return handleUpdateFilesImpl(
      request,
      reply,
      this.workDir,
      this.fileSyncService,
      this.sandboxService,
      this.supabaseClientService,
      this.expoDevServerService,
    );
  }

  private async cleanup(
    request: FastifyRequest<{ Body: PublicDevServerStopRequest }>,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<
      PublicDevServerStopSuccessResponse,
      StandardErrorResponse
    >
  > {
    return handleCleanup(request, reply, this);
  }

  private async restartDevServerV2(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<
      PublicDevServerRestartSuccessResponse,
      StandardErrorResponse
    >
  > {
    return handleRestartDevServerImpl(request, reply, this);
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
}
