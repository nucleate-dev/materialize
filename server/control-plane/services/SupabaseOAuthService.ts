import { randomBytes } from "crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { SystemLogger } from "../loggers/SystemLogger.js";
import {
  type APIResponse,
  HTTP_STATUS,
  type StandardErrorResponse,
  type SupabaseOAuthAuthorizeUrlRequestBody,
  type SupabaseOAuthAuthorizeUrlSuccessResponse,
  type SupabaseOAuthFinalizeRequestBody,
  type SupabaseOAuthFinalizeSuccessResponse,
  type SupabaseOAuthConnectionSuccessResponse,
  type SupabaseOAuthDisconnectRequestBody,
  type SupabaseOAuthDisconnectSuccessResponse,
  type SupabaseOAuthOrganization,
} from "../types/PublicAPITypes.js";
import type { Database } from "../types/supabase.js";
import { validateJWTToken } from "../utils/prototypeAuth.js";

interface SupabaseOAuthConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  oauthAuthorizeUrl: string;
  oauthTokenUrl: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthRedirectUrl: string;
  oauthScopes: string;
  managementApiUrl: string;
}

interface SupabaseTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
}

interface SupabaseOrganizationResponse {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
}

export class SupabaseOAuthService {
  private logger: SystemLogger;
  private config: SupabaseOAuthConfig;
  private serviceClient: SupabaseClient<Database>;

  constructor({
    logger,
    config,
    serviceClient,
  }: {
    logger: SystemLogger;
    config: SupabaseOAuthConfig;
    serviceClient: SupabaseClient<Database>;
  }) {
    this.logger = logger;
    this.config = config;
    this.serviceClient = serviceClient;

    if (
      !this.config.supabaseUrl ||
      !this.config.supabaseAnonKey ||
      !this.config.oauthAuthorizeUrl ||
      !this.config.oauthTokenUrl ||
      !this.config.oauthClientId ||
      !this.config.oauthClientSecret ||
      !this.config.oauthRedirectUrl ||
      !this.config.oauthScopes ||
      !this.config.managementApiUrl
    ) {
      throw new Error(
        "Missing required Supabase OAuth configuration for SupabaseOAuthService",
      );
    }

    this.logger.consoleLogDevOnly(
      "info",
      "SupabaseOAuthService initialized",
    );
  }

  public registerRoutes(app: FastifyInstance): void {
    app.route<{ Body: SupabaseOAuthAuthorizeUrlRequestBody }>({
      method: "POST",
      url: "/supabase-oauth/authorize-url",
      schema: {
        body: {
          type: "object",
          required: ["teamId"],
          properties: {
            teamId: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: this.buildSuccessResponseSchema({
            type: "object",
            required: ["authorizeUrl"],
            properties: {
              authorizeUrl: { type: "string" },
            },
          }),
          400: this.buildErrorResponseSchema(),
          401: this.buildErrorResponseSchema(),
          403: this.buildErrorResponseSchema(),
          500: this.buildErrorResponseSchema(),
        },
      },
      handler: this.handleAuthorizeUrl.bind(this),
    });

    app.route<{ Body: SupabaseOAuthFinalizeRequestBody }>({
      method: "POST",
      url: "/supabase-oauth/finalize",
      schema: {
        body: {
          type: "object",
          required: ["teamId", "code", "state"],
          properties: {
            teamId: { type: "string", format: "uuid" },
            code: { type: "string" },
            state: { type: "string" },
          },
        },
        response: {
          200: this.buildSuccessResponseSchema({
            type: "object",
            required: ["connected"],
            properties: {
              connected: { type: "boolean" },
              organization: this.organizationSchema(),
              expiresAt: { type: "string", nullable: true },
            },
          }),
          400: this.buildErrorResponseSchema(),
          401: this.buildErrorResponseSchema(),
          403: this.buildErrorResponseSchema(),
          404: this.buildErrorResponseSchema(),
          500: this.buildErrorResponseSchema(),
        },
      },
      handler: this.handleFinalize.bind(this),
    });

    app.route<{ Querystring: { teamId: string } }>({
      method: "GET",
      url: "/supabase-oauth/connection",
      schema: {
        querystring: {
          type: "object",
          required: ["teamId"],
          properties: {
            teamId: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: this.buildSuccessResponseSchema({
            type: "object",
            required: ["connected"],
            properties: {
              connected: { type: "boolean" },
              organization: this.organizationSchema(),
              connectedAt: { type: "string", nullable: true },
              connectedByUserId: { type: "string", nullable: true },
              expiresAt: { type: "string", nullable: true },
            },
          }),
          401: this.buildErrorResponseSchema(),
          403: this.buildErrorResponseSchema(),
          500: this.buildErrorResponseSchema(),
        },
      },
      handler: this.handleConnection.bind(this),
    });

    app.route<{ Body: SupabaseOAuthDisconnectRequestBody }>({
      method: "POST",
      url: "/supabase-oauth/disconnect",
      schema: {
        body: {
          type: "object",
          required: ["teamId"],
          properties: {
            teamId: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: this.buildSuccessResponseSchema({
            type: "object",
            required: ["disconnected"],
            properties: {
              disconnected: { type: "boolean" },
            },
          }),
          400: this.buildErrorResponseSchema(),
          401: this.buildErrorResponseSchema(),
          403: this.buildErrorResponseSchema(),
          500: this.buildErrorResponseSchema(),
        },
      },
      handler: this.handleDisconnect.bind(this),
    });
  }

  private buildSuccessResponseSchema(dataSchema: Record<string, unknown>) {
    return {
      type: "object",
      required: ["data", "error"],
      properties: {
        data: dataSchema,
        error: { type: "null" },
      },
    };
  }

  private buildErrorResponseSchema() {
    return {
      type: "object",
      required: ["data", "error"],
      properties: {
        data: { type: "null" },
        error: {
          type: "object",
          required: ["error", "message"],
          properties: {
            error: { type: "string" },
            message: { type: "string" },
          },
        },
      },
    };
  }

  private organizationSchema() {
    return {
      type: "object",
      nullable: true,
      required: [],
      properties: {
        id: { type: "string", nullable: true },
        slug: { type: "string", nullable: true },
        name: { type: "string", nullable: true },
      },
    };
  }

  private createUserClient(token: string): SupabaseClient<Database> {
    return createClient<Database>(this.config.supabaseUrl, this.config.supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  }

  private sendError(
    reply: FastifyReply,
    statusCode: number,
    error: string,
    message: string,
  ): APIResponse<never, StandardErrorResponse> {
    reply.status(statusCode);
    return {
      data: null,
      error: {
        error,
        message,
      },
    };
  }

  private async requireUser(
    request: FastifyRequest,
  ): Promise<{ user: User; token: string } | null> {
    const token = request.headers.authorization?.split(" ")[1] ?? "";
    if (!token || !request.headers.authorization?.startsWith("Bearer")) {
      request.log2.warn("Missing authorization header for Supabase OAuth request");
      return null;
    }

    const { user } = await validateJWTToken(token, request.log2);
    if (!user) {
      return null;
    }

    return { user, token };
  }

  private async ensureTeamEditAccess(
    teamId: string,
    token: string,
    request: FastifyRequest,
  ): Promise<boolean> {
    const supabaseClient = this.createUserClient(token);
    const { data, error } = await supabaseClient.rpc(
      "is_team_member_with_edit_privileges",
      {
        p_team_id: teamId,
      },
    );

    if (error || !data) {
      request.log2.warn("User lacks team edit privileges", {
        teamId,
        error,
      });
      return false;
    }

    return true;
  }

  private async ensureTeamMemberAccess(
    teamId: string,
    token: string,
    request: FastifyRequest,
  ): Promise<boolean> {
    const supabaseClient = this.createUserClient(token);
    const { data, error } = await supabaseClient.rpc("is_team_member", {
      p_team_id: teamId,
    });

    if (error || !data) {
      request.log2.warn("User lacks team membership", {
        teamId,
        error,
      });
      return false;
    }

    return true;
  }

  private async handleAuthorizeUrl(
    request: FastifyRequest<{ Body: SupabaseOAuthAuthorizeUrlRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<SupabaseOAuthAuthorizeUrlSuccessResponse, StandardErrorResponse>
  > {
    const auth = await this.requireUser(request);
    if (!auth) {
      return this.sendError(
        reply,
        HTTP_STATUS.UNAUTHORIZED,
        "Unauthorized",
        "Authentication required",
      );
    }

    const { teamId } = request.body;
    request.log2 = request.log2.child({
      userId: auth.user.id,
      teamId,
    });

    const hasAccess = await this.ensureTeamEditAccess(teamId, auth.token, request);
    if (!hasAccess) {
      return this.sendError(
        reply,
        HTTP_STATUS.FORBIDDEN,
        "Forbidden",
        "You do not have permission to connect Supabase for this team",
      );
    }

    const state = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: deleteError } = await this.serviceClient
      .from("team_supabase_oauth_states")
      .delete()
      .eq("team_id", teamId);

    if (deleteError) {
      request.log2.warn("Failed to clear existing Supabase OAuth states", {
        error: deleteError,
      });
    }

    const { error: insertError } = await this.serviceClient
      .from("team_supabase_oauth_states")
      .insert({
        team_id: teamId,
        created_by_user_id: auth.user.id,
        state,
        expires_at: expiresAt,
        code_verifier: null,
      });

    if (insertError) {
      request.log2.error(insertError, "Failed to persist Supabase OAuth state", {
        teamId,
      });
      return this.sendError(
        reply,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "DATABASE_ERROR",
        "Failed to start Supabase OAuth flow",
      );
    }

    const authorizeUrl = new URL(this.config.oauthAuthorizeUrl);
    authorizeUrl.searchParams.set("client_id", this.config.oauthClientId);
    authorizeUrl.searchParams.set("redirect_uri", this.config.oauthRedirectUrl);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("scope", this.config.oauthScopes);

    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        authorizeUrl: authorizeUrl.toString(),
      },
      error: null,
    };
  }

  private async handleFinalize(
    request: FastifyRequest<{ Body: SupabaseOAuthFinalizeRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<SupabaseOAuthFinalizeSuccessResponse, StandardErrorResponse>
  > {
    const auth = await this.requireUser(request);
    if (!auth) {
      return this.sendError(
        reply,
        HTTP_STATUS.UNAUTHORIZED,
        "Unauthorized",
        "Authentication required",
      );
    }

    const { teamId, code, state } = request.body;
    request.log2 = request.log2.child({
      userId: auth.user.id,
      teamId,
      state,
    });

    const hasAccess = await this.ensureTeamEditAccess(teamId, auth.token, request);
    if (!hasAccess) {
      return this.sendError(
        reply,
        HTTP_STATUS.FORBIDDEN,
        "Forbidden",
        "You do not have permission to complete Supabase OAuth for this team",
      );
    }

    const { data: stateRecord, error: stateError } = await this.serviceClient
      .from("team_supabase_oauth_states")
      .select("id, expires_at, created_by_user_id")
      .eq("team_id", teamId)
      .eq("state", state)
      .maybeSingle();

    if (stateError) {
      request.log2.error(stateError, "Failed to load Supabase OAuth state", {
        teamId,
      });
      return this.sendError(
        reply,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "DATABASE_ERROR",
        "Failed to validate Supabase OAuth state",
      );
    }

    if (!stateRecord) {
      return this.sendError(
        reply,
        HTTP_STATUS.NOT_FOUND,
        "INVALID_STATE",
        "Supabase OAuth state not found",
      );
    }

    if (stateRecord.created_by_user_id !== auth.user.id) {
      return this.sendError(
        reply,
        HTTP_STATUS.FORBIDDEN,
        "Forbidden",
        "Supabase OAuth state does not match the initiating user",
      );
    }

    const stateExpiresAt = new Date(stateRecord.expires_at).getTime();
    if (stateExpiresAt < Date.now()) {
      return this.sendError(
        reply,
        HTTP_STATUS.BAD_REQUEST,
        "STATE_EXPIRED",
        "Supabase OAuth state has expired",
      );
    }

    let tokenResponse: SupabaseTokenResponse;
    try {
      const tokenRequestBody = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: this.config.oauthClientId,
        client_secret: this.config.oauthClientSecret,
        redirect_uri: this.config.oauthRedirectUrl,
      });

      const tokenResult = await fetch(this.config.oauthTokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenRequestBody,
      });

      const tokenJson = (await tokenResult.json()) as SupabaseTokenResponse & {
        error?: string;
        error_description?: string;
      };

      if (!tokenResult.ok || !tokenJson.access_token) {
        request.log2.error("Supabase OAuth token exchange failed", {
          status: tokenResult.status,
          error: tokenJson.error,
          errorDescription: tokenJson.error_description,
        });
        return this.sendError(
          reply,
          HTTP_STATUS.BAD_REQUEST,
          "OAUTH_EXCHANGE_FAILED",
          "Failed to exchange Supabase OAuth code",
        );
      }

      tokenResponse = tokenJson;
    } catch (error) {
      request.log2.error(error, "Supabase OAuth token exchange exception", {
        teamId,
      });
      return this.sendError(
        reply,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "OAUTH_EXCHANGE_FAILED",
        "Failed to exchange Supabase OAuth code",
      );
    }

    const expiresAt = this.resolveExpiresAt(tokenResponse);
    const organization = await this.fetchOrganization(tokenResponse.access_token, request);

    const { error: upsertError } = await this.serviceClient
      .from("team_supabase_connections")
      .upsert(
        {
          team_id: teamId,
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token ?? null,
          expires_at: expiresAt,
          organization_id: organization?.id ?? null,
          organization_slug: organization?.slug ?? null,
          organization_name: organization?.name ?? null,
          connected_by_user_id: auth.user.id,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "team_id",
        },
      );

    if (upsertError) {
      request.log2.error(upsertError, "Failed to upsert Supabase connection", {
        teamId,
      });
      return this.sendError(
        reply,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "DATABASE_ERROR",
        "Failed to save Supabase OAuth connection",
      );
    }

    const { error: deleteError } = await this.serviceClient
      .from("team_supabase_oauth_states")
      .delete()
      .eq("id", stateRecord.id);

    if (deleteError) {
      request.log2.warn("Failed to delete Supabase OAuth state", {
        error: deleteError,
        teamId,
      });
    }

    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        connected: true,
        organization: organization ?? undefined,
        expiresAt: expiresAt ?? undefined,
      },
      error: null,
    };
  }

  private async handleConnection(
    request: FastifyRequest<{ Querystring: { teamId: string } }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<SupabaseOAuthConnectionSuccessResponse, StandardErrorResponse>
  > {
    const auth = await this.requireUser(request);
    if (!auth) {
      return this.sendError(
        reply,
        HTTP_STATUS.UNAUTHORIZED,
        "Unauthorized",
        "Authentication required",
      );
    }

    const { teamId } = request.query;
    request.log2 = request.log2.child({
      userId: auth.user.id,
      teamId,
    });

    const hasAccess = await this.ensureTeamMemberAccess(teamId, auth.token, request);
    if (!hasAccess) {
      return this.sendError(
        reply,
        HTTP_STATUS.FORBIDDEN,
        "Forbidden",
        "You do not have permission to view Supabase connections for this team",
      );
    }

    const { data: connection, error: connectionError } = await this.serviceClient
      .from("team_supabase_connections")
      .select(
        "organization_id, organization_slug, organization_name, connected_by_user_id, created_at, expires_at",
      )
      .eq("team_id", teamId)
      .maybeSingle();

    if (connectionError) {
      request.log2.error(connectionError, "Failed to fetch Supabase connection", {
        teamId,
      });
      return this.sendError(
        reply,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "DATABASE_ERROR",
        "Failed to load Supabase connection",
      );
    }

    if (!connection) {
      reply.status(HTTP_STATUS.OK);
      return {
        data: {
          connected: false,
        },
        error: null,
      };
    }

    const organization: SupabaseOAuthOrganization = {
      id: connection.organization_id,
      slug: connection.organization_slug,
      name: connection.organization_name,
    };

    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        connected: true,
        organization,
        connectedAt: connection.created_at,
        connectedByUserId: connection.connected_by_user_id ?? undefined,
        expiresAt: connection.expires_at ?? undefined,
      },
      error: null,
    };
  }

  private async handleDisconnect(
    request: FastifyRequest<{ Body: SupabaseOAuthDisconnectRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<SupabaseOAuthDisconnectSuccessResponse, StandardErrorResponse>
  > {
    const auth = await this.requireUser(request);
    if (!auth) {
      return this.sendError(
        reply,
        HTTP_STATUS.UNAUTHORIZED,
        "Unauthorized",
        "Authentication required",
      );
    }

    const { teamId } = request.body;
    request.log2 = request.log2.child({
      userId: auth.user.id,
      teamId,
    });

    const hasAccess = await this.ensureTeamEditAccess(teamId, auth.token, request);
    if (!hasAccess) {
      return this.sendError(
        reply,
        HTTP_STATUS.FORBIDDEN,
        "Forbidden",
        "You do not have permission to disconnect Supabase for this team",
      );
    }

    const { error: deleteConnectionError } = await this.serviceClient
      .from("team_supabase_connections")
      .delete()
      .eq("team_id", teamId);

    if (deleteConnectionError) {
      request.log2.error(
        deleteConnectionError,
        "Failed to delete Supabase connection",
        { teamId },
      );
      return this.sendError(
        reply,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "DATABASE_ERROR",
        "Failed to disconnect Supabase",
      );
    }

    const { error: deleteStatesError } = await this.serviceClient
      .from("team_supabase_oauth_states")
      .delete()
      .eq("team_id", teamId);

    if (deleteStatesError) {
      request.log2.warn("Failed to delete Supabase OAuth states", {
        error: deleteStatesError,
        teamId,
      });
    }

    reply.status(HTTP_STATUS.OK);
    return {
      data: {
        disconnected: true,
      },
      error: null,
    };
  }

  private resolveExpiresAt(tokenResponse: SupabaseTokenResponse): string | null {
    if (tokenResponse.expires_at) {
      return new Date(tokenResponse.expires_at * 1000).toISOString();
    }

    if (tokenResponse.expires_in) {
      return new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();
    }

    return null;
  }

  private async fetchOrganization(
    accessToken: string,
    request: FastifyRequest,
  ): Promise<SupabaseOAuthOrganization | null> {
    try {
      const response = await fetch(
        `${this.config.managementApiUrl}/v1/organizations`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        request.log2.warn("Failed to fetch Supabase organizations", {
          status: response.status,
        });
        return null;
      }

      const payload = (await response.json()) as
        | SupabaseOrganizationResponse[]
        | { organizations?: SupabaseOrganizationResponse[] };

      const organizations = Array.isArray(payload)
        ? payload
        : payload.organizations ?? [];

      if (organizations.length === 0) {
        return null;
      }

      const org = organizations[0];
      return {
        id: org.id ?? null,
        slug: org.slug ?? null,
        name: org.name ?? null,
      };
    } catch (error) {
      request.log2.warn("Error fetching Supabase organization metadata", {
        error,
      });
      return null;
    }
  }
}
