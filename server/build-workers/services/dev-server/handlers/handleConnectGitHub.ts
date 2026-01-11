import { FastifyReply, FastifyRequest } from "fastify";
import {
  HTTP_STATUS,
  PublicConnectGitHubSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import { getWorkerContext, WORK_DIR } from "../../../worker.js";

/**
 * Connects an existing dev server to a newly created GitHub repository.
 * This is called after a user creates a GitHub repo for a prototype that already has
 * an active sandbox with code.
 *
 * Steps:
 * 1. Refetch the prototype to get the github_repo_id
 * 2. Fetch the GitHub repository info
 * 3. Get a fresh GitHub installation token
 * 4. Set the git remote origin
 * 5. Push all existing commits to the GitHub repository
 * 6. Start the token refresh job
 */
export async function handleConnectGitHubImpl(
  request: FastifyRequest,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<PublicConnectGitHubSuccessResponse, StandardErrorResponse>
> {
  const { prototypeId } = getWorkerContext();

  if (!prototypeId) {
    reply.code(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "Missing prototype context",
        message: "No prototype_id available in worker context",
      },
    };
  }

  request.log2.info("Connecting existing dev server to GitHub", {
    prototypeId,
  });

  // 1. Refetch prototype to get github_repo_id
  const { data: prototypeRow, error: prototypeError } =
    await developmentServerService.supabaseClientService
      .getClient()
      .from("prototypes")
      .select("github_repo_id, team_id")
      .eq("id", prototypeId)
      .single();

  if (prototypeError) {
    request.log2.error(
      prototypeError,
      "Failed to fetch prototype information",
      { prototypeId },
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

  if (!prototypeRow.github_repo_id) {
    reply.code(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "No GitHub repository",
        message: "This prototype does not have a linked GitHub repository",
      },
    };
  }

  // 2. Fetch GitHub repository info
  const { data: githubRepo, error: githubRepoError } =
    await developmentServerService.supabaseClientService
      .getClient()
      .from("github_repositories")
      .select("*")
      .eq("github_repo_id", prototypeRow.github_repo_id)
      .single();

  if (githubRepoError || !githubRepo) {
    request.log2.error(
      githubRepoError ?? new Error("GitHub repository not found"),
      "Failed to fetch GitHub repository info",
      { prototypeId, githubRepoId: prototypeRow.github_repo_id },
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

  // 3. Get a fresh installation token
  try {
    const userJwtToken = developmentServerService.supabaseClientService
      .getCurrentJwtToken();
    if (!userJwtToken) {
      throw new Error("User JWT token not available");
    }

    const tokenData = await developmentServerService
      .sandboxOrchestrationInitiatorService.refreshGitHubInstallationToken(
        prototypeId,
        userJwtToken,
      );

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
      prototypeId,
      repositoryFullName: githubRepo.full_name,
      defaultBranch: githubRepo.default_branch,
    });

    // 4. Set git remote origin and push to GitHub
    const authenticatedUrl =
      `https://x-access-token:${tokenData.installation_token}@github.com/${githubRepo.full_name}.git`;

    // Check if remote already exists and update it, or add it if it doesn't
    const setRemoteCommand =
      `cd ${WORK_DIR} && (git remote get-url origin > /dev/null 2>&1 && git remote set-url origin ${authenticatedUrl} || git remote add origin ${authenticatedUrl})`;

    const setRemoteResult = await developmentServerService.sandboxService
      .runCommandInternal({
        command: "sh",
        args: ["-c", setRemoteCommand],
        cwd: WORK_DIR,
        session_id: "test",
        timeout_ms: 10000,
        strip_ansi: true,
      });

    if (setRemoteResult.response.error) {
      request.log2.error(
        new Error(setRemoteResult.response.error.error),
        "Failed to set git remote origin",
        {
          prototypeId,
          errorMessage: setRemoteResult.response.error.message,
        },
      );
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Failed to configure git remote",
          message: setRemoteResult.response.error.message,
        },
      };
    }

    // 5. Push all commits to GitHub
    const defaultBranch = githubRepo.default_branch || "main";
    const pushCommand = `cd ${WORK_DIR} && git push -u origin ${defaultBranch}`;

    const pushResult = await developmentServerService.sandboxService
      .runCommandInternal({
        command: "sh",
        args: ["-c", pushCommand],
        cwd: WORK_DIR,
        session_id: "test",
        timeout_ms: 60000, // 1 minute for push
        strip_ansi: true,
      });

    if (pushResult.response.error) {
      request.log2.error(
        new Error(pushResult.response.error.error),
        "Failed to push commits to GitHub",
        {
          prototypeId,
          errorMessage: pushResult.response.error.message,
        },
      );
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Failed to push to GitHub",
          message: pushResult.response.error.message,
        },
      };
    }

    request.log2.info("Successfully pushed commits to GitHub", {
      prototypeId,
      repositoryFullName: githubRepo.full_name,
      defaultBranch,
    });

    // 6. Start the token refresh job
    developmentServerService.startGitHubTokenRefreshJob(prototypeId);

    reply.code(HTTP_STATUS.OK);
    return {
      data: {
        message: "Successfully connected to GitHub repository",
        repository_url: githubRepo.html_url,
        repository_full_name: githubRepo.full_name,
      },
      error: null,
    };
  } catch (error) {
    request.log2.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to connect to GitHub",
      { prototypeId },
    );
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to connect to GitHub",
        message: error instanceof Error
          ? error.message
          : "An unexpected error occurred",
      },
    };
  }
}
