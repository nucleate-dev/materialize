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
  const { user_credentials, github_credentials } = request.body;
  const { user_id, team_id } = user_credentials;

  const { setWorkerContext } = await import("../../../worker.js");
  setWorkerContext(user_id, undefined, team_id);
  request.log2 = request.log2.child({
    userId: user_id,
    teamId: team_id,
  });

  designSystemConstructorService.setGithubCredentials(github_credentials);

  reply.status(200);
  return {
    data: {
      allocated: true,
    },
    error: null,
  };
}
