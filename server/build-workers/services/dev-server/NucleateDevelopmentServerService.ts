// PublicApiService.ts
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  BuildAndDeployResponse,
  BuildStatusResponse,
  DevServerStatus,
  PublicAllocateRequest,
  PublicAllocateSuccessResponse,
  PublicConnectGitHubSuccessResponse,
  PublicDevServerRefetchEnvRequest,
  PublicDevServerRefetchEnvSuccessResponse,
  PublicDevServerRestartSuccessResponse,
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
import { handleCleanupTunnelOnly } from "./handlers/handleCleanupTunnelOnly.js";
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
import { handleConnectGitHubImpl } from "./handlers/handleConnectGitHub.js";
import { handleBuildStatusImpl } from "./handlers/handleBuildStatus.js";
import type { ChatQueryData } from "../../types/ChatTypes.js";
import type { SystemLogger } from "../../loggers/SystemLogger.js";
import { WORK_DIR } from "../../worker.js";
import {
  createSourceRepoPullRequest as handleCreateSourceRepoPullRequest,
  prepareSourceRepoBranch,
  PrepareSourceRepoBranchInput,
  SourceRepoPullRequestInput,
} from "./handlers/handleCreateSourceRepoPullRequest.js";
import {
  listNucleateSourceRepoPullRequests,
  SourceRepoPullRequestSummary,
} from "./handlers/handleListNucleateSourceRepoPullRequests.js";

export const S3_BUCKET = process.env.S3_BUCKET || "materialize-sites";
export const DEV_SERVER_PORT = 19006;
export const DEFAULT_PROTOTYPE_FRAMEWORK:
  Database["public"]["Enums"]["prototype_framework"] =
    "mobile_expo_react_native";

export class NucleateDevelopmentServerService {
  public readonly sandboxService: SandboxService;
  public readonly cloudflareTunnelManagementService:
    CloudflareTunnelManagementService;
  public chatService: ChatService;
  public readonly supabaseClientService: SupabaseClientService;
  public readonly fileSyncService: FileSyncService;
  public readonly terminalService: TerminalService;
  public readonly sandboxOrchestrationInitiatorService:
    SandboxOrchestrationInitiatorService;
  public developmentServerAdapter: IDevelopmentServerAdapter;
  public s3Client: S3Client | undefined;
  public prototypeFramework: Database["public"]["Enums"]["prototype_framework"];
  public cloudflareTunnelHostname: string | null;
  public githubRepository: {
    repositoryUrl: string;
    repositoryOwner: string;
    repositoryName: string;
    defaultBranch: string;
    fullName: string;
  } | null = null;
  public githubInstallationToken: {
    installationToken: string;
    tokenExpiresAt: string;
  } | null = null;
  public sourceRepository: {
    githubRepoId: number;
    installationId: number;
    repositoryUrl: string;
    repositoryOwner: string;
    repositoryName: string;
    defaultBranch: string;
    fullName: string;
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

    app.post("/dev-server/connect-github", this.connectGitHub.bind(this));

    app.delete("/cleanup", this.cleanup.bind(this));
    app.delete("/cleanup-tunnel-only", this.cleanupTunnelOnly.bind(this));

    app.post("/dev-server/build-and-deploy", this.buildAndDeploy.bind(this));
    app.get("/dev-server/build-status", this.getBuildStatus.bind(this));

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

  public setSourceRepository(sourceRepository: {
    githubRepoId: number;
    installationId: number;
    repositoryUrl: string;
    repositoryOwner: string;
    repositoryName: string;
    defaultBranch: string;
    fullName: string;
  }): void {
    this.sourceRepository = sourceRepository;
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
        const userJwtToken = this.supabaseClientService.getCurrentJwtToken();
        if (!userJwtToken) {
          const { baseLogger } = await import("../../loggers/index.js");
          baseLogger.error(
            new Error("User JWT token not available"),
            "Cannot refresh GitHub token without JWT",
            { prototypeId },
          );
          return;
        }

        const tokenData = await this.sandboxOrchestrationInitiatorService
          .refreshGitHubInstallationToken(
            prototypeId,
            userJwtToken,
          );

        this.githubInstallationToken = {
          installationToken: tokenData.installation_token,
          tokenExpiresAt: tokenData.expires_at,
        };

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
        baseLogger.consoleLogDevOnly(
          "info",
          "Stopped GitHub token refresh job",
        );
      });
    }
  }

  /**
   * Commit current changes to git with a commit message derived from chat data.
   * If a GitHub repository is attached, also pushes the commit to the remote.
   */
  public async commitChangesToGit(
    data: ChatQueryData,
    logger: SystemLogger,
  ): Promise<void> {
    const commitMessageArg = this.buildCommitMessageArg(data);
    if (!commitMessageArg) {
      logger.consoleLogDevOnly(
        "info",
        "Skipping git commit after chat - no commit message available",
      );
      return;
    }

    try {
      const { response } = await this.sandboxService.runCommandInternal({
        command: "git",
        args: ["add", ".", "&&", "git", "commit", "-m", commitMessageArg],
        cwd: WORK_DIR,
        session_id: "test",
        timeout_ms: 60000,
        strip_ansi: true,
      });

      if (response.error) {
        logger.warn("Git commit after chat failed", {
          error: response.error,
        });
        return;
      }

      const stdout = response.data?.stdout ?? "";
      const status = response.data?.status;

      if (
        status === "timeout" &&
        stdout.toLowerCase().includes("nothing to commit")
      ) {
        logger.consoleLogDevOnly(
          "info",
          "No git changes to commit after chat execution",
        );
        return;
      }

      logger.consoleLogDevOnly("info", "Committed chat changes to git", {
        status,
      });

      // If GitHub repository is attached, push the commit
      if (this.githubRepository) {
        await this.pushToGitHub(logger);
      }
    } catch (error) {
      logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to commit chat changes after execution",
      );
    }
  }

  /**
   * Push commits to the attached GitHub repository
   */
  public async pushToGitHub(logger: SystemLogger): Promise<void> {
    if (!this.githubRepository) {
      logger.warn("Cannot push to GitHub: no repository attached");
      return;
    }
    const installationToken =
      this.githubInstallationToken?.installationToken;
    if (!installationToken) {
      logger.warn("Cannot push to GitHub: installation token unavailable");
      return;
    }

    try {
      // Update the remote URL with the fresh installation token
      const authenticatedUrl =
        `https://x-access-token:${installationToken}@github.com/${this.githubRepository.fullName}.git`;

      const updateRemoteResult = await this.sandboxService.runCommandInternal({
        command: "sh",
        args: [
          "-c",
          `cd ${WORK_DIR} && git remote set-url origin ${authenticatedUrl}`,
        ],
        cwd: WORK_DIR,
        session_id: "test",
        timeout_ms: 10000,
        strip_ansi: true,
      });

      if (updateRemoteResult.response.error) {
        logger.warn("Failed to update git remote URL before push", {
          error: updateRemoteResult.response.error,
        });
        // Continue with push anyway - the existing remote might still work
      }

      // Push to the default branch
      const pushResult = await this.sandboxService.runCommandInternal({
        command: "git",
        args: [
          "push",
          "-u",
          "origin",
          `HEAD:${this.githubRepository.defaultBranch}`,
        ],
        cwd: WORK_DIR,
        session_id: "test",
        timeout_ms: 60000,
        strip_ansi: true,
      });

      if (pushResult.response.error) {
        logger.warn("Failed to push commit to GitHub", {
          error: pushResult.response.error,
          repository: this.githubRepository.fullName,
        });
        return;
      }

      logger.consoleLogDevOnly("info", "Pushed commit to GitHub", {
        repository: this.githubRepository.fullName,
        branch: this.githubRepository.defaultBranch,
      });
    } catch (error) {
      logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Error pushing to GitHub",
        {
          repository: this.githubRepository?.fullName,
        },
      );
    }
  }

  /**
   * Fetch the latest changes from the connected GitHub repository.
   * Skips fetching entirely if there is no GitHub remote configured.
   */
  public async fetchLatestGitHubChanges(logger: SystemLogger): Promise<void> {
    if (!this.githubRepository) {
      logger.consoleLogDevOnly(
        "info",
        "Skipping git fetch - no GitHub repository configured",
      );
      return;
    }

    try {
      const installationToken =
        this.githubInstallationToken?.installationToken;
      if (!installationToken) {
        logger.warn(
          "Cannot fetch GitHub changes: installation token unavailable",
        );
        return;
      }
      const authenticatedUrl =
        `https://x-access-token:${installationToken}@github.com/${this.githubRepository.fullName}.git`;
      const updateRemoteResult = await this.sandboxService.runCommandInternal({
        command: "sh",
        args: [
          "-c",
          `cd ${WORK_DIR} && git remote set-url origin ${authenticatedUrl}`,
        ],
        cwd: WORK_DIR,
        session_id: "test",
        timeout_ms: 10000,
        strip_ansi: true,
      });

      if (updateRemoteResult.response.error) {
        logger.warn("Failed to update git remote URL before fetch", {
          error: updateRemoteResult.response.error,
        });
      }

      const fetchResult = await this.sandboxService.runCommandInternal({
        command: "git",
        args: ["fetch", "origin", this.githubRepository.defaultBranch],
        cwd: WORK_DIR,
        session_id: "test",
        timeout_ms: 60000,
        strip_ansi: true,
      });

      if (fetchResult.response.error) {
        logger.warn("Failed to fetch latest GitHub changes", {
          error: fetchResult.response.error,
          repository: this.githubRepository.fullName,
        });
        return;
      }

      logger.consoleLogDevOnly("info", "Fetched latest changes from GitHub", {
        repository: this.githubRepository.fullName,
        branch: this.githubRepository.defaultBranch,
      });
    } catch (error) {
      logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Error fetching latest GitHub changes",
        { repository: this.githubRepository?.fullName },
      );
    }
  }

  private buildCommitMessageArg(data: ChatQueryData): string | null {
    const userMessage = this.extractCommitMessageText(data);
    const normalized = userMessage.replace(/\s+/g, " ").trim();
    const baseMessage = normalized.length > 0
      ? normalized
      : "Automated chat commit";
    const truncated = baseMessage.length > 180
      ? `${baseMessage.slice(0, 177)}...`
      : baseMessage;

    const escaped = truncated
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`");

    if (!escaped.trim()) {
      return null;
    }

    return `"${escaped}"`;
  }

  private extractCommitMessageText(data: ChatQueryData): string {
    if (typeof data.prompt === "string" && data.prompt.length > 0) {
      return data.prompt;
    }

    if (Array.isArray(data.content)) {
      const text = data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text || "")
        .join(" ")
        .trim();
      if (text) {
        return text;
      }
    }

    return "";
  }

  public async createSourceRepositoryPullRequest(
    input: SourceRepoPullRequestInput,
    logger: SystemLogger,
  ): Promise<{ branchName: string; pullRequestUrl: string }> {
    return handleCreateSourceRepoPullRequest(this, input, logger);
  }

  public async listOpenSourceRepositoryPullRequests(
    logger: SystemLogger,
  ): Promise<SourceRepoPullRequestSummary[]> {
    return listNucleateSourceRepoPullRequests(this, logger);
  }

  public async prepareSourceRepositoryBranch(
    input: PrepareSourceRepoBranchInput,
    logger: SystemLogger,
  ): Promise<{ branchName: string; baseBranch: string; pullRequestNumber?: number | null }> {
    return prepareSourceRepoBranch(this, input, logger);
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

  private async cleanupTunnelOnly(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<BuildAndDeployResponse, StandardErrorResponse>
  > {
    return handleCleanupTunnelOnly(request, reply, this);
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

  private async connectGitHub(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<
      PublicConnectGitHubSuccessResponse,
      StandardErrorResponse
    >
  > {
    return handleConnectGitHubImpl(request, reply, this);
  }

  private async buildAndDeploy(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<BuildAndDeployResponse, StandardErrorResponse>
  > {
    return handleBuildAndDeployImpl(request, reply, this);
  }

  private async getBuildStatus(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    SandboxAPIResponse<BuildStatusResponse, StandardErrorResponse>
  > {
    return handleBuildStatusImpl(request, reply, this);
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
