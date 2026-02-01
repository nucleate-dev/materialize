import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    GitHubRepoCreateErrorResponse,
    GitHubRepoCreateRequestBody,
    GitHubRepoCreateSuccessResponse,
    HTTP_STATUS,
} from "../../../types/PublicAPITypes.js";
import { checkUserHasPrototypeEditAccess } from "../../../utils/prototypeAuth.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../../types/supabase.js";
import { createInstallationToken } from "./githubClient.js";
import { getValidGitHubUserAccessToken } from "./githubTokenUtils.js";
import { GitHubRepositoryResponse } from "./GitHubIntegrationService.js";

export async function handleCreateRepositoryForPrototypeImpl(
    request: FastifyRequest<{ Body: GitHubRepoCreateRequestBody }>,
    reply: FastifyReply,
): Promise<
    APIResponse<GitHubRepoCreateSuccessResponse, GitHubRepoCreateErrorResponse>
> {
    const token = request.headers.authorization?.split(" ")[1];
    const { prototype_id, name: rawName, description } = request.body;
    const isPrivate = request.body.private ?? true;

    const authResponse = await checkUserHasPrototypeEditAccess(
        prototype_id,
        token,
        request.log2,
    );
    if (!authResponse || !authResponse.canEdit || !authResponse.prototype) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            data: null,
            error: {
                error: "Unauthorized",
                message: "You do not have permission to edit this prototype",
            },
        });
    }

    const teamId = authResponse.prototype.team_id;

    const childContext: Record<string, string> = {
        teamId,
        prototypeId: prototype_id,
    };
    if (authResponse.user?.id) {
        childContext.userId = authResponse.user.id;
    } else if (authResponse.isServiceRole) {
        childContext.userId = "service-role";
    }
    request.log2 = request.log2.child(childContext);

    const providedName = rawName?.trim();
    const repoName = providedName && providedName.length > 0
        ? providedName
        : authResponse.prototype.name?.trim() ||
            authResponse.prototype.slug?.trim() ||
            authResponse.prototype.id;

    const supabaseServiceClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
        // 1. Check if prototype already has a GitHub repo linked
        if (authResponse.prototype.github_repo_id) {
            const { data: existingRepo, error: repoCheckError } =
                await supabaseServiceClient
                    .from("prototype_github_repositories")
                    .select("github_repo_id, full_name, is_archived, html_url")
                    .eq("github_repo_id", authResponse.prototype.github_repo_id)
                    .maybeSingle();

            if (repoCheckError) {
                request.log2.error(
                    repoCheckError,
                    "Failed to check existing GitHub repository",
                    { prototypeId: prototype_id },
                );
                return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                    data: null,
                    error: {
                        error: "Database Error",
                        message: "Failed to check existing GitHub repository",
                    },
                });
            }

            // If repo exists and is not archived, deny the request
            if (existingRepo && !existingRepo.is_archived) {
                request.log2.warn(
                    "Prototype already has an active GitHub repository",
                    {
                        prototypeId: prototype_id,
                        existingRepoId: existingRepo.github_repo_id,
                        existingRepoName: existingRepo.full_name,
                    },
                );
                return reply.status(HTTP_STATUS.CONFLICT).send({
                    data: null,
                    error: {
                        error: "Repository Already Exists",
                        message:
                            `This prototype is already linked to GitHub repository: ${existingRepo.full_name}`,
                    },
                });
            }
        }

        // 2. Fetch GitHub integration for the team
        const { data: integration, error: integrationError } =
            await supabaseServiceClient
                .from("github_integrations")
                .select("account_type, account_login, installation_id")
                .eq("team_id", teamId)
                .maybeSingle();

        if (integrationError) {
            request.log2.error(
                integrationError,
                "Failed to fetch GitHub integration for repo creation",
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
                    "Failed to create installation token for repo creation",
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
                    "Failed to acquire valid GitHub OAuth token for repo creation",
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

        const endpoint = integration.account_type === "Organization"
            ? `https://api.github.com/orgs/${integration.account_login}/repos`
            : "https://api.github.com/user/repos";

        const repoResponse = await fetch(endpoint, {
            method: "POST",
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${githubAccessToken}`,
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: repoName,
                private: isPrivate,
                description,
            }),
        });

        const responseText = await repoResponse.text();
        if (!repoResponse.ok) {
            const errorMessage = formatGitHubRepoCreateError(
                responseText,
                repoResponse.status,
            );
            request.log2.error(
                new Error("GitHub repository creation failed"),
                "GitHub API returned an error while creating repository",
                {
                    status: repoResponse.status,
                    response: responseText.slice(0, 500),
                },
            );
            return reply.status(HTTP_STATUS.BAD_GATEWAY).send({
                data: null,
                error: {
                    error: "GitHub Error",
                    message: errorMessage,
                },
            });
        }

        let repoData: GitHubRepositoryResponse = {};
        try {
            repoData = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
            request.log2.error(
                parseError instanceof Error
                    ? parseError
                    : new Error(String(parseError)),
                "Failed to parse GitHub repository response",
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

        request.log2.info("Created GitHub repository", {
            repository: repoData?.name ?? repoName,
            owner: repoData?.owner?.login ?? integration.account_login,
            githubRepoId: repoData?.id,
        });

        // 3. Store repository metadata in prototype_github_repositories table
        if (!repoData?.id) {
            request.log2.error(
                new Error("GitHub repository ID missing from response"),
                "Cannot store repository without GitHub repo ID",
                { response: JSON.stringify(repoData).slice(0, 200) },
            );
            return reply.status(HTTP_STATUS.BAD_GATEWAY).send({
                data: null,
                error: {
                    error: "GitHub Error",
                    message: "GitHub response missing repository ID",
                },
            });
        }

        const githubRepoId = repoData.id;
        const fullName = repoData.full_name ??
            `${repoData.owner?.login ?? integration.account_login}/${
                repoData.name ?? repoName
            }`;

        const { error: insertRepoError } = await supabaseServiceClient
            .from("prototype_github_repositories")
            .insert({
                github_repo_id: githubRepoId,
                prototype_id: prototype_id,
                installation_id: integration.installation_id,
                account_login: integration.account_login,
                account_type: integration.account_type,
                owner_login: repoData.owner?.login ?? integration.account_login,
                repo_name: repoData.name ?? repoName,
                full_name: fullName,
                html_url: repoData.html_url ?? `https://github.com/${fullName}`,
                default_branch: repoData.default_branch ?? "main",
                is_private: repoData.private ?? isPrivate,
                is_archived: repoData.archived ?? false,
            });

        if (insertRepoError) {
            request.log2.error(
                insertRepoError,
                "Failed to insert GitHub repository into database",
                { githubRepoId, teamId, prototypeId: prototype_id },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "Database Error",
                    message: "Failed to save repository metadata",
                },
            });
        }

        // 4. Link the prototype to the repository
        const { error: updatePrototypeError } = await supabaseServiceClient
            .from("prototypes")
            .update({ github_repo_id: githubRepoId })
            .eq("id", prototype_id);

        if (updatePrototypeError) {
            request.log2.error(
                updatePrototypeError,
                "Failed to link prototype to GitHub repository",
                { githubRepoId, prototypeId: prototype_id },
            );
            // Try to clean up the repo entry we just created
            await supabaseServiceClient
                .from("prototype_github_repositories")
                .delete()
                .eq("github_repo_id", githubRepoId);

            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "Database Error",
                    message: "Failed to link prototype to repository",
                },
            });
        }

        request.log2.info(
            "Successfully linked prototype to GitHub repository",
            {
                prototypeId: prototype_id,
                githubRepoId,
                fullName,
            },
        );

        return reply.status(HTTP_STATUS.OK).send({
            data: {
                owner: repoData?.owner?.login ?? integration.account_login,
                name: repoData?.name ?? repoName,
                html_url: repoData?.html_url,
                default_branch: repoData?.default_branch ?? "main",
                github_repo_id: githubRepoId,
            },
            error: null,
        });
    } catch (error) {
        request.log2.error(
            error,
            "Exception in handleCreateRepositoryForPrototype",
            {
                teamId,
                prototypeId: prototype_id,
            },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
                error: "Internal Server Error",
                message: "An unexpected error occurred",
            },
        });
    }
}

const formatGitHubRepoCreateError = (
    responseText: string,
    status: number,
): string => {
    let message = "GitHub rejected the create repository request";
    let details = "";

    try {
        const parsed = JSON.parse(responseText) as {
            message?: string;
            errors?: Array<{ message?: string; field?: string; code?: string }>;
        };
        if (typeof parsed?.message === "string" && parsed.message.trim()) {
            message = parsed.message.trim();
        }

        if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
            details = parsed.errors
                .map((error) => {
                    if (
                        typeof error?.message === "string" &&
                        error.message.trim()
                    ) {
                        return error.message.trim();
                    }
                    if (error?.field && error?.code) {
                        return `${error.field}: ${error.code}`;
                    }
                    return "";
                })
                .filter(Boolean)
                .join("; ");
        }
    } catch {
        // Leave fallback message intact.
    }

    const composed = details ? `${message} (${details})` : message;
    const trimmed = composed.length > 300
        ? `${composed.slice(0, 297)}...`
        : composed;

    return `GitHub error (${status}): ${trimmed}`;
};
