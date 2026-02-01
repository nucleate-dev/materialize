import { FastifyReply, FastifyRequest } from "fastify";
import {
  HTTP_STATUS,
  PublicDevServerAddContextRequest,
  PublicDevServerAddContextSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import { getWorkerContext } from "../../../worker.js";
import { checkUserHasPrototypeEditAccess } from "../../../utils/prototypeAuth.js";
import { cloneSourceRepositoryToTmp } from "./handleStartDevServer.js";

export async function handleAddContextImpl(
  request: FastifyRequest<{ Body: PublicDevServerAddContextRequest }>,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<
    PublicDevServerAddContextSuccessResponse,
    StandardErrorResponse
  >
> {
  const authHeader = request.headers.authorization;
  let jwtToken: string | undefined;

  if (authHeader) {
    jwtToken = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;
  }

  const { prototypeId } = getWorkerContext();
  if (!prototypeId) {
    reply.code(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "Bad request",
        message: "No prototype ID found",
      },
    };
  }

  const authResult = await checkUserHasPrototypeEditAccess(
    prototypeId,
    jwtToken,
    request.log2,
  );

  if (!authResult || !authResult.user || !authResult.canEdit) {
    request.log2.error(
      new Error("User not authorized to edit prototype"),
      "Authorization failed",
      {
        prototypeId,
        hasAuthResult: !!authResult,
        hasUser: !!authResult?.user,
        canEdit: authResult?.canEdit,
      },
    );
    reply.code(HTTP_STATUS.UNAUTHORIZED);
    return {
      data: null,
      error: {
        error: "Unauthorized",
        message: "You do not have permission to edit this prototype",
      },
    };
  }

  if (developmentServerService.sourceRepository) {
    reply.code(HTTP_STATUS.CONFLICT);
    return {
      data: null,
      error: {
        error: "Context already linked",
        message: "Context is already linked for this prototype",
      },
    };
  }

  const { github } = request.body;
  if (!github || !github.github_repo_id) {
    reply.code(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "Missing GitHub context",
        message: "github.github_repo_id is required",
      },
    };
  }

  const { error: insertError } = await developmentServerService
    .supabaseClientService.getClient()
    .from("prototype_sensitive_metadata")
    .insert({
      prototype_id: prototypeId,
      source_repo_id: github.github_repo_id,
    });

  if (insertError) {
    request.log2.error(
      insertError,
      "Failed to insert prototype sensitive metadata",
      { prototypeId, githubRepoId: github.github_repo_id },
    );
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to link context",
        message: insertError.message,
      },
    };
  }

  if (!jwtToken) {
    reply.code(HTTP_STATUS.UNAUTHORIZED);
    return {
      data: null,
      error: {
        error: "Unauthorized",
        message: "Missing Authorization header",
      },
    };
  }

  const teamId = authResult.prototype.team_id;
  if (!teamId) {
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Missing team id",
        message: "Unable to resolve team id for this prototype",
      },
    };
  }

  try {
    const sourceRepoResponse = await developmentServerService
      .sandboxOrchestrationInitiatorService.fetchGitHubSourceRepo(
        prototypeId,
        teamId,
        github.github_repo_id,
      );

    developmentServerService.setSourceRepository({
      githubRepoId: sourceRepoResponse.source_repo.github_repo_id,
      installationId: sourceRepoResponse.source_repo.installation_id,
      repositoryUrl: sourceRepoResponse.source_repo.repository_url,
      repositoryOwner: sourceRepoResponse.source_repo.repository_owner,
      repositoryName: sourceRepoResponse.source_repo.repository_name,
      defaultBranch: sourceRepoResponse.source_repo.default_branch,
      fullName: sourceRepoResponse.source_repo.full_name,
    });

    if (!developmentServerService.githubInstallationToken) {
      developmentServerService.githubInstallationToken = {
        installationToken: sourceRepoResponse.installation_token,
        tokenExpiresAt: sourceRepoResponse.expires_at,
      };
      developmentServerService.startGitHubTokenRefreshJob(prototypeId);
    }

    await cloneSourceRepositoryToTmp(
      prototypeId,
      developmentServerService,
      request.log2,
      sourceRepoResponse.installation_token,
      "test",
    );

    reply.code(HTTP_STATUS.OK);
    return {
      data: {
        message: "Context linked",
      },
      error: null,
    };
  } catch (error) {
    request.log2.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to fetch or clone GitHub source repository after linking context",
      { prototypeId, githubRepoId: github.github_repo_id, teamId },
    );
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to link context",
        message: error instanceof Error
          ? error.message
          : "Failed to fetch or clone source repository details",
      },
    };
  }
}
