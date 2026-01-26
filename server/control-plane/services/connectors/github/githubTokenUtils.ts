import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "../../../utils/encryptionUtils.js";
import type { Database } from "../../../types/supabase.js";
import type { SystemLogger } from "../../../loggers/SystemLogger.js";
import { refreshGitHubOAuthToken } from "./githubClient.js";

const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export interface ValidGitHubTokenResult {
  accessToken: string;
  expiresAt: string | null;
  refreshed: boolean;
}

interface GetValidTokenOptions {
  supabaseClient: SupabaseClient<Database>;
  teamId: string;
  logger: SystemLogger;
}

/**
 * Returns a decrypted GitHub OAuth access token for the given team.
 * If the token is expired or will expire within 10 minutes, it is refreshed
 * (and the database is updated) before returning.
 */
export async function getValidGitHubUserAccessToken(
  options: GetValidTokenOptions,
): Promise<ValidGitHubTokenResult> {
  const { supabaseClient, teamId, logger } = options;

  const { data, error } = await supabaseClient
    .from("github_integration_tokens")
    .select("token_encrypted, refresh_encrypted, token_expires_at")
    .eq("team_id", teamId)
    .maybeSingle();

  if (error) {
    logger.error(error, "Failed to fetch GitHub integration token record", {
      teamId,
    });
    throw new Error("Failed to fetch GitHub integration tokens");
  }

  if (!data?.token_encrypted) {
    throw new Error("GitHub integration token missing for team");
  }

  const decryptedToken = safeDecrypt(data.token_encrypted, teamId, logger);
  const expiresAt = data.token_expires_at;
  const shouldRefresh = needsRefreshSoon(expiresAt, logger);

  if (!shouldRefresh) {
    return {
      accessToken: decryptedToken,
      expiresAt,
      refreshed: false,
    };
  }

  if (!data.refresh_encrypted) {
    throw new Error(
      "GitHub refresh token missing; cannot refresh expiring access token",
    );
  }

  const refreshToken = safeDecrypt(data.refresh_encrypted, teamId, logger);
  const refreshed = await refreshGitHubOAuthToken(refreshToken, logger);

  const refreshedExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;
  const refreshedAccessTokenEncrypted = encrypt(
    refreshed.access_token,
    "github",
  );
  const refreshedRefreshEncrypted = refreshed.refresh_token
    ? encrypt(refreshed.refresh_token, "github")
    : null;

  const { error: updateError } = await supabaseClient
    .from("github_integration_tokens")
    .update({
      token_encrypted: refreshedAccessTokenEncrypted,
      refresh_encrypted: refreshedRefreshEncrypted,
      token_expires_at: refreshedExpiresAt,
    })
    .eq("team_id", teamId);

  if (updateError) {
    logger.error(
      updateError,
      "Failed to persist refreshed GitHub OAuth token",
      { teamId },
    );
    throw new Error("Failed to update GitHub OAuth token");
  }

  logger.info("Refreshed GitHub OAuth token for team", {
    teamId,
    expiresAt: refreshedExpiresAt,
  });

  return {
    accessToken: refreshed.access_token,
    expiresAt: refreshedExpiresAt,
    refreshed: true,
  };
}

function needsRefreshSoon(
  expiresAt: string | null,
  logger: SystemLogger,
): boolean {
  if (!expiresAt) {
    return false;
  }

  const expiresDate = new Date(expiresAt);
  if (Number.isNaN(expiresDate.getTime())) {
    logger.warn("GitHub token expiry timestamp invalid; forcing refresh", {
      expiresAt,
    });
    return true;
  }

  const timeUntilExpiry = expiresDate.getTime() - Date.now();
  return timeUntilExpiry <= TOKEN_REFRESH_THRESHOLD_MS;
}

function safeDecrypt(
  encryptedValue: string,
  teamId: string,
  logger: SystemLogger,
): string {
  try {
    return decrypt(encryptedValue, "github");
  } catch (error) {
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to decrypt GitHub token",
      { teamId },
    );
    throw new Error("Failed to decrypt GitHub token");
  }
}
