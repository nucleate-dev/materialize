import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    FetchGitHubSourceRepoRequestBody,
    FetchGitHubSourceRepoSuccessResponse,
    HTTP_STATUS,
    StandardErrorResponse,
} from "../../types/PublicAPITypes.js";
import { validateOrchestrationToken } from "./OrchestrationTokenValidationUtils.js";
import { checkUserHasPrototypeEditAccess } from "../../utils/prototypeAuth.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../types/supabase.js";
import {
    createInstallationToken,
    fetchRepositoryById,
} from "../connectors/github/githubClient.js";
import { getValidGitHubUserAccessToken } from "../connectors/github/githubTokenUtils.js";

export async function handleFetchGitHubSourceRepo(
    request: FastifyRequest<{
        Body: FetchGitHubSourceRepoRequestBody;
    }>,
    reply: FastifyReply,
): Promise<
    APIResponse<FetchGitHubSourceRepoSuccessResponse, StandardErrorResponse>
> {
    const { prototype_id, team_id, github_repo_id } = request.body;

    // Step 1: Validate orchestration token
    const validation = await validateOrchestrationToken(
        request,
        prototype_id,
        request.log2,
    );

    if (!validation.isValid) {
        const statusCode = validation.errorMessage?.includes(
            "No active build found for this prototype",
        )
            ? HTTP_STATUS.NOT_FOUND
            : HTTP_STATUS.UNAUTHORIZED;

        const errorResponse: StandardErrorResponse = {
            error: statusCode === HTTP_STATUS.NOT_FOUND
                ? "NOT_FOUND"
                : "UNAUTHORIZED",
            message: validation.errorMessage ?? "Invalid orchestration token",
        };
        return reply.status(statusCode).send({
            data: null,
            error: errorResponse,
        });
    }

    // Step 2: Validate user JWT token and edit access
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            data: null,
            error: {
                error: "UNAUTHORIZED",
                message: "Missing Authorization header",
            },
        });
    }

    const authResponse = await checkUserHasPrototypeEditAccess(
        prototype_id,
        token,
        request.log2,
    );

    if (!authResponse || !authResponse.canEdit || !authResponse.prototype) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            data: null,
            error: {
                error: "UNAUTHORIZED",
                message: "You do not have permission to edit this prototype",
            },
        });
    }

    if (authResponse.prototype.team_id !== team_id) {
        request.log2.warn("Team ID mismatch for fetch source repo request", {
            prototypeId: prototype_id,
            requestTeamId: team_id,
            prototypeTeamId: authResponse.prototype.team_id,
        });
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
            data: null,
            error: {
                error: "BAD_REQUEST",
                message: "team_id does not match the prototype team",
            },
        });
    }

    const supabaseRlsClient = createClient<Database>(
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
        const { data: integration, error: integrationError } =
            await supabaseRlsClient
                .from("github_integrations")
                .select("account_type, installation_id")
                .eq("team_id", team_id)
                .maybeSingle();

        if (integrationError) {
            request.log2.error(
                integrationError,
                "Failed to fetch GitHub integration for source repository lookup",
                { prototypeId: prototype_id, teamId: team_id },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "INTERNAL_SERVER_ERROR",
                    message: "Failed to fetch GitHub integration",
                },
            });
        }

        if (!integration) {
            return reply.status(HTTP_STATUS.NOT_FOUND).send({
                data: null,
                error: {
                    error: "GITHUB_NOT_CONNECTED",
                    message: "GitHub integration not found for this team",
                },
            });
        }

        let githubAccessToken: string | null = null;
        let installationToken: string | null = null;
        let installationTokenExpiresAt: string | null = null;

        if (integration.account_type === "Organization") {
            try {
                const tokenResult = await createInstallationToken(
                    integration.installation_id,
                    request.log2,
                );
                githubAccessToken = tokenResult.token;
                installationToken = tokenResult.token;
                installationTokenExpiresAt = tokenResult.expires_at;
            } catch (installationTokenError) {
                request.log2.error(
                    installationTokenError instanceof Error
                        ? installationTokenError
                        : new Error(String(installationTokenError)),
                    "Failed to create installation token for source repository fetch",
                    {
                        prototypeId: prototype_id,
                        teamId: team_id,
                        githubRepoId: github_repo_id,
                        installationId: integration.installation_id,
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
        } else if (integration.account_type === "User") {
            try {
                const supabaseServiceClient = createClient<Database>(
                    process.env.SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!,
                );
                const tokenResult = await getValidGitHubUserAccessToken({
                    supabaseClient: supabaseServiceClient,
                    teamId: team_id,
                    logger: request.log2,
                });
                githubAccessToken = tokenResult.accessToken;
            } catch (tokenError) {
                request.log2.error(
                    tokenError instanceof Error
                        ? tokenError
                        : new Error(String(tokenError)),
                    "Failed to acquire valid GitHub OAuth token for source repository fetch",
                    { prototypeId: prototype_id, teamId: team_id },
                );
                return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                    data: null,
                    error: {
                        error: "GITHUB_TOKEN_ERROR",
                        message: "Failed to acquire GitHub OAuth token",
                    },
                });
            }

            try {
                const tokenResult = await createInstallationToken(
                    integration.installation_id,
                    request.log2,
                );
                installationToken = tokenResult.token;
                installationTokenExpiresAt = tokenResult.expires_at;
            } catch (installationTokenError) {
                request.log2.error(
                    installationTokenError instanceof Error
                        ? installationTokenError
                        : new Error(String(installationTokenError)),
                    "Failed to create installation token for source repository fetch",
                    {
                        prototypeId: prototype_id,
                        teamId: team_id,
                        githubRepoId: github_repo_id,
                        installationId: integration.installation_id,
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
        } else {
            request.log2.warn(
                "Unsupported GitHub integration account type for repository fetch",
                {
                    prototypeId: prototype_id,
                    teamId: team_id,
                    githubRepoId: github_repo_id,
                    accountType: integration.account_type,
                },
            );
            return reply.status(HTTP_STATUS.BAD_REQUEST).send({
                data: null,
                error: {
                    error: "BAD_REQUEST",
                    message:
                        "Unsupported GitHub integration account type for repository fetch",
                },
            });
        }

        if (!githubAccessToken || !installationToken || !installationTokenExpiresAt) {
            request.log2.warn(
                "Unable to acquire GitHub access token for repository fetch",
                { prototypeId: prototype_id, teamId: team_id },
            );
            return reply.status(HTTP_STATUS.BAD_GATEWAY).send({
                data: null,
                error: {
                    error: "GITHUB_ERROR",
                    message: "Unable to acquire GitHub access token",
                },
            });
        }

        const repoInfo = await fetchRepositoryById(
            github_repo_id,
            githubAccessToken,
            request.log2,
        );

        const successResponse: FetchGitHubSourceRepoSuccessResponse = {
            source_repo: {
                github_repo_id: repoInfo.id,
                installation_id: integration.installation_id,
                repository_url: repoInfo.html_url,
                repository_owner: repoInfo.owner?.login ?? "",
                repository_name: repoInfo.name,
                default_branch: repoInfo.default_branch,
                full_name: repoInfo.full_name,
            },
            installation_token: installationToken,
            expires_at: installationTokenExpiresAt,
        };

        return reply.status(HTTP_STATUS.OK).send({
            data: successResponse,
            error: null,
        });
    } catch (error) {
        request.log2.error(
            error instanceof Error ? error : new Error(String(error)),
            "Unexpected error while fetching source repository data",
            { prototypeId: prototype_id, teamId: team_id },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch GitHub source repository",
            },
        });
    }
}
