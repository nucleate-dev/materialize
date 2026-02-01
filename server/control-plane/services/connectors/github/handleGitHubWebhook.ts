import { FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import { Database } from "../../../types/supabase.js";
import { HTTP_STATUS } from "../../../types/PublicAPITypes.js";
import { createClient } from "@supabase/supabase-js";

interface GitHubWebhookPayload {
    action?: string;
    installation?: {
        id: number;
    };
    repositories_added?: unknown[];
    repositories_removed?: unknown[];
    repository?: {
        id?: number;
        name?: string;
        full_name?: string;
        html_url?: string;
        default_branch?: string;
        private?: boolean;
        archived?: boolean;
        owner?: {
            login?: string;
        };
    };
    changes?: {
        repository?: {
            name?: {
                from?: string;
            };
            default_branch?: {
                from?: string;
            };
        };
    };
    pull_request?: {
        id?: number;
        number?: number;
        html_url?: string;
        state?: string;
        merged?: boolean;
        merged_at?: string;
        closed_at?: string;
        head?: {
            sha?: string;
            ref?: string;
        };
        base?: {
            ref?: string;
        };
    };
}

type PullRequestStatus = Database["public"]["Enums"]["pull_request_status"];

export async function handleGitHubWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const signature = request.headers["x-hub-signature-256"] as string;
    const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;

    if (!webhookSecret) {
        request.log2.error(
            new Error("GITHUB_APP_WEBHOOK_SECRET not configured"),
            "Webhook secret not configured",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            error: "Configuration Error",
            message: "Webhook secret not configured",
        });
    }

    // Verify webhook signature
    // rawBody is populated by fastify-raw-body plugin (must be registered in server.ts)
    if (!request.rawBody) {
        request.log2.error(
            new Error("rawBody not available"),
            "Webhook signature verification failed: rawBody not populated",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            error: "Configuration Error",
            message: "Server not configured for webhook signature verification",
        });
    }

    const hmac = crypto.createHmac("sha256", webhookSecret);
    const rawBodyBuffer = typeof request.rawBody === "string"
        ? Buffer.from(request.rawBody, "utf8")
        : request.rawBody;
    const expectedSignature = "sha256=" +
        hmac.update(rawBodyBuffer).digest("hex");

    if (!signature || signature !== expectedSignature) {
        request.log2.warn("Invalid webhook signature", {
            receivedSignature: signature?.substring(0, 16),
            expectedSignature: expectedSignature.substring(0, 16),
        });
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
            error: "Unauthorized",
            message: "Invalid webhook signature",
        });
    }

    const event = request.headers["x-github-event"] as string;
    const payload = request.body as GitHubWebhookPayload;

    request.log2.consoleLogDevOnly("info", "GitHub webhook received", {
        event,
        payload,
    });

    // Get service role client
    const supabaseServiceClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
        // Handle different webhook events
        if (event === "installation") {
            const installationId = payload.installation?.id;

            if (typeof installationId !== "number") {
                request.log2.warn(
                    "Installation webhook missing installation id, skipping",
                    { event, payloadKeys: Object.keys(payload || {}) },
                );
                return reply.status(HTTP_STATUS.OK).send({ received: true });
            }

            if (payload.action === "deleted") {
                // Permanently delete the integration
                const { error } = await supabaseServiceClient
                    .from("github_integrations")
                    .delete()
                    .eq("installation_id", installationId);

                if (error) {
                    request.log2.error(
                        error,
                        "Failed to delete integration on installation deleted",
                        { installationId },
                    );
                } else {
                    request.log2.info(
                        "Integration deleted due to installation removal",
                        {
                            installationId,
                        },
                    );
                }
            } else if (payload.action === "suspend") {
                // Mark integration as suspended (temporary state)
                const { error } = await supabaseServiceClient
                    .from("github_integrations")
                    .update({
                        is_suspended: true,
                        suspended_at: new Date().toISOString(),
                    })
                    .eq("installation_id", installationId);

                if (error) {
                    request.log2.error(
                        error,
                        "Failed to mark integration as suspended",
                        { installationId },
                    );
                } else {
                    request.log2.info("Integration marked as suspended", {
                        installationId,
                    });
                }
            } else if (payload.action === "unsuspend") {
                // Clear suspension flag (automatically restore integration)
                const { error } = await supabaseServiceClient
                    .from("github_integrations")
                    .update({
                        is_suspended: false,
                        suspended_at: null,
                    })
                    .eq("installation_id", installationId);

                if (error) {
                    request.log2.error(
                        error,
                        "Failed to clear suspension on installation unsuspend",
                        { installationId },
                    );
                } else {
                    request.log2.info(
                        "Installation unsuspended, integration restored",
                        {
                            installationId,
                        },
                    );
                }
            }
        } else if (event === "installation_repositories") {
            // Repositories added or removed - log for monitoring
            const installationId = payload.installation?.id;
            request.log2.info("Installation repositories changed", {
                action: payload.action,
                installationId,
                repositoriesAdded: payload.repositories_added?.length || 0,
                repositoriesRemoved: payload.repositories_removed?.length || 0,
            });
        } else if (event === "repository") {
            // Repository renamed/transferred/archived/etc - update stored data if exists
            const githubRepoId = payload.repository?.id;
            const action = payload.action;

            if (!githubRepoId) {
                request.log2.warn(
                    "Repository webhook missing repository id, skipping",
                    { event, action },
                );
                return reply.status(HTTP_STATUS.OK).send({ received: true });
            }

            request.log2.info("Repository event received", {
                action,
                githubRepoId,
                repositoryFullName: payload.repository?.full_name,
            });

            // Check if this repository exists in our database
            const { data: existingRepo } = await supabaseServiceClient
                .from("prototype_github_repositories")
                .select("github_repo_id, full_name")
                .eq("github_repo_id", githubRepoId)
                .maybeSingle();

            if (!existingRepo) {
                // Repository not tracked by us, ignore
                request.log2.info(
                    "Repository event for untracked repository, ignoring",
                    { githubRepoId, action },
                );
                return reply.status(HTTP_STATUS.OK).send({ received: true });
            }

            // Handle different repository actions
            if (
                action === "renamed" ||
                action === "transferred" ||
                action === "edited" ||
                action === "archived" ||
                action === "unarchived" ||
                action === "privatized" ||
                action === "publicized"
            ) {
                const updateData: {
                    repo_name?: string;
                    full_name?: string;
                    owner_login?: string;
                    html_url?: string;
                    default_branch?: string;
                    is_archived?: boolean;
                    is_private?: boolean;
                } = {};

                // Update fields based on webhook payload
                if (payload.repository?.name) {
                    updateData.repo_name = payload.repository.name;
                }
                if (payload.repository?.full_name) {
                    updateData.full_name = payload.repository.full_name;
                }
                if (payload.repository?.owner?.login) {
                    updateData.owner_login = payload.repository.owner.login;
                }
                if (payload.repository?.html_url) {
                    updateData.html_url = payload.repository.html_url;
                }
                if (payload.repository?.default_branch) {
                    updateData.default_branch =
                        payload.repository.default_branch;
                }
                if (typeof payload.repository?.archived === "boolean") {
                    updateData.is_archived = payload.repository.archived;
                }
                if (typeof payload.repository?.private === "boolean") {
                    updateData.is_private = payload.repository.private;
                }

                // Only update if we have data to update
                if (Object.keys(updateData).length > 0) {
                    const { error: updateError } = await supabaseServiceClient
                        .from("prototype_github_repositories")
                        .update(updateData)
                        .eq("github_repo_id", githubRepoId);

                    if (updateError) {
                        request.log2.error(
                            updateError,
                            "Failed to update repository metadata from webhook",
                            { githubRepoId, action, updateData },
                        );
                    } else {
                        request.log2.info(
                            "Successfully updated repository metadata from webhook",
                            {
                                githubRepoId,
                                action,
                                oldFullName: existingRepo.full_name,
                                newFullName: updateData.full_name,
                                updatedFields: Object.keys(updateData),
                            },
                        );

                        // If repository was renamed, update PR URLs in prototype_source_repo_pull_requests
                        if (
                            (action === "renamed" ||
                                action === "transferred") &&
                            updateData.full_name &&
                            existingRepo.full_name !== updateData.full_name
                        ) {
                            // Fetch all PRs for this repo and update their URLs
                            const { data: affectedPrs, error: prFetchError } =
                                await supabaseServiceClient
                                    .from("prototype_source_repo_pull_requests")
                                    .select(
                                        "id, github_pull_request_number, github_pull_request_url",
                                    )
                                    .eq("github_repo_id", githubRepoId);

                            if (prFetchError) {
                                request.log2.error(
                                    prFetchError,
                                    "Failed to fetch PRs for URL update after repo rename",
                                    { githubRepoId },
                                );
                            } else if (affectedPrs && affectedPrs.length > 0) {
                                let updatedCount = 0;
                                for (const pr of affectedPrs) {
                                    const newUrl =
                                        `https://github.com/${updateData.full_name}/pull/${pr.github_pull_request_number}`;
                                    const { error: prUpdateError } =
                                        await supabaseServiceClient
                                            .from(
                                                "prototype_source_repo_pull_requests",
                                            )
                                            .update({
                                                github_pull_request_url: newUrl,
                                            })
                                            .eq("id", pr.id);

                                    if (prUpdateError) {
                                        request.log2.error(
                                            prUpdateError,
                                            "Failed to update PR URL after repo rename",
                                            {
                                                prId: pr.id,
                                                oldUrl:
                                                    pr.github_pull_request_url,
                                                newUrl,
                                            },
                                        );
                                    } else {
                                        updatedCount++;
                                    }
                                }
                                request.log2.info(
                                    "Updated PR URLs after repository rename",
                                    {
                                        githubRepoId,
                                        oldFullName: existingRepo.full_name,
                                        newFullName: updateData.full_name,
                                        totalPrs: affectedPrs.length,
                                        updatedCount,
                                    },
                                );
                            }
                        }
                    }
                }
            } else if (action === "deleted") {
                // Repository deleted on GitHub - delete from our database
                const { error: deleteError } = await supabaseServiceClient
                    .from("prototype_github_repositories")
                    .delete()
                    .eq("github_repo_id", githubRepoId);

                if (deleteError) {
                    request.log2.error(
                        deleteError,
                        "Failed to delete repository metadata on repo deletion webhook",
                        { githubRepoId },
                    );
                } else {
                    request.log2.info(
                        "Successfully deleted repository metadata after GitHub deletion",
                        { githubRepoId, fullName: existingRepo.full_name },
                    );
                }
            }
        } else if (event === "pull_request") {
            // Handle pull request events for source repo PRs created by Nucleate
            const prNumber = payload.pull_request?.number;
            const githubRepoId = payload.repository?.id;
            const repoFullName = payload.repository?.full_name;
            const action = payload.action;

            if (!prNumber || !githubRepoId) {
                request.log2.warn(
                    "Pull request webhook missing required fields, skipping",
                    { event, action, prNumber, githubRepoId },
                );
                return reply.status(HTTP_STATUS.OK).send({ received: true });
            }

            request.log2.info("Pull request event received", {
                action,
                prNumber,
                githubRepoId,
                repoFullName,
                prUrl: payload.pull_request?.html_url,
            });

            // Look up the PR in our source repo PRs table by stable identifiers (repo ID + PR number)
            // This survives repository renames, unlike URL-based matching
            const { data: existingPr, error: prLookupError } =
                await supabaseServiceClient
                    .from("prototype_source_repo_pull_requests")
                    .select("id, status, github_pull_request_url")
                    .eq("github_repo_id", githubRepoId)
                    .eq("github_pull_request_number", prNumber)
                    .maybeSingle();

            if (prLookupError) {
                request.log2.error(
                    prLookupError,
                    "Failed to look up source repo PR from webhook",
                    { prNumber, githubRepoId, repoFullName },
                );
                return reply.status(HTTP_STATUS.OK).send({ received: true });
            }

            if (!existingPr) {
                // PR not created by Nucleate, ignore
                request.log2.info(
                    "Pull request event for non-Nucleate PR, ignoring",
                    { prNumber, githubRepoId, repoFullName },
                );
                return reply.status(HTTP_STATUS.OK).send({ received: true });
            }

            // Determine the new status based on the webhook action
            let newStatus: PullRequestStatus | null = null;

            if (action === "closed") {
                // Check if merged or just closed
                if (payload.pull_request?.merged) {
                    newStatus = "merged";
                } else {
                    newStatus = "closed";
                }
            } else if (action === "reopened") {
                newStatus = "open";
            }
            // Other actions like 'synchronize', 'edited', 'labeled' don't change status

            if (newStatus && newStatus !== existingPr.status) {
                const updateData: {
                    status: PullRequestStatus;
                    head_sha?: string;
                } = { status: newStatus };

                // Update head SHA if provided
                if (payload.pull_request?.head?.sha) {
                    updateData.head_sha = payload.pull_request.head.sha;
                }

                const { error: updateError } = await supabaseServiceClient
                    .from("prototype_source_repo_pull_requests")
                    .update(updateData)
                    .eq("id", existingPr.id);

                if (updateError) {
                    request.log2.error(
                        updateError,
                        "Failed to update source repo PR status from webhook",
                        {
                            prId: existingPr.id,
                            prNumber,
                            repoFullName,
                            oldStatus: existingPr.status,
                            newStatus,
                        },
                    );
                } else {
                    request.log2.info(
                        "Successfully updated source repo PR status from webhook",
                        {
                            prId: existingPr.id,
                            prNumber,
                            repoFullName,
                            oldStatus: existingPr.status,
                            newStatus,
                        },
                    );
                }
            } else if (
                action === "synchronize" && payload.pull_request?.head?.sha
            ) {
                // Update head SHA on force push / new commits
                const { error: updateError } = await supabaseServiceClient
                    .from("prototype_source_repo_pull_requests")
                    .update({ head_sha: payload.pull_request.head.sha })
                    .eq("id", existingPr.id);

                if (updateError) {
                    request.log2.error(
                        updateError,
                        "Failed to update source repo PR head SHA from webhook",
                        { prId: existingPr.id, prNumber },
                    );
                } else {
                    request.log2.info(
                        "Updated source repo PR head SHA from webhook",
                        {
                            prId: existingPr.id,
                            prNumber,
                            newSha: payload.pull_request.head.sha,
                        },
                    );
                }
            }
        }

        // Acknowledge webhook
        return reply.status(HTTP_STATUS.OK).send({ received: true });
    } catch (error) {
        request.log2.error(error, "Exception in handleWebhook", {
            event,
            action: payload.action,
        });
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            error: "Internal Server Error",
            message: "Failed to process webhook",
        });
    }
}
