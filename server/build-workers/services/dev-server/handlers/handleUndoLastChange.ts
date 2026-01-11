import { FastifyReply, FastifyRequest } from "fastify";
import {
  SandboxAPIResponse,
  StandardErrorResponse,
  UndoLastChangeSuccessResponse,
} from "../../../types/BuildWorkerTypes.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import { getWorkerContext, WORK_DIR } from "../../../worker.js";
import { checkUserHasPrototypeEditAccess } from "../../../utils/prototypeAuth.js";

export async function handleUndoLastChangeImpl(
  request: FastifyRequest,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<UndoLastChangeSuccessResponse, StandardErrorResponse>
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
    request.log2.warn("Cannot undo last change without prototype ID");
    reply.code(400);
    return {
      data: null,
      error: {
        error: "Bad request",
        message: "Prototype ID missing from worker context",
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
      new Error("User is not authorized to undo changes"),
      "Undo last change authorization failed",
      {
        prototypeId,
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

  const gitRevertResult =
    await developmentServerService.sandboxService.runCommandInternal({
      command: "git",
      args: ["revert", "--no-edit", "HEAD"],
      cwd: WORK_DIR,
      session_id: "test",
      timeout_ms: 60000,
      strip_ansi: true,
    });

  const stdout = gitRevertResult.response.data?.stdout ?? "";
  if (
    gitRevertResult.response.error ||
    gitRevertResult.response.data?.status !== "success"
  ) {
    request.log2.error(
      new Error("Failed to revert latest commit"),
      "Git revert command failed",
      {
        prototypeId,
        stdout,
        error: gitRevertResult.response.error,
      },
    );
    reply.code(500);
    return {
      data: null,
      error: {
        error: "Undo failed",
        message: "Unable to revert the latest change",
        details: gitRevertResult.response.error?.message ?? stdout,
      },
    };
  }

  // Check if the commit being reverted is the initial "Initialize development server" commit
  const getCommitMessageResult =
    await developmentServerService.sandboxService.runCommandInternal({
      command: "git",
      args: ["log", "-1", "--format=%s", "HEAD"],
      cwd: WORK_DIR,
      session_id: "test",
      timeout_ms: 10000,
      strip_ansi: true,
    });

  const commitMessage =
    getCommitMessageResult.response.data?.stdout?.trim() ?? "";

  if (commitMessage === "Initialize development server") {
    request.log2.warn(
      "Attempted to undo initial development server commit",
      {
        prototypeId,
        commitMessage,
      },
    );
    reply.code(400);
    return {
      data: null,
      error: {
        error: "Cannot undo initial commit",
        message:
          "Cannot undo the initial development server setup. This is the first commit in your sandbox session.",
      },
    };
  }

  request.log2.consoleLogDevOnly(
    "info",
    "Successfully reverted latest commit via undo-last-change",
    {
      prototypeId,
    },
  );

  developmentServerService.developmentServerState.lastUpdatedTime = new Date();

  return {
    data: {
      message: "Reverted latest commit",
      stdout,
    },
    error: null,
  };
}
