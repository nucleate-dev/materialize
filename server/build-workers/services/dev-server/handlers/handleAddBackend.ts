import { FastifyReply, FastifyRequest } from "fastify";
import axios from "axios";
import {
  HTTP_STATUS,
  PublicDevServerAddBackendRequest,
  PublicDevServerAddBackendSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import { getWorkerContext } from "../../../worker.js";
import { checkUserHasPrototypeEditAccess } from "../../../utils/prototypeAuth.js";

const SUPABASE_MANAGEMENT_API_BASE_URL = "https://api.supabase.com/v1";

export async function handleAddBackendImpl(
  request: FastifyRequest<{ Body: PublicDevServerAddBackendRequest }>,
  reply: FastifyReply,
  developmentServerService: NucleateDevelopmentServerService,
): Promise<
  SandboxAPIResponse<PublicDevServerAddBackendSuccessResponse, StandardErrorResponse>
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
    reply.code(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "Bad request",
        message: "No prototype ID found",
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
      new Error("User not authorized to edit prototype"),
      "Authorization failed",
      {
        prototypeId,
        hasAuthResult: !!authResult,
        hasUser: !!authResult?.user,
        canEdit: authResult?.canEdit,
      },
    );
    reply.code(HTTP_STATUS.UNAUTHORIZED);
    return {
      data: null,
      error: {
        error: "Unauthorized",
        message: "You do not have permission to edit this prototype",
      },
    };
  }

  if (developmentServerService.prototypeBackend) {
    reply.code(HTTP_STATUS.CONFLICT);
    return {
      data: null,
      error: {
        error: "Backend already configured",
        message: "This prototype already has a backend configured",
      },
    };
  }

  const { type, project_id, project_url, metadata } = request.body;

  if (!type) {
    reply.code(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "Missing backend type",
        message: "type is required",
      },
    };
  }

  if (type !== "supabase") {
    reply.code(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "Unsupported backend type",
        message: "Only supabase backend type is supported right now",
      },
    };
  }

  if (!project_id) {
    reply.code(HTTP_STATUS.BAD_REQUEST);
    return {
      data: null,
      error: {
        error: "Missing project ID",
        message: "project_id is required",
      },
    };
  }

  if (!jwtToken) {
    reply.code(HTTP_STATUS.UNAUTHORIZED);
    return {
      data: null,
      error: {
        error: "Unauthorized",
        message: "Missing Authorization header",
      },
    };
  }

  let supabaseAccessToken: string;
  try {
    const tokenResponse = await developmentServerService
      .sandboxOrchestrationInitiatorService.getSupabaseOAuthToken(
        prototypeId,
        jwtToken,
      );
    supabaseAccessToken = tokenResponse.access_token;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    request.log2.error(
      new Error(message),
      "Failed to get Supabase OAuth token",
      { prototypeId },
    );
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to get Supabase OAuth token",
        message,
      },
    };
  }

  process.env.USER_SUPABASE_OAUTH_TOKEN = supabaseAccessToken;

  try {
    await axios.get(
      `${SUPABASE_MANAGEMENT_API_BASE_URL}/projects/${project_id}`,
      {
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === HTTP_STATUS.NOT_FOUND) {
        reply.code(HTTP_STATUS.NOT_FOUND);
        return {
          data: null,
          error: {
            error: "Project not found",
            message: "Supabase project was not found",
          },
        };
      }
      if (status === HTTP_STATUS.UNAUTHORIZED) {
        reply.code(HTTP_STATUS.UNAUTHORIZED);
        return {
          data: null,
          error: {
            error: "Unauthorized",
            message: "Supabase authorization failed",
          },
        };
      }
      const message =
        error.response?.data?.message ??
        error.message ??
        "Supabase management API error";
      request.log2.error(
        new Error(message),
        "Failed to validate Supabase project",
        {
          prototypeId,
          statusCode: status,
          errorData: error.response?.data,
        },
      );
      reply.code(HTTP_STATUS.BAD_GATEWAY);
      return {
        data: null,
        error: {
          error: "Supabase API error",
          message: "Failed to validate Supabase project",
        },
      };
    }

    request.log2.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to validate Supabase project",
      { prototypeId },
    );
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Supabase API error",
        message: "Failed to validate Supabase project",
      },
    };
  }

  const sanitizedMetadata =
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};

  developmentServerService.setPrototypeBackend({
    type: "supabase",
    projectId: project_id,
    projectUrl: project_url ?? null,
    metadata: sanitizedMetadata,
    authenticationKey: supabaseAccessToken,
  });

  reply.code(HTTP_STATUS.OK);
  return {
    data: {
      message: "Backend added",
      backend: {
        type: "supabase",
        project_id,
        project_url: project_url ?? null,
      },
    },
    error: null,
  };
}
