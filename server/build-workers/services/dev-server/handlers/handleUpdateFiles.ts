import { FastifyReply, FastifyRequest } from "fastify";
import fs from "fs/promises";
import path from "path";
import {
  DevServerStatus,
  PublicUpdateFilesV2Request,
  PublicUpdateFilesV2SuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { fetchUserPlan } from "../../../utils/credit-checks.js";
import { checkUserHasPrototypeEditAccess } from "../../../utils/prototypeAuth.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import { getWorkerContext, WORK_DIR } from "../../../worker.js";

export async function handleUpdateFilesImpl(
  request: FastifyRequest<{ Body: PublicUpdateFilesV2Request }>,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<PublicUpdateFilesV2SuccessResponse, StandardErrorResponse>
> {
  const {
    prototype_id,
    file_names,
    asset_names,
    deleted_file_names,
    deleted_asset_names,
  } = request.body;

  try {
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

    // Step 2: Validate user has edit access to prototype
    const authResult = await checkUserHasPrototypeEditAccess(
      prototype_id,
      jwtToken,
      request.log2,
    );

    if (!authResult || !authResult.user || !authResult.canEdit) {
      request.log2.error(
        new Error("User not authorized to edit prototype"),
        "Authorization failed",
        {
          prototypeId: prototype_id,
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

    // Step 3: Paywall check - ensure user is NOT on free plan
    const { teamId } = getWorkerContext();
    if (!teamId) {
      request.log2.error(
        new Error("Team ID missing in worker context"),
        "Team ID required for paywall check",
        {
          userId: authResult.user.id,
          prototypeId: prototype_id,
        },
      );
      reply.code(500);
      return {
        data: null,
        error: {
          error: "TEAM_CONTEXT_REQUIRED",
          message: "Team context required",
        },
      };
    }
    const userPlan = await fetchUserPlan(
      developmentServerService.supabaseClientService.getClient(),
      authResult.user.id,
      request.log2,
      teamId,
    );

    if (userPlan === "free") {
      request.log2.warn("Free tier user attempted to use update-files-v2", {
        userId: authResult.user.id,
        prototypeId: prototype_id,
      });
      reply.code(403);
      return {
        data: null,
        error: {
          error: "Forbidden",
          message:
            "This feature is not available on the free plan. Please upgrade to access hot-reloading.",
        },
      };
    }

    // invalidate any existing builds so far, since files have changed
    developmentServerService.developmentServerState.lastUpdatedTime =
      new Date();

    // Step 4: Check if package.json is in the updated files
    const packageJsonUpdated = file_names.includes("package.json");
    let hasPackageJsonChanges = false;

    if (packageJsonUpdated) {
      try {
        // Read current package.json from disk
        const packageJsonPath = path.join(WORK_DIR, "package.json");
        const currentPackageJson = await fs.readFile(packageJsonPath, "utf-8");

        // Fetch new package.json from Supabase
        const { data: newPackageJsonData, error: fetchError } =
          await developmentServerService.supabaseClientService
            .getClient()
            .from("prototype_files")
            .select("contents")
            .eq("prototype_id", prototype_id)
            .eq("name", "package.json")
            .single();

        if (fetchError) {
          request.log2.warn("Failed to fetch new package.json", {
            error: fetchError.message,
          });
        } else if (newPackageJsonData) {
          // Compare contents
          hasPackageJsonChanges =
            currentPackageJson.trim() !== newPackageJsonData.contents.trim();
          request.log2.consoleLogDevOnly(
            "info",
            "package.json change detection",
            {
              hasChanges: hasPackageJsonChanges,
            },
          );
        }
      } catch (error) {
        // If file doesn't exist, that's fine - it will be created
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          hasPackageJsonChanges = true;
          request.log2.consoleLogDevOnly(
            "info",
            "package.json does not exist on disk, will be created",
          );
        } else {
          request.log2.warn("Error reading package.json for comparison", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Step 5: Sync files from Supabase
    const syncResult =
      await developmentServerService.fileSyncService.syncSpecificFilesFromSupabase(
        prototype_id,
        file_names,
        asset_names,
        deleted_file_names || [],
        deleted_asset_names || [],
      );

    if (!syncResult.success) {
      request.log2.error(
        new Error("File sync failed"),
        "Failed to sync files from Supabase",
        {
          errors: syncResult.errors,
        },
      );
      reply.code(500);
      return {
        data: null,
        error: {
          error: "File sync failed",
          message: "Failed to sync files from Supabase",
          details: syncResult.errors.join(", "),
        },
      };
    }

    request.log2.consoleLogDevOnly("info", "Files synced successfully", {
      filesUpdated: syncResult.filesUpdated,
      assetsUpdated: syncResult.assetsUpdated,
      filesDeleted: syncResult.filesDeleted,
      assetsDeleted: syncResult.assetsDeleted,
    });

    // Step 6: If package.json changed, run npm install and restart dev server
    if (hasPackageJsonChanges) {
      try {
        request.log2.consoleLogDevOnly(
          "info",
          "package.json changed, running npm install and restarting dev server",
        );

        // Run npm install
        const npmInstallResult =
          await developmentServerService.sandboxService.runCommandInternal({
            command: "npm",
            args: ["install"],
            cwd: WORK_DIR,
            session_id: "test",
            timeout_ms: 60000,
            strip_ansi: true,
          });

        if (
          npmInstallResult.response.error ||
          npmInstallResult.response.data?.status !== "success"
        ) {
          request.log2.error(
            new Error("npm install failed"),
            "npm install failed",
            {
              error: npmInstallResult.response.error,
              stdout: npmInstallResult.response.data?.stdout,
            },
          );
          reply.code(500);
          return {
            data: null,
            error: {
              error: "npm install failed",
              message: "Failed to install dependencies",
              details: npmInstallResult.response.error?.message,
            },
          };
        }

        request.log2.consoleLogDevOnly(
          "info",
          "npm install completed successfully",
        );

        // Restart dev server
        developmentServerService.developmentServerState.devServerStatus =
          DevServerStatus.RESTARTING;
        await developmentServerService.developmentServerAdapter.restartDevServer(
          request.log2,
        );
        developmentServerService.developmentServerState.devServerStatus =
          DevServerStatus.RUNNING;
        request.log2.consoleLogDevOnly(
          "info",
          "Dev server restarted successfully",
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        request.log2.error(
          new Error(errorMessage),
          "Error during npm install or dev server restart",
        );
        reply.code(500);
        return {
          data: null,
          error: {
            error: "Post-sync operation failed",
            message: "Error during npm install or dev server restart",
            details: errorMessage,
          },
        };
      }
    }

    // Step 7: Return success response
    reply.status(200);
    return {
      data: {
        dev_server_restarted: packageJsonUpdated,
      },
      error: null,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    request.log2.error(
      new Error(errorMessage),
      "Internal server error in handleUpdateFilesV2",
      { stack: errorStack },
    );
    reply.code(500);
    return {
      data: null,
      error: {
        error: "Internal server error",
        message: errorMessage,
      },
    };
  }
}
