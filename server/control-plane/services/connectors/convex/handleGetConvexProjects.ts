import { createClient } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
    type APIResponse,
    ConvexProjectSummary,
    type ConvexProjectsQuery,
    type ConvexProjectsSuccessResponse,
    HTTP_STATUS,
    type StandardErrorResponse,
} from "../../../types/PublicAPITypes.js";
import type { Database } from "../../../types/supabase.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import {
    ConvexAccessRevokedError,
    executeWithRevocationDetection,
    fetchConvexApi,
} from "./convexTokenUtils.js";

interface IntegrationRecord {
    id: string;
    convex_team_id: string;
}

interface ConvexProjectDetails {
    id: number;
    name: string;
    slug: string;
    teamId: number;
    createTime: number;
}

export async function handleGetConvexProjectsImpl(
    request: FastifyRequest<{ Querystring: ConvexProjectsQuery }>,
    reply: FastifyReply,
): Promise<APIResponse<ConvexProjectsSuccessResponse, StandardErrorResponse>> {
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

    const { data: hasAccess, error: accessError } = await supabaseClient.rpc(
        "is_team_member_with_edit_privileges",
        { p_team_id: teamId },
    );

    if (accessError) {
        request.log2.error(
            accessError,
            "Failed to verify team membership for Convex projects",
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
                message:
                    "You must be a team owner, admin, or editor to view Convex projects",
            },
        });
    }

    const { data: integrations, error: integrationsError } =
        await supabaseClient
            .from("connectors_convex_integrations")
            .select("id, convex_team_id")
            .eq("team_id", teamId)
            .eq("status", "active");

    if (integrationsError) {
        request.log2.error(
            integrationsError,
            "Failed to fetch Convex integrations for projects",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Database Error",
                message: "Failed to fetch Convex integrations",
            },
        });
    }

    if (!integrations || integrations.length === 0) {
        return reply.status(HTTP_STATUS.OK).send({
            data: { projects: [] },
            error: null,
        });
    }

    const projectResults = await Promise.allSettled(
        integrations.map((integration: IntegrationRecord) =>
            fetchProjectsForIntegration(
                integration,
                request,
            )
        ),
    );

    const allProjects: ConvexProjectSummary[] = [];
    const revokedIntegrationIds: string[] = [];

    for (let i = 0; i < projectResults.length; i++) {
        const result = projectResults[i];
        if (result.status === "fulfilled") {
            allProjects.push(...result.value.projects);
            if (result.value.revoked) {
                revokedIntegrationIds.push(result.value.integrationId);
            }
        } else {
            if (result.reason instanceof ConvexAccessRevokedError) {
                revokedIntegrationIds.push(result.reason.integrationId);
            } else {
                request.log2.consoleLogDevOnly(
                    "error",
                    "Failed to fetch projects for Convex integration",
                    {
                        integrationId: integrations[i].id,
                        reason: String(result.reason),
                    },
                );
            }
        }
    }

    if (
        revokedIntegrationIds.length === integrations.length &&
        integrations.length > 0
    ) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
            data: null,
            error: {
                error: "Integration Disconnected",
                message:
                    "All connected Convex teams have been disconnected. Please reconnect your Convex team in team settings.",
            },
        });
    }

    if (revokedIntegrationIds.length > 0) {
        request.log2.consoleLogDevOnly(
            "info",
            "Some Convex integrations were disconnected during project fetch",
            {
                revokedIntegrationIds,
            },
        );
    }

    return reply.status(HTTP_STATUS.OK).send({
        data: { projects: allProjects },
        error: null,
    });
}

interface FetchProjectsResult {
    projects: ConvexProjectSummary[];
    revoked: boolean;
    integrationId: string;
}

async function fetchProjectsForIntegration(
    integration: IntegrationRecord,
    request: FastifyRequest,
): Promise<FetchProjectsResult> {
    try {
        const projects = await executeWithRevocationDetection({
            logger: request.log2,
            integrationId: integration.id,
            operation: async (accessToken) => {
                return fetchConvexApi<ConvexProjectDetails[]>({
                    accessToken,
                    path:
                        `teams/${encodeURIComponent(integration.convex_team_id)}/list_projects`,
                    method: "GET",
                });
            },
        });

        if (!projects) {
            return {
                projects: [],
                revoked: false,
                integrationId: integration.id,
            };
        }

        return {
            projects: projects.map((project) => ({
                id: String(project.id),
                name: project.name,
                slug: project.slug,
                team_id: String(project.teamId),
                create_time: project.createTime,
            })),
            revoked: false,
            integrationId: integration.id,
        };
    } catch (error) {
        if (error instanceof ConvexAccessRevokedError) {
            return {
                projects: [],
                revoked: true,
                integrationId: integration.id,
            };
        }
        throw error;
    }
}
