import crypto from 'crypto';
import type { SystemLogger } from '../loggers/SystemLogger.js';

/**
 * GitHub API client for GitHub App integration
 *
 * Handles:
 * - OAuth token exchange (user authorization)
 * - GitHub API calls for user info and installations
 * - JWT generation for GitHub App authentication
 * - Installation token generation
 *
 * Required ENV vars:
 * - GITHUB_APP_ID
 * - GITHUB_APP_CLIENT_ID
 * - GITHUB_APP_CLIENT_SECRET
 * - GITHUB_APP_PRIVATE_KEY_B64 (base64-encoded PEM private key)
 */

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

// ============================================================================
// Types
// ============================================================================

export interface GitHubOAuthTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in?: number; // Optional: may not be present for non-expiring tokens
  refresh_token?: string; // Optional: only if refresh tokens are enabled
  refresh_token_expires_in?: number;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  type: 'User' | 'Organization';
}

export interface GitHubInstallation {
  id: number;
  account: {
    login: string;
    id: number;
    type: 'User' | 'Organization';
  };
  app_id: number;
  app_slug: string;
  target_type: 'User' | 'Organization';
  created_at: string;
  updated_at: string;
  suspended_at: string | null;
}

export interface GitHubInstallationsResponse {
  total_count: number;
  installations: GitHubInstallation[];
}

export interface GitHubInstallationToken {
  token: string;
  expires_at: string;
}

export interface GitHubAppJWT {
  token: string;
  expiresAt: Date;
}

// ============================================================================
// OAuth Token Exchange
// ============================================================================

/**
 * Exchange OAuth authorization code for access token.
 *
 * This is the second step of the OAuth flow after the user authorizes the app.
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
 */
export async function exchangeCodeForToken(
  code: string,
  logger: SystemLogger,
): Promise<GitHubOAuthTokenResponse> {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GitHub App client ID and secret must be configured');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to exchange code for token'),
      'GitHub OAuth token exchange failed',
      {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      },
    );
    throw new Error(`GitHub OAuth token exchange failed: ${response.status}`);
  }

  const data = await response.json();

  // GitHub returns an error field if something went wrong
  if ('error' in data) {
    logger.error(
      new Error('GitHub OAuth error'),
      'GitHub returned error in token response',
      {
        error: data.error,
        error_description: data.error_description,
      },
    );
    throw new Error(`GitHub OAuth error: ${data.error} - ${data.error_description}`);
  }

  return data as GitHubOAuthTokenResponse;
}

// ============================================================================
// User API Calls
// ============================================================================

/**
 * Get authenticated user information.
 * https://docs.github.com/en/rest/users/users#get-the-authenticated-user
 */
export async function getAuthenticatedUser(
  accessToken: string,
  logger: SystemLogger,
): Promise<GitHubUser> {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to fetch authenticated user'),
      'GitHub API: get user failed',
      {
        status: response.status,
        error: errorText,
      },
    );
    throw new Error(`Failed to fetch GitHub user: ${response.status}`);
  }

  const data = await response.json();
  return data as GitHubUser;
}

/**
 * List app installations accessible to the user access token.
 * https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token
 */
export async function listUserInstallations(
  accessToken: string,
  logger: SystemLogger,
): Promise<GitHubInstallation[]> {
  const response = await fetch(`${GITHUB_API_BASE}/user/installations`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to list user installations'),
      'GitHub API: list installations failed',
      {
        status: response.status,
        error: errorText,
      },
    );
    throw new Error(`Failed to list GitHub installations: ${response.status}`);
  }

  const data = (await response.json()) as GitHubInstallationsResponse;
  return data.installations;
}

// ============================================================================
// GitHub App JWT Authentication
// ============================================================================

/**
 * Generate a JWT for GitHub App authentication.
 *
 * The JWT is used to authenticate as the GitHub App itself (not as a user).
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
 */
export function generateAppJWT(logger: SystemLogger): GitHubAppJWT {
  const appId = process.env.GITHUB_APP_ID;
  const privateKeyB64 = process.env.GITHUB_APP_PRIVATE_KEY_B64;

  if (!appId || !privateKeyB64) {
    throw new Error('GitHub App ID and private key must be configured');
  }

  // Decode base64 private key
  let privateKey: string;
  try {
    privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8');
  } catch (error) {
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      'Failed to decode GitHub App private key from base64',
    );
    throw new Error('Invalid GitHub App private key format');
  }

  // JWT payload
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 600; // 10 minutes (max allowed by GitHub)

  const payload = {
    iat: now,
    exp: expiresAt,
    iss: appId,
  };

  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signatureInput)
    .sign(privateKey, 'base64');

  const encodedSignature = base64UrlEncode(Buffer.from(signature, 'base64'));

  const token = `${signatureInput}.${encodedSignature}`;

  return {
    token,
    expiresAt: new Date(expiresAt * 1000),
  };
}

/**
 * Base64 URL encode (without padding).
 */
function base64UrlEncode(input: string | Buffer): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ============================================================================
// Installation Token
// ============================================================================

/**
 * Create an installation access token.
 *
 * This token is used to make API calls on behalf of the installation.
 * https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app
 */
export async function createInstallationToken(
  installationId: number,
  logger: SystemLogger,
): Promise<GitHubInstallationToken> {
  const appJWT = generateAppJWT(logger);

  const response = await fetch(
    `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${appJWT.token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to create installation token'),
      'GitHub API: create installation token failed',
      {
        installationId,
        status: response.status,
        error: errorText,
      },
    );
    throw new Error(`Failed to create GitHub installation token: ${response.status}`);
  }

  const data = await response.json();
  return data as GitHubInstallationToken;
}

// ============================================================================
// Installation Removal
// ============================================================================

/**
 * Uninstall the GitHub App from a specific installation.
 * https://docs.github.com/en/rest/apps/apps#delete-an-installation-for-the-authenticated-app
 */
export async function deleteAppInstallation(
  installationId: number,
  logger: SystemLogger,
): Promise<boolean> {
  const appJWT = generateAppJWT(logger);

  const response = await fetch(`${GITHUB_API_BASE}/app/installations/${installationId}`, {
    method: 'DELETE',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${appJWT.token}`,
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
  });

  if (response.status === 204) {
    logger.info('Successfully removed GitHub App installation', {
      installationId,
    });
    return true;
  }

  if (response.status === 404) {
    logger.warn('GitHub App installation already removed', {
      installationId,
    });
    return true;
  }

  const errorText = await response.text();
  logger.error(
    new Error('Failed to remove GitHub App installation'),
    'GitHub API: delete installation failed',
    {
      installationId,
      status: response.status,
      error: errorText,
    },
  );
  throw new Error(`Failed to delete GitHub App installation: ${response.status}`);
}

// ============================================================================
// Token Revocation
// ============================================================================

/**
 * Revoke a user access token.
 *
 * This is optional but recommended when disconnecting an integration.
 * https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token
 */
export async function revokeUserToken(
  accessToken: string,
  logger: SystemLogger,
): Promise<boolean> {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.warn('GitHub App client credentials not configured, skipping token revocation');
    return false;
  }

  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/applications/${clientId}/token`,
      {
        method: 'DELETE',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
        body: JSON.stringify({
          access_token: accessToken,
        }),
      },
    );

    if (response.status === 204) {
      logger.info('Successfully revoked GitHub user token');
      return true;
    } else {
      const errorText = await response.text();
      logger.warn('Failed to revoke GitHub user token', {
        status: response.status,
        error: errorText,
      });
      return false;
    }
  } catch (error) {
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      'Exception while revoking GitHub token',
    );
    return false;
  }
}
