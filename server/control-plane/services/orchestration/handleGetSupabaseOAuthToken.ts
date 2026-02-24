import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    GetSupabaseOAuthTokenRequestBody,
    GetSupabaseOAuthTokenSuccessResponse,
    HTTP_STATUS,
    StandardErrorResponse,
} from "../../types/PublicAPITypes.js";
import { validateOrchestrationToken } from "./OrchestrationTokenValidationUtils.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../types/supabase.js";
import { getValidSupabaseAccessToken } from "../connectors/supabase/supabaseTokenUtils.js";
import { checkUserHasPrototypeEditAccess } from "../../utils/prototypeAuth.js";

const SUPABASE_TOKEN_MIN_VALIDITY_MS = 6 * 60 * 60 * 1000;

export async function handleGetSupabaseOAuthToken(
    request: FastifyRequest<{
        Body: GetSupabaseOAuthTokenRequestBody;
    }>,
    reply: FastifyReply,
): Promise<
    APIResponse<GetSupabaseOAuthTokenSuccessResponse, StandardErrorResponse>
> {
    const { prototype_id } = request.body;

    // Step 1: Validate orchestration token
    const validation = await validateOrchestrationToken(
        request,
        prototype_id,
        request.log2,
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

    const authHeader = request.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            data: null,
            error: {
                error: "UNAUTHORIZED",
                message: "Missing Authorization header",
            },
        });
    }

    const authResponse = await checkUserHasPrototypeEditAccess(
        prototype_id,
        token,
        request.log2,
    );

    if (!authResponse || !authResponse.canEdit || !authResponse.prototype) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            data: null,
            error: {
                error: "UNAUTHORIZED",
                message: "You do not have permission to edit this prototype",
            },
        });
    }

    const supabaseAuthClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        },
    );

    try {
        // Step 2: Resolve the active Supabase integration for the prototype's team
        const teamId = authResponse.prototype.team_id;
        const { data: integration, error: integrationError } =
            await supabaseAuthClient
                .from("connectors_supabase_integrations")
                .select("id")
                .eq("team_id", teamId)
                .eq("status", "active")
                .order("connected_at", { ascending: false })
                .maybeSingle();

        if (integrationError) {
            request.log2.error(
                integrationError,
                "Failed to fetch Supabase integration",
                { prototypeId: prototype_id, teamId },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "INTERNAL_SERVER_ERROR",
                    message: "Failed to fetch Supabase integration",
                },
            });
        }

        if (!integration?.id) {
            return reply.status(HTTP_STATUS.NOT_FOUND).send({
                data: null,
                error: {
                    error: "NOT_FOUND",
                    message: "Supabase integration not found for team",
                },
            });
        }

        // Step 3: Get valid Supabase OAuth access token
        const tokenResult = await getValidSupabaseAccessToken({
            logger: request.log2,
            integrationId: integration.id,
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
