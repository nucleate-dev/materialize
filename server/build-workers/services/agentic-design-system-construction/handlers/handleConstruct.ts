import { FastifyReply, FastifyRequest } from "fastify";
import {
  DesignSystemConstructorConstructSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { DesignSystemConstructorService } from "../DesignSystemConstructorService.js";

export async function handleDesignSystemConstructorConstruct(
  _request: FastifyRequest,
  reply: FastifyReply,
  designSystemConstructorService: DesignSystemConstructorService,
): Promise<
  SandboxAPIResponse<
    DesignSystemConstructorConstructSuccessResponse,
    StandardErrorResponse
  >
> {
  await designSystemConstructorService.designSystemConstructorAgent
    .constructDesignSystem();

  reply.status(200);
  return {
    data: {
      started: true,
    },
    error: null,
  };
}
