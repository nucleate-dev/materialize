/**
 * Backfill repository metadata for prototype_source_repositories.
 * A row is inconsistent if any repo metadata columns are null.
 */

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { NucleateDBFixer } from "../nucleate-db-fixer";
import type { Database } from "../types/supabase";

type PrototypeSourceRepoRow =
  Database["public"]["Tables"]["prototype_source_repositories"]["Row"];
type GitHubIntegrationRow =
  Database["public"]["Tables"]["github_integrations"]["Row"];

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

type GitHubRepositoryInfo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  archived: boolean;
  owner?: {
    login?: string;
    type?: string;
  };
};

type GitHubOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

type GitHubInstallationToken = {
  token: string;
  expires_at: string;
};

type GitHubAppJWT = {
  token: string;
  expiresAt: Date;
};

const REQUIRED_COLUMNS: (keyof PrototypeSourceRepoRow)[] = [
  "account_login",
  "account_type",
  "owner_login",
  "repo_name",
  "full_name",
  "html_url",
  "default_branch",
  "is_private",
  "is_archived",
];

const integrationCache = new Map<string, GitHubIntegrationRow>();
const installationTokenCache = new Map<
  number,
  { token: string; expiresAt: Date }
>();

function assertEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function base64UrlEncode(input: string | Buffer): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getEncryptionKey(): Buffer {
  const keyEnv = assertEnv("GITHUB_TOKEN_ENCRYPTION_KEY");

  if (keyEnv.length === 64 && /^[0-9a-fA-F]+$/.test(keyEnv)) {
    return Buffer.from(keyEnv, "hex");
  }

  if (keyEnv.length === 44) {
    const key = Buffer.from(keyEnv, "base64");
    if (key.length === 32) {
      return key;
    }
  }

  throw new Error(
    "GITHUB_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as hex (64 chars) or base64 (44 chars)",
  );
}

function decryptGitHubToken(encrypted: string): string {
  if (!encrypted) {
    throw new Error("Cannot decrypt empty encrypted token");
  }

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted token format. Expected IV:AUTH_TAG:CIPHERTEXT",
    );
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, "hex", "utf8");
  plaintext += decipher.final("utf8");

  return plaintext;
}

function encryptGitHubToken(plaintext: string): string {
  if (!plaintext) {
    throw new Error("Cannot encrypt empty plaintext token");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext}`;
}

function needsRefreshSoon(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }
  const expiresDate = new Date(expiresAt);
  if (Number.isNaN(expiresDate.getTime())) {
    return true;
  }
  return expiresDate.getTime() - Date.now() <= TOKEN_REFRESH_THRESHOLD_MS;
}

async function refreshGitHubOAuthToken(
  refreshToken: string,
): Promise<GitHubOAuthTokenResponse> {
  const clientId = assertEnv("GITHUB_APP_CLIENT_ID");
  const clientSecret = assertEnv("GITHUB_APP_CLIENT_SECRET");

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub OAuth token refresh failed: ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as GitHubOAuthTokenResponse & {
    error?: string;
    error_description?: string;
  };

  if (data.error) {
    throw new Error(
      `GitHub OAuth refresh error: ${data.error} - ${data.error_description ?? "Unknown error"}`,
    );
  }

  return data;
}

function generateAppJWT(): GitHubAppJWT {
  const appId = assertEnv("GITHUB_APP_ID");
  const privateKeyB64 = assertEnv("GITHUB_APP_PRIVATE_KEY_B64");

  let privateKey: string;
  try {
    privateKey = Buffer.from(privateKeyB64, "base64").toString("utf8");
  } catch (error) {
    throw new Error("Invalid GitHub App private key format");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 600;
  const payload = { iat: now, exp: expiresAt, iss: appId };
  const header = { alg: "RS256", typ: "JWT" };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signatureInput)
    .sign(privateKey, "base64");
  const encodedSignature = base64UrlEncode(Buffer.from(signature, "base64"));

  return {
    token: `${signatureInput}.${encodedSignature}`,
    expiresAt: new Date(expiresAt * 1000),
  };
}

async function createInstallationToken(
  installationId: number,
): Promise<GitHubInstallationToken> {
  const cached = installationTokenCache.get(installationId);
  if (cached && cached.expiresAt.getTime() > Date.now() + 60_000) {
    return { token: cached.token, expires_at: cached.expiresAt.toISOString() };
  }

  const appJWT = generateAppJWT();
  const response = await fetch(
    `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJWT.token}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create GitHub installation token: ${response.status} ${errorText}`,
    );
  }

  const data = (await response.json()) as GitHubInstallationToken;
  installationTokenCache.set(installationId, {
    token: data.token,
    expiresAt: new Date(data.expires_at),
  });
  return data;
}

async function fetchRepositoryById(
  repositoryId: number,
  accessToken: string,
): Promise<GitHubRepositoryInfo> {
  if (!repositoryId) {
    throw new Error("Repository ID is required to fetch GitHub repository");
  }
  if (!accessToken) {
    throw new Error("GitHub access token is required to fetch repository");
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/repositories/${repositoryId}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    },
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Failed to fetch GitHub repository ${repositoryId}: ${response.status} ${responseText}`,
    );
  }

  try {
    return JSON.parse(responseText) as GitHubRepositoryInfo;
  } catch {
    throw new Error("Failed to parse GitHub repository response");
  }
}

async function getGitHubIntegration(
  teamId: string,
): Promise<GitHubIntegrationRow> {
  const cached = integrationCache.get(teamId);
  if (cached) {
    return cached;
  }

  const { data, error } = await supabase
    .from("github_integrations")
    .select("account_login, account_type, installation_id")
    .eq("team_id", teamId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[prototype-source-repo-metadata] Failed to fetch GitHub integration for team ${teamId}: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      `[prototype-source-repo-metadata] GitHub integration missing for team ${teamId}`,
    );
  }

  integrationCache.set(teamId, data);
  return data;
}

async function getValidGitHubUserAccessToken(teamId: string): Promise<string> {
  const { data, error } = await supabase
    .from("github_integration_tokens")
    .select("token_encrypted, refresh_encrypted, token_expires_at")
    .eq("team_id", teamId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[prototype-source-repo-metadata] Failed to fetch GitHub integration token for team ${teamId}: ${error.message}`,
    );
  }

  if (!data?.token_encrypted) {
    throw new Error(
      `[prototype-source-repo-metadata] GitHub integration token missing for team ${teamId}`,
    );
  }

  const decryptedToken = decryptGitHubToken(data.token_encrypted);
  if (!needsRefreshSoon(data.token_expires_at)) {
    return decryptedToken;
  }

  if (!data.refresh_encrypted) {
    throw new Error(
      `[prototype-source-repo-metadata] GitHub refresh token missing for team ${teamId}`,
    );
  }

  const refreshToken = decryptGitHubToken(data.refresh_encrypted);
  const refreshed = await refreshGitHubOAuthToken(refreshToken);
  const refreshedExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;

  const updatedTokenEncrypted = encryptGitHubToken(refreshed.access_token);
  const updatedRefreshEncrypted = refreshed.refresh_token
    ? encryptGitHubToken(refreshed.refresh_token)
    : null;

  const { error: updateError } = await supabase
    .from("github_integration_tokens")
    .update({
      token_encrypted: updatedTokenEncrypted,
      refresh_encrypted: updatedRefreshEncrypted,
      token_expires_at: refreshedExpiresAt,
    })
    .eq("team_id", teamId);

  if (updateError) {
    throw new Error(
      `[prototype-source-repo-metadata] Failed to persist refreshed GitHub token for team ${teamId}: ${updateError.message}`,
    );
  }

  return refreshed.access_token;
}

async function getGitHubAccessToken(
  integration: GitHubIntegrationRow,
  teamId: string,
): Promise<string> {
  if (integration.account_type === "Organization") {
    const installationToken = await createInstallationToken(
      integration.installation_id,
    );
    return installationToken.token;
  }

  if (integration.account_type === "User") {
    return await getValidGitHubUserAccessToken(teamId);
  }

  throw new Error(
    `[prototype-source-repo-metadata] Unsupported GitHub account type: ${integration.account_type}`,
  );
}

function buildFullName(ownerLogin: string, repoName: string): string {
  if (ownerLogin && repoName) {
    return `${ownerLogin}/${repoName}`;
  }
  return repoName || ownerLogin || "";
}

export const fixer: NucleateDBFixer<"prototype_source_repositories"> = {
  table: "prototype_source_repositories",
  orderByColumn: "created_at",
  primaryKeyColumn: "prototype_id",
  writeBackMode: "update",

  genIsInconsistent(row: PrototypeSourceRepoRow) {
    return REQUIRED_COLUMNS.some((column) => row[column] == null);
  },

  async genFixRow(row: PrototypeSourceRepoRow) {
    if (!row.source_repo_id) {
      throw new Error(
        `[prototype-source-repo-metadata] Row ${row.prototype_id} missing source_repo_id`,
      );
    }
    if (!row.team_id) {
      throw new Error(
        `[prototype-source-repo-metadata] Row ${row.prototype_id} missing team_id`,
      );
    }

    const integration = await getGitHubIntegration(row.team_id);
    const accessToken = await getGitHubAccessToken(integration, row.team_id);
    const repoInfo = await fetchRepositoryById(
      row.source_repo_id,
      accessToken,
    );

    const ownerLogin = repoInfo.owner?.login ?? integration.account_login ?? "";
    const repoName = repoInfo.name ?? "";
    const fullName =
      repoInfo.full_name ?? buildFullName(ownerLogin, repoName);

    return {
      ...row,
      installation_id: integration.installation_id ?? row.installation_id ?? null,
      account_login: integration.account_login ?? ownerLogin ?? null,
      account_type: integration.account_type ?? repoInfo.owner?.type ?? null,
      owner_login: ownerLogin || null,
      repo_name: repoName || null,
      full_name: fullName || null,
      html_url: repoInfo.html_url ?? null,
      default_branch: repoInfo.default_branch ?? "main",
      is_private:
        typeof repoInfo.private === "boolean" ? repoInfo.private : false,
      is_archived:
        typeof repoInfo.archived === "boolean" ? repoInfo.archived : false,
    };
  },
};

export default fixer;
