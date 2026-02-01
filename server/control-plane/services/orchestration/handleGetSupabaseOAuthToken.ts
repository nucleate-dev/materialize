import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    GetSupabaseOAuthTokenRequestBody,
    GetSupabaseOAuthTokenSuccessResponse,
    HTTP_STATUS,
    StandardErrorResponse,
} from "../../types/PublicAPITypes.js";
import { GlideClient } from "@valkey/valkey-glide";
import { validateOrchestrationToken } from "./OrchestrationTokenValidationUtils.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../types/supabase.js";
import { getValidSupabaseAccessToken } from "../connectors/supabase/supabaseTokenUtils.js";

const SUPABASE_TOKEN_MIN_VALIDITY_MS = 6 * 60 * 60 * 1000;

export async function handleGetSupabaseOAuthToken(
    request: FastifyRequest<{
        Body: GetSupabaseOAuthTokenRequestBody;
    }>,
    reply: FastifyReply,
    cache: GlideClient,
): Promise<APIResponse<GetSupabaseOAuthTokenSuccessResponse, StandardErrorResponse>> {
    const { prototype_id } = request.body;

    // Step 1: Validate orchestration token
    const validation = await validateOrchestrationToken(
        request,
        prototype_id,
        request.log2,
        cache,
    );

    if (!validation.isValid) {
        const statusCode = validation.errorMessage?.includes(
                "No active build found for this prototype",
            )
            ? HTTP_STATUS.NOT_FOUND
            : HTTP_STATUS.UNAUTHORIZED;

        const errorResponse: StandardErrorResponse = {
            error: statusCode === HTTP_STATUS.NOT_FOUND
                ? "NOT_FOUND"
                : "UNAUTHORIZED",
            message: validation.errorMessage ?? "Invalid orchestration token",
        };
        return reply.status(statusCode).send({
            data: null,
            error: errorResponse,
        });
    }

    const supabaseServiceClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
        // Step 2: Validate prototype has a Supabase backend linked
        const { data: backend, error: backendError } =
            await supabaseServiceClient
                .from("prototype_backends")
                .select("id, provider_integration_id")
                .eq("prototype_id", prototype_id)
                .eq("backend_type", "supabase")
                .maybeSingle();

        if (backendError) {
            request.log2.error(
                backendError,
                "Failed to fetch prototype backend",
                { prototypeId: prototype_id },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "INTERNAL_SERVER_ERROR",
                    message: "Failed to fetch prototype backend",
                },
            });
        }

        if (!backend) {
            return reply.status(HTTP_STATUS.NOT_FOUND).send({
                data: null,
                error: {
                    error: "NOT_FOUND",
                    message: "Supabase backend not found for prototype",
                },
            });
        }

        if (!backend.provider_integration_id) {
            request.log2.error(
                new Error("Missing provider_integration_id for backend"),
                "Supabase backend missing integration id",
                { prototypeId: prototype_id, backendId: backend.id },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "INTERNAL_SERVER_ERROR",
                    message: "Supabase backend missing integration id",
                },
            });
        }

        // Step 3: Get valid Supabase OAuth access token
        const tokenResult = await getValidSupabaseAccessToken({
            supabaseClient: supabaseServiceClient,
            logger: request.log2,
            integrationId: backend.provider_integration_id,
            refreshThresholdMs: SUPABASE_TOKEN_MIN_VALIDITY_MS,
        });

        const successResponse: GetSupabaseOAuthTokenSuccessResponse = {
            access_token: tokenResult.accessToken,
            expires_at: tokenResult.expiresAt,
            refreshed: tokenResult.refreshed,
            integration_id: tokenResult.integrationId,
        };

        return reply.status(HTTP_STATUS.OK).send({
            data: successResponse,
            error: null,
        });
    } catch (error) {
        request.log2.error(
            error instanceof Error ? error : new Error(String(error)),
            "Failed to get Supabase OAuth access token",
            { prototypeId: prototype_id },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "SUPABASE_TOKEN_ERROR",
                message: error instanceof Error
                    ? error.message
                    : "Failed to refresh Supabase OAuth token",
            },
        });
    }
}
