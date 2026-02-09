import { FastifyReply, FastifyRequest } from "fastify";
import {
    buildStateCipherKey,
    ConvexOAuthCallbackQuery,
    ConvexOAuthStatePayload,
    getConvexOAuthConfig,
} from "./ConvexIntegrationService.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../../types/supabase.js";
import { userIsTeamAdminOrOwner } from "../../../utils/teamUtils.js";
import { encrypt } from "../../../utils/encryptionUtils.js";
import crypto from "crypto";

interface ConvexTokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
}

interface ConvexTeamTokenDetails {
    type: "teamToken";
    teamId: number;
    name: string;
    createTime: number;
}

interface ConvexProjectTokenDetails {
    type: "projectToken";
    projectId: number;
    name: string;
    createTime: number;
}

type ConvexTokenDetails = ConvexTeamTokenDetails | ConvexProjectTokenDetails;

const STATE_TTL_MS = 15 * 60 * 1000;

export async function handleConvexOAuthCallbackImpl(
    request: FastifyRequest<{ Querystring: ConvexOAuthCallbackQuery }>,
    reply: FastifyReply,
): Promise<void> {
    const { code, state, error, error_description } = request.query;

    if (error) {
        const payload = state ? parseOAuthState(state) : null;
        return reply.redirect(
            buildClientCallbackUrl({
                teamId: payload?.teamId,
                convexConnected: "0",
                error: error_description || error,
            }),
        );
    }

    if (!code || !state) {
        return reply.redirect(
            buildClientCallbackUrl({
                convexConnected: "0",
                error: "missing_params",
            }),
        );
    }

    const payload = parseOAuthState(state);
    if (!payload) {
        return reply.redirect(
            buildClientCallbackUrl({
                convexConnected: "0",
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
                convexConnected: "0",
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
                    convexConnected: "0",
                    error: tokenResponse.error || "missing_access_token",
                }),
            );
        }

        const accessToken = tokenResponse.access_token;
        const tokenDetails = await fetchTokenDetails(accessToken, request.log2);

        if (
            tokenDetails.type !== "teamToken" ||
            tokenDetails.teamId === undefined ||
            tokenDetails.teamId === null
        ) {
            return reply.redirect(
                buildClientCallbackUrl({
                    teamId,
                    convexConnected: "0",
                    error: "unsupported_token_scope",
                }),
            );
        }

        const convexTeamId = String(tokenDetails.teamId);
        const convexTeamName = extractConvexTeamSlug(accessToken);

        const { data: integration, error: integrationError } =
            await supabaseServiceClient
                .from("connectors_convex_integrations")
                .upsert(
                    {
                        team_id: teamId,
                        convex_team_id: convexTeamId,
                        convex_team_name: convexTeamName,
                        connected_by_user_id: userId,
                        metadata: {
                            token_scope: tokenResponse.scope ?? null,
                            token_type: tokenResponse.token_type ?? null,
                            token_name: tokenDetails.name ?? null,
                            token_details_type: tokenDetails.type,
                        },
                        connected_at: new Date().toISOString(),
                        status: "active",
                    },
                    {
                        onConflict: "team_id,convex_team_id",
                    },
                )
                .select()
                .single();

        if (integrationError || !integration) {
            request.log2.consoleLogDevOnly(
                "error",
                "Failed to persist Convex integration metadata",
                {
                    error: integrationError?.message,
                },
            );
            return reply.redirect(
                buildClientCallbackUrl({
                    teamId,
                    convexConnected: "0",
                    error: "integration_save_failed",
                }),
            );
        }

        const accessTokenEncrypted = encrypt(accessToken, "convex");
        const refreshTokenEncrypted = tokenResponse.refresh_token
            ? encrypt(tokenResponse.refresh_token, "convex")
            : null;
        const expiresAt = tokenResponse.expires_in
            ? new Date(Date.now() + tokenResponse.expires_in * 1000)
                .toISOString()
            : null;

        const { error: tokenError } = await supabaseServiceClient
            .from("connectors_convex_integration_tokens")
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
                "Failed to persist Convex integration tokens",
                {
                    error: tokenError.message,
                },
            );
            return reply.redirect(
                buildClientCallbackUrl({
                    teamId,
                    convexConnected: "0",
                    error: "token_save_failed",
                }),
            );
        }

        return reply.redirect(
            buildClientCallbackUrl({
                teamId,
                convexConnected: "1",
            }),
        );
    } catch (err) {
        request.log2.consoleLogDevOnly(
            "error",
            "Unexpected error handling Convex OAuth callback",
            {
                error: err instanceof Error ? err.message : String(err),
            },
        );
        return reply.redirect(
            buildClientCallbackUrl({
                teamId,
                convexConnected: "0",
                error: "internal_error",
            }),
        );
    }
}

const parseOAuthState = (state: string): ConvexOAuthStatePayload | null => {
    const clientSecret = process.env.CONVEX_OAUTH_CLIENT_SECRET;
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

const decryptStatePayload = (
    state: string,
    clientSecret: string,
): ConvexOAuthStatePayload | null => {
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
        return JSON.parse(decrypted.toString("utf8")) as ConvexOAuthStatePayload;
    } catch {
        return null;
    }
};

const base64UrlDecodeToBuffer = (value: string): Buffer => {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (padded.length % 4)) % 4;
    const paddedValue = padded + "=".repeat(padLength);
    return Buffer.from(paddedValue, "base64");
};

const exchangeCodeForToken = async (
    code: string,
    codeVerifier: string,
    log2: FastifyRequest["log2"],
): Promise<ConvexTokenResponse> => {
    const { clientId, clientSecret, redirectUri, oauthBaseUrl } =
        getConvexOAuthConfig();
    const tokenUrl = new URL("oauth/token", oauthBaseUrl);

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
        code_verifier: codeVerifier,
    });

    const response = await fetch(tokenUrl.toString(), {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: body.toString(),
    });

    const responseText = await response.text();
    if (!response.ok) {
        log2.consoleLogDevOnly("error", "Convex OAuth token exchange failed", {
            status: response.status,
            response: responseText.slice(0, 500),
        });
        throw new Error("token_exchange_failed");
    }

    try {
        return JSON.parse(responseText) as ConvexTokenResponse;
    } catch (error) {
        log2.consoleLogDevOnly(
            "error",
            "Failed to parse Convex OAuth token response",
            {
                error: error instanceof Error ? error.message : String(error),
            },
        );
        throw new Error("invalid_token_response");
    }
};

const fetchTokenDetails = async (
    accessToken: string,
    log2: FastifyRequest["log2"],
): Promise<ConvexTokenDetails> => {
    const { platformApiBaseUrl } = getConvexOAuthConfig();
    const tokenDetailsUrl = new URL("token_details", platformApiBaseUrl);

    const response = await fetch(tokenDetailsUrl.toString(), {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
    });

    const responseText = await response.text();
    if (!response.ok) {
        log2.consoleLogDevOnly("error", "Failed to fetch Convex token details", {
            status: response.status,
            response: responseText.slice(0, 500),
        });
        throw new Error("token_details_fetch_failed");
    }

    try {
        const parsed = JSON.parse(responseText) as Partial<ConvexTokenDetails>;
        if (parsed.type !== "teamToken" && parsed.type !== "projectToken") {
            throw new Error("invalid_token_details_type");
        }
        return parsed as ConvexTokenDetails;
    } catch (error) {
        log2.consoleLogDevOnly(
            "error",
            "Failed to parse Convex token details response",
            {
                error: error instanceof Error ? error.message : String(error),
            },
        );
        throw new Error("invalid_token_details_response");
    }
};

const extractConvexTeamSlug = (accessToken: string): string | null => {
    const match = /^team:([^|]+)\|/.exec(accessToken);
    if (!match?.[1]) {
        return null;
    }
    return match[1];
};

const buildClientCallbackUrl = (
    params: Record<string, string | null | undefined>,
): string => {
    const callbackBaseUrl = getCallbackBaseUrl();
    const callbackUrl = new URL("/connectors/convex", callbackBaseUrl);
    Object.entries(params).forEach(([key, value]) => {
        if (value) {
            callbackUrl.searchParams.set(key, value);
        }
    });
    return callbackUrl.toString();
};

const getCallbackBaseUrl = (): string => {
    if (process.env.NODE_ENV === "development") {
        return "http://localhost:3000";
    }
    return process.env.SITE_BASE_URL || "http://localhost:3000";
};
