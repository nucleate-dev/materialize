import { FastifyReply, FastifyRequest } from "fastify";
import {
  DevServerStatus,
  HTTP_STATUS,
  ResetSandboxSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import {
  getWorkerContext,
  resetWorkerContext,
  SOURCE_REPO_DIR,
} from "../../../worker.js";
import { clearAllClaudeSessions } from "../../../utils/shared-utils.js";
import { runCommandAsRoot } from "../../../utils/rootCommandUtils.js";

/**
 * Handles /reset-sandbox endpoint
 * INTERNAL TOOLS ONLY - Resets the sandbox to a clean state
 *
 * Steps:
 * 1. Reset project files (clean workspace and tracked changes)
 * 2. Clear all Claude session files
 * 3. Reset worker context (userId and prototypeId)
 * 4. Return the prototype_id that was cleaned up
 */
export async function handleResetSandbox(
  request: FastifyRequest,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<ResetSandboxSuccessResponse, StandardErrorResponse>
> {
  const { prototypeId } = getWorkerContext();

  request.log2.consoleLogDevOnly("info", "Resetting sandbox", {
    prototypeId,
  });

  try {
    // Step 1: Reset project files using FileSyncService
    try {
      await developmentServerService.fileSyncService.resetProjectFiles();
      request.log2.consoleLogDevOnly(
        "info",
        "Project files reset successfully",
      );
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      request.log2.error(
        new Error(errorMessage),
        "Failed to reset project files",
      );
      throw new Error(`Failed to reset project files: ${errorMessage}`);
    }

    // Step 2: Clear source repository contents (but keep the directory itself)
    try {
      await runCommandAsRoot(
        "bash",
        ["-lc", `find ${SOURCE_REPO_DIR} -mindepth 1 -delete`],
        { timeoutMs: 60000 },
      );
      request.log2.consoleLogDevOnly(
        "info",
        "Source repository contents cleared successfully",
      );
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      request.log2.error(
        new Error(errorMessage),
        "Failed to clear source repository contents",
      );
      throw new Error(
        `Failed to clear source repository contents: ${errorMessage}`,
      );
    }

    // Step 3: Clear all Claude session files
    let claudeSessionsCleared = false;
    let claudeSessionsDeletedCount = 0;
    try {
      const clearResult = await clearAllClaudeSessions(request.log2);
      claudeSessionsCleared = clearResult.success;
      claudeSessionsDeletedCount = clearResult.deletedCount;

      if (clearResult.success) {
        request.log2.consoleLogDevOnly(
          "info",
          "Claude sessions cleared successfully",
          {
            deletedCount: clearResult.deletedCount,
          },
        );
      } else {
        request.log2.warn("Claude sessions cleared with errors", {
          deletedCount: clearResult.deletedCount,
          errors: clearResult.errors,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      request.log2.error(
        new Error(errorMessage),
        "Failed to clear Claude sessions",
      );
      // Don't throw - continue with reset even if Claude sessions fail
    }

    // Step 4: Stop the dev server
    try {
      await developmentServerService.developmentServerAdapter.stopDevServer(
        request.log2,
      );
      developmentServerService.developmentServerState.devServerStatus =
        DevServerStatus.STOPPED;
      request.log2.consoleLogDevOnly("info", "Dev server stopped successfully");
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      request.log2.error(new Error(errorMessage), "Failed to stop dev server");
    }

    // Step 5: Reset worker context
    resetWorkerContext();
    request.log2.consoleLogDevOnly("info", "Worker context reset successfully");

    // Step 6: Return success response with the prototype_id that was cleaned up
    reply.code(HTTP_STATUS.OK);
    return {
      data: {
        prototype_id: prototypeId || null,
        message: "Sandbox reset successfully",
        files_cleared: true,
        claude_sessions_cleared: claudeSessionsCleared,
        claude_sessions_deleted_count: claudeSessionsDeletedCount,
      },
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    request.log2.error(new Error(errorMessage), "Failed to reset sandbox");

    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Reset failed",
        message: errorMessage,
      },
    };
  }
}
