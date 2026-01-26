import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    GitHubStatusErrorResponse,
    GitHubStatusQuery,
    GitHubStatusSuccessResponse,
    HTTP_STATUS,
} from "../../../types/PublicAPITypes.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../../types/supabase.js";

export async function handleGetStatusImpl(
    request: FastifyRequest<{ Querystring: GitHubStatusQuery }>,
    reply: FastifyReply,
): Promise<
    APIResponse<GitHubStatusSuccessResponse, GitHubStatusErrorResponse>
> {
    // Validate JWT and get user
    const token = request.headers.authorization?.split(" ")[1] ?? "";
    const { user } = await validateJWTToken(token, request.log2);
    if (!user) {
        request.log2.warn("Unauthorized user");
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            data: null,
            error: {
                error: "Unauthorized",
                message: "Invalid token",
            },
        });
    }

    request.log2 = request.log2.child({ userId: user.id });

    const { teamId } = request.query;

    // Create Supabase client with user's token (respects RLS)
    const supabaseClient = createClient<Database>(
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
        // Check if integration exists for this team
        // Note: github_integrations now only contains metadata (no tokens)
        const { data: integration, error: integrationError } =
            await supabaseClient
                .from("github_integrations")
                .select(
                    "account_login, account_type, connected_at, installation_id, is_suspended, suspended_at",
                )
                .eq("team_id", teamId)
                .maybeSingle();

        if (integrationError) {
            request.log2.error(
                integrationError,
                "Failed to fetch GitHub integration status",
                { teamId },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "Database Error",
                    message: "Failed to fetch GitHub integration status",
                },
            });
        }

        if (!integration) {
            // No integration found
            return reply.status(HTTP_STATUS.OK).send({
                data: {
                    connected: false,
                },
                error: null,
            });
        }

        // Integration exists
        return reply.status(HTTP_STATUS.OK).send({
            data: {
                connected: true,
                account_login: integration.account_login,
                account_type: integration.account_type,
                connected_at: integration.connected_at,
                installation_id: integration.installation_id,
                is_suspended: integration.is_suspended,
                suspended_at: integration.suspended_at,
            },
            error: null,
        });
    } catch (error) {
        request.log2.error(error, "Exception in handleGetStatus", { teamId });
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Internal Server Error",
                message: "An unexpected error occurred",
            },
        });
    }
}
