import { FastifyReply, FastifyRequest } from "fastify";
import {
  DevServerStatus,
  HTTP_STATUS,
  PublicDevServerStartSuccessResponse,
  PublicStartDevServerRequest,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import { restoreClaudeSessionsFromSupabase } from "../../../utils/shared-utils.js";
import { ChatService } from "../../chat/ChatService.js";
import { syncPrototypeEnvVarsToDisk } from "../utils/envVarUtils.js";
import { getWorkerContext, WORK_DIR } from "../../../worker.js";
import { DEFAULT_PROTOTYPE_FRAMEWORK } from "../NucleateDevelopmentServerService.js";
import { NextJsReactAdapter } from "../adapters/NextJsReactAdapter.js";
import { SupabaseClientService } from "../../SupabaseClientService.js";

export async function handleStartDevServerImpl(
  request: FastifyRequest<{ Body: PublicStartDevServerRequest }>,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<PublicDevServerStartSuccessResponse, StandardErrorResponse>
> {
  const { prototype_id } = request.body;
  if (!prototype_id) {
    reply.code(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "Missing required parameters",
        message: "prototype_id is required",
      },
    };
  }
  // Note: auth already happens by control-plane before calling this route
  const { userId } = getWorkerContext();

  // if web, set the adapter to the NextJsReactAdapter with the correct tunnel hostname
  const resolvedFramework =
    developmentServerService.prototypeFramework ?? DEFAULT_PROTOTYPE_FRAMEWORK;
  if (resolvedFramework === "web_nextjs_react") {
    const tunnelHostname = developmentServerService.cloudflareTunnelHostname;
    if (!tunnelHostname) {
      request.log2.error(
        new Error("Missing Cloudflare tunnel hostname"),
        "Cannot start Next.js dev server without tunnel hostname",
      );
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Missing tunnel hostname",
          message: "Unable to start dev server without Cloudflare hostname",
        },
      };
    }
    developmentServerService.developmentServerAdapter = new NextJsReactAdapter(
      developmentServerService.terminalService,
      tunnelHostname,
    );
  }

  if (
    developmentServerService.developmentServerState.devServerStatus ===
      DevServerStatus.RUNNING ||
    developmentServerService.developmentServerState.devServerStatus ===
      DevServerStatus.STARTING
  ) {
    reply.code(HTTP_STATUS.CONFLICT);
    return {
      data: null,
      error: {
        error: "Development server is already started or starting",
        message: "Development server is already started or starting",
      },
    };
  }

  // 0. Initialize git
  await initializeGit(developmentServerService, userId, request.log2);

  // 1. Fetch necessary files (project files + assets, past claude sessions)
  const { errors: fetchErrors } =
    await developmentServerService.fileSyncService.fetchAllFilesAndAssetsFromSupabaseAndWriteToDisk(
      prototype_id,
    );
  if (fetchErrors.length > 0) {
    const errorMsg = fetchErrors.join("; ");
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to fetch files and assets from Supabase",
        message: errorMsg,
      },
    };
  }

  const envSyncResult = await syncPrototypeEnvVarsToDisk({
    prototypeId: prototype_id,
    supabaseClientService: developmentServerService.supabaseClientService,
    logger: request.log2,
  });

  if (!envSyncResult.success) {
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to synchronize environment variables",
        message: envSyncResult.error ?? "Failed to sync env vars",
      },
    };
  }
  await restoreClaudeSessions(
    prototype_id,
    request.log2,
    developmentServerService.supabaseClientService,
    developmentServerService.chatService,
  );

  // 2. Install dependencies with sandboxService runCommandInternal
  request.log2.consoleLogDevOnly("info", "Installing dependencies", {
    prototypeId: prototype_id,
  });

  const npmInstallResult =
    await developmentServerService.sandboxService.runCommandInternal({
      command: "npm",
      args: ["install"],
      cwd: `${WORK_DIR}/client`,
      session_id: "dev-server",
      timeout_ms: 180000, // 3 minutes
      strip_ansi: true,
    });

  if (npmInstallResult.response.error) {
    request.log2.error(
      new Error(npmInstallResult.response.error.error),
      "npm install failed, continuing anyway",
      {
        prototypeId: prototype_id,
        errorMessage: npmInstallResult.response.error.message,
      },
    );
  } else if (npmInstallResult.response.data?.status === "timeout") {
    request.log2.warn("npm install timed out, continuing anyway", {
      prototypeId: prototype_id,
      stdout: npmInstallResult.response.data.stdout,
    });
  } else if (npmInstallResult.response.data?.status === "success") {
    const stdout = npmInstallResult.response.data.stdout;
    // Check for common npm error indicators in output
    const hasErrors =
      stdout.includes("ERR!") ||
      stdout.includes("error") ||
      stdout.includes("failed");

    if (hasErrors) {
      request.log2.warn(
        "npm install completed but output contains error indicators, continuing anyway",
        {
          prototypeId: prototype_id,
          stdout,
        },
      );
    } else {
      request.log2.consoleLogDevOnly(
        "info",
        "npm install completed successfully",
        {
          prototypeId: prototype_id,
        },
      );
    }
  }

  // 3. Start the development server
  developmentServerService.developmentServerState.devServerStatus =
    DevServerStatus.STARTING;

  try {
    const startResult =
      await developmentServerService.developmentServerAdapter.startDevServer(
        request.log2,
      );

    if (startResult.error) {
      request.log2.error(
        new Error(startResult.error.error),
        "Failed to start development server",
        {
          prototypeId: prototype_id,
          errorMessage: startResult.error.message,
        },
      );
      developmentServerService.developmentServerState.devServerStatus =
        DevServerStatus.ERROR;
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Failed to start development server",
          message: startResult.error.message,
          details: startResult.error.details,
        },
      };
    }

    // Dev server started successfully
    developmentServerService.developmentServerState.devServerStatus =
      DevServerStatus.RUNNING;
    developmentServerService.developmentServerState.tunnelUrl =
      startResult.data.tunnel_url;

    request.log2.consoleLogDevOnly(
      "info",
      "Development server started successfully",
      {
        prototypeId: prototype_id,
        tunnelUrl: startResult.data.tunnel_url,
      },
    );

    reply.code(HTTP_STATUS.OK);
    return {
      data: {
        tunnel_url: startResult.data.tunnel_url,
      },
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    request.log2.error(
      new Error(errorMessage),
      "Exception while starting development server",
      {
        prototypeId: prototype_id,
      },
    );
    developmentServerService.developmentServerState.devServerStatus =
      DevServerStatus.ERROR;
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to start development server",
        message: errorMessage,
      },
    };
  }
}

/**
 * Restores Claude session .jsonl files from Supabase Storage to ~/.claude/projects/
 */
async function restoreClaudeSessions(
  prototypeId: string,
  log2: SystemLogger,
  supabaseClientService: SupabaseClientService,
  chatService: ChatService,
): Promise<void> {
  try {
    // Restore all session files from Storage
    const result = await restoreClaudeSessionsFromSupabase(
      prototypeId,
      supabaseClientService.getClient(),
      log2,
    );

    // Register restored session IDs with ChatService for validation
    if (result.restoredSessionIds.length > 0) {
      chatService.registerValidSessionIds(result.restoredSessionIds);
    }

    // Log any errors but don't fail the dev server start
    if (result.errors.length > 0) {
      log2.warn("Claude session restoration had errors", {
        prototypeId,
        errorCount: result.errors.length,
        errors: result.errors,
      });
    }
  } catch (error) {
    log2.error(
      error instanceof Error ? error : new Error(String(error)),
      "Error restoring Claude sessions",
      { prototypeId },
    );
  }
}

// TODO: Initialize with user's OAuth, clone existing repo, etc
async function initializeGit(
  developmentServerService: NucleateDevelopmentServerService,
  userId: string | undefined,
  log2: SystemLogger,
): Promise<void> {
  let userRow;
  if (userId) {
    const { data, error: userFetchError } =
      await developmentServerService.supabaseClientService
        .getClient()
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();
    if (userFetchError) {
      log2.error(userFetchError, "Failed to fetch user from supabase", {
        userId,
      });
      return;
    }
    userRow = data;
  }

  const gitInitializationResult =
    await developmentServerService.sandboxService.runCommandInternal({
      command: "git",
      args: ["init"],
      cwd: `${WORK_DIR}`,
      session_id: "dev-server",
      timeout_ms: 180000, // 3 minutes
      strip_ansi: true,
    });
  const commandString = `cd ${WORK_DIR} && git init && git config --global user.email "${userRow?.email}" && git config --global user.name "${userRow?.name}"`;
  developmentServerService.terminalService.sendInput(
    "dev-server",
    commandString,
    {
      bypassValidation: true,
    },
  );
  return;
}
