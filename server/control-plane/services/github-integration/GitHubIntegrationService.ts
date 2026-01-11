import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import type { Database } from "../../types/supabase.js";
import {
  type APIResponse,
  type GitHubConnectStartErrorResponse,
  type GitHubConnectStartRequestBody,
  type GitHubConnectStartSuccessResponse,
  type GitHubDisconnectErrorResponse,
  type GitHubDisconnectRequestBody,
  type GitHubDisconnectSuccessResponse,
  type GitHubOAuthCallbackQuery,
  type GitHubRepoCreateErrorResponse,
  type GitHubRepoCreateRequestBody,
  type GitHubRepoCreateSuccessResponse,
  type GitHubStatusErrorResponse,
  type GitHubStatusQuery,
  type GitHubStatusSuccessResponse,
  HTTP_STATUS,
} from "../../types/PublicAPITypes.js";
import {
  checkUserHasPrototypeEditAccess,
  validateJWTToken,
} from "../../utils/prototypeAuth.js";
import { userIsTeamAdminOrOwner } from "../../utils/teamUtils.js";
import { decrypt, encrypt } from "../../utils/encryptionUtils.js";
import {
  createInstallationToken,
  deleteAppInstallation,
  exchangeCodeForToken,
  getAuthenticatedUser,
  listUserInstallations,
  revokeUserToken,
} from "../../utils/githubClient.js";

/**
 * GitHubIntegrationService handles team-level GitHub App integration
 *
 * Routes:
 * - POST /github/connect/start - Initiate GitHub connection flow
 * - GET /github/oauth/callback - Handle GitHub OAuth callback
 * - GET /github/status - Get team GitHub connection status
 * - POST /github/disconnect - Disconnect GitHub integration
 * - POST /github/webhooks - Handle GitHub App webhooks
 */
export class GitHubIntegrationService {
  constructor() {}

  /**
   * Register routes with Fastify
   */
  public registerRoutes(app: FastifyInstance): void {
    // POST /github/connect/start
    app.post<{ Body: GitHubConnectStartRequestBody }>(
      "/github/connect/start",
      {
        schema: {
          body: {
            type: "object",
            required: ["teamId"],
            properties: {
              teamId: {
                type: "string",
                format: "uuid",
              },
            },
          },
        },
      },
      this.handleConnectStart.bind(this),
    );

    // GET /github/oauth/callback
    app.get<{ Querystring: GitHubOAuthCallbackQuery }>(
      "/github/oauth/callback",
      {
        schema: {
          querystring: {
            type: "object",
            required: ["code", "state"],
            properties: {
              code: { type: "string" },
              state: { type: "string" },
              installation_id: { type: "string" },
            },
          },
        },
      },
      this.handleOAuthCallback.bind(this),
    );

    // GET /github/status
    app.get<{ Querystring: GitHubStatusQuery }>(
      "/github/status",
      {
        schema: {
          querystring: {
            type: "object",
            required: ["teamId"],
            properties: {
              teamId: {
                type: "string",
                format: "uuid",
              },
            },
          },
        },
      },
      this.handleGetStatus.bind(this),
    );

    // POST /github/disconnect
    app.post<{ Body: GitHubDisconnectRequestBody }>(
      "/github/disconnect",
      {
        schema: {
          body: {
            type: "object",
            required: ["teamId"],
            properties: {
              teamId: {
                type: "string",
                format: "uuid",
              },
            },
          },
        },
      },
      this.handleDisconnect.bind(this),
    );

    // POST /github/repo/create
    app.post<{ Body: GitHubRepoCreateRequestBody }>(
      "/github/repo/create",
      {
        schema: {
          body: {
            type: "object",
            required: ["teamId", "name", "prototype_id"],
            properties: {
              teamId: { type: "string", format: "uuid" },
              prototype_id: { type: "string" },
              name: { type: "string" },
              private: { type: "boolean", default: true },
              description: { type: "string" },
            },
          },
        },
      },
      this.handleCreateRepository.bind(this),
    );

    // POST /github/webhooks
    app.post(
      "/github/webhooks",
      {
        config: {
          rawBody: true, // We need raw body for signature verification
        },
      },
      this.handleWebhook.bind(this),
    );
  }

  /**
   * POST /github/connect/start
   * Initiate GitHub App connection flow for a team
   */
  private async handleConnectStart(
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
      const { data: session, error: sessionError } = await supabaseServiceClient
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
      request.log2.error(error, "Exception in handleConnectStart", { teamId });
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: "Internal Server Error",
          message: "An unexpected error occurred",
        },
      });
    }
  }

  /**
   * GET /github/oauth/callback
   * Handle GitHub OAuth callback after user authorizes the app
   */
  private async handleOAuthCallback(
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
      const { data: session, error: sessionError } = await supabaseServiceClient
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
      const tokenEncrypted = encrypt(tokenResponse.access_token);
      const refreshEncrypted = tokenResponse.refresh_token
        ? encrypt(tokenResponse.refresh_token)
        : null;

      // Calculate token expiration (if provided)
      const tokenExpiresAt = tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
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

  /**
   * GET /github/status
   * Get GitHub integration status for a team
   */
  private async handleGetStatus(
    request: FastifyRequest<{ Querystring: GitHubStatusQuery }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<GitHubStatusSuccessResponse, GitHubStatusErrorResponse>
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

    // Create Supabase client with user's token (respects RLS)
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

    try {
      // Check if integration exists for this team
      // Note: github_integrations now only contains metadata (no tokens)
      const { data: integration, error: integrationError } =
        await supabaseClient
          .from("github_integrations")
          .select(
            "account_login, account_type, connected_at, installation_id, is_suspended, suspended_at",
          )
          .eq("team_id", teamId)
          .maybeSingle();

      if (integrationError) {
        request.log2.error(
          integrationError,
          "Failed to fetch GitHub integration status",
          { teamId },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to fetch GitHub integration status",
          },
        });
      }

      if (!integration) {
        // No integration found
        return reply.status(HTTP_STATUS.OK).send({
          data: {
            connected: false,
          },
          error: null,
        });
      }

      // Integration exists
      return reply.status(HTTP_STATUS.OK).send({
        data: {
          connected: true,
          account_login: integration.account_login,
          account_type: integration.account_type,
          connected_at: integration.connected_at,
          installation_id: integration.installation_id,
          is_suspended: integration.is_suspended,
          suspended_at: integration.suspended_at,
        },
        error: null,
      });
    } catch (error) {
      request.log2.error(error, "Exception in handleGetStatus", { teamId });
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: "Internal Server Error",
          message: "An unexpected error occurred",
        },
      });
    }
  }

  /**
   * POST /github/disconnect
   * Disconnect GitHub integration for a team
   */
  private async handleDisconnect(
    request: FastifyRequest<{ Body: GitHubDisconnectRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<
      GitHubDisconnectSuccessResponse,
      GitHubDisconnectErrorResponse
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

    // Get service role client
    const supabaseServiceClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
      // Ensure we have metadata for the installation we need to remove
      const {
        data: integrationData,
        error: integrationFetchError,
      } = await supabaseServiceClient
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
        request.log2.warn("GitHub integration metadata not found for team", {
          teamId,
        });
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
          const accessToken = decrypt(tokenData.token_encrypted);
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

  /**
   * POST /github/repo/create
   * Create a GitHub repository for a team
   */
  private async handleCreateRepository(
    request: FastifyRequest<{ Body: GitHubRepoCreateRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<
      GitHubRepoCreateSuccessResponse,
      GitHubRepoCreateErrorResponse
    >
  > {
    const token = request.headers.authorization?.split(" ")[1];
    const { teamId, prototype_id, name, description } = request.body;
    const isPrivate = request.body.private ?? true;

    const authResponse = await checkUserHasPrototypeEditAccess(
      prototype_id,
      token,
      request.log2,
    );
    if (!authResponse || !authResponse.canEdit) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: "Unauthorized",
          message: "You do not have permission to edit this prototype",
        },
      });
    }

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

    if (authResponse.prototype.team_id !== teamId) {
      request.log2.warn("Prototype does not belong to specified team", {
        prototypeTeamId: authResponse.prototype.team_id,
      });
      return reply.status(HTTP_STATUS.FORBIDDEN).send({
        data: null,
        error: {
          error: "Forbidden",
          message: "Prototype does not belong to the specified team",
        },
      });
    }

    const supabaseServiceClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
      const {
        data: integration,
        error: integrationError,
      } = await supabaseServiceClient
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
        request.log2.warn("GitHub integration not found for team", { teamId });
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
        const {
          data: tokenRecord,
          error: tokenError,
        } = await supabaseServiceClient
          .from("github_integration_tokens")
          .select("token_encrypted")
          .eq("team_id", teamId)
          .maybeSingle();

        if (tokenError) {
          request.log2.error(
            tokenError,
            "Failed to fetch GitHub token for repo creation",
            { teamId },
          );
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
              error: "Database Error",
              message: "Failed to load GitHub credentials",
            },
          });
        }

        if (!tokenRecord?.token_encrypted) {
          request.log2.warn("GitHub integration token missing for team", {
            teamId,
          });
          return reply.status(HTTP_STATUS.BAD_REQUEST).send({
            data: null,
            error: {
              error: "Integration Missing",
              message: "GitHub credentials not found for this team",
            },
          });
        }

        try {
          githubAccessToken = decrypt(tokenRecord.token_encrypted);
        } catch (decryptError) {
          request.log2.error(
            decryptError instanceof Error
              ? decryptError
              : new Error(String(decryptError)),
            "Failed to decrypt GitHub token for repo creation",
          );
          return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
            data: null,
            error: {
              error: "Token Error",
              message: "Failed to decrypt GitHub token",
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
          name,
          private: isPrivate,
          description,
        }),
      });

      const responseText = await repoResponse.text();
      if (!repoResponse.ok) {
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
            message: "GitHub rejected the create repository request",
          },
        });
      }

      let repoData: any = {};
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
        repository: repoData?.name ?? name,
        owner: repoData?.owner?.login ?? integration.account_login,
      });

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          owner: repoData?.owner?.login ?? integration.account_login,
          name: repoData?.name ?? name,
          html_url: repoData?.html_url,
          default_branch: repoData?.default_branch ?? "main",
        },
        error: null,
      });
    } catch (error) {
      request.log2.error(error, "Exception in handleCreateRepository", {
        teamId,
        prototypeId: prototype_id,
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

  /**
   * POST /github/webhooks
   * Handle GitHub App webhooks
   */
  private async handleWebhook(
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
    const payload = request.body as any;

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
        const installationId = payload.installation.id;

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
        request.log2.info("Installation repositories changed", {
          action: payload.action,
          installationId: payload.installation.id,
          repositoriesAdded: payload.repositories_added?.length || 0,
          repositoriesRemoved: payload.repositories_removed?.length || 0,
        });
      } else if (event === "repository") {
        // Repository renamed/transferred - may need to update stored data
        request.log2.info("Repository event", {
          action: payload.action,
          repositoryFullName: payload.repository?.full_name,
        });
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
}
