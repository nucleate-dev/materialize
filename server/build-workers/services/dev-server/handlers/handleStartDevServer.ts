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
import { getWorkerContext, WORK_DIR } from "../../../worker.js";
import { DEFAULT_PROTOTYPE_FRAMEWORK } from "../NucleateDevelopmentServerService.js";
import { NextJsReactAdapter } from "../adapters/NextJsReactAdapter.js";
import { SupabaseClientService } from "../../SupabaseClientService.js";

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
  const { userId } = getWorkerContext();
  const sourceRepository = developmentServerService.sourceRepository;
  let cachedInstallationToken: {
    installation_token: string;
    expires_at: string;
  } | null = null;
  let githubTokenJobStarted = false;

  if (sourceRepository) {
    try {
      cachedInstallationToken = await cloneSourceRepositoryToTmp(
        prototype_id,
        developmentServerService,
        request.log2,
      );
      githubTokenJobStarted = true;
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
          message:
            error instanceof Error
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

  // if web, set the adapter to the NextJsReactAdapter with the correct tunnel hostname
  const resolvedFramework =
    developmentServerService.prototypeFramework ?? DEFAULT_PROTOTYPE_FRAMEWORK;
  if (resolvedFramework === "web_nextjs_react") {
    const tunnelHostname = developmentServerService.cloudflareTunnelHostname;
    if (!tunnelHostname) {
      request.log2.error(
        new Error("Missing Cloudflare tunnel hostname"),
        "Cannot start Next.js dev server without tunnel hostname",
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
    developmentServerService.developmentServerAdapter = new NextJsReactAdapter(
      developmentServerService.terminalService,
      tunnelHostname,
    );
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
        const userJwtToken =
          developmentServerService.supabaseClientService.getCurrentJwtToken();
        if (!userJwtToken) {
          throw new Error("User JWT token not available");
        }

        tokenData =
          await developmentServerService.sandboxOrchestrationInitiatorService.refreshGitHubInstallationToken(
            prototype_id,
            userJwtToken,
          );
        cachedInstallationToken = tokenData;
      }

      // Store GitHub info in developmentServerService
      developmentServerService.githubRepository = {
        installationToken: tokenData.installation_token,
        repositoryUrl: githubRepo.html_url,
        repositoryOwner: githubRepo.owner_login,
        repositoryName: githubRepo.repo_name,
        defaultBranch: githubRepo.default_branch || "main",
        fullName: githubRepo.full_name,
        tokenExpiresAt: tokenData.expires_at,
      };

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
          message:
            tokenError instanceof Error
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
    const syncResult =
      await developmentServerService.fileSyncService.syncFilesToSupabase(
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
    const { errors: fetchErrors } =
      await developmentServerService.fileSyncService.fetchAllFilesAndAssetsFromSupabaseAndWriteToDisk(
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
  await restoreClaudeSessions(
    prototype_id,
    request.log2,
    developmentServerService.supabaseClientService,
    developmentServerService.chatService,
  );

  // 2. Install dependencies with sandboxService runCommandInternal
  request.log2.consoleLogDevOnly("info", "Installing dependencies", {
    prototypeId: prototype_id,
  });

  const npmInstallResult =
    await developmentServerService.sandboxService.runCommandInternal({
      command: "npm",
      args: ["install"],
      cwd: `${WORK_DIR}/client`,
      session_id: "dev-server",
      timeout_ms: 180000, // 3 minutes
      strip_ansi: true,
    });

  if (npmInstallResult.response.error) {
    request.log2.error(
      new Error(npmInstallResult.response.error.error),
      "npm install failed, continuing anyway",
      {
        prototypeId: prototype_id,
        errorMessage: npmInstallResult.response.error.message,
      },
    );
  } else if (npmInstallResult.response.data?.status === "timeout") {
    request.log2.warn("npm install timed out, continuing anyway", {
      prototypeId: prototype_id,
      stdout: npmInstallResult.response.data.stdout,
    });
  } else if (npmInstallResult.response.data?.status === "success") {
    const stdout = npmInstallResult.response.data.stdout;
    // Check for common npm error indicators in output
    const hasErrors =
      stdout.includes("ERR!") ||
      stdout.includes("error") ||
      stdout.includes("failed");

    if (hasErrors) {
      request.log2.warn(
        "npm install completed but output contains error indicators, continuing anyway",
        {
          prototypeId: prototype_id,
          stdout,
        },
      );
    } else {
      request.log2.consoleLogDevOnly(
        "info",
        "npm install completed successfully",
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
    const startResult =
      await developmentServerService.developmentServerAdapter.startDevServer(
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

    // Start GitHub token refresh job if needed for this prototype
    if (hasGitHubRepo && !githubTokenJobStarted) {
      developmentServerService.startGitHubTokenRefreshJob(prototype_id);
      githubTokenJobStarted = true;
    }

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
    const { data, error: userFetchError } =
      await developmentServerService.supabaseClientService
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

  const commandString = `cd ${WORK_DIR} && git init && git config --global user.email "${userRow?.email}" && git config --global user.name "${userRow?.name}"`;
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
  if (!githubRepo) {
    throw new Error(
      "GitHub repository info not set in developmentServerService",
    );
  }

  // Fetch user info for git config
  let userRow;
  if (userId) {
    const { data, error: userFetchError } =
      await developmentServerService.supabaseClientService
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
  const authenticatedUrl = `https://x-access-token:${githubRepo.installationToken}@github.com/${githubRepo.fullName}.git`;

  // Clone the repository directly into WORK_DIR
  // Use find to remove all contents including hidden files
  const cloneCommand = `cd ${WORK_DIR} && find . -mindepth 1 -delete && git clone ${authenticatedUrl} . && git config user.email "${
    userRow?.email ?? "noreply@nucleate.dev"
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

async function cloneSourceRepositoryToTmp(
  prototypeId: string,
  developmentServerService: NucleateDevelopmentServerService,
  log2: SystemLogger,
): Promise<{ installation_token: string; expires_at: string }> {
  const sourceRepo = developmentServerService.sourceRepository;
  if (!sourceRepo) {
    throw new Error("Source repository not configured");
  }

  const userJwtToken =
    developmentServerService.supabaseClientService.getCurrentJwtToken();
  if (!userJwtToken) {
    throw new Error("User JWT token not available");
  }

  const tokenData =
    await developmentServerService.sandboxOrchestrationInitiatorService.refreshGitHubInstallationToken(
      prototypeId,
      userJwtToken,
    );

  developmentServerService.startGitHubTokenRefreshJob(prototypeId);

  const authenticatedUrl = `https://x-access-token:${tokenData.installation_token}@github.com/${sourceRepo.fullName}.git`;

  // Clone source repository using terminal command
  // Note: Don't remove the directory itself (owned by root), just clean contents and clone
  const cloneCommand = `mkdir -p /tmp/source-repository && find /tmp/source-repository -mindepth 1 -delete && git clone ${authenticatedUrl} /tmp/source-repository`;

  try {
    const cloneResult =
      await developmentServerService.terminalService.asyncSendInputWithCompletionDetectionOrTimeout(
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

  log2.info("Cloned source repository into /tmp/source-repository", {
    prototypeId,
    repositoryFullName: sourceRepo.fullName,
  });

  return tokenData;
}
