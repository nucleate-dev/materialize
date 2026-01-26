import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    GitHubConnectStartErrorResponse,
    GitHubConnectStartRequestBody,
    GitHubConnectStartSuccessResponse,
    HTTP_STATUS,
} from "../../../types/PublicAPITypes.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import { userIsTeamAdminOrOwner } from "../../../utils/teamUtils.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../../types/supabase.js";

export async function handleConnectStartImpl(
    request: FastifyRequest<{ Body: GitHubConnectStartRequestBody }>,
    reply: FastifyReply,
): Promise<
    APIResponse<
        GitHubConnectStartSuccessResponse,
        GitHubConnectStartErrorResponse
    >
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

    // Get service role client for creating connect session
    const supabaseServiceClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
        // Create connect session
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        const { data: session, error: sessionError } =
            await supabaseServiceClient
                .from("github_connect_sessions")
                .insert({
                    team_id: teamId,
                    created_by_user_id: user.id,
                    status: "started",
                    expires_at: expiresAt.toISOString(),
                })
                .select()
                .single();

        if (sessionError || !session) {
            request.log2.error(
                sessionError,
                "Failed to create GitHub connect session",
                {
                    teamId,
                },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "Database Error",
                    message: "Failed to create GitHub connect session",
                },
            });
        }

        // Generate GitHub App install URL
        const appSlug = process.env.GITHUB_APP_SLUG;
        if (!appSlug) {
            request.log2.error(
                new Error("GITHUB_APP_SLUG not configured"),
                "Missing GitHub App slug configuration",
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "Configuration Error",
                    message: "GitHub App not properly configured",
                },
            });
        }

        const installUrl =
            `https://github.com/apps/${appSlug}/installations/select_target?state=${session.id}`;

        request.log2.info("GitHub connect session created", {
            teamId,
            connectSessionId: session.id,
        });

        return reply.status(HTTP_STATUS.OK).send({
            data: {
                installUrl,
                connectSessionId: session.id,
            },
            error: null,
        });
    } catch (error) {
        request.log2.error(error, "Exception in handleConnectStart", {
            teamId,
        });
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Internal Server Error",
                message: "An unexpected error occurred",
            },
        });
    }
}
