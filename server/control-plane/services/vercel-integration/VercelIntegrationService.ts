import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/supabase.js";
import {
  type APIResponse,
  type VercelConnectStartErrorResponse,
  type VercelConnectStartRequestBody,
  type VercelConnectStartSuccessResponse,
  type VercelDeployErrorResponse,
  type VercelDeployRequestBody,
  type VercelDeploySuccessResponse,
  type VercelDeploymentsErrorResponse,
  type VercelDeploymentsQuery,
  type VercelDeploymentsSuccessResponse,
  type VercelDisconnectErrorResponse,
  type VercelDisconnectRequestBody,
  type VercelDisconnectSuccessResponse,
  type VercelOAuthCallbackQuery,
  type VercelProjectCreateErrorResponse,
  type VercelProjectCreateRequestBody,
  type VercelProjectCreateSuccessResponse,
  type VercelStatusErrorResponse,
  type VercelStatusQuery,
  type VercelStatusSuccessResponse,
  HTTP_STATUS,
} from "../../types/PublicAPITypes.js";
import {
  checkUserHasPrototypeEditAccess,
  validateJWTToken,
} from "../../utils/prototypeAuth.js";
import { userIsTeamAdminOrOwner } from "../../utils/teamUtils.js";
import { decrypt, encrypt } from "../../utils/encryptionUtils.js";
import {
  createDeployment,
  createProject,
  exchangeCodeForToken,
  getAuthenticatedUser,
  getDeployment,
  listDeployments,
  revokeToken,
  verifyWebhookSignature,
  type VercelDeployment,
} from "../../utils/vercelClient.js";
import { fetchRepositoryById } from "../../utils/githubClient.js";

interface VercelWebhookPayload {
  type?: string;
  payload?: {
    deployment?: {
      id?: string;
      name?: string;
      url?: string;
      state?: string;
    };
    project?: {
      id?: string;
      name?: string;
    };
    user?: {
      id?: string;
    };
    team?: {
      id?: string;
    };
  };
}

/**
 * VercelIntegrationService handles team-level Vercel integration
 *
 * Routes:
 * - POST /vercel/connect/start - Initiate Vercel connection flow
 * - GET /vercel/oauth/callback - Handle Vercel OAuth callback
 * - GET /vercel/status - Get team Vercel connection status
 * - POST /vercel/disconnect - Disconnect Vercel integration
 * - POST /vercel/project/create - Create Vercel project linked to GitHub repo
 * - POST /vercel/deploy - Trigger deployment
 * - GET /vercel/deployments - List deployments for prototype
 * - POST /vercel/webhooks - Handle Vercel webhooks
 */
export class VercelIntegrationService {
  constructor() {}

  /**
   * Register routes with Fastify
   */
  public registerRoutes(app: FastifyInstance): void {
    // POST /vercel/connect/start
    app.post<{ Body: VercelConnectStartRequestBody }>(
      "/vercel/connect/start",
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

    // GET /vercel/oauth/callback
    app.get<{ Querystring: VercelOAuthCallbackQuery }>(
      "/vercel/oauth/callback",
      {
        schema: {
          querystring: {
            type: "object",
            required: ["code", "state"],
            properties: {
              code: { type: "string" },
              state: { type: "string" },
              teamId: { type: "string" },
              configurationId: { type: "string" },
            },
          },
        },
      },
      this.handleOAuthCallback.bind(this),
    );

    // GET /vercel/status
    app.get<{ Querystring: VercelStatusQuery }>(
      "/vercel/status",
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

    // POST /vercel/disconnect
    app.post<{ Body: VercelDisconnectRequestBody }>(
      "/vercel/disconnect",
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

    // POST /vercel/project/create
    app.post<{ Body: VercelProjectCreateRequestBody }>(
      "/vercel/project/create",
      {
        schema: {
          body: {
            type: "object",
            required: ["prototype_id"],
            properties: {
              prototype_id: { type: "string" },
              name: { type: "string" },
              framework: { type: "string" },
            },
          },
        },
      },
      this.handleCreateProject.bind(this),
    );

    // POST /vercel/deploy
    app.post<{ Body: VercelDeployRequestBody }>(
      "/vercel/deploy",
      {
        schema: {
          body: {
            type: "object",
            required: ["prototype_id"],
            properties: {
              prototype_id: { type: "string" },
              git_ref: { type: "string" },
            },
          },
        },
      },
      this.handleDeploy.bind(this),
    );

    // GET /vercel/deployments
    app.get<{ Querystring: VercelDeploymentsQuery }>(
      "/vercel/deployments",
      {
        schema: {
          querystring: {
            type: "object",
            required: ["prototype_id"],
            properties: {
              prototype_id: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
      this.handleGetDeployments.bind(this),
    );

    // POST /vercel/webhooks
    app.post(
      "/vercel/webhooks",
      {
        config: {
          rawBody: true, // We need raw body for signature verification
        },
      },
      this.handleWebhook.bind(this),
    );
  }

  /**
   * POST /vercel/connect/start
   * Initiate Vercel integration connection flow for a team
   */
  private async handleConnectStart(
    request: FastifyRequest<{ Body: VercelConnectStartRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<
      VercelConnectStartSuccessResponse,
      VercelConnectStartErrorResponse
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
            "You do not have permission to manage Vercel integration for this team",
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
        .from("vercel_connect_sessions")
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
          "Failed to create Vercel connect session",
          {
            teamId,
          },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to create Vercel connect session",
          },
        });
      }

      // Generate Vercel integration install URL
      const integrationSlug = process.env.VERCEL_INTEGRATION_SLUG;
      if (!integrationSlug) {
        request.log2.error(
          new Error("VERCEL_INTEGRATION_SLUG not configured"),
          "Missing Vercel integration slug configuration",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Configuration Error",
            message: "Vercel integration not properly configured",
          },
        });
      }

      const installUrl =
        `https://vercel.com/integrations/${integrationSlug}/new?state=${session.id}`;

      request.log2.info("Vercel connect session created", {
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
   * GET /vercel/oauth/callback
   * Handle Vercel OAuth callback after user authorizes the integration
   */
  private async handleOAuthCallback(
    request: FastifyRequest<{ Querystring: VercelOAuthCallbackQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { code, state, teamId: vercelTeamId, configurationId } = request.query;
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
        .from("vercel_connect_sessions")
        .select("*")
        .eq("id", connectSessionId)
        .single();

      if (sessionError || !session) {
        request.log2.error(sessionError, "Connect session not found", {
          connectSessionId,
        });
        return reply.redirect(
          `${siteBaseUrl}/dashboard?vercelConnected=0&error=invalid_session`,
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
          .from("vercel_connect_sessions")
          .update({ status: "expired" })
          .eq("id", connectSessionId);

        return reply.redirect(
          `${siteBaseUrl}/dashboard?teamId=${session.team_id}&vercelConnected=0&error=session_expired`,
        );
      }

      // Check if session is already used
      if (session.status !== "started") {
        request.log2.warn("Connect session already used or invalid", {
          connectSessionId,
          status: session.status,
        });
        return reply.redirect(
          `${siteBaseUrl}/dashboard?teamId=${session.team_id}&vercelConnected=0&error=session_already_used`,
        );
      }

      request.log2 = request.log2.child({ teamId: session.team_id });

      // 2. Build redirect URI for token exchange
      const serverBaseUrl = process.env.SERVER_BASE_URL || "http://localhost:3001";
      const redirectUri = `${serverBaseUrl}/vercel/oauth/callback`;

      // 3. Exchange code for access token
      const tokenResponse = await exchangeCodeForToken(
        code,
        redirectUri,
        request.log2,
      );

      // 4. Get authenticated user
      const vercelUser = await getAuthenticatedUser(
        tokenResponse.access_token,
        request.log2,
      );

      request.log2 = request.log2.child({
        vercelUserId: vercelUser.id,
        vercelUsername: vercelUser.username,
      });

      // 5. Encrypt token
      const tokenEncrypted = encrypt(tokenResponse.access_token);

      // Determine account type based on whether vercelTeamId is present
      const accountType = vercelTeamId ? "team" : "user";
      const accountName = vercelUser.name || vercelUser.username;

      // 6. Upsert vercel_integrations (metadata only, no tokens)
      const { error: integrationError } = await supabaseServiceClient
        .from("vercel_integrations")
        .upsert(
          {
            team_id: session.team_id,
            vercel_user_id: vercelUser.id,
            vercel_team_id: vercelTeamId || null,
            configuration_id: configurationId || tokenResponse.installation_id || "",
            account_name: accountName,
            account_type: accountType,
          },
          {
            onConflict: "team_id",
          },
        );

      if (integrationError) {
        request.log2.error(
          integrationError,
          "Failed to save Vercel integration metadata",
          {
            teamId: session.team_id,
          },
        );

        // Mark session as failed
        await supabaseServiceClient
          .from("vercel_connect_sessions")
          .update({ status: "failed" })
          .eq("id", connectSessionId);

        return reply.redirect(
          `${siteBaseUrl}/dashboard?teamId=${session.team_id}&vercelConnected=0&error=save_failed`,
        );
      }

      // 7. Upsert vercel_integration_tokens (tokens only, service role access)
      const { error: tokensError } = await supabaseServiceClient
        .from("vercel_integration_tokens")
        .upsert(
          {
            team_id: session.team_id,
            token_encrypted: tokenEncrypted,
            token_expires_at: null, // Vercel tokens don't expire by default
          },
          {
            onConflict: "team_id",
          },
        );

      if (tokensError) {
        request.log2.error(
          tokensError,
          "Failed to save Vercel integration tokens",
          {
            teamId: session.team_id,
          },
        );

        // Mark session as failed
        await supabaseServiceClient
          .from("vercel_connect_sessions")
          .update({ status: "failed" })
          .eq("id", connectSessionId);

        // Clean up metadata if tokens failed
        await supabaseServiceClient
          .from("vercel_integrations")
          .delete()
          .eq("team_id", session.team_id);

        return reply.redirect(
          `${siteBaseUrl}/dashboard?teamId=${session.team_id}&vercelConnected=0&error=save_failed`,
        );
      }

      // 8. Mark connect session as connected
      await supabaseServiceClient
        .from("vercel_connect_sessions")
        .update({ status: "connected" })
        .eq("id", connectSessionId);

      request.log2.info("Vercel integration successfully connected", {
        teamId: session.team_id,
        vercelUserId: vercelUser.id,
        accountName,
        accountType,
      });

      // 9. Redirect back to settings
      return reply.redirect(
        `${siteBaseUrl}/dashboard?teamId=${session.team_id}&vercelConnected=1`,
      );
    } catch (error) {
      request.log2.error(error, "Exception in handleOAuthCallback");

      // Try to get team_id from session for redirect
      let teamIdForRedirect = "";
      try {
        const { data: session } = await supabaseServiceClient
          .from("vercel_connect_sessions")
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
        `${siteBaseUrl}/dashboard?vercelConnected=0&error=internal_error${teamIdForRedirect}`,
      );
    }
  }

  /**
   * GET /vercel/status
   * Get Vercel integration status for a team
   */
  private async handleGetStatus(
    request: FastifyRequest<{ Querystring: VercelStatusQuery }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<VercelStatusSuccessResponse, VercelStatusErrorResponse>
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
      const { data: integration, error: integrationError } =
        await supabaseClient
          .from("vercel_integrations")
          .select(
            "account_name, account_type, connected_at, vercel_team_id, configuration_id",
          )
          .eq("team_id", teamId)
          .maybeSingle();

      if (integrationError) {
        request.log2.error(
          integrationError,
          "Failed to fetch Vercel integration status",
          { teamId },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to fetch Vercel integration status",
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
          account_name: integration.account_name,
          account_type: integration.account_type,
          connected_at: integration.connected_at,
          vercel_team_id: integration.vercel_team_id,
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
   * POST /vercel/disconnect
   * Disconnect Vercel integration for a team
   */
  private async handleDisconnect(
    request: FastifyRequest<{ Body: VercelDisconnectRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<
      VercelDisconnectSuccessResponse,
      VercelDisconnectErrorResponse
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
            "You do not have permission to manage Vercel integration for this team",
        },
      });
    }

    // Get service role client
    const supabaseServiceClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
      // Ensure we have metadata for the integration we need to remove
      const {
        data: integrationData,
        error: integrationFetchError,
      } = await supabaseServiceClient
        .from("vercel_integrations")
        .select("configuration_id")
        .eq("team_id", teamId)
        .maybeSingle();

      if (integrationFetchError) {
        request.log2.error(
          integrationFetchError,
          "Failed to fetch Vercel integration metadata for disconnect",
          { teamId },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to disconnect Vercel integration",
          },
        });
      }

      if (!integrationData) {
        request.log2.warn("Vercel integration metadata not found for team", {
          teamId,
        });
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          data: null,
          error: {
            error: "Not Found",
            message: "No Vercel integration found for this team",
          },
        });
      }

      // First, get the encrypted token from the tokens table
      const { data: tokenData } = await supabaseServiceClient
        .from("vercel_integration_tokens")
        .select("token_encrypted")
        .eq("team_id", teamId)
        .maybeSingle();

      // Attempt to revoke the token (best effort)
      if (tokenData?.token_encrypted) {
        try {
          const accessToken = decrypt(tokenData.token_encrypted);
          await revokeToken(accessToken, request.log2);
        } catch (revokeError) {
          // Log but don't fail the disconnect operation
          request.log2.warn(
            "Failed to revoke Vercel token, continuing with disconnect",
            {
              error: revokeError instanceof Error
                ? revokeError.message
                : String(revokeError),
            },
          );
        }
      }

      // Delete the integration (cascade will delete tokens and projects too)
      const { error: deleteError } = await supabaseServiceClient
        .from("vercel_integrations")
        .delete()
        .eq("team_id", teamId);

      if (deleteError) {
        request.log2.error(
          deleteError,
          "Failed to delete Vercel integration",
          { teamId },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to disconnect Vercel integration",
          },
        });
      }

      request.log2.info("Vercel integration disconnected", { teamId });

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          success: true,
          message: "Vercel integration disconnected successfully",
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
   * POST /vercel/project/create
   * Create a Vercel project linked to the prototype's GitHub repository
   */
  private async handleCreateProject(
    request: FastifyRequest<{ Body: VercelProjectCreateRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<
      VercelProjectCreateSuccessResponse,
      VercelProjectCreateErrorResponse
    >
  > {
    const token = request.headers.authorization?.split(" ")[1];
    const { prototype_id, name: rawName, framework } = request.body;

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

    const supabaseServiceClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
      // 1. Check if prototype already has a Vercel project linked
      const { data: existingProject, error: projectCheckError } =
        await supabaseServiceClient
          .from("vercel_projects")
          .select("id, vercel_project_id, vercel_project_name")
          .eq("prototype_id", prototype_id)
          .maybeSingle();

      if (projectCheckError) {
        request.log2.error(
          projectCheckError,
          "Failed to check existing Vercel project",
          { prototypeId: prototype_id },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to check existing Vercel project",
          },
        });
      }

      if (existingProject) {
        request.log2.warn("Prototype already has a Vercel project", {
          prototypeId: prototype_id,
          existingProjectId: existingProject.vercel_project_id,
        });
        return reply.status(HTTP_STATUS.CONFLICT).send({
          data: null,
          error: {
            error: "Project Already Exists",
            message: `This prototype is already linked to Vercel project: ${existingProject.vercel_project_name}`,
          },
        });
      }

      // 2. Check if prototype has a GitHub repository linked
      if (!authResponse.prototype.github_repo_id) {
        request.log2.warn("Prototype does not have a GitHub repository", {
          prototypeId: prototype_id,
        });
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          data: null,
          error: {
            error: "GitHub Repository Required",
            message: "Please create a GitHub repository for this prototype first",
          },
        });
      }

      // 3. Fetch Vercel integration for the team
      const { data: integration, error: integrationError } =
        await supabaseServiceClient
          .from("vercel_integrations")
          .select("vercel_team_id, account_type")
          .eq("team_id", teamId)
          .maybeSingle();

      if (integrationError) {
        request.log2.error(
          integrationError,
          "Failed to fetch Vercel integration for project creation",
          { teamId },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to load Vercel integration for this team",
          },
        });
      }

      if (!integration) {
        request.log2.warn("Vercel integration not found for team", { teamId });
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          data: null,
          error: {
            error: "Integration Missing",
            message: "This team is not connected to Vercel",
          },
        });
      }

      // 4. Get Vercel access token
      const { data: tokenRecord, error: tokenError } =
        await supabaseServiceClient
          .from("vercel_integration_tokens")
          .select("token_encrypted")
          .eq("team_id", teamId)
          .maybeSingle();

      if (tokenError || !tokenRecord?.token_encrypted) {
        request.log2.error(
          tokenError,
          "Failed to fetch Vercel token for project creation",
          { teamId },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to load Vercel credentials",
          },
        });
      }

      let vercelAccessToken: string;
      try {
        vercelAccessToken = decrypt(tokenRecord.token_encrypted);
      } catch (decryptError) {
        request.log2.error(
          decryptError instanceof Error
            ? decryptError
            : new Error(String(decryptError)),
          "Failed to decrypt Vercel token",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Token Error",
            message: "Failed to decrypt Vercel token",
          },
        });
      }

      // 5. Get GitHub repository info
      const { data: githubRepo, error: githubRepoError } =
        await supabaseServiceClient
          .from("github_repositories")
          .select("full_name, owner_login, repo_name, installation_id")
          .eq("github_repo_id", authResponse.prototype.github_repo_id)
          .maybeSingle();

      if (githubRepoError || !githubRepo) {
        request.log2.error(
          githubRepoError,
          "Failed to fetch GitHub repository info",
          { githubRepoId: authResponse.prototype.github_repo_id },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to load GitHub repository info",
          },
        });
      }

      // 6. Create Vercel project
      const projectName = rawName?.trim() ||
        authResponse.prototype.name?.trim() ||
        authResponse.prototype.slug?.trim() ||
        authResponse.prototype.id;

      const vercelProject = await createProject(
        vercelAccessToken,
        {
          name: projectName,
          gitRepository: {
            type: "github",
            repo: githubRepo.full_name,
          },
          framework: framework || "nextjs",
        },
        integration.vercel_team_id,
        request.log2,
      );

      // 7. Get production URL from project
      const productionUrl = vercelProject.targets?.production?.alias?.[0]
        ? `https://${vercelProject.targets.production.alias[0]}`
        : null;

      // 8. Store project in database
      const { error: insertProjectError } = await supabaseServiceClient
        .from("vercel_projects")
        .insert({
          prototype_id,
          team_id: teamId,
          vercel_project_id: vercelProject.id,
          vercel_project_name: vercelProject.name,
          production_url: productionUrl,
        });

      if (insertProjectError) {
        request.log2.error(
          insertProjectError,
          "Failed to insert Vercel project into database",
          { vercelProjectId: vercelProject.id, teamId, prototypeId: prototype_id },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to save Vercel project metadata",
          },
        });
      }

      request.log2.info("Successfully created Vercel project", {
        prototypeId: prototype_id,
        vercelProjectId: vercelProject.id,
        vercelProjectName: vercelProject.name,
      });

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          vercel_project_id: vercelProject.id,
          vercel_project_name: vercelProject.name,
          production_url: productionUrl,
        },
        error: null,
      });
    } catch (error) {
      request.log2.error(error, "Exception in handleCreateProject", {
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
   * POST /vercel/deploy
   * Trigger a deployment to Vercel
   */
  private async handleDeploy(
    request: FastifyRequest<{ Body: VercelDeployRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<VercelDeploySuccessResponse, VercelDeployErrorResponse>
  > {
    const token = request.headers.authorization?.split(" ")[1];
    const { prototype_id, git_ref } = request.body;

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

    const supabaseServiceClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
      // 1. Get Vercel project for this prototype
      const { data: vercelProject, error: projectError } =
        await supabaseServiceClient
          .from("vercel_projects")
          .select("id, vercel_project_id, vercel_project_name")
          .eq("prototype_id", prototype_id)
          .maybeSingle();

      if (projectError) {
        request.log2.error(projectError, "Failed to fetch Vercel project", {
          prototypeId: prototype_id,
        });
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to load Vercel project",
          },
        });
      }

      if (!vercelProject) {
        request.log2.warn("Vercel project not found for prototype", {
          prototypeId: prototype_id,
        });
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          data: null,
          error: {
            error: "Project Not Found",
            message: "Please create a Vercel project for this prototype first",
          },
        });
      }

      // 2. Get Vercel integration for the team
      const { data: integration, error: integrationError } =
        await supabaseServiceClient
          .from("vercel_integrations")
          .select("vercel_team_id")
          .eq("team_id", teamId)
          .maybeSingle();

      if (integrationError || !integration) {
        request.log2.error(
          integrationError,
          "Failed to fetch Vercel integration for deployment",
          { teamId },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to load Vercel integration",
          },
        });
      }

      // 3. Get Vercel access token
      const { data: tokenRecord, error: tokenError } =
        await supabaseServiceClient
          .from("vercel_integration_tokens")
          .select("token_encrypted")
          .eq("team_id", teamId)
          .maybeSingle();

      if (tokenError || !tokenRecord?.token_encrypted) {
        request.log2.error(
          tokenError,
          "Failed to fetch Vercel token for deployment",
          { teamId },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to load Vercel credentials",
          },
        });
      }

      let vercelAccessToken: string;
      try {
        vercelAccessToken = decrypt(tokenRecord.token_encrypted);
      } catch (decryptError) {
        request.log2.error(
          decryptError instanceof Error
            ? decryptError
            : new Error(String(decryptError)),
          "Failed to decrypt Vercel token",
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Token Error",
            message: "Failed to decrypt Vercel token",
          },
        });
      }

      // 4. Get GitHub repository info
      if (!authResponse.prototype.github_repo_id) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          data: null,
          error: {
            error: "GitHub Repository Required",
            message: "This prototype is not linked to a GitHub repository",
          },
        });
      }

      const { data: githubRepo, error: githubRepoError } =
        await supabaseServiceClient
          .from("github_repositories")
          .select("full_name, owner_login, repo_name, default_branch")
          .eq("github_repo_id", authResponse.prototype.github_repo_id)
          .maybeSingle();

      if (githubRepoError || !githubRepo) {
        request.log2.error(
          githubRepoError,
          "Failed to fetch GitHub repository info for deployment",
          { githubRepoId: authResponse.prototype.github_repo_id },
        );
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to load GitHub repository info",
          },
        });
      }

      // 5. Create deployment
      const deploymentRef = git_ref || githubRepo.default_branch || "main";

      const deployment = await createDeployment(
        vercelAccessToken,
        {
          name: vercelProject.vercel_project_name,
          project: vercelProject.vercel_project_id,
          target: "production",
          gitSource: {
            type: "github",
            org: githubRepo.owner_login,
            repo: githubRepo.repo_name,
            ref: deploymentRef,
          },
        },
        integration.vercel_team_id,
        request.log2,
      );

      // 6. Store deployment record
      const { error: insertDeploymentError } = await supabaseServiceClient
        .from("vercel_deployments")
        .insert({
          vercel_project_id: vercelProject.id,
          prototype_id,
          team_id: teamId,
          vercel_deployment_id: deployment.id,
          vercel_deployment_url: deployment.url ? `https://${deployment.url}` : null,
          status: mapVercelState(deployment.state || deployment.readyState || "QUEUED"),
          git_ref: deploymentRef,
        });

      if (insertDeploymentError) {
        request.log2.error(
          insertDeploymentError,
          "Failed to insert deployment record",
          { vercelDeploymentId: deployment.id },
        );
        // Don't fail the request - deployment was created successfully
      }

      request.log2.info("Successfully triggered Vercel deployment", {
        prototypeId: prototype_id,
        vercelDeploymentId: deployment.id,
        gitRef: deploymentRef,
      });

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          deployment_id: deployment.id,
          deployment_url: deployment.url ? `https://${deployment.url}` : null,
          status: mapVercelState(deployment.state || deployment.readyState || "QUEUED"),
        },
        error: null,
      });
    } catch (error) {
      request.log2.error(error, "Exception in handleDeploy", {
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
   * GET /vercel/deployments
   * List deployments for a prototype
   */
  private async handleGetDeployments(
    request: FastifyRequest<{ Querystring: VercelDeploymentsQuery }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<VercelDeploymentsSuccessResponse, VercelDeploymentsErrorResponse>
  > {
    const token = request.headers.authorization?.split(" ")[1];
    const { prototype_id, limit = 10 } = request.query;

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
          message: "You do not have permission to view this prototype",
        },
      });
    }

    const supabaseServiceClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
      // Get deployments from database
      const { data: deployments, error: deploymentsError } =
        await supabaseServiceClient
          .from("vercel_deployments")
          .select("vercel_deployment_id, vercel_deployment_url, status, git_ref, created_at, error_message")
          .eq("prototype_id", prototype_id)
          .order("created_at", { ascending: false })
          .limit(limit);

      if (deploymentsError) {
        request.log2.error(deploymentsError, "Failed to fetch deployments", {
          prototypeId: prototype_id,
        });
        return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          data: null,
          error: {
            error: "Database Error",
            message: "Failed to load deployments",
          },
        });
      }

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          deployments: deployments.map((d) => ({
            id: d.vercel_deployment_id,
            url: d.vercel_deployment_url,
            status: d.status as "queued" | "building" | "ready" | "error" | "canceled",
            git_ref: d.git_ref,
            created_at: d.created_at,
            error_message: d.error_message,
          })),
        },
        error: null,
      });
    } catch (error) {
      request.log2.error(error, "Exception in handleGetDeployments", {
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
   * POST /vercel/webhooks
   * Handle Vercel webhooks for deployment status updates
   */
  private async handleWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const signature = request.headers["x-vercel-signature"] as string;
    const webhookSecret = process.env.VERCEL_WEBHOOK_SECRET;

    if (!webhookSecret) {
      request.log2.error(
        new Error("VERCEL_WEBHOOK_SECRET not configured"),
        "Webhook secret not configured",
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: "Configuration Error",
        message: "Webhook secret not configured",
      });
    }

    // Verify webhook signature
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

    const rawBodyStr = typeof request.rawBody === "string"
      ? request.rawBody
      : request.rawBody.toString("utf8");

    if (!signature || !verifyWebhookSignature(rawBodyStr, signature, webhookSecret)) {
      request.log2.warn("Invalid webhook signature");
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        error: "Unauthorized",
        message: "Invalid webhook signature",
      });
    }

    const payload = request.body as VercelWebhookPayload;

    request.log2.consoleLogDevOnly("info", "Vercel webhook received", {
      type: payload.type,
    });

    // Get service role client
    const supabaseServiceClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    try {
      // Handle deployment status updates
      if (payload.type === "deployment.created" || payload.type === "deployment.ready" ||
          payload.type === "deployment.error" || payload.type === "deployment.canceled") {
        const deploymentId = payload.payload?.deployment?.id;
        const deploymentState = payload.payload?.deployment?.state;

        if (!deploymentId) {
          request.log2.warn("Deployment webhook missing deployment id");
          return reply.status(HTTP_STATUS.OK).send({ received: true });
        }

        // Map Vercel state to our status
        const status = mapVercelState(deploymentState || "");

        // Update deployment status in our database
        const { error: updateError } = await supabaseServiceClient
          .from("vercel_deployments")
          .update({
            status,
            vercel_deployment_url: payload.payload?.deployment?.url
              ? `https://${payload.payload.deployment.url}`
              : undefined,
          })
          .eq("vercel_deployment_id", deploymentId);

        if (updateError) {
          request.log2.error(updateError, "Failed to update deployment status", {
            deploymentId,
            status,
          });
        } else {
          request.log2.info("Updated deployment status", {
            deploymentId,
            status,
          });
        }
      }

      // Acknowledge webhook
      return reply.status(HTTP_STATUS.OK).send({ received: true });
    } catch (error) {
      request.log2.error(error, "Exception in handleWebhook", {
        type: payload.type,
      });
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: "Internal Server Error",
        message: "Failed to process webhook",
      });
    }
  }
}

/**
 * Map Vercel deployment state to our status
 */
function mapVercelState(state: string): "queued" | "building" | "ready" | "error" | "canceled" {
  const stateMap: Record<string, "queued" | "building" | "ready" | "error" | "canceled"> = {
    QUEUED: "queued",
    BUILDING: "building",
    INITIALIZING: "building",
    READY: "ready",
    ERROR: "error",
    CANCELED: "canceled",
  };
  return stateMap[state.toUpperCase()] || "queued";
}
