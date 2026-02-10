import { createClient } from "@supabase/supabase-js";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
    type APIResponse,
    type ConvexCreateProjectRequestBody,
    type ConvexCreateProjectSuccessResponse,
    HTTP_STATUS,
    type StandardErrorResponse,
} from "../../../types/PublicAPITypes.js";
import type { Database } from "../../../types/supabase.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import {
    ConvexAccessRevokedError,
    ConvexApiError,
    executeWithRevocationDetection,
    fetchConvexApi,
} from "./convexTokenUtils.js";

interface ConvexCreateProjectResponse {
    projectId: number;
    deploymentName: string;
    deploymentUrl: string;
}

interface ConvexProjectDetails {
    id: number;
    name: string;
    slug: string;
    teamId: number;
    createTime: number;
}

export async function handleCreateConvexProjectImpl(
    request: FastifyRequest<{ Body: ConvexCreateProjectRequestBody }>,
    reply: FastifyReply,
): Promise<
    APIResponse<ConvexCreateProjectSuccessResponse, StandardErrorResponse>
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

    const {
        teamId,
        convexTeamId,
        name,
        deploymentType = "dev",
        deploymentRegion,
        deploymentClass,
    } = request.body;

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
            "Failed to verify team membership for creating Convex project",
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
                    "You must be a team owner, admin, or editor to create Convex projects",
            },
        });
    }

    const { data: integration, error: integrationError } = await supabaseClient
        .from("connectors_convex_integrations")
        .select("id")
        .eq("team_id", teamId)
        .eq("convex_team_id", convexTeamId)
        .eq("status", "active")
        .maybeSingle();

    if (integrationError) {
        request.log2.error(
            integrationError,
            "Failed to verify Convex integration for project creation",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Database Error",
                message: "Failed to verify Convex integration",
            },
        });
    }

    if (!integration) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
            data: null,
            error: {
                error: "Invalid Team",
                message:
                    "The specified Convex team is not connected to this team",
            },
        });
    }

    let createdProject: ConvexCreateProjectResponse;
    let createdProjectDetails: ConvexProjectDetails | null = null;

    try {
        const createResult = await executeWithRevocationDetection({
            logger: request.log2,
            integrationId: integration.id,
            operation: async (accessToken) => {
                const created = await fetchConvexApi<ConvexCreateProjectResponse>({
                    accessToken,
                    path:
                        `teams/${encodeURIComponent(convexTeamId)}/create_project`,
                    method: "POST",
                    body: {
                        projectName: name,
                        deploymentType,
                        deploymentRegion: deploymentRegion ?? null,
                        deploymentClass: deploymentClass ?? null,
                    },
                });

                const projects = await fetchConvexApi<ConvexProjectDetails[]>({
                    accessToken,
                    path:
                        `teams/${encodeURIComponent(convexTeamId)}/list_projects`,
                    method: "GET",
                });

                const projectDetails = projects.find(
                    (project) => project.id === created.projectId,
                ) ?? null;

                return { created, projectDetails };
            },
        });

        createdProject = createResult.created;
        createdProjectDetails = createResult.projectDetails;
    } catch (error) {
        if (error instanceof ConvexAccessRevokedError) {
            return reply.status(HTTP_STATUS.BAD_REQUEST).send({
                data: null,
                error: {
                    error: "Integration Disconnected",
                    message:
                        "Your Convex team has been disconnected. Please reconnect in team settings.",
                },
            });
        }

        if (error instanceof ConvexApiError) {
            const convexError = extractConvexApiError(error);
            return reply.status(convexError.status).send({
                data: null,
                error: {
                    error: "Convex API Error",
                    message: convexError.message,
                },
            });
        }

        request.log2.error(
            error instanceof Error ? error : new Error(String(error)),
            "Failed to create Convex project",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Convex API Error",
                message: "Failed to create Convex project",
            },
        });
    }

    request.log2.consoleLogDevOnly("info", "Created Convex project", {
        projectId: createdProject.projectId,
        projectName: createdProjectDetails?.name ?? name,
        convexTeamId,
        teamId,
    });

    return reply.status(HTTP_STATUS.CREATED).send({
        data: {
            project: {
                id: String(createdProject.projectId),
                name: createdProjectDetails?.name ?? name,
                slug:
                    createdProjectDetails?.slug ??
                    normalizeProjectSlug(name),
                team_id:
                    createdProjectDetails?.teamId !== undefined
                        ? String(createdProjectDetails.teamId)
                        : convexTeamId,
                create_time:
                    createdProjectDetails?.createTime ?? Date.now(),
                deployment_name: createdProject.deploymentName,
                deployment_url: createdProject.deploymentUrl,
            },
        },
        error: null,
    });
}

interface ConvexErrorData {
    status: number;
    message: string;
}

const extractConvexApiError = (error: ConvexApiError): ConvexErrorData => {
    const status = error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : HTTP_STATUS.BAD_GATEWAY;

    const fallbackMessage = error.message || "Convex API error";
    if (!error.responseBody) {
        return { status, message: fallbackMessage };
    }

    try {
        const parsed = JSON.parse(error.responseBody) as {
            error?: string;
            message?: string;
            details?: string;
        };
        const message = parsed.message || parsed.error || parsed.details;
        return {
            status,
            message: message || fallbackMessage,
        };
    } catch {
        return {
            status,
            message: error.responseBody || fallbackMessage,
        };
    }
};

const normalizeProjectSlug = (name: string): string =>
    name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
