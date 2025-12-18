import { FastifyReply, FastifyRequest } from "fastify";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import { uploadDirectoryToS3 } from "../s3-upload-utils.js";
import {
  BuildAndDeployResponse,
  HTTP_STATUS,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { getWorkerContext } from "../../../worker.js";
import { checkUserHasPrototypeEditAccess } from "../../../utils/prototypeAuth.js";

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

  // Set building state
  developmentServerService.developmentServerState.isBuilding = true;
  developmentServerService.developmentServerState.buildError = undefined;
  developmentServerService.developmentServerState.buildStartTime = new Date();

  try {
    log2.consoleLogDevOnly("info", "Starting build process");
    const buildResult =
      await developmentServerService.developmentServerAdapter.build(log2);

    if (buildResult.error || !buildResult.data) {
      const errorMsg = buildResult.error?.message || "Build failed";
      log2.error(new Error(errorMsg), "Build failed");
      developmentServerService.developmentServerState.isBuilding = false;
      developmentServerService.developmentServerState.buildError = errorMsg;
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Internal server error",
          message: errorMsg,
        },
      };
    }

    log2.consoleLogDevOnly("info", "Build completed successfully", {
      outputPath: buildResult.data.output_path,
    });
    developmentServerService.developmentServerState.isBuilding = false;

    // Step 2: Upload to S3
    if (!developmentServerService.s3Client) {
      const errorMsg = "S3 client not configured";
      log2.error(new Error(errorMsg), "S3 client not available");
      reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Internal server error",
          message: errorMsg,
        },
      };
    }

    // 3. Upload the build to S3
    const uploadResult = await uploadDirectoryToS3(
      log2,
      buildResult.data.output_path,
      `${prototypeId}`,
      developmentServerService.s3Client,
    );
    developmentServerService.developmentServerState.builtVersion =
      uploadResult.version;

    log2.consoleLogDevOnly("info", "Build and deploy completed successfully", {
      prototypeId,
      version: uploadResult.version,
      uploadedFileCount: uploadResult.uploadResults.length,
    });

    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        message: "Build and upload was successful",
      },
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log2.error(
      error instanceof Error ? error : new Error(errorMessage),
      "Failed to build and deploy",
    );

    developmentServerService.developmentServerState.isBuilding = false;
    developmentServerService.developmentServerState.buildError = `S3 upload failed: ${errorMessage}`;

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
