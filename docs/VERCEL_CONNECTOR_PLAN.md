# Deploy to Vercel Integration - Implementation Plan

## Summary

Add a "Deploy to Vercel" button in ProjectSettingsModal that allows users to deploy their prototypes to Vercel via their connected GitHub repository. This follows the exact OAuth and service patterns established by the existing GitHub integration.

## Prerequisites
- User's team has GitHub connected
- User has created a GitHub repository for the prototype
- User's team has Vercel connected (new integration)

---

## Phase 1: Database Schema

### Migration File
**Path:** `supabase/migrations/20260116000000_create_vercel_integration_tables.sql`

**Tables:**
1. `vercel_connect_sessions` - OAuth state tracking (15-min expiry)
2. `vercel_integrations` - Team-level metadata (account name, type, configuration_id)
3. `vercel_integration_tokens` - Encrypted tokens (NO RLS - service role only)
4. `vercel_projects` - Links Vercel projects to prototypes
5. `vercel_deployments` - Deployment history

**Key fields for `vercel_integrations`:**
- `team_id` (PK, FK to teams)
- `vercel_team_id` (nullable - null for personal accounts)
- `vercel_user_id`
- `configuration_id` (Vercel's integration config ID)
- `account_name`
- `account_type` ('user' | 'team')

**Security:** Follow exact pattern from `20260110000000_create_github_integration_tables.sql`:
- RLS enabled on all tables
- `vercel_integration_tokens` has NO policies (service role only)
- Team members can read metadata; owner/admin can write

---

## Phase 2: Backend Service

### 2.1 Vercel Client Utilities
**Path:** `server/control-plane/utils/vercelClient.ts`

```typescript
// Key functions:
exchangeCodeForToken(code, redirectUri, logger)
getAuthenticatedUser(accessToken, logger)
createProject(accessToken, projectName, teamId, gitRepo, logger)
createDeployment(accessToken, projectId, teamId, gitSource, logger)
getDeploymentStatus(accessToken, deploymentId, teamId, logger)
revokeToken(accessToken, logger)
```

**API Base:** `https://api.vercel.com`
**Auth:** `Authorization: Bearer <token>`
**Team access:** Append `?teamId={vercelTeamId}` for team resources

### 2.2 VercelIntegrationService
**Path:** `server/control-plane/services/vercel-integration/VercelIntegrationService.ts`

| Route | Method | Description |
|-------|--------|-------------|
| `/vercel/connect/start` | POST | Create session, return Vercel OAuth URL |
| `/vercel/oauth/callback` | GET | Exchange code, store encrypted token |
| `/vercel/status` | GET | Get team's Vercel connection status |
| `/vercel/disconnect` | POST | Revoke token, delete integration |
| `/vercel/project/create` | POST | Create Vercel project linked to GitHub repo |
| `/vercel/deploy` | POST | Trigger deployment from GitHub |
| `/vercel/deployments` | GET | List deployments for prototype |
| `/vercel/webhooks` | POST | Handle deployment status webhooks |

### 2.3 OAuth Flow
1. `POST /vercel/connect/start` → Creates session, returns `https://vercel.com/integrations/{slug}/new?state={sessionId}`
2. User authorizes → Vercel redirects to callback with `code`, `teamId`, `configurationId`
3. `GET /vercel/oauth/callback` → `POST https://api.vercel.com/v2/oauth/access_token` (x-www-form-urlencoded)
4. Encrypt token, store in `vercel_integration_tokens`
5. Redirect to dashboard with success

---

## Phase 3: API Types

**Path:** `server/control-plane/types/PublicAPITypes.ts`

Add types for:
- `VercelConnectStartRequestBody/SuccessResponse`
- `VercelOAuthCallbackQuery`
- `VercelStatusQuery/SuccessResponse`
- `VercelDisconnectRequestBody/SuccessResponse`
- `VercelProjectCreateRequestBody/SuccessResponse`
- `VercelDeployRequestBody/SuccessResponse`
- `VercelDeploymentsQuery/SuccessResponse`

---

## Phase 4: Environment Variables

```env
# Add to control-plane .env
VERCEL_INTEGRATION_CLIENT_ID=xxx
VERCEL_INTEGRATION_CLIENT_SECRET=xxx
VERCEL_INTEGRATION_SLUG=nucleate
VERCEL_WEBHOOK_SECRET=xxx
```

**Note:** Reuse existing `GITHUB_TOKEN_ENCRYPTION_KEY` for token encryption (same encryptionUtils.ts)

---

## Phase 5: Frontend - ProjectSettingsModal

**Path:** `web-application/src/components/prototype-editor/ProjectSettingsModal.tsx`

### 5.1 Add Tab Type
```typescript
export type ProjectSettingsTab = "details" | "deploy" | "share" | "environment" | "github" | "vercel";
```

### 5.2 Add Props
```typescript
isVercelIntegrationEnabled?: boolean;
vercelIntegration?: { connected: boolean; loading: boolean };
vercelProject?: { project_id: string | null; project_name: string | null; production_url: string | null; loading: boolean };
onCreateVercelProject?: () => void;
onDeployToVercel?: () => void;
canManageVercel?: boolean;
```

### 5.3 Add TabsTrigger (after GitHub, line ~1033)
```tsx
<TabsTrigger
  value="vercel"
  disabled={!isVercelIntegrationEnabled || !githubRepository?.html_url}
>
  {/* Vercel triangle logo SVG */}
  <span>Vercel</span>
</TabsTrigger>
```

### 5.4 TabsContent States
1. **No GitHub repo:** Warning + "Create GitHub repo first"
2. **Vercel not connected:** Warning + "Go to Team Settings"
3. **No Vercel project:** Info + "Create Vercel Project" button
4. **Project exists, no deployments:** Success + "Deploy to Vercel" button
5. **Project exists, has deployments:** Success + "Deploy to Vercel" button + deployment history list

### 5.5 Redeployment Behavior
- "Deploy to Vercel" can be clicked **multiple times** - each click creates a new immutable deployment
- Vercel automatically promotes the latest successful deployment to production
- Previous deployments remain accessible at their unique preview URLs
- Deployment history shows status (queued → building → ready/error) with timestamps

---

## Phase 6: Server Registration

**Path:** `server/control-plane/server.ts`

```typescript
import { VercelIntegrationService } from './services/vercel-integration/VercelIntegrationService.js';

// After GitHub registration (line ~273):
vercelIntegrationService = new VercelIntegrationService();
vercelIntegrationService.registerRoutes(fastify);

// Add to rawBody routes (line ~220):
routes: ["/github/webhooks", "/vercel/webhooks"],
```

---

## Deployment Flow

```
User clicks "Create Vercel Project"
  ↓
POST /vercel/project/create { prototype_id }
  ↓
Backend validates:
  - prototype.github_repo_id exists
  - team has Vercel connected
  ↓
Calls Vercel API: POST /v10/projects with gitRepository
  ↓
Stores in vercel_projects table
  ↓
User clicks "Deploy to Vercel"
  ↓
POST /vercel/deploy { prototype_id, git_ref? }
  ↓
Backend calls: POST /v13/deployments with gitSource
  ↓
Creates vercel_deployments record (status: 'queued')
  ↓
Vercel webhooks update status (building → ready/error)
```

---

## Files to Modify/Create

### Create New:
- `supabase/migrations/20260116000000_create_vercel_integration_tables.sql`
- `server/control-plane/utils/vercelClient.ts`
- `server/control-plane/services/vercel-integration/VercelIntegrationService.ts`

### Modify:
- `server/control-plane/types/PublicAPITypes.ts` - Add Vercel types
- `server/control-plane/server.ts` - Register service + rawBody route
- `web-application/src/components/prototype-editor/ProjectSettingsModal.tsx` - Add Vercel tab
- `web-application/src/app/dashboard/projects/[prototype_id]/InternalPrototypePage.tsx` - Pass Vercel props

---

## Verification

1. **OAuth Flow:** Connect Vercel in team settings, verify token stored encrypted
2. **Project Creation:** Create Vercel project, verify linked to GitHub repo
3. **Deployment:** Deploy to Vercel, verify deployment appears in Vercel dashboard
4. **Webhooks:** Verify deployment status updates via webhook
5. **Disconnect:** Disconnect Vercel, verify data cleaned up

---

## External Setup Required

1. Create Vercel Integration in Vercel Console
2. Configure Redirect URL: `{server}/vercel/oauth/callback`
3. Configure Webhook URL: `{server}/vercel/webhooks`
4. Select scopes: `deployment` (R/W), `project` (R/W), `user` (R)
5. Get client ID and secret for env vars
