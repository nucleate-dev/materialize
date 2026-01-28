import { FastifyReply, FastifyRequest } from "fastify";
import {
  APIResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlSuccessResponse,
  HTTP_STATUS,
  StandardErrorResponse,
} from "../../../types/PublicAPITypes.js";
import { checkUserHasPrototypeEditAccess } from "../../../utils/prototypeAuth.js";
import {
  isRunningDevServer,
} from "../../../utils/prototypeDevServerStatusUtils.js";
import { getCloudfrontScreenshotUrl } from "../../cleanup/screenshotUtils.js";
import { DispatcherService } from "../../dispatcher/DispatcherService.js";

export default async function handleFetchViewingUrlImpl(
  request: FastifyRequest<{ Body: FetchViewingUrlRequestBody }>,
  reply: FastifyReply,
  dispatcherService: DispatcherService,
): Promise<APIResponse<FetchViewingUrlSuccessResponse, StandardErrorResponse>> {
  try {
    // Extract validated body (validation handled by Fastify schema)
    const { prototype_id, current_page } = request.body;

    // Get JWT token if provided (optional for this endpoint) and validate user access
    const token = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.split(" ")[1]
      : undefined;
    const authResult = await checkUserHasPrototypeEditAccess(
      prototype_id,
      token,
      request.log2,
    );
    if (authResult === null || authResult.prototype === null) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: "UNAUTHORIZED",
          message: "Access denied for this prototype",
        },
      });
    }

    // Check if user is prototype owner and current_page is 'edit'
    if (authResult.canEdit && current_page === "edit") {
      try {
        // Fetch dispatch-precheck from control plane
        const precheckResult = await dispatcherService.dispatchPrecheck(
          { prototype_id },
          token!,
          request.log2,
        );

        if (precheckResult.data && precheckResult.data.viewing_url) {
          // Type guard to check if it's a success response
          const isEditable = isRunningDevServer(precheckResult.data.status);
          let staticViewingUrl = precheckResult.data.viewing_url;
          if (
            !isEditable &&
            token &&
            authResult.prototype.visibility !== "PUBLIC" &&
            staticViewingUrl.includes("build.nucleate.dev")
          ) {
            staticViewingUrl += `?token=${encodeURIComponent(token)}`;
          }
          const successResponse: FetchViewingUrlSuccessResponse = {
            viewing_url: staticViewingUrl,
            source: isEditable ? "editable_instance" : "static_build",
            status: precheckResult.data.status,
            terminal_url: precheckResult.data.terminal_tunnel_hostname,
          };
          return reply.status(HTTP_STATUS.OK).send({
            data: successResponse,
            error: null,
          });
        }
      } catch (precheckError) {
        request.log2.warn(
          "Failed to fetch dispatch precheck, falling back to static build:",
          { precheckError },
        );
        // Continue to static build fallback
      }
    }

    // Return static build URL
    let staticViewingUrl = `https://${prototype_id}.build.nucleate.dev/`;
    if (token && authResult.prototype.visibility !== "PUBLIC") {
      !authResult.isServiceRole
        ? (staticViewingUrl += `?token=${encodeURIComponent(token)}`)
        : (staticViewingUrl = await getCloudfrontScreenshotUrl(prototype_id));
    }
    request.log2.consoleLogDevOnly(
      "info",
      "Returning static build URL " + staticViewingUrl,
    );

    const successResponse: FetchViewingUrlSuccessResponse = {
      viewing_url: staticViewingUrl,
      source: "static_build",
      status: null,
      terminal_url: null,
    };
    return reply.status(HTTP_STATUS.OK).send({
      data: successResponse,
      error: null,
    });
  } catch (error) {
    request.log2.error(error, "Fetch viewing URL error:");
    const errorResponse: StandardErrorResponse = {
      error: "Internal Server Error",
      message: "Internal server error",
    };
    return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
      data: null,
      error: errorResponse,
    });
  }
}
