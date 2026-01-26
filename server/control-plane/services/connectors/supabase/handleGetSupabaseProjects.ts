import { createClient } from "@supabase/supabase-js";
import { SupabaseManagementAPI } from "supabase-management-js";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
    type APIResponse,
    HTTP_STATUS,
    type StandardErrorResponse,
    type SupabaseProjectsQuery,
    type SupabaseProjectSummary,
    type SupabaseProjectsSuccessResponse,
} from "../../../types/PublicAPITypes.js";
import type { Database } from "../../../types/supabase.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import { getValidSupabaseAccessToken } from "./supabaseTokenUtils.js";

interface IntegrationRecord {
    id: string;
    supabase_organization_id: string;
}

export async function handleGetSupabaseProjectsImpl(
    request: FastifyRequest<{ Querystring: SupabaseProjectsQuery }>,
    reply: FastifyReply,
): Promise<
    APIResponse<SupabaseProjectsSuccessResponse, StandardErrorResponse>
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

    // Verify user has appropriate team role (owner, admin, or editor)
    const { data: hasAccess, error: accessError } = await supabaseClient.rpc(
        "is_team_member_with_edit_privileges",
        { p_team_id: teamId },
    );

    if (accessError) {
        request.log2.error(
            accessError,
            "Failed to verify team membership for Supabase projects",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Database Error",
                message: "Failed to verify team membership",
            },
        });
    }

    if (!hasAccess) {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
            data: null,
            error: {
                error: "Forbidden",
                message: "You must be a team owner, admin, or editor to view Supabase projects",
            },
        });
    }

    // Fetch all integrations for this team
    const { data: integrations, error: integrationsError } = await supabaseClient
        .from("connectors_supabase_integrations")
        .select("id, supabase_organization_id")
        .eq("team_id", teamId)
        .eq("status", "active");

    if (integrationsError) {
        request.log2.error(
            integrationsError,
            "Failed to fetch Supabase integrations for projects",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Database Error",
                message: "Failed to fetch Supabase integrations",
            },
        });
    }

    if (!integrations || integrations.length === 0) {
        return reply.status(HTTP_STATUS.OK).send({
            data: { projects: [] },
            error: null,
        });
    }

    // Use service role client for token operations
    const supabaseServiceClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Fetch projects from all integrations concurrently
    const projectResults = await Promise.allSettled(
        integrations.map((integration: IntegrationRecord) =>
            fetchProjectsForIntegration(
                integration,
                supabaseServiceClient,
                request,
            ),
        ),
    );

    // Collect all projects, logging any failures
    const allProjects: SupabaseProjectSummary[] = [];
    for (let i = 0; i < projectResults.length; i++) {
        const result = projectResults[i];
        if (result.status === "fulfilled") {
            allProjects.push(...result.value);
        } else {
            request.log2.warn(
                "Failed to fetch projects for integration",
                { integrationId: integrations[i].id, reason: String(result.reason) },
            );
        }
    }

    return reply.status(HTTP_STATUS.OK).send({
        data: { projects: allProjects },
        error: null,
    });
}

async function fetchProjectsForIntegration(
    integration: IntegrationRecord,
    supabaseClient: ReturnType<typeof createClient<Database>>,
    request: FastifyRequest,
): Promise<SupabaseProjectSummary[]> {
    // Get valid (and refreshed if needed) access token
    const { accessToken } = await getValidSupabaseAccessToken({
        supabaseClient,
        logger: request.log2,
        integrationId: integration.id,
    });

    const managementClient = new SupabaseManagementAPI({ accessToken });
    const projects = await managementClient.getProjects();

    if (!projects) {
        return [];
    }

    // Filter projects to only those belonging to this integration's organization
    const orgProjects = projects.filter(
        (p) => p.organization_id === integration.supabase_organization_id,
    );

    return orgProjects.map((p) => ({
        id: p.id,
        name: p.name,
        organization_id: p.organization_id,
        region: p.region,
        created_at: p.created_at,
        database: p.database
            ? { host: p.database.host, version: p.database.version }
            : undefined,
    }));
}
