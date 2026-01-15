import type { SystemLogger } from '../loggers/SystemLogger.js';

/**
 * Vercel API client for Vercel Integration
 *
 * Handles:
 * - OAuth token exchange (user authorization)
 * - Vercel API calls for user info, projects, and deployments
 * - Token revocation
 *
 * Required ENV vars:
 * - VERCEL_INTEGRATION_CLIENT_ID
 * - VERCEL_INTEGRATION_CLIENT_SECRET
 * - VERCEL_INTEGRATION_SLUG
 */

const VERCEL_API_BASE = 'https://api.vercel.com';

// ============================================================================
// Types
// ============================================================================

export interface VercelOAuthTokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  team_id?: string; // null for personal accounts
  installation_id?: string;
}

export interface VercelUser {
  id: string;
  email: string;
  name: string | null;
  username: string;
  avatar?: string;
}

export interface VercelTeam {
  id: string;
  slug: string;
  name: string;
  avatar?: string;
}

export interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  link?: {
    type: string;
    repo: string;
    repoId: number;
    org?: string;
    gitCredentialId?: string;
    productionBranch?: string;
  };
  targets?: {
    production?: {
      alias?: string[];
    };
  };
}

export interface VercelDeployment {
  id: string;
  uid: string;
  name: string;
  url: string;
  state: 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
  readyState?: 'QUEUED' | 'BUILDING' | 'INITIALIZING' | 'READY' | 'ERROR' | 'CANCELED';
  createdAt: number;
  buildingAt?: number;
  ready?: number;
  source?: string;
  meta?: {
    githubCommitRef?: string;
    githubCommitSha?: string;
    githubCommitMessage?: string;
  };
}

export interface CreateProjectRequest {
  name: string;
  gitRepository: {
    type: 'github';
    repo: string; // format: "owner/repo"
  };
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  rootDirectory?: string;
}

export interface CreateDeploymentRequest {
  name: string;
  project: string; // project ID or name
  target?: 'production' | 'preview';
  gitSource: {
    type: 'github';
    org: string;
    repo: string;
    ref: string; // branch name or commit SHA
  };
}

// ============================================================================
// OAuth Token Exchange
// ============================================================================

/**
 * Exchange OAuth authorization code for access token.
 *
 * This is the second step of the OAuth flow after the user authorizes the integration.
 * https://vercel.com/docs/rest-api#endpoints/oauth2/request-an-access-token
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  logger: SystemLogger,
): Promise<VercelOAuthTokenResponse> {
  const clientId = process.env.VERCEL_INTEGRATION_CLIENT_ID;
  const clientSecret = process.env.VERCEL_INTEGRATION_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Vercel Integration client ID and secret must be configured');
  }

  // Vercel requires x-www-form-urlencoded format
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('code', code);
  params.append('redirect_uri', redirectUri);

  const response = await fetch(`${VERCEL_API_BASE}/v2/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to exchange code for token'),
      'Vercel OAuth token exchange failed',
      {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      },
    );
    throw new Error(`Vercel OAuth token exchange failed: ${response.status}`);
  }

  const data = await response.json();

  // Vercel returns an error field if something went wrong
  if ('error' in data) {
    logger.error(
      new Error('Vercel OAuth error'),
      'Vercel returned error in token response',
      {
        error: data.error,
        error_description: data.error_description,
      },
    );
    throw new Error(`Vercel OAuth error: ${data.error} - ${data.error_description}`);
  }

  return data as VercelOAuthTokenResponse;
}

// ============================================================================
// User API Calls
// ============================================================================

/**
 * Build URL with optional teamId query parameter.
 * Vercel requires teamId for team-scoped resources.
 */
function buildUrl(path: string, teamId?: string | null): string {
  const url = new URL(path, VERCEL_API_BASE);
  if (teamId) {
    url.searchParams.set('teamId', teamId);
  }
  return url.toString();
}

/**
 * Get authenticated user information.
 * https://vercel.com/docs/rest-api#endpoints/user/get-the-authenticated-user
 */
export async function getAuthenticatedUser(
  accessToken: string,
  logger: SystemLogger,
): Promise<VercelUser> {
  const response = await fetch(`${VERCEL_API_BASE}/v2/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to fetch authenticated user'),
      'Vercel API: get user failed',
      {
        status: response.status,
        error: errorText,
      },
    );
    throw new Error(`Failed to fetch Vercel user: ${response.status}`);
  }

  const data = await response.json();
  return data.user as VercelUser;
}

/**
 * Get teams the user has access to.
 * https://vercel.com/docs/rest-api#endpoints/teams/list-all-teams
 */
export async function listUserTeams(
  accessToken: string,
  logger: SystemLogger,
): Promise<VercelTeam[]> {
  const response = await fetch(`${VERCEL_API_BASE}/v2/teams`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to list user teams'),
      'Vercel API: list teams failed',
      {
        status: response.status,
        error: errorText,
      },
    );
    throw new Error(`Failed to list Vercel teams: ${response.status}`);
  }

  const data = await response.json();
  return data.teams as VercelTeam[];
}

// ============================================================================
// Project Management
// ============================================================================

/**
 * Create a new Vercel project linked to a GitHub repository.
 * https://vercel.com/docs/rest-api#endpoints/projects/create-a-project
 */
export async function createProject(
  accessToken: string,
  projectData: CreateProjectRequest,
  vercelTeamId: string | null,
  logger: SystemLogger,
): Promise<VercelProject> {
  const url = buildUrl('/v10/projects', vercelTeamId);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(projectData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to create Vercel project'),
      'Vercel API: create project failed',
      {
        status: response.status,
        error: errorText,
        projectData: { name: projectData.name, repo: projectData.gitRepository.repo },
      },
    );
    throw new Error(`Failed to create Vercel project: ${response.status}`);
  }

  const data = await response.json();
  return data as VercelProject;
}

/**
 * Get a Vercel project by ID or name.
 * https://vercel.com/docs/rest-api#endpoints/projects/find-a-project-by-id-or-name
 */
export async function getProject(
  accessToken: string,
  projectIdOrName: string,
  vercelTeamId: string | null,
  logger: SystemLogger,
): Promise<VercelProject> {
  const url = buildUrl(`/v9/projects/${encodeURIComponent(projectIdOrName)}`, vercelTeamId);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to get Vercel project'),
      'Vercel API: get project failed',
      {
        status: response.status,
        error: errorText,
        projectIdOrName,
      },
    );
    throw new Error(`Failed to get Vercel project: ${response.status}`);
  }

  const data = await response.json();
  return data as VercelProject;
}

/**
 * Delete a Vercel project.
 * https://vercel.com/docs/rest-api#endpoints/projects/delete-a-project
 */
export async function deleteProject(
  accessToken: string,
  projectIdOrName: string,
  vercelTeamId: string | null,
  logger: SystemLogger,
): Promise<boolean> {
  const url = buildUrl(`/v9/projects/${encodeURIComponent(projectIdOrName)}`, vercelTeamId);

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 204) {
    logger.info('Successfully deleted Vercel project', { projectIdOrName });
    return true;
  }

  if (response.status === 404) {
    logger.warn('Vercel project already deleted or not found', { projectIdOrName });
    return true;
  }

  const errorText = await response.text();
  logger.error(
    new Error('Failed to delete Vercel project'),
    'Vercel API: delete project failed',
    {
      status: response.status,
      error: errorText,
      projectIdOrName,
    },
  );
  throw new Error(`Failed to delete Vercel project: ${response.status}`);
}

// ============================================================================
// Deployment Management
// ============================================================================

/**
 * Create a new deployment.
 * https://vercel.com/docs/rest-api#endpoints/deployments/create-a-new-deployment
 */
export async function createDeployment(
  accessToken: string,
  deploymentData: CreateDeploymentRequest,
  vercelTeamId: string | null,
  logger: SystemLogger,
): Promise<VercelDeployment> {
  const url = buildUrl('/v13/deployments', vercelTeamId);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deploymentData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to create Vercel deployment'),
      'Vercel API: create deployment failed',
      {
        status: response.status,
        error: errorText,
        deploymentData: { name: deploymentData.name, project: deploymentData.project },
      },
    );
    throw new Error(`Failed to create Vercel deployment: ${response.status}`);
  }

  const data = await response.json();
  return data as VercelDeployment;
}

/**
 * Get a deployment by ID.
 * https://vercel.com/docs/rest-api#endpoints/deployments/get-a-deployment-by-id-or-url
 */
export async function getDeployment(
  accessToken: string,
  deploymentId: string,
  vercelTeamId: string | null,
  logger: SystemLogger,
): Promise<VercelDeployment> {
  const url = buildUrl(`/v13/deployments/${encodeURIComponent(deploymentId)}`, vercelTeamId);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to get Vercel deployment'),
      'Vercel API: get deployment failed',
      {
        status: response.status,
        error: errorText,
        deploymentId,
      },
    );
    throw new Error(`Failed to get Vercel deployment: ${response.status}`);
  }

  const data = await response.json();
  return data as VercelDeployment;
}

/**
 * List deployments for a project.
 * https://vercel.com/docs/rest-api#endpoints/deployments/list-deployments
 */
export async function listDeployments(
  accessToken: string,
  projectId: string,
  vercelTeamId: string | null,
  logger: SystemLogger,
  limit: number = 10,
): Promise<VercelDeployment[]> {
  const url = new URL('/v6/deployments', VERCEL_API_BASE);
  url.searchParams.set('projectId', projectId);
  url.searchParams.set('limit', limit.toString());
  if (vercelTeamId) {
    url.searchParams.set('teamId', vercelTeamId);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to list Vercel deployments'),
      'Vercel API: list deployments failed',
      {
        status: response.status,
        error: errorText,
        projectId,
      },
    );
    throw new Error(`Failed to list Vercel deployments: ${response.status}`);
  }

  const data = await response.json();
  return data.deployments as VercelDeployment[];
}

/**
 * Cancel a deployment.
 * https://vercel.com/docs/rest-api#endpoints/deployments/cancel-a-deployment
 */
export async function cancelDeployment(
  accessToken: string,
  deploymentId: string,
  vercelTeamId: string | null,
  logger: SystemLogger,
): Promise<VercelDeployment> {
  const url = buildUrl(`/v12/deployments/${encodeURIComponent(deploymentId)}/cancel`, vercelTeamId);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      new Error('Failed to cancel Vercel deployment'),
      'Vercel API: cancel deployment failed',
      {
        status: response.status,
        error: errorText,
        deploymentId,
      },
    );
    throw new Error(`Failed to cancel Vercel deployment: ${response.status}`);
  }

  const data = await response.json();
  return data as VercelDeployment;
}

// ============================================================================
// Token Management
// ============================================================================

/**
 * Revoke an access token.
 * Note: Vercel doesn't have a standard token revocation endpoint like GitHub.
 * The token will expire naturally or can be revoked via the Vercel dashboard.
 * This function is a no-op but included for API consistency.
 */
export async function revokeToken(
  _accessToken: string,
  logger: SystemLogger,
): Promise<boolean> {
  logger.info('Vercel token revocation requested - tokens expire naturally or via dashboard');
  // Vercel doesn't have a programmatic token revocation endpoint
  // Tokens are managed through the Vercel dashboard
  return true;
}

// ============================================================================
// Webhook Verification
// ============================================================================

/**
 * Verify a Vercel webhook signature.
 * https://vercel.com/docs/observability/webhooks-overview/webhooks-api#securing-webhooks
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha1', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}
