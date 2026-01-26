import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import type { Database } from "../../../types/supabase.js";
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
  type GitHubRepositoriesErrorResponse,
  type GitHubRepositoriesQuery,
  type GitHubRepositoriesSuccessResponse,
  type GitHubStatusErrorResponse,
  type GitHubStatusQuery,
  type GitHubStatusSuccessResponse,
  HTTP_STATUS,
} from "../../../types/PublicAPITypes.js";
import {
  checkUserHasPrototypeEditAccess,
  validateJWTToken,
} from "../../../utils/prototypeAuth.js";
import { userIsTeamAdminOrOwner } from "../../../utils/teamUtils.js";
import { decrypt, encrypt } from "../../../utils/encryptionUtils.js";
import {
  createInstallationToken,
  deleteAppInstallation,
  exchangeCodeForToken,
  getAuthenticatedUser,
  listUserInstallations,
  revokeUserToken,
} from "./githubClient.js";
import { getValidGitHubUserAccessToken } from "./githubTokenUtils.js";

interface GitHubRepositoryResponse {
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
}

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
          if (typeof error?.message === "string" && error.message.trim()) {
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
            required: ["prototype_id"],
            properties: {
              prototype_id: { type: "string" },
              name: { type: "string" },
              private: { type: "boolean", default: true },
              description: { type: "string" },
            },
          },
        },
      },
      this.handleCreateRepositoryForPrototype.bind(this),
    );

    // GET /github/repositories
    app.get<{ Querystring: GitHubRepositoriesQuery }>(
      "/github/repositories",
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
      this.handleGetRepositories.bind(this),
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
          request.log2.warn("Multiple installations found, using most recent", {
            installationId: targetInstallation.id,
            totalInstallations: installations.length,
          });
        }
      }

      // 5. Encrypt tokens
      const tokenEncrypted = encrypt(tokenResponse.access_token, "github");
      const refreshEncrypted = tokenResponse.refresh_token
        ? encrypt(tokenResponse.refresh_token, "github")
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
          const accessToken = decrypt(tokenData.token_encrypted, "github");
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
        request.log2.error(deleteError, "Failed to delete GitHub integration", {
          teamId,
        });
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
   * GET /github/repositories
   * Get list of repositories accessible to the team's GitHub integration
   */
  private async handleGetRepositories(
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
              message: "Failed to acquire GitHub credentials for this team",
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

  /**
   * POST /github/repo/create
   * Create a GitHub repository for the team that owns the prototype
   */
  private async handleCreateRepositoryForPrototype(
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
            .from("github_repositories")
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
              message: "Failed to acquire GitHub credentials for this team",
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

      // 3. Store repository metadata in github_repositories table
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
        .from("github_repositories")
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
          .from("github_repositories")
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

      request.log2.info("Successfully linked prototype to GitHub repository", {
        prototypeId: prototype_id,
        githubRepoId,
        fullName,
      });

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
          .from("github_repositories")
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
            updateData.default_branch = payload.repository.default_branch;
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
              .from("github_repositories")
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
                (action === "renamed" || action === "transferred") &&
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
                    const { error: prUpdateError } = await supabaseServiceClient
                      .from("prototype_source_repo_pull_requests")
                      .update({ github_pull_request_url: newUrl })
                      .eq("id", pr.id);

                    if (prUpdateError) {
                      request.log2.error(
                        prUpdateError,
                        "Failed to update PR URL after repo rename",
                        {
                          prId: pr.id,
                          oldUrl: pr.github_pull_request_url,
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
            .from("github_repositories")
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
            request.log2.info("Updated source repo PR head SHA from webhook", {
              prId: existingPr.id,
              prNumber,
              newSha: payload.pull_request.head.sha,
            });
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
}
