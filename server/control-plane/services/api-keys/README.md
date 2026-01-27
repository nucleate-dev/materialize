# API Keys Service

Provides API key management for programmatic access to Nucleate (MCP server, CI/CD, etc.).

## Database Migration

**Run this SQL in Supabase SQL Editor before deploying:**

See `schema.sql` in this directory for the full migration.

Key components:
- `api_keys` table
- RLS policies for user access
- `validate_api_key()` function for auth

After running the migration, regenerate types:
```bash
cd server/control-plane
npm run gen:supabase:types
```

## API Endpoints

### Create API Key

```
POST /api-keys/create
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "My CLI Key",
  "team_id": "uuid",
  "scopes": ["prototypes:read", "files:write"],  // optional, defaults to all
  "expires_in_days": 365  // optional
}

Response:
{
  "data": {
    "id": "uuid",
    "name": "My CLI Key",
    "key": "nuc_abc123...",  // Only shown once!
    "key_prefix": "nuc_abc123",
    "scopes": "prototypes:read,files:write",
    "expires_at": "2025-01-01T00:00:00Z",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "error": null
}
```

### List API Keys

```
GET /api-keys/list?team_id=<uuid>
Authorization: Bearer <jwt-token>

Response:
{
  "data": {
    "keys": [
      {
        "id": "uuid",
        "name": "My CLI Key",
        "key_prefix": "nuc_abc123",
        "scopes": "prototypes:read,files:write",
        "last_used_at": "2024-01-15T00:00:00Z",
        "expires_at": "2025-01-01T00:00:00Z",
        "created_at": "2024-01-01T00:00:00Z"
      }
    ]
  },
  "error": null
}
```

### Revoke API Key

```
DELETE /api-keys/:key_id
Authorization: Bearer <jwt-token>

Response:
{
  "data": {
    "success": true,
    "message": "API key revoked successfully"
  },
  "error": null
}
```

## API Key Format

```
nuc_<64 hex characters>
```

- Prefix: `nuc_` (for easy identification)
- Random: 32 bytes = 64 hex characters
- Total: 68 characters
- Storage: SHA-256 hash (never store raw key)

## Available Scopes

| Scope | Description |
|-------|-------------|
| `prototypes:read` | Read prototype metadata |
| `prototypes:write` | Create, update, delete prototypes |
| `files:read` | Read file contents |
| `files:write` | Write and delete files |
| `dev-server:control` | Start/stop dev servers |

Default: All scopes enabled

## Authentication Flow

1. Client sends `Authorization: Bearer nuc_...`
2. `validateJWTToken()` in `prototypeAuth.ts` detects `nuc_` prefix
3. Key is hashed with SHA-256
4. `validate_api_key()` RPC checks hash against database
5. If valid, returns user info and updates `last_used_at`
6. Request proceeds with user context

## Security

- Keys are hashed before storage (SHA-256)
- Raw key shown only once at creation
- Keys can be revoked immediately
- Optional expiration dates
- Scopes limit access (not yet enforced at endpoint level)
- `last_used_at` tracking for auditing
