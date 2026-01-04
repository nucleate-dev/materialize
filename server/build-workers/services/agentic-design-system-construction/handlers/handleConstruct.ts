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
  const constructionResult = await designSystemConstructorService
    .designSystemConstructorAgent
    .constructDesignSystem();

  reply.status(200);
  return {
    data: {
      started: true,
      total_cost_usd: constructionResult.totalCostUsd,
      total_input_tokens: constructionResult.totalInputTokens,
      total_output_tokens: constructionResult.totalOutputTokens,
    },
    error: null,
  };
}
