import { FastifyReply, FastifyRequest } from "fastify";
import {
  DesignSystemConstructorAllocateSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { DesignSystemConstructorService } from "../DesignSystemConstructorService.js";

export async function handleDesignSystemConstructorAllocate(
  _request: FastifyRequest,
  reply: FastifyReply,
  _designSystemConstructorService: DesignSystemConstructorService,
): Promise<
  SandboxAPIResponse<
    DesignSystemConstructorAllocateSuccessResponse,
    StandardErrorResponse
  >
> {
  reply.status(200);
  return {
    data: {
      allocated: true,
    },
    error: null,
  };
}
