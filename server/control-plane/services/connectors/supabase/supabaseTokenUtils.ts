import type { SupabaseClient } from "@supabase/supabase-js";
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
  supabaseClient: SupabaseClient<Database>;
  logger: SystemLogger;
  integrationId?: string;
  teamId?: string;
  supabaseOrganizationId?: string;
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
 * Returns a decrypted Supabase OAuth access token for the given integration.
 * If the token is expired or will expire within 10 minutes, it is refreshed
 * (and the database is updated) before returning.
 */
export async function getValidSupabaseAccessToken(
  options: GetValidSupabaseTokenOptions,
): Promise<ValidSupabaseTokenResult> {
  const { supabaseClient, logger } = options;
  const integrationId = await resolveIntegrationId(options);

  const { data, error } = await supabaseClient
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
  const shouldRefresh = needsRefreshSoon(expiresAt, logger, integrationId);

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
  const refreshed = await refreshSupabaseAccessToken(refreshToken, logger);

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

  const { error: updateError } = await supabaseClient
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
): Promise<string> {
  if (options.integrationId) {
    return options.integrationId;
  }

  const { teamId, supabaseOrganizationId, supabaseClient, logger } = options;
  if (!teamId || !supabaseOrganizationId) {
    throw new Error(
      "Supabase integration identifier missing; provide integrationId or teamId + supabaseOrganizationId",
    );
  }

  const { data, error } = await supabaseClient
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
  return timeUntilExpiry <= TOKEN_REFRESH_THRESHOLD_MS;
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

async function refreshSupabaseAccessToken(
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
    logger.error(
      new Error("Supabase OAuth token refresh failed"),
      "Supabase OAuth token refresh failed",
      { status: response.status },
    );
    logger.consoleLogDevOnly("error", "Supabase OAuth token refresh failed", {
      status: response.status,
      response: responseText.slice(0, 500),
    });
    throw new Error("token_refresh_failed");
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
