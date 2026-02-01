import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "../../../utils/encryptionUtils.js";
import type { Database } from "../../../types/supabase.js";
import type { SystemLogger } from "../../../loggers/SystemLogger.js";

const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export interface ValidSupabaseTokenResult {
  accessToken: string;
  expiresAt: string | null;
  refreshed: boolean;
  integrationId: string;
}

interface GetValidSupabaseTokenOptions {
  logger: SystemLogger;
  integrationId?: string;
  teamId?: string;
  supabaseOrganizationId?: string;
  refreshThresholdMs?: number;
}

interface SupabaseOAuthConfig {
  clientId: string;
  clientSecret: string;
  managementBaseUrl: string;
}

interface SupabaseTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * Custom error class for token refresh failures that includes HTTP status.
 * Used to detect when a user has revoked OAuth access.
 */
export class SupabaseTokenRefreshError extends Error {
  public readonly statusCode: number;
  public readonly isRevoked: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "SupabaseTokenRefreshError";
    this.statusCode = statusCode;
    // 401 Unauthorized or 403 Forbidden indicates revoked access
    this.isRevoked = statusCode === 401 || statusCode === 403;
  }
}

/**
 * Custom error class for Management API call failures due to revoked access.
 */
export class SupabaseAccessRevokedError extends Error {
  public readonly integrationId: string;

  constructor(integrationId: string) {
    super(
      "Supabase OAuth access has been revoked. Please reconnect your Supabase organization.",
    );
    this.name = "SupabaseAccessRevokedError";
    this.integrationId = integrationId;
  }
}

interface ExecuteWithRevocationDetectionOptions<T> {
  logger: SystemLogger;
  integrationId: string;
  /** Function that executes the API call. Receives accessToken as parameter. */
  operation: (accessToken: string) => Promise<T>;
}

/**
 * Wraps a Supabase Management API call with automatic retry on auth failure.
 *
 * On 401/403:
 * 1. Forces a token refresh
 * 2. Retries the operation once with the new token
 * 3. If retry also fails with 401/403, marks integration as disconnected
 *
 * This handles cases where tokens expire mid-request or have transient auth issues,
 * while still detecting true revocations.
 */
export async function executeWithRevocationDetection<T>(
  options: ExecuteWithRevocationDetectionOptions<T>,
): Promise<T> {
  const { logger, integrationId, operation } = options;
  const supabaseServiceClient = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get the current access token
  const { accessToken } = await getValidSupabaseAccessToken({
    logger,
    integrationId,
  });

  try {
    return await operation(accessToken);
  } catch (error) {
    // Check if this is an auth error (401/403)
    if (!isAuthError(error)) {
      // Not an auth error, re-throw as-is
      throw error;
    }

    logger.info(
      "Supabase Management API returned auth error, attempting token refresh and retry",
      { integrationId },
    );

    // Force a token refresh by fetching with a very short threshold
    let refreshedToken: string;
    try {
      refreshedToken = await forceTokenRefresh(
        supabaseServiceClient,
        logger,
        integrationId,
      );
    } catch (refreshError) {
      // Token refresh failed - if it's due to revocation, mark as disconnected
      if (
        refreshError instanceof SupabaseTokenRefreshError &&
        refreshError.isRevoked
      ) {
        // Already marked as disconnected by getValidSupabaseAccessToken
        throw new SupabaseAccessRevokedError(integrationId);
      }
      throw refreshError;
    }

    // Retry the operation with the refreshed token
    try {
      return await operation(refreshedToken);
    } catch (retryError) {
      // If retry also fails with auth error, it's truly revoked
      if (isAuthError(retryError)) {
        logger.warn(
          "Supabase Management API call failed after token refresh - marking as disconnected",
          { integrationId },
        );
        await markIntegrationAsDisconnected(
          supabaseServiceClient,
          integrationId,
          logger,
        );
        throw new SupabaseAccessRevokedError(integrationId);
      }
      throw retryError;
    }
  }
}

/**
 * Forces a token refresh regardless of expiration time.
 */
async function forceTokenRefresh(
  supabaseClient: SupabaseClient<Database>,
  logger: SystemLogger,
  integrationId: string,
): Promise<string> {
  const { data, error } = await supabaseClient
    .from("connectors_supabase_integration_tokens")
    .select("refresh_token_encrypted")
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (error || !data?.refresh_token_encrypted) {
    throw new Error("Failed to fetch refresh token for forced refresh");
  }

  const refreshToken = decrypt(data.refresh_token_encrypted, "supabase");
  const refreshed = await refreshSupabaseAccessTokenInternal(
    refreshToken,
    logger,
  );

  if (refreshed.error || !refreshed.access_token) {
    throw new Error("Token refresh failed");
  }

  // Update the stored tokens
  const refreshedExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;
  const refreshedAccessTokenEncrypted = encrypt(
    refreshed.access_token,
    "supabase",
  );
  const refreshedRefreshEncrypted = refreshed.refresh_token
    ? encrypt(refreshed.refresh_token, "supabase")
    : data.refresh_token_encrypted;

  await supabaseClient
    .from("connectors_supabase_integration_tokens")
    .update({
      access_token_encrypted: refreshedAccessTokenEncrypted,
      refresh_token_encrypted: refreshedRefreshEncrypted,
      token_expires_at: refreshedExpiresAt,
    })
    .eq("integration_id", integrationId);

  logger.info("Forced token refresh completed", { integrationId });

  return refreshed.access_token;
}

/**
 * Checks if an error is an auth error (401 or 403).
 * Handles various error formats from supabase-management-js.
 */
function isAuthError(error: unknown): boolean {
  if (!error) return false;

  // Check for SupabaseManagementAPIError which has a response property
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { status?: number } }).response === "object"
  ) {
    const status = (error as { response: { status?: number } }).response
      ?.status;
    if (status === 401 || status === 403) {
      return true;
    }
  }

  // Check for status directly on the error
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error
  ) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) {
      return true;
    }
  }

  // Check error message for common auth failure patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes("unauthorized") ||
      message.includes("forbidden") ||
      message.includes("invalid token") ||
      message.includes("token expired") ||
      message.includes("access denied")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Returns a decrypted Supabase OAuth access token for the given integration.
 * If the token is expired or will expire within the refresh threshold, it is
 * refreshed (and the database is updated) before returning.
 */
export async function getValidSupabaseAccessToken(
  options: GetValidSupabaseTokenOptions,
): Promise<ValidSupabaseTokenResult> {
  const supabaseServiceClient = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { logger } = options;
  const refreshThresholdMs = Number.isFinite(options.refreshThresholdMs) &&
      options.refreshThresholdMs !== undefined &&
      options.refreshThresholdMs >= 0
    ? options.refreshThresholdMs
    : TOKEN_REFRESH_THRESHOLD_MS;
  const integrationId = await resolveIntegrationId(
    options,
    supabaseServiceClient,
  );

  const { data, error } = await supabaseServiceClient
    .from("connectors_supabase_integration_tokens")
    .select(
      "access_token_encrypted, refresh_token_encrypted, token_expires_at, token_type, token_scopes",
    )
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (error) {
    logger.error(
      error,
      "Failed to fetch Supabase integration token record",
      {
        integrationId,
      },
    );
    throw new Error("Failed to fetch Supabase integration tokens");
  }

  if (!data?.access_token_encrypted) {
    throw new Error("Supabase integration token missing");
  }

  const decryptedToken = safeDecrypt(
    data.access_token_encrypted,
    integrationId,
    logger,
  );
  const expiresAt = data.token_expires_at;
  const shouldRefresh = needsRefreshSoon(
    expiresAt,
    logger,
    integrationId,
    refreshThresholdMs,
  );

  if (!shouldRefresh) {
    return {
      accessToken: decryptedToken,
      expiresAt,
      refreshed: false,
      integrationId,
    };
  }

  if (!data.refresh_token_encrypted) {
    throw new Error(
      "Supabase refresh token missing; cannot refresh expiring access token",
    );
  }

  const refreshToken = safeDecrypt(
    data.refresh_token_encrypted,
    integrationId,
    logger,
  );

  let refreshed: SupabaseTokenResponse;
  try {
    refreshed = await refreshSupabaseAccessTokenInternal(refreshToken, logger);
  } catch (error) {
    // If the token refresh failed due to revoked access, update the integration status
    if (error instanceof SupabaseTokenRefreshError && error.isRevoked) {
      await markIntegrationAsDisconnected(
        supabaseServiceClient,
        integrationId,
        logger,
      );
    }
    throw error;
  }

  if (refreshed.error) {
    logger.error(
      new Error(refreshed.error_description ?? refreshed.error),
      "Supabase token refresh returned an error",
      { integrationId },
    );
    throw new Error("Supabase token refresh returned an error");
  }

  if (!refreshed.access_token) {
    throw new Error("Supabase token refresh returned no access token");
  }

  const refreshedExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;
  const refreshedAccessTokenEncrypted = encrypt(
    refreshed.access_token,
    "supabase",
  );
  const refreshedRefreshEncrypted = refreshed.refresh_token
    ? encrypt(refreshed.refresh_token, "supabase")
    : data.refresh_token_encrypted;

  const { error: updateError } = await supabaseServiceClient
    .from("connectors_supabase_integration_tokens")
    .update({
      access_token_encrypted: refreshedAccessTokenEncrypted,
      refresh_token_encrypted: refreshedRefreshEncrypted,
      token_expires_at: refreshedExpiresAt,
      token_type: refreshed.token_type ?? data.token_type ?? null,
      token_scopes: refreshed.scope ?? data.token_scopes ?? null,
    })
    .eq("integration_id", integrationId);

  if (updateError) {
    logger.error(
      updateError,
      "Failed to persist refreshed Supabase OAuth token",
      { integrationId },
    );
    throw new Error("Failed to update Supabase OAuth token");
  }

  logger.info("Refreshed Supabase OAuth token for integration", {
    integrationId,
    expiresAt: refreshedExpiresAt,
  });

  return {
    accessToken: refreshed.access_token,
    expiresAt: refreshedExpiresAt,
    refreshed: true,
    integrationId,
  };
}

async function resolveIntegrationId(
  options: GetValidSupabaseTokenOptions,
  supabaseServiceClient: SupabaseClient<Database>,
): Promise<string> {
  if (options.integrationId) {
    return options.integrationId;
  }

  const { teamId, supabaseOrganizationId, logger } = options;
  if (!teamId || !supabaseOrganizationId) {
    throw new Error(
      "Supabase integration identifier missing; provide integrationId or teamId + supabaseOrganizationId",
    );
  }

  const { data, error } = await supabaseServiceClient
    .from("connectors_supabase_integrations")
    .select("id")
    .eq("team_id", teamId)
    .eq("supabase_organization_id", supabaseOrganizationId)
    .maybeSingle();

  if (error) {
    logger.error(
      error,
      "Failed to fetch Supabase integration record",
      { teamId, supabaseOrganizationId },
    );
    throw new Error("Failed to fetch Supabase integration");
  }

  if (!data?.id) {
    throw new Error("Supabase integration missing for team");
  }

  return data.id;
}

function needsRefreshSoon(
  expiresAt: string | null,
  logger: SystemLogger,
  integrationId: string,
  refreshThresholdMs: number,
): boolean {
  if (!expiresAt) {
    return false;
  }

  const expiresDate = new Date(expiresAt);
  if (Number.isNaN(expiresDate.getTime())) {
    logger.warn("Supabase token expiry timestamp invalid; forcing refresh", {
      integrationId,
      expiresAt,
    });
    return true;
  }

  const timeUntilExpiry = expiresDate.getTime() - Date.now();
  return timeUntilExpiry <= refreshThresholdMs;
}

function safeDecrypt(
  encryptedValue: string,
  integrationId: string,
  logger: SystemLogger,
): string {
  try {
    return decrypt(encryptedValue, "supabase");
  } catch (error) {
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to decrypt Supabase token",
      { integrationId },
    );
    throw new Error("Failed to decrypt Supabase token");
  }
}

/**
 * Mark a Supabase integration as disconnected when OAuth access has been revoked.
 */
async function markIntegrationAsDisconnected(
  supabaseClient: SupabaseClient<Database>,
  integrationId: string,
  logger: SystemLogger,
): Promise<void> {
  const { error } = await supabaseClient
    .from("connectors_supabase_integrations")
    .update({ status: "disconnected" })
    .eq("id", integrationId);

  if (error) {
    logger.error(error, "Failed to mark Supabase integration as disconnected", {
      integrationId,
    });
    // Don't throw here - we still want to propagate the original error
  } else {
    logger.info(
      "Marked Supabase integration as disconnected due to revoked access",
      {
        integrationId,
      },
    );
  }
}

function getSupabaseOAuthConfig(): SupabaseOAuthConfig {
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  const managementBaseUrl = process.env.SUPABASE_MANAGEMENT_API_BASE_URL;

  if (!clientId || !clientSecret || !managementBaseUrl) {
    throw new Error("Supabase OAuth configuration is incomplete");
  }

  const normalizedBaseUrl = managementBaseUrl.endsWith("/")
    ? managementBaseUrl
    : `${managementBaseUrl}/`;

  return {
    clientId,
    clientSecret,
    managementBaseUrl: normalizedBaseUrl,
  };
}

async function refreshSupabaseAccessTokenInternal(
  refreshToken: string,
  logger: SystemLogger,
): Promise<SupabaseTokenResponse> {
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
    const isRevoked = response.status === 401 || response.status === 403;
    logger.error(
      new Error("Supabase OAuth token refresh failed"),
      "Supabase OAuth token refresh failed",
      { status: response.status, isRevoked },
    );
    logger.consoleLogDevOnly("error", "Supabase OAuth token refresh failed", {
      status: response.status,
      isRevoked,
      response: responseText.slice(0, 500),
    });
    throw new SupabaseTokenRefreshError(
      isRevoked
        ? "Supabase OAuth access has been revoked"
        : "Supabase OAuth token refresh failed",
      response.status,
    );
  }

  try {
    return JSON.parse(responseText) as SupabaseTokenResponse;
  } catch (error) {
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to parse Supabase OAuth token refresh response",
    );
    throw new Error("invalid_token_response");
  }
}
