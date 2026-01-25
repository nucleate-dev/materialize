import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import type { Database } from "../../../types/supabase.js";
import {
    type APIResponse,
    HTTP_STATUS,
} from "../../../types/PublicAPITypes.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import { userIsTeamAdminOrOwner } from "../../../utils/teamUtils.js";
import { encrypt } from "../../../utils/encryptionUtils.js";

interface SupabaseConnectStartRequestBody {
    teamId: string;
}

interface SupabaseConnectStartSuccessResponse {
    authorizationUrl: string;
}

interface SupabaseConnectStartErrorResponse {
    error: string;
    message: string;
}

interface SupabaseOAuthCallbackQuery {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
}

interface SupabaseIntegrationsQuery {
    teamId: string;
}

interface SupabaseIntegrationSummary {
    id: string;
    supabase_organization_id: string;
    supabase_organization_name: string | null;
    connected_at: string;
}

interface SupabaseIntegrationsSuccessResponse {
    integrations: SupabaseIntegrationSummary[];
}

interface SupabaseIntegrationsErrorResponse {
    error: string;
    message: string;
}

interface SupabaseOAuthStatePayload {
    teamId: string;
    userId: string;
    createdAt: number;
    nonce: string;
}

interface SupabaseTokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    organization_id?: string;
    organization_name?: string;
    org_id?: string;
    organization?: {
        id?: string;
        name?: string;
    };
    error?: string;
    error_description?: string;
}

interface SupabaseOrganizationSummary {
    id: string;
    name?: string | null;
}

const STATE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_SCOPE = "organizations.read projects.read";

/**
 * SupabaseIntegrationService handles Supabase OAuth connections
 *
 * Routes:
 * - POST /connectors/supabase/connect/start
 * - GET /connectors/supabase/oauth/callback
 * - GET /connectors/supabase/integrations
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
    }

    private async handleConnectStart(
        request: FastifyRequest<{ Body: SupabaseConnectStartRequestBody }>,
        reply: FastifyReply,
    ): Promise<
        APIResponse<
            SupabaseConnectStartSuccessResponse,
            SupabaseConnectStartErrorResponse
        >
    > {
        const token = request.headers.authorization?.split(" ")[1] ?? "";
        const { user } = await validateJWTToken(token, request.log2);
        if (!user) {
            return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
                data: null,
                error: {
                    error: "Unauthorized",
                    message: "Invalid token",
                },
            });
        }

        const { teamId } = request.body;

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

        const hasTeamAccess = await userIsTeamAdminOrOwner(
            teamId,
            user.id,
            supabaseClient,
            request.log2,
        );
        if (!hasTeamAccess) {
            return reply.status(HTTP_STATUS.FORBIDDEN).send({
                data: null,
                error: {
                    error: "Forbidden",
                    message:
                        "You do not have permission to manage Supabase connectors for this team",
                },
            });
        }

        try {
            const state = createOAuthState(teamId, user.id);
            const authorizationUrl = buildAuthorizationUrl(state);

            return reply.status(HTTP_STATUS.OK).send({
                data: {
                    authorizationUrl,
                },
                error: null,
            });
        } catch (error) {
            request.log2.consoleLogDevOnly(
                "error",
                "Failed to start Supabase OAuth connection",
                {
                    error: error instanceof Error
                        ? error.message
                        : String(error),
                },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "Internal Server Error",
                    message: "Failed to initiate Supabase OAuth flow",
                },
            });
        }
    }

    private async handleOAuthCallback(
        request: FastifyRequest<{ Querystring: SupabaseOAuthCallbackQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { code, state, error, error_description } = request.query;

        if (error) {
            const payload = state ? parseOAuthState(state) : null;
            return reply.redirect(
                buildClientCallbackUrl({
                    teamId: payload?.teamId,
                    supabaseConnected: "0",
                    error: error_description || error,
                }),
            );
        }

        if (!code || !state) {
            return reply.redirect(
                buildClientCallbackUrl({
                    supabaseConnected: "0",
                    error: "missing_params",
                }),
            );
        }

        const payload = parseOAuthState(state);
        if (!payload) {
            return reply.redirect(
                buildClientCallbackUrl({
                    supabaseConnected: "0",
                    error: "invalid_state",
                }),
            );
        }

        const { teamId, userId } = payload;
        request.log2 = request.log2.child({ teamId, userId });

        const supabaseServiceClient = createClient<Database>(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        const isOwnerOrAdmin = await userIsTeamAdminOrOwner(
            teamId,
            userId,
            supabaseServiceClient,
            request.log2,
        );
        if (!isOwnerOrAdmin) {
            return reply.redirect(
                buildClientCallbackUrl({
                    teamId,
                    supabaseConnected: "0",
                    error: "forbidden",
                }),
            );
        }

        try {
            const tokenResponse = await exchangeCodeForToken(
                code,
                request.log2,
            );
            if (!tokenResponse.access_token) {
                return reply.redirect(
                    buildClientCallbackUrl({
                        teamId,
                        supabaseConnected: "0",
                        error: tokenResponse.error || "missing_access_token",
                    }),
                );
            }

            const accessToken = tokenResponse.access_token;
            let { id: organizationId, name: organizationName } =
                extractOrganizationDetails(tokenResponse);

            if (!organizationId) {
                const organizations = await fetchOrganizations(
                    accessToken,
                    request.log2,
                );
                if (organizations.length === 1) {
                    organizationId = organizations[0].id;
                    organizationName = organizations[0].name ?? null;
                } else {
                    return reply.redirect(
                        buildClientCallbackUrl({
                            teamId,
                            supabaseConnected: "0",
                            error: "missing_org",
                        }),
                    );
                }
            }

            if (!organizationId) {
                return reply.redirect(
                    buildClientCallbackUrl({
                        teamId,
                        supabaseConnected: "0",
                        error: "missing_org",
                    }),
                );
            }

            if (organizationId && !organizationName) {
                const organization = await fetchOrganizationById(
                    accessToken,
                    organizationId,
                    request.log2,
                );
                organizationName = organization?.name ?? null;
            }

            const { data: integration, error: integrationError } =
                await supabaseServiceClient
                    .from("connectors_supabase_integrations")
                    .upsert(
                        {
                            team_id: teamId,
                            supabase_organization_id: organizationId,
                            supabase_organization_name: organizationName,
                            connected_by_user_id: userId,
                            metadata: {
                                scope: tokenResponse.scope ?? null,
                                token_type: tokenResponse.token_type ?? null,
                            },
                            connected_at: new Date().toISOString(),
                        },
                        {
                            onConflict: "team_id,supabase_organization_id",
                        },
                    )
                    .select()
                    .single();

            if (integrationError || !integration) {
                request.log2.consoleLogDevOnly(
                    "error",
                    "Failed to persist Supabase integration metadata",
                    {
                        error: integrationError?.message,
                    },
                );
                return reply.redirect(
                    buildClientCallbackUrl({
                        teamId,
                        supabaseConnected: "0",
                        error: "integration_save_failed",
                    }),
                );
            }

            const accessTokenEncrypted = encrypt(accessToken, "supabase");
            const refreshTokenEncrypted = tokenResponse.refresh_token
                ? encrypt(tokenResponse.refresh_token, "supabase")
                : null;
            const expiresAt = tokenResponse.expires_in
                ? new Date(Date.now() + tokenResponse.expires_in * 1000)
                    .toISOString()
                : null;

            const { error: tokenError } = await supabaseServiceClient
                .from("connectors_supabase_integration_tokens")
                .upsert(
                    {
                        integration_id: integration.id,
                        access_token_encrypted: accessTokenEncrypted,
                        refresh_token_encrypted: refreshTokenEncrypted,
                        token_type: tokenResponse.token_type ?? null,
                        token_scopes: tokenResponse.scope ?? null,
                        token_expires_at: expiresAt,
                    },
                    {
                        onConflict: "integration_id",
                    },
                );

            if (tokenError) {
                request.log2.consoleLogDevOnly(
                    "error",
                    "Failed to persist Supabase integration tokens",
                    {
                        error: tokenError.message,
                    },
                );
                return reply.redirect(
                    buildClientCallbackUrl({
                        teamId,
                        supabaseConnected: "0",
                        error: "token_save_failed",
                    }),
                );
            }

            return reply.redirect(
                buildClientCallbackUrl({
                    teamId,
                    supabaseConnected: "1",
                }),
            );
        } catch (err) {
            request.log2.consoleLogDevOnly(
                "error",
                "Unexpected error handling Supabase OAuth callback",
                {
                    error: err instanceof Error ? err.message : String(err),
                },
            );
            return reply.redirect(
                buildClientCallbackUrl({
                    teamId,
                    supabaseConnected: "0",
                    error: "internal_error",
                }),
            );
        }
    }

    private async handleGetIntegrations(
        request: FastifyRequest<{ Querystring: SupabaseIntegrationsQuery }>,
        reply: FastifyReply,
    ): Promise<
        APIResponse<
            SupabaseIntegrationsSuccessResponse,
            SupabaseIntegrationsErrorResponse
        >
    > {
        const token = request.headers.authorization?.split(" ")[1] ?? "";
        const { user } = await validateJWTToken(token, request.log2);
        if (!user) {
            return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
                data: null,
                error: {
                    error: "Unauthorized",
                    message: "Invalid token",
                },
            });
        }

        const { teamId } = request.query;

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

        const { data, error } = await supabaseClient
            .from("connectors_supabase_integrations")
            .select(
                "id, supabase_organization_id, supabase_organization_name, connected_at",
            )
            .eq("team_id", teamId)
            .order("connected_at", { ascending: false });

        if (error) {
            request.log2.consoleLogDevOnly(
                "error",
                "Failed to fetch Supabase integrations",
                {
                    error: error.message,
                },
            );
            return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
                data: null,
                error: {
                    error: "Database Error",
                    message: "Failed to fetch Supabase integrations",
                },
            });
        }

        return reply.status(HTTP_STATUS.OK).send({
            data: {
                integrations: (data || []) as SupabaseIntegrationSummary[],
            },
            error: null,
        });
    }
}

const base64UrlEncode = (value: string): string =>
    Buffer.from(value)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

const base64UrlDecode = (value: string): string => {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (padded.length % 4)) % 4;
    const paddedValue = padded + "=".repeat(padLength);
    return Buffer.from(paddedValue, "base64").toString("utf8");
};

const getSupabaseOAuthConfig = () => {
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

const buildAuthorizationUrl = (state: string): string => {
    const { clientId, redirectUrl, managementBaseUrl } =
        getSupabaseOAuthConfig();
    const authorizeUrl = new URL("oauth/authorize", managementBaseUrl);

    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUrl);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("scope", DEFAULT_SCOPE);
    authorizeUrl.searchParams.set("access_type", "offline");

    return authorizeUrl.toString();
};

const createOAuthState = (teamId: string, userId: string): string => {
    const { clientSecret } = getSupabaseOAuthConfig();
    const payload: SupabaseOAuthStatePayload = {
        teamId,
        userId,
        createdAt: Date.now(),
        nonce: crypto.randomBytes(16).toString("hex"),
    };

    const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
    const signature = crypto
        .createHmac("sha256", clientSecret)
        .update(payloadBase64)
        .digest("base64url");

    return `${payloadBase64}.${signature}`;
};

const parseOAuthState = (
    state: string,
): SupabaseOAuthStatePayload | null => {
    if (!state || !process.env.SUPABASE_OAUTH_CLIENT_SECRET) {
        return null;
    }

    const [payloadBase64, signature] = state.split(".");
    if (!payloadBase64 || !signature) {
        return null;
    }

    const expectedSignature = crypto
        .createHmac("sha256", process.env.SUPABASE_OAUTH_CLIENT_SECRET)
        .update(payloadBase64)
        .digest("base64url");

    if (signature.length !== expectedSignature.length) {
        return null;
    }

    const isValidSignature = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
    );

    if (!isValidSignature) {
        return null;
    }

    let payload: SupabaseOAuthStatePayload;
    try {
        payload = JSON.parse(
            base64UrlDecode(payloadBase64),
        ) as SupabaseOAuthStatePayload;
    } catch {
        return null;
    }

    if (!payload?.teamId || !payload?.userId || !payload?.createdAt) {
        return null;
    }

    if (Date.now() - payload.createdAt > STATE_TTL_MS) {
        return null;
    }

    return payload;
};

const exchangeCodeForToken = async (
    code: string,
    log2: FastifyRequest["log2"],
): Promise<SupabaseTokenResponse> => {
    const { clientId, clientSecret, redirectUrl, managementBaseUrl } =
        getSupabaseOAuthConfig();
    const tokenUrl = new URL("oauth/token", managementBaseUrl);

    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUrl,
        client_id: clientId,
        client_secret: clientSecret,
    });

    const response = await fetch(tokenUrl.toString(), {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    });

    const responseText = await response.text();
    if (!response.ok) {
        log2.consoleLogDevOnly(
            "error",
            "Supabase OAuth token exchange failed",
            {
                status: response.status,
                response: responseText.slice(0, 500),
            },
        );
        throw new Error("token_exchange_failed");
    }

    try {
        return JSON.parse(responseText) as SupabaseTokenResponse;
    } catch (error) {
        log2.consoleLogDevOnly(
            "error",
            "Failed to parse Supabase OAuth token response",
            {
                error: error instanceof Error ? error.message : String(error),
            },
        );
        throw new Error("invalid_token_response");
    }
};

const extractOrganizationDetails = (
    tokenResponse: SupabaseTokenResponse,
): { id: string | null; name: string | null } => {
    const orgId = tokenResponse.organization_id ??
        tokenResponse.org_id ??
        tokenResponse.organization?.id ??
        null;
    const orgName = tokenResponse.organization_name ??
        tokenResponse.organization?.name ?? null;

    return { id: orgId, name: orgName };
};

const normalizeOrganizationsResponse = (
    data: unknown,
): SupabaseOrganizationSummary[] => {
    if (Array.isArray(data)) {
        return data as SupabaseOrganizationSummary[];
    }

    if (data && typeof data === "object") {
        const record = data as {
            organizations?: SupabaseOrganizationSummary[];
            data?: SupabaseOrganizationSummary[] | {
                organizations?: SupabaseOrganizationSummary[];
            };
        };

        if (Array.isArray(record.organizations)) {
            return record.organizations;
        }

        if (Array.isArray(record.data)) {
            return record.data;
        }

        if (record.data && typeof record.data === "object") {
            const nested = record.data as {
                organizations?: SupabaseOrganizationSummary[];
            };
            if (Array.isArray(nested.organizations)) {
                return nested.organizations;
            }
        }
    }

    return [];
};

const fetchOrganizations = async (
    accessToken: string,
    log2: FastifyRequest["log2"],
): Promise<SupabaseOrganizationSummary[]> => {
    const { managementBaseUrl } = getSupabaseOAuthConfig();
    const organizationsUrl = new URL("organizations", managementBaseUrl);

    const response = await fetch(organizationsUrl.toString(), {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        log2.consoleLogDevOnly(
            "error",
            "Failed to fetch Supabase organizations",
            {
                status: response.status,
            },
        );
        return [];
    }

    const data = (await response.json()) as unknown;
    return normalizeOrganizationsResponse(data);
};

const fetchOrganizationById = async (
    accessToken: string,
    organizationId: string,
    log2: FastifyRequest["log2"],
): Promise<SupabaseOrganizationSummary | null> => {
    const { managementBaseUrl } = getSupabaseOAuthConfig();
    const organizationUrl = new URL(
        `organizations/${organizationId}`,
        managementBaseUrl,
    );

    const response = await fetch(organizationUrl.toString(), {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        log2.consoleLogDevOnly(
            "error",
            "Failed to fetch Supabase organization detail",
            {
                status: response.status,
            },
        );
        return null;
    }

    const data = (await response.json()) as unknown;
    const normalized = normalizeOrganizationsResponse(data);
    if (normalized.length > 0) {
        return normalized[0];
    }

    if (data && typeof data === "object") {
        const record = data as {
            id?: string;
            name?: string;
            data?: { id?: string; name?: string };
        };
        if (record.id) {
            return { id: record.id, name: record.name };
        }
        if (record.data?.id) {
            return { id: record.data.id, name: record.data.name };
        }
    }

    return null;
};

const getCallbackBaseUrl = (): string => {
    if (process.env.NODE_ENV === "development") {
        return "http://localhost:3000";
    }
    return process.env.SITE_BASE_URL || "http://localhost:3000";
};

const buildClientCallbackUrl = (
    params: Record<string, string | null | undefined>,
): string => {
    const callbackBaseUrl = getCallbackBaseUrl();
    const callbackUrl = new URL("/connectors/supabase", callbackBaseUrl);
    Object.entries(params).forEach(([key, value]) => {
        if (value) {
            callbackUrl.searchParams.set(key, value);
        }
    });
    return callbackUrl.toString();
};
