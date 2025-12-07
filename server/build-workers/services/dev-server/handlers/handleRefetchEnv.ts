import { FastifyReply, FastifyRequest } from "fastify";
import {
  HTTP_STATUS,
  PublicDevServerRefetchEnvRequest,
  PublicDevServerRefetchEnvSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import { syncPrototypeEnvVarsToDisk } from "../utils/envVarUtils.js";

export async function handleRefetchEnvImpl(
  request: FastifyRequest<{ Body: PublicDevServerRefetchEnvRequest }>,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<
    PublicDevServerRefetchEnvSuccessResponse,
    StandardErrorResponse
  >
> {
  const { prototype_id } = request.body;
  if (!prototype_id) {
    reply.code(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "Missing prototype_id",
        message: "prototype_id is required to refetch env vars",
      },
    };
  }

  const envResult = await syncPrototypeEnvVarsToDisk({
    prototypeId: prototype_id,
    workDir: developmentServerService.workDir,
    supabaseClientService: developmentServerService.supabaseClientService,
    logger: request.log2,
  });

  if (!envResult.success) {
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Env sync failed",
        message: envResult.error ?? "Failed to sync env vars",
      },
    };
  }

  request.log2.consoleLogDevOnly(
    "info",
    "Refetched prototype env vars and wrote to disk",
    {
      prototypeId: prototype_id,
      envVarCount: envResult.envVarCount,
    },
  );

  reply.code(HTTP_STATUS.OK);
  return {
    data: {
      message: "Environment variables refreshed",
      env_var_count: envResult.envVarCount,
    },
    error: null,
  };
}
