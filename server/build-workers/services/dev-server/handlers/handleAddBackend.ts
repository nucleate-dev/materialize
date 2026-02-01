import { FastifyReply, FastifyRequest } from "fastify";
import { SupabaseManagementAPI, isSupabaseError } from "supabase-management-js";
import fs from "fs/promises";
import path from "path";
import {
  HTTP_STATUS,
  PublicDevServerAddBackendRequest,
  PublicDevServerAddBackendSuccessResponse,
  SandboxAPIResponse,
  StandardErrorResponse,
} from "../../../types/BuildWorkerTypes.js";
import { Json } from "../../../types/supabase.js";
import { NucleateDevelopmentServerService } from "../NucleateDevelopmentServerService.js";
import { getWorkerContext, WORK_DIR } from "../../../worker.js";
import { checkUserHasPrototypeEditAccess } from "../../../utils/prototypeAuth.js";

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
    request.log2.consoleLogDevOnly(
      "info",
      "Add backend: fetching Supabase OAuth token",
      { prototypeId },
    );
    const tokenResponse = await developmentServerService
      .sandboxOrchestrationInitiatorService.getSupabaseOAuthToken(
        prototypeId,
        jwtToken,
      );
    supabaseAccessToken = tokenResponse.access_token;
    request.log2.consoleLogDevOnly(
      "info",
      "Add backend: Supabase OAuth token fetched",
      { prototypeId, hasToken: Boolean(supabaseAccessToken) },
    );
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
  request.log2.consoleLogDevOnly(
    "info",
    "Add backend: set USER_SUPABASE_OAUTH_TOKEN",
  );

  try {
    const managementClient = new SupabaseManagementAPI({
      accessToken: supabaseAccessToken,
    });
    request.log2.consoleLogDevOnly(
      "info",
      "Add backend: validating Supabase project access",
      { projectId: project_id },
    );
    const projects = await managementClient.getProjects();
    const hasProject = Array.isArray(projects) &&
      projects.some((project) => project.id === project_id);

    if (!hasProject) {
      request.log2.consoleLogDevOnly(
        "warn",
        "Add backend: Supabase project not found",
        { projectId: project_id },
      );
      reply.code(HTTP_STATUS.NOT_FOUND);
      return {
        data: null,
        error: {
          error: "Project not found",
          message: "Supabase project was not found",
        },
      };
    }
  } catch (error) {
    if (isSupabaseError(error)) {
      const status = error.response.status;
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

      request.log2.error(
        error,
        "Failed to validate Supabase project",
        { prototypeId, statusCode: status },
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
  const sanitizedMetadataForInsert = sanitizedMetadata as Json;
  request.log2.consoleLogDevOnly(
    "info",
    "Add backend: metadata sanitized",
    { hasMetadata: Object.keys(sanitizedMetadata).length > 0 },
  );

  const { error: insertBackendError } =
    await developmentServerService.supabaseClientService
      .getClient()
      .from("prototype_backends")
      .insert({
        prototype_id: prototypeId,
        backend_type: "supabase",
        provider_project_id: project_id,
        provider_project_url: project_url ?? null,
        metadata: sanitizedMetadataForInsert,
      });

  if (insertBackendError) {
    request.log2.error(
      insertBackendError,
      "Failed to persist prototype backend",
      { prototypeId, projectId: project_id },
    );
    reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return {
      data: null,
      error: {
        error: "Failed to persist backend",
        message: insertBackendError.message,
      },
    };
  }
  request.log2.consoleLogDevOnly(
    "info",
    "Add backend: prototype backend persisted",
    { prototypeId, projectId: project_id },
  );

  developmentServerService.setPrototypeBackend({
    type: "supabase",
    projectId: project_id,
    projectUrl: project_url ?? null,
    metadata: sanitizedMetadata,
    authenticationKey: supabaseAccessToken,
  });
  request.log2.consoleLogDevOnly(
    "info",
    "Add backend: in-memory backend updated",
    { prototypeId, projectId: project_id },
  );

  const backendEnvPath = path.join(
    WORK_DIR,
    "backend",
    "supabase",
    "functions",
    ".env",
  );
  try {
    await fs.access(backendEnvPath);
    request.log2.consoleLogDevOnly(
      "info",
      "Add backend: backend env file detected, syncing env vars",
      { backendEnvPath },
    );
    const backendSyncResult = await developmentServerService
      .syncBackendEnvVarsToConnectedBackend(request.log2);
    if (!backendSyncResult.success) {
      request.log2.consoleLogDevOnly(
        "warn",
        "Add backend: backend env sync failed",
        { error: backendSyncResult.error },
      );
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return {
        data: null,
        error: {
          error: "Failed to sync backend environment variables",
          message: backendSyncResult.error ??
            "Failed to sync backend env vars",
        },
      };
    }
  } catch {
    // No backend env vars on disk yet; skip sync.
    request.log2.consoleLogDevOnly(
      "info",
      "Add backend: no backend env file found, skipping env sync",
      { backendEnvPath },
    );
  }

  request.log2.consoleLogDevOnly("info", "Add backend: success", {
    prototypeId,
    projectId: project_id,
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
