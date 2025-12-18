import { FastifyReply, FastifyRequest } from "fastify";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import {
  BuildAndDeployResponse,
  HTTP_STATUS,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { getWorkerContext } from "../../../worker.js";
import { checkUserHasPrototypeEditAccess } from "../../../utils/prototypeAuth.js";
import { triggerDevServerBuildAndUploadToS3 } from "./handleCleanup.js";

export async function handleBuildAndDeployImpl(
  request: FastifyRequest,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<SandboxAPIResponse<BuildAndDeployResponse, StandardErrorResponse>> {
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
  const log2 = request.log2;

  // 1. Check if build is valid (check state). If it is valid, then return success:
  if (
    developmentServerService.developmentServerState.buildStartTime >=
      developmentServerService.developmentServerState.lastUpdatedTime &&
    !developmentServerService.developmentServerState.isBuilding
  ) {
    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        message: "There is already a valid build.",
      },
      error: null,
    };
  } else if (developmentServerService.developmentServerState.isBuilding) {
    reply.status(HTTP_STATUS.CONFLICT);
    return {
      data: null,
      error: {
        error: "Conflict",
        message: "Build is already in progress.",
      },
    };
  } else {
    // Build is not valid and not building - trigger build and upload
    try {
      log2.consoleLogDevOnly("info", "Starting build and deploy process");

      // Use the shared function that handles build, upload, and all persistence steps
      await triggerDevServerBuildAndUploadToS3(
        developmentServerService,
        prototypeId,
        log2,
      );

      log2.consoleLogDevOnly("info", "Build and deploy completed successfully", {
        prototypeId,
        version: developmentServerService.developmentServerState.builtVersion,
      });

      reply.status(HTTP_STATUS.OK);
      return {
        data: {
          message: "Build and upload was successful",
        },
        error: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log2.error(
        error instanceof Error ? error : new Error(errorMessage),
        "Failed to build and deploy",
      );

      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Internal server error",
          message: `There was an error: ${errorMessage}`,
        },
      };
    }
  }
}
