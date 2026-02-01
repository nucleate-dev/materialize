import { FastifyReply, FastifyRequest } from "fastify";
import {
  DevServerStatus,
  HTTP_STATUS,
  PublicDevServerStartSuccessResponse,
  PublicStartDevServerRequest,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import { restoreClaudeSessionsFromSupabase } from "../../../utils/shared-utils.js";
import { ChatService } from "../../chat/ChatService.js";
import { syncPrototypeEnvVarsToDisk } from "../utils/envVarUtils.js";
import {
  getWorkerContext,
  SOURCE_REPO_DIR,
  WORK_DIR,
} from "../../../worker.js";
import { DEFAULT_PROTOTYPE_FRAMEWORK } from "../NucleateDevelopmentServerService.js";
import { NextJsReactAdapter } from "../adapters/NextJsReactAdapter.js";
import { ViteReactAdapter } from "../adapters/ViteReactAdapter.js";
import { ExpoReactNativeBunAdapter } from "../adapters/ExpoReactNativeBunAdapter.js";
import { SupabaseClientService } from "../../SupabaseClientService.js";
import type { Database } from "../../../types/supabase.js";

type PrototypeFramework =
  | Database["public"]["Enums"]["prototype_framework"]
  | "mobile_expo_react_native_bun";

export async function handleStartDevServerImpl(
  request: FastifyRequest<{ Body: PublicStartDevServerRequest }>,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<PublicDevServerStartSuccessResponse, StandardErrorResponse>
> {
  const { prototype_id } = request.body;
  if (!prototype_id) {
    reply.code(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "Missing required parameters",
        message: "prototype_id is required",
      },
    };
  }
  // Note: auth already happens by control-plane before calling this route
  const { userId, teamId } = getWorkerContext();
  const supabaseClient = developmentServerService.supabaseClientService
    .getClient();
  let sourceRepoInstallationToken: string | null = null;
  let sourceRepository = developmentServerService.sourceRepository;
  let cachedInstallationToken: {
    installation_token: string;
    expires_at: string;
  } | null = null;
  let githubTokenJobStarted = false;

  try {
    const { data: sensitiveMetadata, error: metadataError } =
      await supabaseClient
        .from("prototype_sensitive_metadata")
        .select("source_repo_id")
        .eq("prototype_id", prototype_id)
        .maybeSingle();

    if (metadataError) {
      request.log2.error(
        metadataError,
        "Failed to fetch prototype sensitive metadata",
        { prototypeId: prototype_id },
      );
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Failed to fetch prototype metadata",
          message: metadataError.message,
        },
      };
    }

    if (sensitiveMetadata?.source_repo_id) {
      if (!teamId) {
        request.log2.error(
          new Error("Missing team id in worker context"),
          "Cannot fetch source repository without team id",
          { prototypeId: prototype_id },
        );
        reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return {
          data: null,
          error: {
            error: "Missing team id",
            message: "Unable to fetch source repository without team id",
          },
        };
      }

      const sourceRepoResponse = await developmentServerService
        .sandboxOrchestrationInitiatorService.fetchGitHubSourceRepo(
          prototype_id,
          teamId,
          sensitiveMetadata.source_repo_id,
        );

      sourceRepoInstallationToken = sourceRepoResponse.installation_token;
      developmentServerService.setSourceRepository({
        githubRepoId: sourceRepoResponse.source_repo.github_repo_id,
        installationId: sourceRepoResponse.source_repo.installation_id,
        repositoryUrl: sourceRepoResponse.source_repo.repository_url,
        repositoryOwner: sourceRepoResponse.source_repo.repository_owner,
        repositoryName: sourceRepoResponse.source_repo.repository_name,
        defaultBranch: sourceRepoResponse.source_repo.default_branch,
        fullName: sourceRepoResponse.source_repo.full_name,
      });

      sourceRepository = developmentServerService.sourceRepository;
      request.log2.info("Source repository configured for worker", {
        prototypeId: prototype_id,
        repositoryName: sourceRepoResponse.source_repo.repository_name,
        fullName: sourceRepoResponse.source_repo.full_name,
      });
    }
  } catch (error) {
    request.log2.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to initialize source repository configuration",
      { prototypeId: prototype_id },
    );
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to initialize source repository",
        message: error instanceof Error
          ? error.message
          : "Unable to initialize source repository",
      },
    };
  }

  const applyInstallationToken = (
    tokenData: { installation_token: string; expires_at: string } | null,
  ): void => {
    if (!tokenData) {
      return;
    }
    developmentServerService.githubInstallationToken = {
      installationToken: tokenData.installation_token,
      tokenExpiresAt: tokenData.expires_at,
    };
    if (!githubTokenJobStarted) {
      developmentServerService.startGitHubTokenRefreshJob(prototype_id);
      githubTokenJobStarted = true;
    }
  };

  if (sourceRepository) {
    try {
      cachedInstallationToken = await cloneSourceRepositoryToTmp(
        prototype_id,
        developmentServerService,
        request.log2,
        sourceRepoInstallationToken ?? undefined,
      );
      applyInstallationToken(cachedInstallationToken);
    } catch (error) {
      request.log2.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to clone source repository",
        { prototypeId: prototype_id },
      );
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Failed to clone source repository",
          message: error instanceof Error
            ? error.message
            : "Unable to clone source repository",
        },
      };
    }
  }

  // Fetch prototype to check for GitHub repo
  const { data: prototypeRow, error: prototypeError } =
    await developmentServerService.supabaseClientService
      .getClient()
      .from("prototypes")
      .select("github_repo_id, team_id")
      .eq("id", prototype_id)
      .single();

  if (prototypeError) {
    request.log2.error(
      prototypeError,
      "Failed to fetch prototype information",
      { prototypeId: prototype_id },
    );
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to fetch prototype information",
        message: prototypeError.message,
      },
    };
  }

  const hasGitHubRepo = prototypeRow.github_repo_id !== null;

  // if web, set the adapter to the appropriate adapter with the correct tunnel hostname
  const resolvedFramework =
    (developmentServerService.prototypeFramework ??
      DEFAULT_PROTOTYPE_FRAMEWORK) as PrototypeFramework;
  if (resolvedFramework === "mobile_expo_react_native_bun") {
    developmentServerService.developmentServerAdapter =
      new ExpoReactNativeBunAdapter(
        developmentServerService.terminalService,
      );
  }
  if (
    resolvedFramework === "web_nextjs_react" ||
    resolvedFramework === "web_vite_react"
  ) {
    const tunnelHostname = developmentServerService.cloudflareTunnelHostname;
    if (!tunnelHostname) {
      request.log2.error(
        new Error("Missing Cloudflare tunnel hostname"),
        `Cannot start ${resolvedFramework} dev server without tunnel hostname`,
      );
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Missing tunnel hostname",
          message: "Unable to start dev server without Cloudflare hostname",
        },
      };
    }
    if (resolvedFramework === "web_vite_react") {
      developmentServerService.developmentServerAdapter = new ViteReactAdapter(
        developmentServerService.terminalService,
        tunnelHostname,
      );
    } else {
      developmentServerService.developmentServerAdapter =
        new NextJsReactAdapter(
          developmentServerService.terminalService,
          tunnelHostname,
        );
    }
  }

  if (
    developmentServerService.developmentServerState.devServerStatus ===
    DevServerStatus.RUNNING ||
    developmentServerService.developmentServerState.devServerStatus ===
    DevServerStatus.STARTING
  ) {
    reply.code(HTTP_STATUS.CONFLICT);
    return {
      data: null,
      error: {
        error: "Development server is already started or starting",
        message: "Development server is already started or starting",
      },
    };
  }

  // 0. Initialize git or clone repository
  if (hasGitHubRepo) {
    // Fetch GitHub repository info
    const { data: githubRepo, error: githubRepoError } =
      await developmentServerService.supabaseClientService
        .getClient()
        .from("github_repositories")
        .select("*")
        .eq("github_repo_id", prototypeRow.github_repo_id!)
        .single();

    if (githubRepoError || !githubRepo) {
      request.log2.error(
        githubRepoError ?? new Error("GitHub repository not found"),
        "Failed to fetch GitHub repository info",
        {
          prototypeId: prototype_id,
          githubRepoId: prototypeRow.github_repo_id,
        },
      );
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Failed to fetch GitHub repository information",
          message: githubRepoError?.message ?? "Repository not found",
        },
      };
    }

    // Get a fresh installation token (or reuse the one from source repo cloning)
    try {
      let tokenData = cachedInstallationToken;
      if (!tokenData) {
        const userJwtToken = developmentServerService.supabaseClientService
          .getCurrentJwtToken();
        if (!userJwtToken) {
          throw new Error("User JWT token not available");
        }

        tokenData = await developmentServerService
          .sandboxOrchestrationInitiatorService.refreshGitHubInstallationToken(
            prototype_id,
            userJwtToken,
          );
        cachedInstallationToken = tokenData;
      }

      // Store GitHub info in developmentServerService
      developmentServerService.githubRepository = {
        repositoryUrl: githubRepo.html_url,
        repositoryOwner: githubRepo.owner_login,
        repositoryName: githubRepo.repo_name,
        defaultBranch: githubRepo.default_branch || "main",
        fullName: githubRepo.full_name,
      };
      applyInstallationToken(tokenData);

      request.log2.info("GitHub repository configured for prototype", {
        prototypeId: prototype_id,
        repositoryFullName: githubRepo.full_name,
        defaultBranch: githubRepo.default_branch,
      });

      // Clone the repository instead of initializing git
      await cloneGithubRepository(
        developmentServerService,
        userId,
        request.log2,
      );
    } catch (tokenError) {
      request.log2.error(
        tokenError instanceof Error
          ? tokenError
          : new Error(String(tokenError)),
        "Failed to get GitHub installation token",
        { prototypeId: prototype_id },
      );
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Failed to authenticate with GitHub",
          message: tokenError instanceof Error
            ? tokenError.message
            : "Failed to get installation token",
        },
      };
    }
  } else {
    // Initialize git normally (no GitHub repo)
    await initializeGit(developmentServerService, userId, request.log2);
  }

  // 1. Fetch necessary files (project files + assets, past claude sessions)
  if (hasGitHubRepo) {
    // For GitHub repos, sync files from local disk to Supabase
    // (the repository was just cloned, so disk has the latest)
    const syncResult = await developmentServerService.fileSyncService
      .syncFilesToSupabase(
        prototype_id,
        "all",
      );
    if (!syncResult.success || syncResult.errors.length > 0) {
      request.log2.warn("File sync had errors after GitHub clone", {
        prototypeId: prototype_id,
        errors: syncResult.errors,
      });
      // Don't fail - continue with dev server start
    }
  } else {
    // For non-GitHub prototypes, fetch from Supabase as usual
    const { errors: fetchErrors } = await developmentServerService
      .fileSyncService.fetchAllFilesAndAssetsFromSupabaseAndWriteToDisk(
        prototype_id,
      );
    if (fetchErrors.length > 0) {
      const errorMsg = fetchErrors.join("; ");
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Failed to fetch files and assets from Supabase",
          message: errorMsg,
        },
      };
    }
  }

  // 2.5 Fetch prototype backend and hydrate backend state (if configured)
  const { data: prototypeBackend, error: prototypeBackendError } =
    await developmentServerService.supabaseClientService
      .getClient()
      .from("prototype_backends")
      .select(
        "backend_type, provider_project_id, provider_project_url, metadata",
      )
      .eq("prototype_id", prototype_id)
      .maybeSingle();

  if (prototypeBackendError) {
    request.log2.error(
      prototypeBackendError,
      "Failed to fetch prototype backend",
      { prototypeId: prototype_id },
    );
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to fetch prototype backend",
        message: prototypeBackendError.message,
      },
    };
  }

  if (prototypeBackend) {
    let authenticationKey: string | null = null;
    if (prototypeBackend.backend_type === "supabase") {
      const userJwtToken = developmentServerService.supabaseClientService
        .getCurrentJwtToken();
      if (!userJwtToken) {
        reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return {
          data: null,
          error: {
            error: "Failed to get Supabase OAuth token",
            message: "User JWT token not available",
          },
        };
      }

      try {
        const supabaseToken = await developmentServerService
          .sandboxOrchestrationInitiatorService.getSupabaseOAuthToken(
            prototype_id,
            userJwtToken,
          );
        authenticationKey = supabaseToken.access_token;
        process.env.USER_SUPABASE_OAUTH_TOKEN = supabaseToken.access_token;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        request.log2.error(
          new Error(message),
          "Failed to get Supabase OAuth token",
          { prototypeId: prototype_id },
        );
        reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return {
          data: null,
          error: {
            error: "Failed to get Supabase OAuth token",
            message,
          },
        };
      }
    }

    const metadata =
      prototypeBackend.metadata &&
        typeof prototypeBackend.metadata === "object" &&
        !Array.isArray(prototypeBackend.metadata)
        ? (prototypeBackend.metadata as Record<string, unknown>)
        : {};

    developmentServerService.setPrototypeBackend({
      type: prototypeBackend.backend_type,
      projectId: prototypeBackend.provider_project_id,
      projectUrl: prototypeBackend.provider_project_url,
      metadata,
      authenticationKey,
    });
  } else {
    developmentServerService.setPrototypeBackend(null);
  }

  const envSyncResult = await syncPrototypeEnvVarsToDisk({
    prototypeId: prototype_id,
    supabaseClientService: developmentServerService.supabaseClientService,
    logger: request.log2,
  });

  if (!envSyncResult.success) {
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to synchronize environment variables",
        message: envSyncResult.error ?? "Failed to sync env vars",
      },
    };
  }

  if (developmentServerService.prototypeBackend) {
    const backendSyncResult = await developmentServerService
      .syncBackendEnvVarsToConnectedBackend(request.log2);
    if (!backendSyncResult.success) {
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Failed to sync backend environment variables",
          message: backendSyncResult.error ??
            "Failed to sync backend env vars",
        },
      };
    }
  }

  await restoreClaudeSessions(
    prototype_id,
    request.log2,
    developmentServerService.supabaseClientService,
    developmentServerService.chatService,
  );

  // 2. Install dependencies with sandboxService runCommandInternal
  // Use bun for Vite and Expo Bun projects, npm for everything else
  const useBun =
    resolvedFramework === "web_vite_react" ||
    resolvedFramework === "mobile_expo_react_native_bun";
  const packageManager = useBun ? "bun" : "npm";

  request.log2.consoleLogDevOnly(
    "info",
    `Installing dependencies with ${packageManager}`,
    {
      prototypeId: prototype_id,
    },
  );

  const installResult = await developmentServerService.sandboxService
    .runCommandInternal({
      command: packageManager,
      args: ["install"],
      cwd: `${WORK_DIR}/client`,
      session_id: "dev-server",
      timeout_ms: 180000, // 3 minutes
      strip_ansi: true,
    });

  if (installResult.response.error) {
    request.log2.error(
      new Error(installResult.response.error.error),
      `${packageManager} install failed, continuing anyway`,
      {
        prototypeId: prototype_id,
        errorMessage: installResult.response.error.message,
      },
    );
  } else if (installResult.response.data?.status === "timeout") {
    request.log2.warn(
      `${packageManager} install timed out, continuing anyway`,
      {
        prototypeId: prototype_id,
        stdout: installResult.response.data.stdout,
      },
    );
  } else if (installResult.response.data?.status === "success") {
    const stdout = installResult.response.data.stdout;
    // Check for common error indicators in output
    const hasErrors = stdout.includes("ERR!") ||
      stdout.includes("error") ||
      stdout.includes("failed");

    if (hasErrors) {
      request.log2.warn(
        `${packageManager} install completed but output contains error indicators, continuing anyway`,
        {
          prototypeId: prototype_id,
          stdout,
        },
      );
    } else {
      request.log2.consoleLogDevOnly(
        "info",
        `${packageManager} install completed successfully`,
        {
          prototypeId: prototype_id,
        },
      );
    }
  }

  // Only create initial commit if not using GitHub (GitHub repo already has commits)
  if (!hasGitHubRepo) {
    await addAllFilesToFirstCommit(developmentServerService);
  }

  // 3. Start the development server
  developmentServerService.developmentServerState.devServerStatus =
    DevServerStatus.STARTING;

  try {
    const startResult = await developmentServerService.developmentServerAdapter
      .startDevServer(
        request.log2,
      );

    if (startResult.error) {
      request.log2.error(
        new Error(startResult.error.error),
        "Failed to start development server",
        {
          prototypeId: prototype_id,
          errorMessage: startResult.error.message,
        },
      );
      developmentServerService.developmentServerState.devServerStatus =
        DevServerStatus.ERROR;
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Failed to start development server",
          message: startResult.error.message,
          details: startResult.error.details,
        },
      };
    }

    // Dev server started successfully
    developmentServerService.developmentServerState.devServerStatus =
      DevServerStatus.RUNNING;
    developmentServerService.developmentServerState.tunnelUrl =
      startResult.data.tunnel_url;

    request.log2.consoleLogDevOnly(
      "info",
      "Development server started successfully",
      {
        prototypeId: prototype_id,
        tunnelUrl: startResult.data.tunnel_url,
      },
    );

    reply.code(HTTP_STATUS.OK);
    return {
      data: {
        tunnel_url: startResult.data.tunnel_url,
      },
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    request.log2.error(
      new Error(errorMessage),
      "Exception while starting development server",
      {
        prototypeId: prototype_id,
      },
    );
    developmentServerService.developmentServerState.devServerStatus =
      DevServerStatus.ERROR;
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to start development server",
        message: errorMessage,
      },
    };
  }
}

/**
 * Restores Claude session .jsonl files from Supabase Storage to ~/.claude/projects/
 */
async function restoreClaudeSessions(
  prototypeId: string,
  log2: SystemLogger,
  supabaseClientService: SupabaseClientService,
  chatService: ChatService,
): Promise<void> {
  try {
    // Restore all session files from Storage
    const result = await restoreClaudeSessionsFromSupabase(
      prototypeId,
      supabaseClientService.getClient(),
      log2,
    );

    // Register restored session IDs with ChatService for validation
    if (result.restoredSessionIds.length > 0) {
      chatService.registerValidSessionIds(result.restoredSessionIds);
    }

    // Log any errors but don't fail the dev server start
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

// TODO: Initialize with user's OAuth, clone existing repo, etc
async function initializeGit(
  developmentServerService: NucleateDevelopmentServerService,
  userId: string | undefined,
  log2: SystemLogger,
): Promise<void> {
  let userRow;
  if (userId) {
    const { data, error: userFetchError } = await developmentServerService
      .supabaseClientService
      .getClient()
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();
    if (userFetchError) {
      log2.error(userFetchError, "Failed to fetch user from supabase", {
        userId,
      });
      return;
    }
    userRow = data;
  }

  const commandString =
    `cd ${WORK_DIR} && git init && git config --global user.email "${userRow?.email}" && git config --global user.name "${userRow?.name}"`;
  developmentServerService.terminalService.sendInput(
    "dev-server",
    commandString,
    {
      bypassValidation: true,
    },
  );
  return;
}

async function addAllFilesToFirstCommit(
  developmentServerService: NucleateDevelopmentServerService,
): Promise<void> {
  await developmentServerService.sandboxService.runCommandInternal({
    command: "git",
    args: [
      "add",
      ".",
      "&&",
      "git",
      "commit",
      "-m",
      `"Initialize development server"`,
    ],
    cwd: `${WORK_DIR}/client`,
    session_id: "dev-server",
    timeout_ms: 180000, // 3 minutes
    strip_ansi: true,
  });
  return;
}

async function cloneGithubRepository(
  developmentServerService: NucleateDevelopmentServerService,
  userId: string | undefined,
  log2: SystemLogger,
): Promise<void> {
  const githubRepo = developmentServerService.githubRepository;
  const installationToken = developmentServerService.githubInstallationToken
    ?.installationToken;
  if (!githubRepo) {
    throw new Error(
      "GitHub repository info not set in developmentServerService",
    );
  }
  if (!installationToken) {
    throw new Error(
      "GitHub installation token not available for cloning repository",
    );
  }

  // Fetch user info for git config
  let userRow;
  if (userId) {
    const { data, error: userFetchError } = await developmentServerService
      .supabaseClientService
      .getClient()
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();
    if (userFetchError) {
      log2.error(userFetchError, "Failed to fetch user from supabase", {
        userId,
      });
    } else {
      userRow = data;
    }
  }

  // Construct the authenticated GitHub URL with the installation token
  // Format: https://x-access-token:<token>@github.com/<owner>/<repo>.git
  const authenticatedUrl =
    `https://x-access-token:${installationToken}@github.com/${githubRepo.fullName}.git`;

  // Clone the repository directly into WORK_DIR
  // Use find to remove all contents including hidden files
  const cloneCommand =
    `cd ${WORK_DIR} && find . -mindepth 1 -delete && git clone ${authenticatedUrl} . && git config user.email "${userRow?.email ?? "noreply@nucleate.dev"
    }" && git config user.name "${userRow?.name ?? "Nucleate User"}"`;

  developmentServerService.terminalService.sendInput(
    "dev-server",
    cloneCommand,
    {
      bypassValidation: true,
    },
  );

  log2.info("Cloned GitHub repository", {
    repositoryFullName: githubRepo.fullName,
    defaultBranch: githubRepo.defaultBranch,
  });
}

export async function cloneSourceRepositoryToTmp(
  prototypeId: string,
  developmentServerService: NucleateDevelopmentServerService,
  log2: SystemLogger,
  installationTokenOverride?: string,
): Promise<{ installation_token: string; expires_at: string } | null> {
  const sourceRepo = developmentServerService.sourceRepository;
  if (!sourceRepo) {
    throw new Error("Source repository not configured");
  }

  let tokenData: { installation_token: string; expires_at: string } | null =
    null;
  let installationToken = installationTokenOverride ?? null;

  if (!installationToken) {
    const userJwtToken = developmentServerService.supabaseClientService
      .getCurrentJwtToken();
    if (!userJwtToken) {
      throw new Error("User JWT token not available");
    }

    tokenData = await developmentServerService
      .sandboxOrchestrationInitiatorService.refreshGitHubInstallationToken(
        prototypeId,
        userJwtToken,
      );
    installationToken = tokenData.installation_token;
  }

  const authenticatedUrl =
    `https://x-access-token:${installationToken}@github.com/${sourceRepo.fullName}.git`;

  // Clone source repository using terminal command
  // Note: Don't remove the directory itself (owned by root), just clean contents and clone
  const cloneCommand =
    `mkdir -p ${SOURCE_REPO_DIR} && find ${SOURCE_REPO_DIR} -mindepth 1 -delete && git clone ${authenticatedUrl} ${SOURCE_REPO_DIR}`;

  try {
    const cloneResult = await developmentServerService.terminalService
      .asyncSendInputWithCompletionDetectionOrTimeout(
        "dev-server",
        cloneCommand,
        {
          timeout: 180000,
          bypassValidation: true,
        },
      );

    if (cloneResult.exitCode !== 0) {
      throw new Error(
        `Failed to clone source repository (exit code ${cloneResult.exitCode}): ${cloneResult.output}`,
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to clone source repository: ${errorMessage}`);
  }

  log2.info("Cloned source repository into source repo directory", {
    prototypeId,
    repositoryFullName: sourceRepo.fullName,
  });

  try {
    await developmentServerService.terminalService
      .asyncSendInputWithCompletionDetectionOrTimeout(
        "dev-server",
        `cd ${SOURCE_REPO_DIR} && git remote remove origin`,
        { timeout: 15000, bypassValidation: true },
      );
    log2.info("Removed origin remote for source repository clone", {
      prototypeId,
    });
  } catch (remoteError) {
    log2.error(
      remoteError instanceof Error
        ? remoteError
        : new Error(String(remoteError)),
      "Failed to remove origin remote after source repository clone",
      { prototypeId },
    );
  }

  return tokenData;
}
