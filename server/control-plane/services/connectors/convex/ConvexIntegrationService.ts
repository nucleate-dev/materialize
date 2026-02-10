import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "crypto";
import {
    type APIResponse,
    type ConvexConnectStartRequestBody,
    type ConvexConnectStartSuccessResponse,
    type ConvexCreateProjectRequestBody,
    type ConvexCreateProjectSuccessResponse,
    type ConvexIntegrationsQuery,
    type ConvexIntegrationsSuccessResponse,
    type ConvexProjectsQuery,
    type ConvexProjectsSuccessResponse,
    type StandardErrorResponse,
} from "../../../types/PublicAPITypes.js";
import { handleConvexConnectStartImpl } from "./handleConvexConnectStart.js";
import { handleConvexOAuthCallbackImpl } from "./handleConvexOAuthCallback.js";
import { handleGetConvexIntegrationsImpl } from "./handleGetConvexIntegrations.js";
import { handleGetConvexProjectsImpl } from "./handleGetConvexProjects.js";
import { handleCreateConvexProjectImpl } from "./handleCreateConvexProject.js";

export interface ConvexOAuthCallbackQuery {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
}

export interface ConvexOAuthStatePayload {
    teamId: string;
    userId: string;
    createdAt: number;
    nonce: string;
    codeVerifier: string;
}

/**
 * ConvexIntegrationService handles Convex OAuth connections.
 *
 * Routes:
 * - POST /connectors/convex/connect/start
 * - GET /connectors/convex/oauth/callback
 * - GET /connectors/convex/integrations
 * - GET /connectors/convex/projects
 * - POST /connectors/convex/create-project
 */
export class ConvexIntegrationService {
    constructor() {}

    public registerRoutes(app: FastifyInstance): void {
        app.post<{ Body: ConvexConnectStartRequestBody }>(
            "/connectors/convex/connect/start",
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

        app.get<{ Querystring: ConvexOAuthCallbackQuery }>(
            "/connectors/convex/oauth/callback",
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

        app.get<{ Querystring: ConvexIntegrationsQuery }>(
            "/connectors/convex/integrations",
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

        app.get<{ Querystring: ConvexProjectsQuery }>(
            "/connectors/convex/projects",
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

        app.post<{ Body: ConvexCreateProjectRequestBody }>(
            "/connectors/convex/create-project",
            {
                schema: {
                    body: {
                        type: "object",
                        required: ["teamId", "convexTeamId", "name"],
                        properties: {
                            teamId: {
                                type: "string",
                                format: "uuid",
                            },
                            convexTeamId: {
                                type: "string",
                            },
                            name: {
                                type: "string",
                                minLength: 1,
                            },
                            deploymentType: {
                                type: "string",
                                enum: ["dev", "prod"],
                            },
                            deploymentRegion: {
                                type: "string",
                            },
                            deploymentClass: {
                                type: "string",
                            },
                        },
                    },
                },
            },
            this.handleCreateProject.bind(this),
        );
    }

    private async handleConnectStart(
        request: FastifyRequest<{ Body: ConvexConnectStartRequestBody }>,
        reply: FastifyReply,
    ): Promise<
        APIResponse<ConvexConnectStartSuccessResponse, StandardErrorResponse>
    > {
        return handleConvexConnectStartImpl(request, reply);
    }

    private async handleOAuthCallback(
        request: FastifyRequest<{ Querystring: ConvexOAuthCallbackQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        return handleConvexOAuthCallbackImpl(request, reply);
    }

    private async handleGetIntegrations(
        request: FastifyRequest<{ Querystring: ConvexIntegrationsQuery }>,
        reply: FastifyReply,
    ): Promise<
        APIResponse<ConvexIntegrationsSuccessResponse, StandardErrorResponse>
    > {
        return handleGetConvexIntegrationsImpl(request, reply);
    }

    private async handleGetProjects(
        request: FastifyRequest<{ Querystring: ConvexProjectsQuery }>,
        reply: FastifyReply,
    ): Promise<APIResponse<ConvexProjectsSuccessResponse, StandardErrorResponse>> {
        return handleGetConvexProjectsImpl(request, reply);
    }

    private async handleCreateProject(
        request: FastifyRequest<{ Body: ConvexCreateProjectRequestBody }>,
        reply: FastifyReply,
    ): Promise<
        APIResponse<ConvexCreateProjectSuccessResponse, StandardErrorResponse>
    > {
        return handleCreateConvexProjectImpl(request, reply);
    }
}

export const getConvexOAuthConfig = (): ConvexOAuthConfig => {
    const clientId = process.env.CONVEX_OAUTH_CLIENT_ID;
    const clientSecret = process.env.CONVEX_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.CONVEX_OAUTH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error("Convex OAuth configuration is incomplete");
    }

    return {
        clientId,
        clientSecret,
        redirectUri,
        dashboardBaseUrl: "https://dashboard.convex.dev/",
        oauthBaseUrl: "https://api.convex.dev/",
        platformApiBaseUrl: "https://api.convex.dev/v1/",
    };
};

export const buildStateCipherKey = (clientSecret: string): Buffer =>
    crypto.createHash("sha256").update(clientSecret).digest();

interface ConvexOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    dashboardBaseUrl: string;
    oauthBaseUrl: string;
    platformApiBaseUrl: string;
}
