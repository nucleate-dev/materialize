import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "../../../utils/encryptionUtils.js";
import type { Database } from "../../../types/supabase.js";
import type { SystemLogger } from "../../../loggers/SystemLogger.js";

export interface ValidConvexTokenResult {
    accessToken: string;
    integrationId: string;
}

interface GetValidConvexTokenOptions {
    logger: SystemLogger;
    integrationId?: string;
    teamId?: string;
    convexTeamId?: string;
}

interface ExecuteWithRevocationDetectionOptions<T> {
    logger: SystemLogger;
    integrationId: string;
    operation: (accessToken: string) => Promise<T>;
}

interface FetchConvexApiOptions {
    accessToken: string;
    path: string;
    method?: "GET" | "POST";
    body?: unknown;
}

export class ConvexApiError extends Error {
    public readonly statusCode: number;
    public readonly responseBody: string;

    constructor(message: string, statusCode: number, responseBody: string) {
        super(message);
        this.name = "ConvexApiError";
        this.statusCode = statusCode;
        this.responseBody = responseBody;
    }
}

export class ConvexAccessRevokedError extends Error {
    public readonly integrationId: string;

    constructor(integrationId: string) {
        super(
            "Convex OAuth access has been revoked. Please reconnect your Convex team.",
        );
        this.name = "ConvexAccessRevokedError";
        this.integrationId = integrationId;
    }
}

export async function executeWithRevocationDetection<T>(
    options: ExecuteWithRevocationDetectionOptions<T>,
): Promise<T> {
    const { logger, integrationId, operation } = options;
    const supabaseServiceClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { accessToken } = await getValidConvexAccessToken({
        logger,
        integrationId,
    });

    try {
        return await operation(accessToken);
    } catch (error) {
        if (!isAuthError(error)) {
            throw error;
        }

        logger.consoleLogDevOnly(
            "error",
            "Convex API returned an auth error; marking integration as disconnected",
            { integrationId },
        );

        await markIntegrationAsDisconnected(
            supabaseServiceClient,
            integrationId,
            logger,
        );
        throw new ConvexAccessRevokedError(integrationId);
    }
}

export async function getValidConvexAccessToken(
    options: GetValidConvexTokenOptions,
): Promise<ValidConvexTokenResult> {
    const supabaseServiceClient = createClient<Database>(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { logger } = options;
    const integrationId = await resolveIntegrationId(options, supabaseServiceClient);

    const { data, error } = await supabaseServiceClient
        .from("connectors_convex_integration_tokens")
        .select("access_token_encrypted")
        .eq("integration_id", integrationId)
        .maybeSingle();

    if (error) {
        logger.error(error, "Failed to fetch Convex integration token record", {
            integrationId,
        });
        throw new Error("Failed to fetch Convex integration tokens");
    }

    if (!data?.access_token_encrypted) {
        throw new Error("Convex integration token missing");
    }

    return {
        accessToken: safeDecrypt(data.access_token_encrypted, integrationId, logger),
        integrationId,
    };
}

async function resolveIntegrationId(
    options: GetValidConvexTokenOptions,
    supabaseServiceClient: SupabaseClient<Database>,
): Promise<string> {
    if (options.integrationId) {
        return options.integrationId;
    }

    const { teamId, convexTeamId, logger } = options;
    if (!teamId || !convexTeamId) {
        throw new Error(
            "Convex integration identifier missing; provide integrationId or teamId + convexTeamId",
        );
    }

    const { data, error } = await supabaseServiceClient
        .from("connectors_convex_integrations")
        .select("id")
        .eq("team_id", teamId)
        .eq("convex_team_id", convexTeamId)
        .maybeSingle();

    if (error) {
        logger.error(error, "Failed to fetch Convex integration record", {
            teamId,
            convexTeamId,
        });
        throw new Error("Failed to fetch Convex integration");
    }

    if (!data?.id) {
        throw new Error("Convex integration missing for team");
    }

    return data.id;
}

function safeDecrypt(
    encryptedValue: string,
    integrationId: string,
    logger: SystemLogger,
): string {
    try {
        return decrypt(encryptedValue, "convex");
    } catch (error) {
        logger.error(
            error instanceof Error ? error : new Error(String(error)),
            "Failed to decrypt Convex token",
            { integrationId },
        );
        throw new Error("Failed to decrypt Convex token");
    }
}

async function markIntegrationAsDisconnected(
    supabaseClient: SupabaseClient<Database>,
    integrationId: string,
    logger: SystemLogger,
): Promise<void> {
    const { error } = await supabaseClient
        .from("connectors_convex_integrations")
        .update({ status: "disconnected" })
        .eq("id", integrationId);

    if (error) {
        logger.error(error, "Failed to mark Convex integration as disconnected", {
            integrationId,
        });
    } else {
        logger.consoleLogDevOnly(
            "info",
            "Marked Convex integration as disconnected due to auth failure",
            { integrationId },
        );
    }
}

function isAuthError(error: unknown): boolean {
    if (!error) {
        return false;
    }

    if (error instanceof ConvexApiError) {
        return error.statusCode === 401 || error.statusCode === 403;
    }

    if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof (error as { status?: number }).status === "number"
    ) {
        const status = (error as { status: number }).status;
        return status === 401 || status === 403;
    }

    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
            message.includes("unauthorized") ||
            message.includes("forbidden") ||
            message.includes("invalid token") ||
            message.includes("access denied")
        );
    }

    return false;
}

export async function fetchConvexApi<T>(
    options: FetchConvexApiOptions,
): Promise<T> {
    const { accessToken, path, method = "GET", body } = options;
    const baseUrl = getConvexPlatformApiBaseUrl();
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(normalizedPath, baseUrl);

    const response = await fetch(url.toString(), {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const responseText = await response.text();

    if (!response.ok) {
        throw new ConvexApiError(
            "Convex API request failed",
            response.status,
            responseText.slice(0, 2000),
        );
    }

    if (!responseText) {
        return undefined as T;
    }

    try {
        return JSON.parse(responseText) as T;
    } catch {
        throw new ConvexApiError(
            "Convex API returned invalid JSON",
            response.status,
            responseText.slice(0, 2000),
        );
    }
}

function getConvexPlatformApiBaseUrl(): string {
    return "https://api.convex.dev/v1/";
}
