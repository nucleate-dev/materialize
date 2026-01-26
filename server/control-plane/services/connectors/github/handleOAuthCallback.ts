import { FastifyReply, FastifyRequest } from "fastify";
import { GitHubOAuthCallbackQuery } from "../../../types/PublicAPITypes.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../../types/supabase.js";
import {
    exchangeCodeForToken,
    getAuthenticatedUser,
    listUserInstallations,
} from "./githubClient.js";
import { encrypt } from "../../../utils/encryptionUtils.js";

export async function handleOAuthCallbackImpl(
    request: FastifyRequest<{ Querystring: GitHubOAuthCallbackQuery }>,
    reply: FastifyReply,
): Promise<void> {
    const { code, state, installation_id } = request.query;
    const connectSessionId = state;

    request.log2 = request.log2.child({ connectSessionId });

    const siteBaseUrl = process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : process.env.SITE_BASE_URL || "http://localhost:3000";

    // Get service role client
    const supabaseServiceClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
        // 1. Validate connect session
        const { data: session, error: sessionError } =
            await supabaseServiceClient
                .from("github_connect_sessions")
                .select("*")
                .eq("id", connectSessionId)
                .single();

        if (sessionError || !session) {
            request.log2.error(sessionError, "Connect session not found", {
                connectSessionId,
            });
            return reply.redirect(
                `${siteBaseUrl}/dashboard?githubConnected=0&error=invalid_session`,
            );
        }

        // Check if session is expired
        if (new Date(session.expires_at) < new Date()) {
            request.log2.warn("Connect session expired", {
                connectSessionId,
                expiresAt: session.expires_at,
            });

            // Mark as expired
            await supabaseServiceClient
                .from("github_connect_sessions")
                .update({ status: "expired" })
                .eq("id", connectSessionId);

            return reply.redirect(
                `${siteBaseUrl}/dashboard?teamId=${session.team_id}&githubConnected=0&error=session_expired`,
            );
        }

        // Check if session is already used
        if (session.status !== "started") {
            request.log2.warn("Connect session already used or invalid", {
                connectSessionId,
                status: session.status,
            });
            return reply.redirect(
                `${siteBaseUrl}/dashboard?teamId=${session.team_id}&githubConnected=0&error=session_already_used`,
            );
        }

        request.log2 = request.log2.child({ teamId: session.team_id });

        // 2. Exchange code for access token
        const tokenResponse = await exchangeCodeForToken(code, request.log2);

        // 3. Get authenticated user
        const githubUser = await getAuthenticatedUser(
            tokenResponse.access_token,
            request.log2,
        );

        request.log2 = request.log2.child({
            githubUserId: githubUser.id,
            githubLogin: githubUser.login,
        });

        // 4. Get user installations and verify installation_id
        const installations = await listUserInstallations(
            tokenResponse.access_token,
            request.log2,
        );

        let targetInstallation;
        if (installation_id) {
            // Verify the provided installation_id belongs to the user
            targetInstallation = installations.find(
                (inst) => inst.id === parseInt(installation_id, 10),
            );
            if (!targetInstallation) {
                request.log2.error(
                    new Error("Installation not found or not accessible"),
                    "Installation ID mismatch",
                    {
                        providedInstallationId: installation_id,
                        userInstallations: installations.map((i) => i.id),
                    },
                );
                return reply.redirect(
                    `${siteBaseUrl}/dashboard?teamId=${session.team_id}&githubConnected=0&error=installation_not_found`,
                );
            }
        } else {
            // No installation_id provided, try to find the most recent one
            if (installations.length === 0) {
                request.log2.error(
                    new Error("No installations found"),
                    "User has no accessible installations",
                );
                return reply.redirect(
                    `${siteBaseUrl}/dashboard?teamId=${session.team_id}&githubConnected=0&error=no_installation`,
                );
            } else if (installations.length === 1) {
                targetInstallation = installations[0];
                request.log2.info("Using only available installation", {
                    installationId: targetInstallation.id,
                });
            } else {
                // Multiple installations - take the most recently updated one
                targetInstallation = installations.sort(
                    (a, b) =>
                        new Date(b.updated_at).getTime() -
                        new Date(a.updated_at).getTime(),
                )[0];
                request.log2.warn(
                    "Multiple installations found, using most recent",
                    {
                        installationId: targetInstallation.id,
                        totalInstallations: installations.length,
                    },
                );
            }
        }

        // 5. Encrypt tokens
        const tokenEncrypted = encrypt(tokenResponse.access_token, "github");
        const refreshEncrypted = tokenResponse.refresh_token
            ? encrypt(tokenResponse.refresh_token, "github")
            : null;

        // Calculate token expiration (if provided)
        const tokenExpiresAt = tokenResponse.expires_in
            ? new Date(Date.now() + tokenResponse.expires_in * 1000)
                .toISOString()
            : null;

        // 6. Upsert github_integrations (metadata only, no tokens)
        const { error: integrationError } = await supabaseServiceClient
            .from("github_integrations")
            .upsert(
                {
                    team_id: session.team_id,
                    installation_id: targetInstallation.id,
                    account_login: targetInstallation.account.login,
                    account_type: targetInstallation.account.type,
                    installed_by_github_user_id: githubUser.id,
                },
                {
                    onConflict: "team_id",
                },
            );

        if (integrationError) {
            request.log2.error(
                integrationError,
                "Failed to save GitHub integration metadata",
                {
                    teamId: session.team_id,
                },
            );

            // Mark session as failed
            await supabaseServiceClient
                .from("github_connect_sessions")
                .update({ status: "failed" })
                .eq("id", connectSessionId);

            return reply.redirect(
                `${siteBaseUrl}/dashboard?teamId=${session.team_id}&githubConnected=0&error=save_failed`,
            );
        }

        // 7. Upsert github_integration_tokens (tokens only, service role access)
        const { error: tokensError } = await supabaseServiceClient
            .from("github_integration_tokens")
            .upsert(
                {
                    team_id: session.team_id,
                    token_encrypted: tokenEncrypted,
                    refresh_encrypted: refreshEncrypted,
                    token_expires_at: tokenExpiresAt,
                },
                {
                    onConflict: "team_id",
                },
            );

        if (tokensError) {
            request.log2.error(
                tokensError,
                "Failed to save GitHub integration tokens",
                {
                    teamId: session.team_id,
                },
            );

            // Mark session as failed
            await supabaseServiceClient
                .from("github_connect_sessions")
                .update({ status: "failed" })
                .eq("id", connectSessionId);

            // Clean up metadata if tokens failed
            await supabaseServiceClient
                .from("github_integrations")
                .delete()
                .eq("team_id", session.team_id);

            return reply.redirect(
                `${siteBaseUrl}/dashboard?teamId=${session.team_id}&githubConnected=0&error=save_failed`,
            );
        }

        // 8. Mark connect session as connected
        await supabaseServiceClient
            .from("github_connect_sessions")
            .update({ status: "connected" })
            .eq("id", connectSessionId);

        request.log2.info("GitHub integration successfully connected", {
            teamId: session.team_id,
            installationId: targetInstallation.id,
            accountLogin: targetInstallation.account.login,
        });

        // 9. Redirect back to settings
        return reply.redirect(
            `${siteBaseUrl}/dashboard?teamId=${session.team_id}&githubConnected=1`,
        );
    } catch (error) {
        request.log2.error(error, "Exception in handleOAuthCallback");

        // Try to get team_id from session for redirect
        let teamIdForRedirect = "";
        try {
            const { data: session } = await supabaseServiceClient
                .from("github_connect_sessions")
                .select("team_id")
                .eq("id", connectSessionId)
                .single();
            if (session) {
                teamIdForRedirect = `&teamId=${session.team_id}`;
            }
        } catch {
            // Ignore errors when getting team_id for redirect
        }

        return reply.redirect(
            `${siteBaseUrl}/dashboard?githubConnected=0&error=internal_error${teamIdForRedirect}`,
        );
    }
}
