import { FastifyReply, FastifyRequest } from "fastify";
import {
  PublicDevServerStopSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
  DevServerStatus,
  OperationStatus,
  HTTP_STATUS,
} from "../../../types/BuildWorkerTypes.js";
import { MaterializeDevelopmentServerService } from "../MaterializeDevelopmentServerService.js";
import { getWorkerContext } from "../../../worker.js";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import { uploadAllClaudeSessionsToSupabase } from "../../../utils/shared-utils.js";
import { uploadDirectoryToS3 } from "../s3-upload-utils.js";

export async function handleCleanup(
  request: FastifyRequest<{}>,
  reply: FastifyReply,
  developmentServerService: MaterializeDevelopmentServerService,
): Promise<
  SandboxAPIResponse<PublicDevServerStopSuccessResponse, StandardErrorResponse>
> {
  const state = developmentServerService.developmentServerState;

  // 1. Check if build is valid (check state). If it is valid, then:
  if (state.buildIsValid) {
    request.log2.consoleLogDevOnly(
      "info",
      "Build is valid, stopping dev server and uploading files",
    );

    // 1.1. Stop the dev server
    try {
      await developmentServerService.developmentServerAdapter.stopDevServer(
        request.log2,
      );
      request.log2.consoleLogDevOnly("info", "Dev server stopped successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      request.log2.error(new Error(errorMessage), "Failed to stop dev server");
    }

    // TODO: eventually move cloudflare tunnel kill to here and sync supabase files here
    // so that the dev server can continue to be active while we are building in case the user comes back

    // 1.4. Return a success response
    state.devServerStatus = DevServerStatus.STOPPED;
    state.buildIsValid = false;

    reply.code(HTTP_STATUS.OK);
    return {
      data: {
        server_operation_status: OperationStatus.IDLE,
        server_status: DevServerStatus.STOPPED,
      },
      error: null,
    };
  } else if (state.isBuilding) {
    reply.code(HTTP_STATUS.OK);
    return {
      data: null,
      error: {
        error: "Operation in progress",
        message:
          "Build or deploy operation is already in progress. Check again later.",
      },
    };
  } else {
    // 3. It is not valid and not building.
    request.log2.consoleLogDevOnly(
      "info",
      "Build is not valid, triggering build and deploy",
    );
    // 3.1. Set is building state to true
    developmentServerService.developmentServerState.isBuilding = true;
    // 3.2. Call triggerDevServerBuildAndThenUploadToS3() and DO NOT await the response
    const { prototypeId } = getWorkerContext();
    if (prototypeId) {
      triggerBackgroundDevServerBuildAndUploadToS3(
        developmentServerService,
        prototypeId,
        request.log2,
      ).catch((error) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        request.log2.error(
          new Error(errorMessage),
          "Background build and deploy failed",
        );
      });
    } else {
      request.log2.error(
        new Error("No prototypeId in worker context"),
        "Cannot trigger build without prototypeId",
      );
    }

    // 3.3. Set reply to 200 BUT return an error response saying build is in progress
    reply.code(HTTP_STATUS.OK);
    return {
      data: null,
      error: {
        error: "Build started",
        message:
          "Build and deploy operation has been started in the background",
      },
    };
  }
}

async function triggerBackgroundDevServerBuildAndUploadToS3(
  developmentServerService: MaterializeDevelopmentServerService,
  prototypeId: string,
  log2: SystemLogger,
): Promise<void> {
  // 1. Kill the cloudflare tunnel
  try {
    await developmentServerService.cloudflareTunnelManagementService.killTunnel();
    log2.consoleLogDevOnly("info", "Cloudflare tunnel killed successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log2.error(new Error(errorMessage), "Failed to kill Cloudflare tunnel");
  }

  if (!developmentServerService.s3Client) {
    throw new Error("S3 client not initialized");
  }

  // 2. Build the project using the adapter
  developmentServerService.developmentServerState.isBuilding = true;
  const buildResult =
    await developmentServerService.developmentServerAdapter.build(log2);
  developmentServerService.developmentServerState.isBuilding = false;
  if (buildResult.error) {
    throw new Error(buildResult.error.message);
  }
  developmentServerService.developmentServerState.buildIsValid = true;
  log2.consoleLogDevOnly("info", "Build completed successfully");

  // 3. Upload the build to S3
  const uploadResult = await uploadDirectoryToS3(
    log2,
    buildResult.data.output_path,
    `${prototypeId}`,
    developmentServerService.s3Client,
  );
  developmentServerService.developmentServerState.builtVersion =
    uploadResult.version;

  // 4. Sync files to Supabase
  try {
    const syncResult =
      await developmentServerService.fileSyncService.syncFilesToSupabase(
        prototypeId,
        "all",
      );
    if (syncResult.success) {
      log2.consoleLogDevOnly("info", "Files synced to Supabase successfully", {
        filesUpdated: syncResult.filesUpdated,
        assetsUpdated: syncResult.assetsUpdated,
      });
    } else {
      log2.warn("File sync completed with errors", {
        errors: syncResult.errors,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log2.error(new Error(errorMessage), "Failed to sync files to Supabase");
  }

  // 5. Sync terminal output to supabase storage
  try {
    const persistenceResult =
      await developmentServerService.terminalService.persistTrackedTerminalLogs(
        log2,
      );
    if (persistenceResult.failed.length > 0) {
      log2.warn("Terminal log persistence completed with errors", {
        prototypeId: persistenceResult.prototypeId,
        failed: persistenceResult.failed,
        uploaded: persistenceResult.uploaded.length,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log2.warn("Failed to persist terminal logs after S3 upload", {
      prototypeId,
      error: errorMessage,
    });
  }

  // 6. Upload claude sessions to supabase storage
  // Upload all Claude session files to Supabase before build
  try {
    const uploadResult = await uploadAllClaudeSessionsToSupabase(
      prototypeId,
      developmentServerService.supabaseClientService.getClient(),
      log2,
    );

    log2.info(
      "Claude session upload before Expo build, " +
        `Uploaded ${uploadResult.uploadedCount} session files`,
      {
        success: uploadResult.success,
        errorCount: uploadResult.errors.length,
        errors: uploadResult.errors,
      },
    );

    if (!uploadResult.success) {
      log2.warn("Claude session upload had errors", {
        prototypeId: prototypeId,
        errorCount: uploadResult.errors.length,
        errors: uploadResult.errors,
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log2.warn("Proceeding with Expo build despite session upload failure", {
      prototypeId: prototypeId,
      error: errorMessage,
    });
  }
}
