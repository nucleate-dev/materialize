import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import {
    type APIResponse,
    type StandardErrorResponse,
    type SupabaseConnectStartRequestBody,
    type SupabaseConnectStartSuccessResponse,
    type SupabaseIntegrationsQuery,
    type SupabaseIntegrationsSuccessResponse,
    type SupabaseProjectsQuery,
    type SupabaseProjectsSuccessResponse,
} from "../../../types/PublicAPITypes.js";
import { handleSupabaseConnectStartImpl } from "./handleSupabaseConnectStart.js";
import { handleSupabaseOAuthCallbackImpl } from "./handleSupabaseOAuthCallback.js";
import { handleGetSupabaseIntegrationsImpl } from "./handleGetSupabaseIntegrations.js";
import { handleGetSupabaseProjectsImpl } from "./handleGetSupabaseProjects.js";

export interface SupabaseOAuthCallbackQuery {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
}

export interface SupabaseOAuthStatePayload {
    teamId: string;
    userId: string;
    createdAt: number;
    nonce: string;
    codeVerifier: string;
}

/**
 * SupabaseIntegrationService handles Supabase OAuth connections
 *
 * Routes:
 * - POST /connectors/supabase/connect/start
 * - GET /connectors/supabase/oauth/callback
 * - GET /connectors/supabase/integrations
 * - GET /connectors/supabase/projects
 */
export class SupabaseIntegrationService {
    constructor() {}

    public registerRoutes(app: FastifyInstance): void {
        app.post<{ Body: SupabaseConnectStartRequestBody }>(
            "/connectors/supabase/connect/start",
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
                            organizationSlug: {
                                type: "string",
                            },
                        },
                    },
                },
            },
            this.handleConnectStart.bind(this),
        );

        app.get<{ Querystring: SupabaseOAuthCallbackQuery }>(
            "/connectors/supabase/oauth/callback",
            {
                schema: {
                    querystring: {
                        type: "object",
                        properties: {
                            code: { type: "string" },
                            state: { type: "string" },
                            error: { type: "string" },
                            error_description: { type: "string" },
                        },
                    },
                },
            },
            this.handleOAuthCallback.bind(this),
        );

        app.get<{ Querystring: SupabaseIntegrationsQuery }>(
            "/connectors/supabase/integrations",
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
            this.handleGetIntegrations.bind(this),
        );

        app.get<{ Querystring: SupabaseProjectsQuery }>(
            "/connectors/supabase/projects",
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
            this.handleGetProjects.bind(this),
        );
    }

    private async handleConnectStart(
        request: FastifyRequest<{ Body: SupabaseConnectStartRequestBody }>,
        reply: FastifyReply,
    ): Promise<
        APIResponse<SupabaseConnectStartSuccessResponse, StandardErrorResponse>
    > {
        return handleSupabaseConnectStartImpl(request, reply);
    }

    private async handleOAuthCallback(
        request: FastifyRequest<{ Querystring: SupabaseOAuthCallbackQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        return handleSupabaseOAuthCallbackImpl(request, reply);
    }

    private async handleGetIntegrations(
        request: FastifyRequest<{ Querystring: SupabaseIntegrationsQuery }>,
        reply: FastifyReply,
    ): Promise<
        APIResponse<SupabaseIntegrationsSuccessResponse, StandardErrorResponse>
    > {
        return handleGetSupabaseIntegrationsImpl(request, reply);
    }

    private async handleGetProjects(
        request: FastifyRequest<{ Querystring: SupabaseProjectsQuery }>,
        reply: FastifyReply,
    ): Promise<
        APIResponse<SupabaseProjectsSuccessResponse, StandardErrorResponse>
    > {
        return handleGetSupabaseProjectsImpl(request, reply);
    }
}

export const getSupabaseOAuthConfig = (): SupabaseOAuthConfig => {
    const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
    const redirectUrl = process.env.SUPABASE_OAUTH_REDIRECT_URL;
    const managementBaseUrl = process.env.SUPABASE_MANAGEMENT_API_BASE_URL;

    if (!clientId || !clientSecret || !redirectUrl || !managementBaseUrl) {
        throw new Error("Supabase OAuth configuration is incomplete");
    }

    const normalizedBaseUrl = managementBaseUrl.endsWith("/")
        ? managementBaseUrl
        : `${managementBaseUrl}/`;

    return {
        clientId,
        clientSecret,
        redirectUrl,
        managementBaseUrl: normalizedBaseUrl,
    };
};

export const buildStateCipherKey = (clientSecret: string): Buffer =>
    crypto.createHash("sha256").update(clientSecret).digest();

interface SupabaseOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUrl: string;
    managementBaseUrl: string;
}
