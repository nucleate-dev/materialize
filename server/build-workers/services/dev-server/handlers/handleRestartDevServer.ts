import { FastifyReply, FastifyRequest } from "fastify";
import {
  PublicDevServerRestartSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";

export async function handleRestartDevServerImpl(
  request: FastifyRequest,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<
    PublicDevServerRestartSuccessResponse,
    StandardErrorResponse
  >
> {
  return {
    data: null,
    error: {
      error: "Not implemented",
      message: "Not implemented yet",
    },
  };
}
