// PublicApiService.ts
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  BuildAndDeployResponse,
  DevServerStatus,
  PublicAllocateRequest,
  PublicAllocateSuccessResponse,
  PublicDevServerRestartSuccessResponse,
  PublicDevServerRefetchEnvRequest,
  PublicDevServerRefetchEnvSuccessResponse,
  PublicDevServerStartSuccessResponse,
  PublicDevServerStopSuccessResponse,
  PublicStartDevServerRequest,
  PublicUpdateFilesV2Request,
  PublicUpdateFilesV2SuccessResponse,
  ResetSandboxSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
  UndoLastChangeSuccessResponse,
} from "../../types/BuildWorkerTypes.js";
import { CloudflareTunnelManagementService } from "../CloudflareTunnelManagementService.js";
import { SandboxService } from "../SandboxService.js";
import { SupabaseClientService } from "../SupabaseClientService.js";
import { ChatService } from "../chat/ChatService.js";
import { FileSyncService } from "../FileSyncService.js";
import { handleAllocateImpl } from "./handlers/handleAllocate.js";
import { handleUpdateFilesImpl } from "./handlers/handleUpdateFiles.js";
import { handleStartDevServerImpl } from "./handlers/handleStartDevServer.js";
import { handleCleanup } from "./handlers/handleCleanup.js";
import { handleRestartDevServerImpl } from "./handlers/handleRestartDevServer.js";
import { handleBuildAndDeployImpl } from "./handlers/handleBuildAndDeploy.js";
import { handleResetSandbox } from "./handlers/handleResetSandbox.js";
import { handleUndoLastChangeImpl } from "./handlers/handleUndoLastChange.js";
import { IDevelopmentServerAdapter } from "./adapters/IDevelopmentServerAdapter.js";
import { TerminalService } from "../terminals/TerminalService.js";
import { ExpoReactNativeAdapter } from "./adapters/ExpoReactNativeAdapter.js";
import { S3Client } from "@aws-sdk/client-s3";
import { handleRefetchEnvImpl } from "./handlers/handleRefetchEnv.js";
import type { Database } from "../../types/supabase.js";
import { SandboxOrchestrationInitiatorService } from "../SandboxOrchestrationInitiatorService.js";

export const S3_BUCKET = process.env.S3_BUCKET || "materialize-sites";
export const DEV_SERVER_PORT = 19006;
export const DEFAULT_PROTOTYPE_FRAMEWORK: Database["public"]["Enums"]["prototype_framework"] =
  "mobile_expo_react_native";

export class NucleateDevelopmentServerService {
  public readonly sandboxService: SandboxService;
  public readonly cloudflareTunnelManagementService: CloudflareTunnelManagementService;
  public chatService: ChatService;
  public readonly supabaseClientService: SupabaseClientService;
  public readonly fileSyncService: FileSyncService;
  public readonly terminalService: TerminalService;
  public readonly sandboxOrchestrationInitiatorService: SandboxOrchestrationInitiatorService;
  public developmentServerAdapter: IDevelopmentServerAdapter;
  public s3Client: S3Client | undefined;
  public prototypeFramework: Database["public"]["Enums"]["prototype_framework"];
  public cloudflareTunnelHostname: string | null;
  public githubRepository: {
    installationToken: string;
    repositoryUrl: string;
    repositoryOwner: string;
    repositoryName: string;
    defaultBranch: string;
    fullName: string;
    tokenExpiresAt: string;
  } | null = null;
  public developmentServerState: {
    tunnelUrl: string;
    devServerStatus: DevServerStatus;
    isBuilding: boolean;
    builtVersion: string;
    buildStartTime: Date;
    lastUpdatedTime: Date;
    buildError?: string;
  };
  private githubTokenRefreshInterval: NodeJS.Timeout | null = null;

  constructor(
    sandboxService: SandboxService,
    cloudflareTunnelManagementService: CloudflareTunnelManagementService,
    supabaseClientService: SupabaseClientService,
    fileSyncService: FileSyncService,
    terminalService: TerminalService,
    sandboxOrchestrationInitiatorService: SandboxOrchestrationInitiatorService,
    codeService: ChatService,
  ) {
    this.sandboxService = sandboxService;
    this.cloudflareTunnelManagementService = cloudflareTunnelManagementService;
    this.chatService = codeService;
    this.supabaseClientService = supabaseClientService;
    this.fileSyncService = fileSyncService;
    this.terminalService = terminalService;
    this.sandboxOrchestrationInitiatorService =
      sandboxOrchestrationInitiatorService;
    this.developmentServerAdapter = new ExpoReactNativeAdapter(terminalService); // default adapter]
    this.prototypeFramework = DEFAULT_PROTOTYPE_FRAMEWORK;
    this.cloudflareTunnelHostname = null;
    const now = new Date();
    this.developmentServerState = {
      tunnelUrl: "",
      devServerStatus: DevServerStatus.STOPPED,
      isBuilding: false,
      builtVersion: "",
      buildStartTime: now,
      lastUpdatedTime: now,
    };
  }

  public registerRoutes(app: FastifyInstance): void {
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
    app.post("/dev-server/undo-last-change", this.undoLastChange.bind(this));
    app.post<{ Body: PublicDevServerRefetchEnvRequest }>(
      "/dev-server/refetch-env",
      this.refetchEnvVars.bind(this),
    );

    app.delete("/cleanup", this.cleanup.bind(this));

    app.post("/dev-server/build-and-deploy", this.buildAndDeploy.bind(this));

    // ----------- INTERNAL TOOLS ONLY -----------
    // Reset sandbox to clean state (clears files, Claude sessions, and worker context)
    app.post("/reset-sandbox", this.resetSandbox.bind(this));
  }

  public setS3Client(s3Client: S3Client): void {
    this.s3Client = s3Client;
  }

  public setPrototypeFramework(
    framework: Database["public"]["Enums"]["prototype_framework"],
  ): void {
    this.prototypeFramework = framework;
  }

  public setCloudflareTunnelHostname(hostname: string): void {
    this.cloudflareTunnelHostname = hostname;
  }

  /**
   * Start a background job to refresh the GitHub installation token every 50 minutes.
   * GitHub installation tokens expire after 1 hour, so we refresh every 50 minutes to be safe.
   */
  public startGitHubTokenRefreshJob(prototypeId: string): void {
    // Clear any existing interval
    this.stopGitHubTokenRefreshJob();

    const FIFTY_MINUTES_MS = 50 * 60 * 1000;

    this.githubTokenRefreshInterval = setInterval(async () => {
      try {
        const tokenData =
          await this.sandboxOrchestrationInitiatorService.refreshGitHubInstallationToken(
            prototypeId,
          );

        if (this.githubRepository) {
          this.githubRepository.installationToken = tokenData.installation_token;
          this.githubRepository.tokenExpiresAt = tokenData.expires_at;
        }

        // Note: baseLogger is imported from loggers/index.js
        const { baseLogger } = await import("../../loggers/index.js");
        baseLogger.info("Refreshed GitHub installation token", {
          prototypeId,
          expiresAt: tokenData.expires_at,
        });
      } catch (error) {
        const { baseLogger } = await import("../../loggers/index.js");
        baseLogger.error(
          error instanceof Error ? error : new Error(String(error)),
          "Failed to refresh GitHub installation token in background job",
          { prototypeId },
        );
      }
    }, FIFTY_MINUTES_MS);

    // Also log that we started the job
    import("../../loggers/index.js").then(({ baseLogger }) => {
      baseLogger.info("Started GitHub token refresh job", {
        prototypeId,
        intervalMs: FIFTY_MINUTES_MS,
      });
    });
  }

  /**
   * Stop the GitHub installation token refresh job
   */
  public stopGitHubTokenRefreshJob(): void {
    if (this.githubTokenRefreshInterval) {
      clearInterval(this.githubTokenRefreshInterval);
      this.githubTokenRefreshInterval = null;

      import("../../loggers/index.js").then(({ baseLogger }) => {
        baseLogger.consoleLogDevOnly("info", "Stopped GitHub token refresh job");
      });
    }
  }

  private async allocate(
    request: FastifyRequest<{ Body: PublicAllocateRequest }>,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<PublicAllocateSuccessResponse, StandardErrorResponse>
  > {
    return handleAllocateImpl(request, reply, this);
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
    return handleUpdateFilesImpl(request, reply, this);
  }

  private async cleanup(
    request: FastifyRequest,
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

  private async undoLastChange(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<UndoLastChangeSuccessResponse, StandardErrorResponse>
  > {
    return handleUndoLastChangeImpl(request, reply, this);
  }

  private async refetchEnvVars(
    request: FastifyRequest<{ Body: PublicDevServerRefetchEnvRequest }>,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<
      PublicDevServerRefetchEnvSuccessResponse,
      StandardErrorResponse
    >
  > {
    return handleRefetchEnvImpl(request, reply, this);
  }

  private async buildAndDeploy(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<BuildAndDeployResponse, StandardErrorResponse>
  > {
    return handleBuildAndDeployImpl(request, reply, this);
  }

  private async resetSandbox(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<ResetSandboxSuccessResponse, StandardErrorResponse>
  > {
    return handleResetSandbox(request, reply, this);
  }
}
