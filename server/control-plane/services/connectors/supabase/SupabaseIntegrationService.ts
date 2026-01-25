import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import type { Database } from "../../../types/supabase.js";
import {
    type APIResponse,
    HTTP_STATUS,
    type StandardErrorResponse,
    type SupabaseConnectStartRequestBody,
    type SupabaseConnectStartSuccessResponse,
    type SupabaseIntegrationsQuery,
    type SupabaseIntegrationSummary,
    type SupabaseIntegrationsSuccessResponse,
} from "../../../types/PublicAPITypes.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import { userIsTeamAdminOrOwner } from "../../../utils/teamUtils.js";
import { encrypt } from "../../../utils/encryptionUtils.js";

interface SupabaseOAuthCallbackQuery {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
}

interface SupabaseOAuthStatePayload {
    teamId: string;
    userId: string;
    createdAt: number;
    nonce: string;
    codeVerifier: string;
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
    }

    private async handleConnectStart(
        request: FastifyRequest<{ Body: SupabaseConnectStartRequestBody }>,
        reply: FastifyReply,
    ): Promise<
        APIResponse<SupabaseConnectStartSuccessResponse, StandardErrorResponse>
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

        const { teamId, organizationSlug } = request.body;

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
            const codeVerifier = createCodeVerifier();
            const codeChallenge = createCodeChallenge(codeVerifier);
            const state = createOAuthState(teamId, user.id, codeVerifier);
            const authorizationUrl = buildAuthorizationUrl({
                state,
                codeChallenge,
                organizationSlug,
            });

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
                payload.codeVerifier,
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
        APIResponse<SupabaseIntegrationsSuccessResponse, StandardErrorResponse>
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
                "id, supabase_organization_id, supabase_organization_name, connected_at, status",
            )
            .eq("team_id", teamId)
            .order("connected_at", { ascending: false });

        if (error) {
            request.log2.consoleLogDevOnly(
                "error",
                "Failed to fetch Supabase integrations",
                { error: error.message },
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

const base64UrlEncodeBuffer = (value: Buffer): string =>
    value
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

const base64UrlDecodeToBuffer = (value: string): Buffer => {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (padded.length % 4)) % 4;
    const paddedValue = padded + "=".repeat(padLength);
    return Buffer.from(paddedValue, "base64");
};

interface SupabaseOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUrl: string;
    managementBaseUrl: string;
}

const getSupabaseOAuthConfig = (): SupabaseOAuthConfig => {
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

const buildAuthorizationUrl = ({
    state,
    codeChallenge,
    organizationSlug,
}: {
    state: string;
    codeChallenge: string;
    organizationSlug?: string;
}): string => {
    const { clientId, redirectUrl, managementBaseUrl } =
        getSupabaseOAuthConfig();
    const authorizeUrl = new URL("oauth/authorize", managementBaseUrl);

    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUrl);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    if (organizationSlug) {
        authorizeUrl.searchParams.set("organization_slug", organizationSlug);
    }

    return authorizeUrl.toString();
};

const buildStateCipherKey = (clientSecret: string): Buffer =>
    crypto.createHash("sha256").update(clientSecret).digest();

const encryptStatePayload = (
    payload: SupabaseOAuthStatePayload,
    clientSecret: string,
): string => {
    const iv = crypto.randomBytes(12);
    const key = buildStateCipherKey(clientSecret);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(payload), "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
        base64UrlEncodeBuffer(iv),
        base64UrlEncodeBuffer(encrypted),
        base64UrlEncodeBuffer(tag),
    ].join(".");
};

const decryptStatePayload = (
    state: string,
    clientSecret: string,
): SupabaseOAuthStatePayload | null => {
    const [ivEncoded, payloadEncoded, tagEncoded] = state.split(".");
    if (!ivEncoded || !payloadEncoded || !tagEncoded) {
        return null;
    }

    try {
        const iv = base64UrlDecodeToBuffer(ivEncoded);
        const encrypted = base64UrlDecodeToBuffer(payloadEncoded);
        const tag = base64UrlDecodeToBuffer(tagEncoded);
        const key = buildStateCipherKey(clientSecret);

        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
        ]);
        return JSON.parse(decrypted.toString("utf8")) as SupabaseOAuthStatePayload;
    } catch {
        return null;
    }
};

const createCodeVerifier = (): string =>
    base64UrlEncodeBuffer(crypto.randomBytes(32));

const createCodeChallenge = (codeVerifier: string): string =>
    base64UrlEncodeBuffer(
        crypto.createHash("sha256").update(codeVerifier).digest(),
    );

const createOAuthState = (
    teamId: string,
    userId: string,
    codeVerifier: string,
): string => {
    const { clientSecret } = getSupabaseOAuthConfig();
    const payload: SupabaseOAuthStatePayload = {
        teamId,
        userId,
        createdAt: Date.now(),
        nonce: crypto.randomBytes(16).toString("hex"),
        codeVerifier,
    };

    return encryptStatePayload(payload, clientSecret);
};

const parseOAuthState = (
    state: string,
): SupabaseOAuthStatePayload | null => {
    const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
    if (!state || !clientSecret) {
        return null;
    }

    const payload = decryptStatePayload(state, clientSecret);
    if (
        !payload?.teamId ||
        !payload?.userId ||
        !payload?.createdAt ||
        !payload?.codeVerifier
    ) {
        return null;
    }

    if (Date.now() - payload.createdAt > STATE_TTL_MS) {
        return null;
    }

    return payload;
};

const exchangeCodeForToken = async (
    code: string,
    codeVerifier: string,
    log2: FastifyRequest["log2"],
): Promise<SupabaseTokenResponse> => {
    const { clientId, clientSecret, redirectUrl, managementBaseUrl } =
        getSupabaseOAuthConfig();
    const tokenUrl = new URL("oauth/token", managementBaseUrl);

    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUrl,
        code_verifier: codeVerifier,
    });

    const authToken = Buffer.from(`${clientId}:${clientSecret}`).toString(
        "base64",
    );

    const response = await fetch(tokenUrl.toString(), {
        method: "POST",
        headers: {
            Authorization: `Basic ${authToken}`,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
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

/**
 * Refresh a Supabase access token using the refresh token.
 * Use decrypt(refreshTokenEncrypted, "supabase") to get the refresh token from DB first.
 * After refresh, encrypt and store the new tokens in the database.
 */
export const refreshAccessToken = async (
    refreshToken: string,
    log2: FastifyRequest["log2"],
): Promise<SupabaseTokenResponse> => {
    const { clientId, clientSecret, managementBaseUrl } =
        getSupabaseOAuthConfig();
    const tokenUrl = new URL("oauth/token", managementBaseUrl);

    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
    });

    const authToken = Buffer.from(`${clientId}:${clientSecret}`).toString(
        "base64",
    );

    const response = await fetch(tokenUrl.toString(), {
        method: "POST",
        headers: {
            Authorization: `Basic ${authToken}`,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: body.toString(),
    });

    const responseText = await response.text();
    if (!response.ok) {
        log2.consoleLogDevOnly(
            "error",
            "Supabase OAuth token refresh failed",
            {
                status: response.status,
                response: responseText.slice(0, 500),
            },
        );
        throw new Error("token_refresh_failed");
    }

    try {
        return JSON.parse(responseText) as SupabaseTokenResponse;
    } catch (error) {
        log2.consoleLogDevOnly(
            "error",
            "Failed to parse Supabase OAuth token refresh response",
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
