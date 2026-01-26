import { FastifyReply, FastifyRequest } from "fastify";
import {
    APIResponse,
    HTTP_STATUS,
    StandardErrorResponse,
    SupabaseConnectStartRequestBody,
    SupabaseConnectStartSuccessResponse,
} from "../../../types/PublicAPITypes.js";
import { validateJWTToken } from "../../../utils/prototypeAuth.js";
import { createClient } from "@supabase/supabase-js";
import { Database } from "../../../types/supabase.js";
import { userIsTeamAdminOrOwner } from "../../../utils/teamUtils.js";
import {
    buildStateCipherKey,
    getSupabaseOAuthConfig,
    SupabaseOAuthStatePayload,
} from "./SupabaseIntegrationService.js";
import crypto from "crypto";

export async function handleSupabaseConnectStartImpl(
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
                error: error instanceof Error ? error.message : String(error),
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

const base64UrlEncodeBuffer = (value: Buffer): string =>
    value
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
