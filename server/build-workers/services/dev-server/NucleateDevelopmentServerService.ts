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
  PublicDevServerStopRequest,
  PublicDevServerStopSuccessResponse,
  PublicStartDevServerRequest,
  PublicUpdateFilesV2Request,
  PublicUpdateFilesV2SuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
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
import { IDevelopmentServerAdapter } from "./adapters/IDevelopmentServerAdapter.js";
import { TerminalService } from "../terminals/TerminalService.js";
import { ExpoReactNativeAdapter } from "./adapters/ExpoReactNativeAdapter.js";
import { S3Client } from "@aws-sdk/client-s3";
import { handleRefetchEnvImpl } from "./handlers/handleRefetchEnv.js";

export const S3_BUCKET = process.env.S3_BUCKET || "materialize-sites";
export const DEV_SERVER_PORT = 19006;

export class NucleateDevelopmentServerService {
  public readonly sandboxService: SandboxService;
  public readonly cloudflareTunnelManagementService: CloudflareTunnelManagementService;
  public chatService: ChatService;
  public readonly supabaseClientService: SupabaseClientService;
  public readonly fileSyncService: FileSyncService;
  public readonly terminalService: TerminalService;
  public developmentServerAdapter: IDevelopmentServerAdapter;
  public s3Client: S3Client | undefined;
  public developmentServerState: {
    tunnelUrl: string;
    devServerStatus: DevServerStatus;
    isBuilding: boolean;
    builtVersion: string;
    buildStartTime: Date;
    lastUpdatedTime: Date;
    buildError?: string;
  };

  constructor(
    sandboxService: SandboxService,
    cloudflareTunnelManagementService: CloudflareTunnelManagementService,
    supabaseClientService: SupabaseClientService,
    fileSyncService: FileSyncService,
    terminalService: TerminalService,
    codeService: ChatService,
  ) {
    this.sandboxService = sandboxService;
    this.cloudflareTunnelManagementService = cloudflareTunnelManagementService;
    this.chatService = codeService;
    this.supabaseClientService = supabaseClientService;
    this.fileSyncService = fileSyncService;
    this.terminalService = terminalService;
    this.developmentServerAdapter = new ExpoReactNativeAdapter(terminalService); // default adapter]
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
    app.post<{ Body: PublicDevServerRefetchEnvRequest }>(
      "/dev-server/refetch-env",
      this.refetchEnvVars.bind(this),
    );

    app.delete<{ Body: PublicDevServerStopRequest }>(
      "/cleanup",
      this.cleanup.bind(this),
    );

    app.post("/build-and-deploy", this.buildAndDeploy.bind(this));
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
}
