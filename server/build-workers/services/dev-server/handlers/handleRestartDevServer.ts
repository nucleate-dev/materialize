import { FastifyReply, FastifyRequest } from "fastify";
import {
  DevServerStatus,
  PublicDevServerRestartSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import { getWorkerContext } from "../../../worker.js";
import { checkUserHasPrototypeEditAccess } from "../../../utils/prototypeAuth.js";

export async function handleRestartDevServerImpl(
  request: FastifyRequest,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<
    PublicDevServerRestartSuccessResponse,
    StandardErrorResponse
  >
> {
  // Step 1: Extract JWT token from Authorization header
  const authHeader = request.headers.authorization;
  let jwtToken: string | undefined;

  if (authHeader) {
    if (authHeader.startsWith("Bearer ")) {
      jwtToken = authHeader.substring(7);
    } else {
      jwtToken = authHeader;
    }
  }

  const { prototypeId } = getWorkerContext();
  if (!prototypeId) {
    request.log2.warn("No prototype ID found", {
      prototypeId: prototypeId ?? "",
    });
    reply.code(400);
    return {
      data: null,
      error: {
        error: "Bad request",
        message: "No prototype ID found",
      },
    };
  }

  // Step 2: Validate user has edit access to prototype
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
        prototypeId: prototypeId,
        hasAuthResult: !!authResult,
        hasUser: !!authResult?.user,
        canEdit: authResult?.canEdit,
      },
    );
    reply.code(401);
    return {
      data: null,
      error: {
        error: "Unauthorized",
        message: "You do not have permission to edit this prototype",
      },
    };
  }

  // Step 3: restart the dev server
  developmentServerService.developmentServerState.devServerStatus =
    DevServerStatus.RESTARTING;
  await developmentServerService.developmentServerAdapter.restartDevServer(
    request.log2,
  );
  developmentServerService.developmentServerState.devServerStatus =
    DevServerStatus.RUNNING;
  return {
    data: {
      message: "restarted",
    },
    error: null,
  };
}
