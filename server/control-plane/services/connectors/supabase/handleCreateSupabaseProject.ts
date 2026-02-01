import { createClient } from "@supabase/supabase-js";
import { SupabaseManagementAPI } from "supabase-management-js";
import crypto from "crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
    type APIResponse,
    HTTP_STATUS,
    type StandardErrorResponse,
    type SupabaseCreateProjectRequestBody,
    type SupabaseCreateProjectSuccessResponse,
} from "../../../types/PublicAPITypes.js";
import type { Database } from "../../../types/supabase.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import {
    executeWithRevocationDetection,
    SupabaseAccessRevokedError,
} from "./supabaseTokenUtils.js";

/**
 * Generate a secure random password for the database.
 * Uses a mix of uppercase, lowercase, numbers, and special characters.
 */
function generateSecurePassword(length = 32): string {
    const charset =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    const randomBytes = crypto.randomBytes(length);
    let password = "";
    for (let i = 0; i < length; i++) {
        password += charset[randomBytes[i] % charset.length];
    }
    return password;
}

export async function handleCreateSupabaseProjectImpl(
    request: FastifyRequest<{ Body: SupabaseCreateProjectRequestBody }>,
    reply: FastifyReply,
): Promise<
    APIResponse<SupabaseCreateProjectSuccessResponse, StandardErrorResponse>
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

    const { teamId, organizationId, name, region } = request.body;

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
            "Failed to verify team membership for creating Supabase project",
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
                    "You must be a team owner, admin, or editor to create Supabase projects",
            },
        });
    }

    // Verify the organization is connected to this team
    const { data: integration, error: integrationError } = await supabaseClient
        .from("connectors_supabase_integrations")
        .select("id")
        .eq("team_id", teamId)
        .eq("supabase_organization_id", organizationId)
        .eq("status", "active")
        .maybeSingle();

    if (integrationError) {
        request.log2.error(
            integrationError,
            "Failed to verify Supabase integration for project creation",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Database Error",
                message: "Failed to verify Supabase integration",
            },
        });
    }

    if (!integration) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
            data: null,
            error: {
                error: "Invalid Organization",
                message:
                    "The specified Supabase organization is not connected to this team",
            },
        });
    }

    // Generate a secure database password
    const dbPassword = generateSecurePassword();

    // Create the project via Supabase Management API
    // executeWithRevocationDetection handles token fetching, refresh, and retry
    let createdProject;
    try {
        createdProject = await executeWithRevocationDetection({
            logger: request.log2,
            integrationId: integration.id,
            operation: async (accessToken) => {
                const managementClient = new SupabaseManagementAPI({
                    accessToken,
                });
                return managementClient.createProject({
                    organization_id: organizationId,
                    name,
                    region: region as "us-east-1",
                    db_pass: dbPassword,
                    plan: "free",
                });
            },
        });
    } catch (error) {
        // Check if API call failed due to revoked access
        if (error instanceof SupabaseAccessRevokedError) {
            return reply.status(HTTP_STATUS.BAD_REQUEST).send({
                data: null,
                error: {
                    error: "Integration Disconnected",
                    message:
                        "Your Supabase organization has been disconnected. Please reconnect in team settings.",
                },
            });
        }
        const supabaseError = extractSupabaseManagementError(error);
        if (supabaseError) {
            return reply.status(supabaseError.status).send({
                data: null,
                error: {
                    error: "Supabase API Error",
                    message: supabaseError.message,
                },
            });
        }
        request.log2.error(
            error instanceof Error ? error : new Error(String(error)),
            "Failed to create Supabase project",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Supabase API Error",
                message: "Failed to create Supabase project",
            },
        });
    }

    if (!createdProject) {
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Supabase API Error",
                message: "No project returned from Supabase",
            },
        });
    }

    request.log2.consoleLogDevOnly("info", "Created Supabase project", {
        projectId: createdProject.id,
        projectName: createdProject.name,
        organizationId,
        teamId,
    });

    return reply.status(HTTP_STATUS.CREATED).send({
        data: {
            project: {
                id: createdProject.id,
                name: createdProject.name,
                organization_id: createdProject.organization_id,
                region: createdProject.region,
                created_at: createdProject.created_at,
                database: createdProject.database
                    ? {
                        host: createdProject.database.host,
                        version: createdProject.database.version,
                    }
                    : undefined,
            },
        },
        error: null,
    });
}

type SupabaseManagementErrorData = {
    status: number;
    message: string;
    details?: string;
};

const extractSupabaseManagementError = (
    error: unknown,
): SupabaseManagementErrorData | null => {
    if (!error || typeof error !== "object") {
        return null;
    }

    if (!("response" in error)) {
        return null;
    }

    const response =
        (error as { response?: { status?: number; data?: unknown } })
            .response;
    if (!response || typeof response !== "object") {
        return null;
    }

    const status = typeof response.status === "number"
        ? response.status
        : HTTP_STATUS.BAD_GATEWAY;
    const data = response.data;
    let message = "Supabase API error";
    let details: string | undefined;

    if (typeof data === "string") {
        message = data;
        details = data;
    } else if (data && typeof data === "object") {
        if ("message" in data && typeof data.message === "string") {
            message = data.message;
        } else if ("error" in data && typeof data.error === "string") {
            message = data.error;
        } else {
            message = JSON.stringify(data);
        }
        details = JSON.stringify(data);
    } else if (error instanceof Error) {
        message = error.message;
    }

    return { status, message, details };
};
