import { FastifyReply, FastifyRequest } from "fastify";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import {
  BuildStatusResponse,
  HTTP_STATUS,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { getWorkerContext } from "../../../worker.js";
import { checkUserHasPrototypeEditAccess } from "../../../utils/prototypeAuth.js";

export async function handleBuildStatusImpl(
  request: FastifyRequest,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<SandboxAPIResponse<BuildStatusResponse, StandardErrorResponse>> {
  const authHeader = request.headers.authorization;
  let jwtToken: string | undefined;

  if (authHeader) {
    jwtToken = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;
  }

  const { prototypeId } = getWorkerContext();
  if (!prototypeId) {
    reply.status(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "Bad request",
        message: "No prototype ID found for sandbox",
      },
    };
  }

  const authResult = await checkUserHasPrototypeEditAccess(
    prototypeId,
    jwtToken,
    request.log2,
  );

  if (!authResult || !authResult.user || !authResult.canEdit) {
    reply.status(HTTP_STATUS.UNAUTHORIZED);
    return {
      data: null,
      error: {
        error: "Unauthorized",
        message: "You do not have permission to access this prototype",
      },
    };
  }

  const { buildStartTime, lastUpdatedTime, isBuilding } =
    developmentServerService.developmentServerState;

  const isBuildValid = lastUpdatedTime <= buildStartTime;

  reply.status(HTTP_STATUS.OK);
  return {
    data: {
      is_build_valid: isBuildValid,
      is_building: isBuilding,
      build_start_time: buildStartTime.toISOString(),
      last_updated_time: lastUpdatedTime.toISOString(),
    },
    error: null,
  };
}

