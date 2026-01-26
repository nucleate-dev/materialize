import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    GitHubRepositoriesErrorResponse,
    GitHubRepositoriesQuery,
    GitHubRepositoriesSuccessResponse,
    HTTP_STATUS,
} from "../../../types/PublicAPITypes.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../../types/supabase.js";
import { createInstallationToken } from "./githubClient.js";
import { getValidGitHubUserAccessToken } from "./githubTokenUtils.js";
import { GitHubRepositoryResponse } from "./GitHubIntegrationService.js";

export async function handleGetRepositoriesImpl(
    request: FastifyRequest<{ Querystring: GitHubRepositoriesQuery }>,
    reply: FastifyReply,
): Promise<
    APIResponse<
        GitHubRepositoriesSuccessResponse,
        GitHubRepositoriesErrorResponse
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

    const { teamId } = request.query;

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

    // Get service role client for accessing tokens
    const supabaseServiceClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
        // Fetch GitHub integration for the team
        const { data: integration, error: integrationError } =
            await supabaseClient
                .from("github_integrations")
                .select("account_type, account_login, installation_id")
                .eq("team_id", teamId)
                .maybeSingle();

        if (integrationError) {
            request.log2.error(
                integrationError,
                "Failed to fetch GitHub integration for repositories list",
                { teamId },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "Database Error",
                    message: "Failed to load GitHub integration for this team",
                },
            });
        }

        if (!integration) {
            request.log2.warn("GitHub integration not found for team", {
                teamId,
            });
            return reply.status(HTTP_STATUS.BAD_REQUEST).send({
                data: null,
                error: {
                    error: "Integration Missing",
                    message: "This team is not connected to GitHub",
                },
            });
        }

        let githubAccessToken: string;

        if (integration.account_type === "Organization") {
            try {
                const installationToken = await createInstallationToken(
                    integration.installation_id,
                    request.log2,
                );
                githubAccessToken = installationToken.token;
            } catch (installationTokenError) {
                request.log2.error(
                    installationTokenError instanceof Error
                        ? installationTokenError
                        : new Error(String(installationTokenError)),
                    "Failed to create installation token for fetching repositories",
                    { installationId: integration.installation_id },
                );
                return reply.status(HTTP_STATUS.BAD_GATEWAY).send({
                    data: null,
                    error: {
                        error: "GitHub Error",
                        message:
                            "Unable to authenticate with the GitHub installation for this team",
                    },
                });
            }
        } else if (integration.account_type === "User") {
            try {
                const tokenResult = await getValidGitHubUserAccessToken({
                    supabaseClient: supabaseServiceClient,
                    teamId,
                    logger: request.log2,
                });
                githubAccessToken = tokenResult.accessToken;
            } catch (tokenError) {
                request.log2.error(
                    tokenError instanceof Error
                        ? tokenError
                        : new Error(String(tokenError)),
                    "Failed to acquire valid GitHub OAuth token for repositories list",
                    { teamId },
                );
                return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                    data: null,
                    error: {
                        error: "Token Error",
                        message:
                            "Failed to acquire GitHub credentials for this team",
                    },
                });
            }
        } else {
            request.log2.error(
                new Error("Unsupported GitHub account type"),
                "Unknown GitHub integration account type",
                { accountType: integration.account_type },
            );
            return reply.status(HTTP_STATUS.BAD_REQUEST).send({
                data: null,
                error: {
                    error: "Integration Error",
                    message: "Unsupported GitHub integration type",
                },
            });
        }

        // Fetch repositories from GitHub API
        const endpoint = integration.account_type === "Organization"
            ? `https://api.github.com/orgs/${integration.account_login}/repos?per_page=100`
            : "https://api.github.com/user/repos?per_page=100&affiliation=owner";

        const repoResponse = await fetch(endpoint, {
            method: "GET",
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${githubAccessToken}`,
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });

        const responseText = await repoResponse.text();
        if (!repoResponse.ok) {
            request.log2.error(
                new Error("GitHub repositories fetch failed"),
                "GitHub API returned an error while fetching repositories",
                {
                    status: repoResponse.status,
                    response: responseText.slice(0, 500),
                },
            );
            return reply.status(HTTP_STATUS.BAD_GATEWAY).send({
                data: null,
                error: {
                    error: "GitHub Error",
                    message: "GitHub rejected the repositories fetch request",
                },
            });
        }

        let repositories: GitHubRepositoryResponse[] = [];
        try {
            repositories = responseText ? JSON.parse(responseText) : [];
        } catch (parseError) {
            request.log2.error(
                parseError instanceof Error
                    ? parseError
                    : new Error(String(parseError)),
                "Failed to parse GitHub repositories response",
                { response: responseText.slice(0, 200) },
            );
            return reply.status(HTTP_STATUS.BAD_GATEWAY).send({
                data: null,
                error: {
                    error: "GitHub Error",
                    message: "Invalid response received from GitHub",
                },
            });
        }

        // Transform repositories to our response format
        const formattedRepositories = repositories
            .filter((repo) => !repo.archived) // Filter out archived repos
            .map((repo) => ({
                id: repo.id ?? 0,
                name: repo.name ?? "",
                full_name: repo.full_name ?? "",
                html_url: repo.html_url ?? "",
                default_branch: repo.default_branch ?? "main",
                private: repo.private ?? false,
                archived: repo.archived ?? false,
                owner_login: repo.owner?.login ?? integration.account_login,
            }));

        request.log2.info("Successfully fetched GitHub repositories", {
            teamId,
            repositoryCount: formattedRepositories.length,
        });

        return reply.status(HTTP_STATUS.OK).send({
            data: {
                repositories: formattedRepositories,
            },
            error: null,
        });
    } catch (error) {
        request.log2.error(error, "Exception in handleGetRepositories", {
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
