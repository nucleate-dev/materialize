import { createClient } from "@supabase/supabase-js";
import {
    APIResponse,
    HTTP_STATUS,
    StandardErrorResponse,
    SupabaseIntegrationsQuery,
    SupabaseIntegrationsSuccessResponse,
    SupabaseIntegrationSummary,
} from "../../../types/PublicAPITypes.js";
import { Database } from "../../../types/supabase.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import { FastifyReply, FastifyRequest } from "fastify";

export async function handleGetSupabaseIntegrationsImpl(
    request: FastifyRequest<{ Querystring: SupabaseIntegrationsQuery }>,
    reply: FastifyReply,
): Promise<
    APIResponse<SupabaseIntegrationsSuccessResponse, StandardErrorResponse>
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
        .from("connectors_supabase_integrations")
        .select(
            "id, supabase_organization_id, supabase_organization_name, connected_at, status",
        )
        .eq("team_id", teamId)
        .order("connected_at", { ascending: false });

    if (error) {
        request.log2.consoleLogDevOnly(
            "error",
            "Failed to fetch Supabase integrations",
            { error: error.message },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Database Error",
                message: "Failed to fetch Supabase integrations",
            },
        });
    }

    return reply.status(HTTP_STATUS.OK).send({
        data: {
            integrations: (data || []) as SupabaseIntegrationSummary[],
        },
        error: null,
    });
}
