import { FastifyReply, FastifyRequest } from "fastify";
import {
  DesignSystemConstructorStatusSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { DesignSystemConstructorService } from "../DesignSystemConstructorService.js";

export async function handleDesignSystemConstructorStatus(
  _request: FastifyRequest,
  reply: FastifyReply,
  designSystemConstructorService: DesignSystemConstructorService,
): Promise<
  SandboxAPIResponse<
    DesignSystemConstructorStatusSuccessResponse,
    StandardErrorResponse
  >
> {
  reply.status(200);
  return {
    data: {
      state: designSystemConstructorService.designSystemConstructionState.state,
    },
    error: null,
  };
}
