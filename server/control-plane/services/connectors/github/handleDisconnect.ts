import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    GitHubDisconnectErrorResponse,
    GitHubDisconnectRequestBody,
    GitHubDisconnectSuccessResponse,
    HTTP_STATUS,
} from "../../../types/PublicAPITypes.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../../types/supabase.js";
import { userIsTeamAdminOrOwner } from "../../../utils/teamUtils.js";
import { decrypt } from "dotenv";
import { deleteAppInstallation, revokeUserToken } from "./githubClient.js";

export async function handleDisconnectImpl(
    request: FastifyRequest<{ Body: GitHubDisconnectRequestBody }>,
    reply: FastifyReply,
): Promise<
    APIResponse<GitHubDisconnectSuccessResponse, GitHubDisconnectErrorResponse>
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

    const { teamId } = request.body;

    // Create Supabase client with user's token
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

    // Check if user is team owner/admin
    const hasTeamAccess = await userIsTeamAdminOrOwner(
        teamId,
        user.id,
        supabaseClient,
        request.log2,
    );
    if (!hasTeamAccess) {
        request.log2.warn("User is not owner/admin of requested team", {
            teamId,
        });
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
            data: null,
            error: {
                error: "Forbidden",
                message:
                    "You do not have permission to manage GitHub integration for this team",
            },
        });
    }

    // Get service role client
    const supabaseServiceClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
        // Ensure we have metadata for the installation we need to remove
        const { data: integrationData, error: integrationFetchError } =
            await supabaseServiceClient
                .from("github_integrations")
                .select("installation_id")
                .eq("team_id", teamId)
                .maybeSingle();

        if (integrationFetchError) {
            request.log2.error(
                integrationFetchError,
                "Failed to fetch GitHub integration metadata for disconnect",
                { teamId },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "Database Error",
                    message: "Failed to disconnect GitHub integration",
                },
            });
        }

        if (!integrationData?.installation_id) {
            request.log2.warn(
                "GitHub integration metadata not found for team",
                {
                    teamId,
                },
            );
            return reply.status(HTTP_STATUS.NOT_FOUND).send({
                data: null,
                error: {
                    error: "Not Found",
                    message: "No GitHub integration found for this team",
                },
            });
        }

        // First, get the encrypted token from the tokens table
        const { data: tokenData } = await supabaseServiceClient
            .from("github_integration_tokens")
            .select("token_encrypted")
            .eq("team_id", teamId)
            .maybeSingle();

        // Attempt to revoke the token (best effort)
        if (tokenData?.token_encrypted) {
            try {
                const accessToken = decrypt(
                    tokenData.token_encrypted,
                    "github",
                );
                await revokeUserToken(accessToken, request.log2);
            } catch (revokeError) {
                // Log but don't fail the disconnect operation
                request.log2.warn(
                    "Failed to revoke GitHub token, continuing with disconnect",
                    {
                        error: revokeError instanceof Error
                            ? revokeError.message
                            : String(revokeError),
                    },
                );
            }
        }

        // Attempt to remove the GitHub App installation
        try {
            await deleteAppInstallation(
                integrationData.installation_id,
                request.log2,
            );
        } catch (installationError) {
            request.log2.error(
                installationError instanceof Error
                    ? installationError
                    : new Error(String(installationError)),
                "Failed to remove GitHub App installation during disconnect",
                {
                    teamId,
                    installationId: integrationData.installation_id,
                },
            );
            return reply.status(HTTP_STATUS.BAD_GATEWAY).send({
                data: null,
                error: {
                    error: "GitHub Error",
                    message:
                        "Failed to remove GitHub App installation. Please try again later.",
                },
            });
        }

        // Delete the integration (cascade will delete tokens too)
        const { error: deleteError } = await supabaseServiceClient
            .from("github_integrations")
            .delete()
            .eq("team_id", teamId);

        if (deleteError) {
            request.log2.error(
                deleteError,
                "Failed to delete GitHub integration",
                {
                    teamId,
                },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "Database Error",
                    message: "Failed to disconnect GitHub integration",
                },
            });
        }

        request.log2.info("GitHub integration disconnected", { teamId });

        return reply.status(HTTP_STATUS.OK).send({
            data: {
                success: true,
                message: "GitHub integration disconnected successfully",
            },
            error: null,
        });
    } catch (error) {
        request.log2.error(error, "Exception in handleDisconnect", { teamId });
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Internal Server Error",
                message: "An unexpected error occurred",
            },
        });
    }
}
