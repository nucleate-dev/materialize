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

  // TODO: Finish add-context flow (fetch repo details, set source repo state, etc.)
  reply.code(HTTP_STATUS.OK);
  return {
    data: {
      message: "Context linked",
    },
    error: null,
  };
}
