import { FastifyReply, FastifyRequest } from "fastify";
import {
  DesignSystemConstructorAllocateRequest,
  DesignSystemConstructorAllocateSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { DesignSystemConstructorService } from "../DesignSystemConstructorService.js";

export async function handleDesignSystemConstructorAllocate(
  request: FastifyRequest<{ Body: DesignSystemConstructorAllocateRequest }>,
  reply: FastifyReply,
  designSystemConstructorService: DesignSystemConstructorService,
): Promise<
  SandboxAPIResponse<
    DesignSystemConstructorAllocateSuccessResponse,
    StandardErrorResponse
  >
> {
  if (!request.body) {
    reply.code(400);
    return {
      data: null,
      error: {
        error: "Bad request",
        message: "Missing allocation request body",
        details: "Expected user_credentials and github_credentials in body",
      },
    };
  }

  const { user_credentials, github_credentials } = request.body;
  const userId = user_credentials?.user_id;
  const teamId = user_credentials?.team_id;
  const githubToken = github_credentials?.token;

  if (
    typeof userId !== "string" ||
    typeof teamId !== "string" ||
    typeof githubToken !== "string"
  ) {
    reply.code(400);
    return {
      data: null,
      error: {
        error: "Bad request",
        message: "Invalid allocation request body",
        details:
          "Expected user_credentials.user_id, user_credentials.team_id, and github_credentials.token",
      },
    };
  }

  const { setWorkerContext } = await import("../../../worker.js");
  setWorkerContext(userId, undefined, teamId);
  request.log2 = request.log2.child({
    userId,
    teamId,
  });

  designSystemConstructorService.setGithubCredentials({
    token: githubToken,
  });

  reply.status(200);
  return {
    data: {
      allocated: true,
    },
    error: null,
  };
}
