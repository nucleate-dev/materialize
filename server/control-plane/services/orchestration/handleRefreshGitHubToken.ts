import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    HTTP_STATUS,
    RefreshGitHubInstallationTokenErrorResponse,
    RefreshGitHubInstallationTokenRequestBody,
    RefreshGitHubInstallationTokenSuccessResponse,
} from "../../types/PublicAPITypes.js";
import { GlideClient } from "@valkey/valkey-glide";
import { validateJWTToken } from "../../utils/prototypeAuth.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../types/supabase.js";
import { getValidGitHubUserAccessToken } from "../connectors/github/githubTokenUtils.js";
import { createInstallationToken } from "../connectors/github/githubClient.js";
import { validateOrchestrationToken } from "./OrchestrationTokenValidationUtils.js";

export async function handleRefreshGitHubInstallationToken(
    request: FastifyRequest<{
        Body: RefreshGitHubInstallationTokenRequestBody;
    }>,
    reply: FastifyReply,
    cache: GlideClient,
): Promise<
    APIResponse<
        RefreshGitHubInstallationTokenSuccessResponse,
        RefreshGitHubInstallationTokenErrorResponse
    >
> {
    const { prototype_id } = request.body;

    // Step 1: Validate orchestration token
    const validation = await validateOrchestrationToken(
        request,
        prototype_id,
        request.log2,
        cache,
    );

    if (!validation.isValid) {
        const statusCode = validation.errorMessage ===
                "No active build found for this prototype"
            ? HTTP_STATUS.NOT_FOUND
            : HTTP_STATUS.UNAUTHORIZED;

        const errorResponse: RefreshGitHubInstallationTokenErrorResponse = {
            error: statusCode === HTTP_STATUS.NOT_FOUND
                ? "NOT_FOUND"
                : "UNAUTHORIZED",
            message: validation.errorMessage!,
        };
        return reply.status(statusCode).send({
            data: null,
            error: errorResponse,
        });
    }

    // Step 2: Validate user JWT token
    const authHeader = request.headers.authorization;
    if (!authHeader) {
        request.log2.warn("Missing authorization header", {
            prototypeId: prototype_id,
        });
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            data: null,
            error: {
                error: "UNAUTHORIZED",
                message: "Missing Authorization header",
            },
        });
    }

    const token = authHeader.split(" ")[1] ?? "";
    const { user } = await validateJWTToken(token, request.log2);
    if (!user) {
        request.log2.warn("Invalid JWT token", { prototypeId: prototype_id });
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            data: null,
            error: {
                error: "UNAUTHORIZED",
                message: "Invalid JWT token",
            },
        });
    }

    // Step 3: Create authenticated Supabase client using user's JWT
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
        // Step 4: Fetch prototype to get team_id (using user's authenticated client)
        const { data: prototype, error: prototypeError } =
            await supabaseAuthClient
                .from("prototypes")
                .select("team_id, github_repo_id")
                .eq("id", prototype_id)
                .single();

        if (prototypeError || !prototype) {
            request.log2.error(
                prototypeError ?? new Error("Prototype not found"),
                "Failed to fetch prototype",
                { prototypeId: prototype_id },
            );
            return reply.status(HTTP_STATUS.NOT_FOUND).send({
                data: null,
                error: {
                    error: "NOT_FOUND",
                    message: "Prototype not found",
                },
            });
        }

        // Check if prototype has a GitHub repo
        // if (!prototype.github_repo_id) {
        //   this.logger.warn('Prototype does not have a GitHub repository', {
        //     prototypeId: prototype_id,
        //   });
        //   return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        //     data: null,
        //     error: {
        //       error: 'NO_GITHUB_REPO',
        //       message: 'This prototype does not have a linked GitHub repository',
        //     },
        //   });
        // }

        // Step 5: Fetch GitHub integration for the team (use service role for sensitive data)
        const supabaseServiceClient = createClient<Database>(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const { data: integration, error: integrationError } =
            await supabaseServiceClient
                .from("github_integrations")
                .select("installation_id, account_type")
                .eq("team_id", prototype.team_id)
                .maybeSingle();

        if (integrationError || !integration) {
            request.log2.error(
                integrationError ?? new Error("GitHub integration not found"),
                "Failed to fetch GitHub integration",
                { teamId: prototype.team_id, prototypeId: prototype_id },
            );
            return reply.status(HTTP_STATUS.NOT_FOUND).send({
                data: null,
                error: {
                    error: "GITHUB_NOT_CONNECTED",
                    message: "GitHub integration not found for this team",
                },
            });
        }

        if (integration.account_type === "User") {
            try {
                await getValidGitHubUserAccessToken({
                    supabaseClient: supabaseServiceClient,
                    teamId: prototype.team_id,
                    logger: request.log2,
                });
            } catch (tokenError) {
                request.log2.error(
                    tokenError instanceof Error
                        ? tokenError
                        : new Error(String(tokenError)),
                    "Failed to refresh GitHub OAuth token before issuing installation token",
                    { prototypeId: prototype_id, teamId: prototype.team_id },
                );
                return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                    data: null,
                    error: {
                        error: "GITHUB_TOKEN_ERROR",
                        message: "Failed to refresh GitHub OAuth token",
                    },
                });
            }
        }

        // Step 6: Create installation token
        try {
            const installationToken = await createInstallationToken(
                integration.installation_id,
                request.log2,
            );

            request.log2.info("Created GitHub installation token", {
                prototypeId: prototype_id,
                teamId: prototype.team_id,
                installationId: integration.installation_id,
            });

            return reply.status(HTTP_STATUS.OK).send({
                data: {
                    installation_token: installationToken.token,
                    expires_at: installationToken.expires_at,
                },
                error: null,
            });
        } catch (tokenError) {
            request.log2.error(
                tokenError instanceof Error
                    ? tokenError
                    : new Error(String(tokenError)),
                "Failed to create GitHub installation token",
                {
                    installationId: integration.installation_id,
                    prototypeId: prototype_id,
                },
            );
            return reply.status(HTTP_STATUS.BAD_GATEWAY).send({
                data: null,
                error: {
                    error: "GITHUB_ERROR",
                    message: "Failed to create GitHub installation token",
                },
            });
        }
    } catch (error) {
        request.log2.error(
            error instanceof Error ? error : new Error(String(error)),
            "Exception in handleRefreshGitHubInstallationToken",
            { prototypeId: prototype_id },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "INTERNAL_SERVER_ERROR",
                message: "An unexpected error occurred",
            },
        });
    }
}
