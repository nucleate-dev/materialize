# GitHub Integration Implementation Summary

This document summarizes the implementation of team-level GitHub App integration for Nucleate.

## Overview

Implemented a complete team-level GitHub App integration that allows teams to connect their GitHub accounts using OAuth during installation. The integration includes:

- Backend API routes for OAuth flow management
- Encrypted token storage
- RLS-protected database tables
- Feature-flagged UI in team settings
- Webhook handling for installation lifecycle events

## Files Changed/Added

### Backend (control-plane)

#### New Files

1. **`supabase/migrations/20260110000000_create_github_integration_tables.sql`**
   - Creates `github_connect_sessions` table for OAuth flow state tracking
   - Creates `github_integrations` table for storing metadata (account info, suspension state)
   - Creates `github_integration_tokens` table for storing encrypted tokens (NO RLS policies)
   - Implements RLS policies ensuring only team owners/admins can connect/disconnect
   - Adds triggers for automatic `updated_at` timestamp management

2. **`server/control-plane/utils/encryptionUtils.ts`**
   - AES-256-GCM encryption utilities for token encryption at rest
   - Supports hex and base64 encoded master keys
   - Format: `IV:AUTH_TAG:CIPHERTEXT`
   - Requires env var: `GITHUB_TOKEN_ENCRYPTION_KEY` (32 bytes)

3. **`server/control-plane/utils/githubClient.ts`**
   - Complete GitHub API client for App integration
   - OAuth code exchange
   - User info and installation listing
   - JWT generation for App authentication
   - Installation token creation
   - Token revocation

4. **`server/control-plane/services/github-integration/GitHubIntegrationService.ts`**
   - Main service class with route handlers
   - Routes:
     * `POST /github/connect/start` - Initiate OAuth flow
     * `GET /github/oauth/callback` - Handle GitHub callback
     * `GET /github/status` - Get connection status
     * `POST /github/disconnect` - Remove connection
     * `POST /github/webhooks` - Handle GitHub webhooks

#### Modified Files

1. **`server/control-plane/types/PublicAPITypes.ts`**
   - Added TypeScript interfaces for all GitHub API endpoints
   - Request/response types for connect, status, disconnect operations

2. **`server/control-plane/server.ts`**
   - Imported `fastify-raw-body` plugin for webhook signature verification
   - Registered raw-body plugin with `global: false` (only for routes that need it)
   - Imported `GitHubIntegrationService`
   - Registered service routes with Fastify
   - Added `rawBody` field to FastifyRequest type declaration

### Frontend (web-application)

#### New Files

1. **`web-application/src/components/dashboard/TeamAndAccountSettingsDialog/GitHubIntegrationTab.tsx`**
   - GitHub integration UI component
   - Shows connection status
   - Connect/disconnect buttons with proper authorization checks
   - Handles OAuth redirect flow

#### Modified Files

1. **`web-application/src/components/dashboard/TeamAndAccountSettingsDialog/index.tsx`**
   - Added `github` tab type
   - Imported `GitHubIntegrationTab`
   - Added GitHub tab to Team section (feature-flagged)
   - Added rendering logic for GitHub tab

2. **`web-application/src/components/dashboard/Sidebar/index.tsx`**
   - Added `useEffect` to detect `githubConnected` query parameter
   - Auto-opens settings dialog with GitHub tab after OAuth redirect
   - Cleans up URL parameters after handling redirect

## Environment Variables Required

### Backend (control-plane)

Add these to `server/control-plane/.env`:

```bash
# GitHub App Configuration
GITHUB_APP_ID=your_app_id
GITHUB_APP_CLIENT_ID=your_client_id
GITHUB_APP_CLIENT_SECRET=your_client_secret
GITHUB_APP_PRIVATE_KEY_B64=base64_encoded_pem_private_key
GITHUB_APP_WEBHOOK_SECRET=your_webhook_secret
GITHUB_APP_SLUG=your-app-slug

# Token Encryption (generate with: openssl rand -hex 32)
GITHUB_TOKEN_ENCRYPTION_KEY=64_character_hex_string

# Base URLs (should already exist)
SITE_BASE_URL=https://app.nucleate.dev
SITE_BASE_API_URL=https://api.nucleate.dev
```

### Frontend (web-application)

Already exists or should exist:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.nucleate.dev
```

## GitHub App Configuration

Configure your GitHub App with these settings:

### 1. OAuth Settings

- ✅ **Enable "Request user authorization (OAuth) during installation"**
  - This is CRITICAL - it allows the OAuth callback URL to be used instead of a setup URL
- **User authorization callback URL**: `https://api.nucleate.dev/github/oauth/callback`

### 2. Webhook Settings

- **Webhook URL**: `https://api.nucleate.dev/github/webhooks`
- **Webhook secret**: (use the value from `GITHUB_APP_WEBHOOK_SECRET`)

### 3. Permissions

Suggested permissions (adjust based on your needs):

- **Repository permissions**:
  - Contents: Read & write
  - Metadata: Read-only
  - Pull requests: Read & write

- **Organization permissions**:
  - Members: Read-only

### 4. Subscribe to Events

- ✅ Installation
- ✅ Installation repositories
- ✅ Repository

## Setup Instructions

### 1. Install Required Dependencies

Install the `fastify-raw-body` plugin for webhook signature verification:

```bash
cd server/control-plane
npm install fastify-raw-body
```

### 2. Apply Database Migration

```bash
cd supabase
npx supabase migration up
```

### 3. Regenerate TypeScript Types

After applying the migration, regenerate Supabase types:

```bash
cd supabase
npx supabase gen types typescript --local > path/to/types/supabase.ts
```

Or for remote:

```bash
npx supabase gen types typescript --project-id <project-ref> > path/to/types/supabase.ts
```

### 4. Configure Environment Variables

1. Create your GitHub App at https://github.com/organizations/nucleatedev/settings/apps
2. Copy all required credentials to `.env` files
3. Generate encryption key: `openssl rand -hex 32`
4. Encode private key: `base64 -i path/to/private-key.pem`

### 5. Deploy Backend

Deploy the control-plane service with the new environment variables.

### 6. Test the Integration

1. Navigate to Team Settings in the web app
2. Click on the "GitHub" tab (should appear under Team section)
3. Click "Connect GitHub"
4. Complete OAuth flow
5. Verify connection status appears
6. Test disconnect functionality

## Security Features

### 1. Token Encryption & Client Protection

- All GitHub tokens stored encrypted at rest using AES-256-GCM
- Each encrypted value includes unique IV and authentication tag
- Master key stored in environment variable, never in database
- **Encrypted tokens are NEVER exposed to clients** (even in encrypted form)
  - Tokens stored in separate `github_integration_tokens` table with NO RLS policies
  - Only service role (backend) can read/write encrypted tokens
  - Clients query `github_integrations` which only contains metadata
  - This prevents encrypted tokens from being cached/logged on client devices

### 2. Row-Level Security (RLS)

- **Metadata table** (`github_integrations`):
  - Team members can SELECT (read metadata only)
  - Only INSERT/UPDATE/DELETE allowed for owners/admins
  - Does NOT contain any token fields
- **Tokens table** (`github_integration_tokens`):
  - RLS enabled but NO policies defined
  - Result: Regular users cannot access it at all
  - Service role bypasses RLS and can read/write
  - Foreign key cascade from `github_integrations`

### 3. OAuth Flow Security

- Connect sessions expire after 15 minutes
- State parameter prevents CSRF attacks
- Sessions can only be used once
- Installation ID validation prevents unauthorized access

### 4. Webhook Security

- HMAC SHA-256 signature verification
- Rejects webhooks with invalid signatures
- Idempotent event handling

## API Endpoints

### POST /github/connect/start

Initiates GitHub connection flow.

**Auth**: Required (team owner/admin)

**Request**:
```json
{
  "teamId": "uuid"
}
```

**Response**:
```json
{
  "data": {
    "installUrl": "https://github.com/apps/<slug>/...",
    "connectSessionId": "uuid"
  },
  "error": null
}
```

### GET /github/oauth/callback

Handles GitHub OAuth callback. User is redirected here by GitHub after authorizing.

**Query Params**:
- `code`: OAuth authorization code
- `state`: Connect session ID
- `installation_id`: (optional) GitHub installation ID

**Response**: 302 redirect to settings page with success/error status

### GET /github/status

Gets GitHub integration status for a team.

**Auth**: Required (team member)

**Query Params**:
- `teamId`: Team UUID

**Response**:
```json
{
  "data": {
    "connected": true,
    "account_login": "username",
    "account_type": "User",
    "connected_at": "2025-01-10T00:00:00Z",
    "installation_id": 12345,
    "is_suspended": false,
    "suspended_at": null
  },
  "error": null
}
```

### POST /github/disconnect

Disconnects GitHub integration for a team.

**Auth**: Required (team owner/admin)

**Request**:
```json
{
  "teamId": "uuid"
}
```

**Response**:
```json
{
  "data": {
    "success": true,
    "message": "GitHub integration disconnected successfully"
  },
  "error": null
}
```

### POST /github/webhooks

Handles GitHub App webhook events.

**Headers**:
- `X-Hub-Signature-256`: HMAC signature
- `X-GitHub-Event`: Event type

**Events Handled**:
- `installation`:
  - `deleted`: Permanently removes the integration from the database
  - `suspend`: Marks integration as suspended (sets `is_suspended = true`)
  - `unsuspend`: Clears suspension flag (sets `is_suspended = false`), automatically restoring access
- `installation_repositories` (added/removed)
- `repository` (renamed/transferred)

## Database Schema

### github_connect_sessions

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams |
| created_by_user_id | uuid | FK to users |
| status | text | started/connected/expired/failed |
| expires_at | timestamptz | Session expiration |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

### github_integrations

**Metadata table** (contains NO token fields, safe for client access with RLS):

| Column | Type | Description |
|--------|------|-------------|
| team_id | uuid | Primary key, FK to teams |
| installation_id | bigint | GitHub installation ID |
| account_login | text | GitHub username/org |
| account_type | text | User or Organization |
| installed_by_github_user_id | bigint | GitHub user ID |
| is_suspended | boolean | Suspension status (default false) |
| suspended_at | timestamptz | When suspended (nullable) |
| connected_at | timestamptz | Connection timestamp |
| updated_at | timestamptz | Last update timestamp |

**RLS**: Team members can SELECT, only owners/admins can INSERT/UPDATE/DELETE

### github_integration_tokens

**Tokens table** (NO RLS policies, only service role can access):

| Column | Type | Description |
|--------|------|-------------|
| team_id | uuid | Primary key, FK to github_integrations |
| token_encrypted | text | Encrypted access token |
| refresh_encrypted | text | Encrypted refresh token (nullable) |
| token_expires_at | timestamptz | Token expiration (nullable) |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

**CRITICAL SECURITY**: This table has RLS enabled but NO policies defined. Regular users cannot access it. Only service role can read/write. Foreign key CASCADE on update and delete.

## Troubleshooting

### TypeScript Errors After Implementation

This is expected! The errors occur because Supabase types haven't been regenerated yet. Follow these steps:

1. Apply the migration: `npx supabase migration up`
2. Regenerate types (see Setup Instructions above)
3. Run `npm run typecheck` again - errors should be gone

### "Invalid signature" on Webhook

1. Verify `GITHUB_APP_WEBHOOK_SECRET` matches GitHub App settings
2. Ensure `fastify-raw-body` plugin is installed: `npm install fastify-raw-body`
3. Check that the plugin is registered in `server.ts` before service registration
4. Verify route has `config: { rawBody: true }` in route options
5. Ensure webhook URL is correct: `https://api.nucleate.dev/github/webhooks`

**Critical**: The webhook signature verification requires the exact raw bytes GitHub sent. Using `JSON.stringify(request.body)` will never match because JSON re-stringification doesn't preserve the original formatting.

### "Installation not found" During OAuth

1. Verify the GitHub App is installed for the user/org
2. Check that `installation_id` query param is being passed correctly
3. Ensure user has access to the installation

### Encryption Key Issues

1. Generate a new key: `openssl rand -hex 32`
2. Verify it's exactly 64 hex characters
3. No spaces or newlines in the environment variable

## Future Enhancements

Potential improvements for future iterations:

1. **Repository Selection UI**: Show which repositories are accessible
2. **Refresh Token Support**: Implement token refresh before expiration
3. **Installation Transfer**: Handle when installations move between accounts
4. **Multiple Installations**: Support teams connecting multiple GitHub accounts
5. **Audit Logging**: Track all connect/disconnect actions
6. **Rate Limit Handling**: Graceful handling of GitHub API rate limits

## Notes

- One team can have at most ONE GitHub App installation connected
- Tokens are stored in a separate table (`github_integration_tokens`) completely isolated from client access
- Tokens are never exposed to the client (even in encrypted form)
- Service uses user access tokens (not installation tokens) for most operations
- Webhook events are processed asynchronously and are idempotent
- RLS policies ensure service role can always bypass for internal operations
- Foreign key cascades ensure deleting `github_integrations` also deletes associated tokens
