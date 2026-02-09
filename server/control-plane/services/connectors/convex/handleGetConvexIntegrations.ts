import { createClient } from "@supabase/supabase-js";
import {
    APIResponse,
    ConvexIntegrationSummary,
    ConvexIntegrationsQuery,
    ConvexIntegrationsSuccessResponse,
    HTTP_STATUS,
    StandardErrorResponse,
} from "../../../types/PublicAPITypes.js";
import { Database } from "../../../types/supabase.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import { FastifyReply, FastifyRequest } from "fastify";

export async function handleGetConvexIntegrationsImpl(
    request: FastifyRequest<{ Querystring: ConvexIntegrationsQuery }>,
    reply: FastifyReply,
): Promise<
    APIResponse<ConvexIntegrationsSuccessResponse, StandardErrorResponse>
> {
    const token = request.headers.authorization?.split(" ")[1] ?? "";
    const { user } = await validateJWTToken(token, request.log2);
    if (!user) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            data: null,
            error: {
                error: "Unauthorized",
                message: "Invalid token",
            },
        });
    }

    const { teamId } = request.query;

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

    const { data, error } = await supabaseClient
        .from("connectors_convex_integrations")
        .select("id, convex_team_id, convex_team_name, connected_at, status")
        .eq("team_id", teamId)
        .order("connected_at", { ascending: false });

    if (error) {
        request.log2.consoleLogDevOnly(
            "error",
            "Failed to fetch Convex integrations",
            { error: error.message },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Database Error",
                message: "Failed to fetch Convex integrations",
            },
        });
    }

    return reply.status(HTTP_STATUS.OK).send({
        data: {
            integrations: (data || []) as ConvexIntegrationSummary[],
        },
        error: null,
    });
}
