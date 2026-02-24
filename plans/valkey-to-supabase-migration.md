# Valkey Cache → Supabase Migration Plan

## Goal

Replace all Valkey (Redis) cache usage in the control-plane with Supabase tables and RPC functions. Preserve exact current product behavior, including FIFO ordering for idle containers, atomic operations, and all state machine transitions.

---

## 1. Current System Overview

### Cache Key Schema (Valkey)

| Key Pattern | Redis Type | Purpose |
|---|---|---|
| `proto:{prototypeId}:current` | STRING | Points to the current `buildId` for a prototype |
| `proto:{prototypeId}:builds` | ZSET | All build IDs for a prototype, scored by timestamp |
| `active_build:{buildId}` | HASH | Full `ActiveBuild` struct (status, fargate info, tunnel info, etc.) |
| `idle_builds:list` | LIST | FIFO queue of idle Fargate container task ARNs |
| `idle_builds:{taskArn}` | HASH | Idle container metadata (status, IP, task ARN) |
| `development:{prototypeId}` | HASH | Dev-mode-only build state (lighter version of ActiveBuild) |

### Data Types

```typescript
interface ActiveBuild {
  fargate_task_arn: string;
  fargate_private_ip: string;
  url: string;
  status: BuildStatus; // 'creating' | 'updating' | 'chatting' | 'building' | 'stable' | 'error' | 'cleaning'
  last_touched: number; // Unix epoch seconds
  terminal_tunnel_id: string;
  terminal_tunnel_hostname: string;
  orchestration_token: string;
  clean_attempts: number;
}

interface IdleBuild {
  fargate_task_arn: string;
  fargate_private_ip: string;
  status: 'ready' | 'creating';
}
```

### Files That Touch the Cache

| File | Operations |
|---|---|
| `utils/cacheInteractionUtils.ts` | Shared helpers: `hgetallAsActiveBuild`, `activeBuildToStringRecord`, `removeBuildDataFromCache`, `updateBuildTunnelInfo`, `hgetallAsDevBuild` |
| `services/dispatcher/handlers/handleDispatch.ts` | Creates new builds, updates status through dispatch lifecycle |
| `services/dispatcher/handlers/handleDispatchPrecheck.ts` | Reads current build status for polling |
| `services/idle-container-allocation-system/IdleContainerAllocationSystemService.ts` | Manages idle container FIFO queue |
| `services/cleanup/CleanupService.ts` | Scans for idle builds, cleans them up |
| `services/orchestration/handleStartChat.ts` | Sets `status='chatting'` |
| `services/orchestration/handleEndChat.ts` | Sets `status='stable'` |
| `services/orchestration/OrchestrationTokenValidationUtils.ts` | Validates orchestration tokens by reading build data |
| `services/prototype-management/handlers/handleDeletePrototype.ts` | Reads build for cleanup during deletion |
| `internal-services/InternalCacheManagementService.ts` | Admin tools: stats, clear cache, read build data |
| `internal-services/InternalCleanupServiceManagement.ts` | Admin tools: force clean builds |
| `server.ts` | Initializes GlideClient, health check via `cache.ping()` |

---

## 2. Supabase Table Design

All tables are prefixed with `cache_` and have RLS enabled (service-role-only access).

### Table: `cache_active_builds`

Replaces: `active_build:{buildId}` HASH + `proto:{prototypeId}:current` STRING + `proto:{prototypeId}:builds` ZSET

```sql
CREATE TABLE cache_active_builds (
  -- Primary key is the build_id (e.g., "build_{prototypeId}_{timestamp}_{random}")
  build_id TEXT PRIMARY KEY,

  -- Foreign key to prototypes table
  prototype_id TEXT NOT NULL,

  -- Whether this is the "current" build for the prototype
  -- Replaces the proto:{prototypeId}:current STRING key
  is_current BOOLEAN NOT NULL DEFAULT false,

  -- ActiveBuild fields
  fargate_task_arn TEXT NOT NULL DEFAULT '',
  fargate_private_ip TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'updating', 'chatting', 'building', 'stable', 'error', 'cleaning')),
  last_touched BIGINT NOT NULL, -- Unix epoch seconds
  terminal_tunnel_id TEXT NOT NULL DEFAULT '',
  terminal_tunnel_hostname TEXT NOT NULL DEFAULT '',
  orchestration_token TEXT NOT NULL DEFAULT '',
  clean_attempts INTEGER NOT NULL DEFAULT 0,

  -- Timestamps for ordering (replaces the ZSET score)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for looking up the current build by prototype_id
-- Partial unique index ensures at most one current build per prototype
CREATE UNIQUE INDEX idx_cache_active_builds_current
  ON cache_active_builds (prototype_id)
  WHERE is_current = true;

-- Index for finding builds by prototype_id (replaces ZSET range queries)
CREATE INDEX idx_cache_active_builds_prototype
  ON cache_active_builds (prototype_id, last_touched DESC);

-- Index for cleanup service scanning (replaces SCAN active_build:*)
CREATE INDEX idx_cache_active_builds_status_touched
  ON cache_active_builds (status, last_touched);

-- RLS: service-role-only access
ALTER TABLE cache_active_builds ENABLE ROW LEVEL SECURITY;
-- No RLS policies = only service role can access
```

### Table: `cache_idle_containers`

Replaces: `idle_builds:list` LIST + `idle_builds:{taskArn}` HASH

```sql
CREATE TABLE cache_idle_containers (
  -- Primary key is the Fargate task ARN
  fargate_task_arn TEXT PRIMARY KEY,

  -- IdleBuild fields
  fargate_private_ip TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'creating'
    CHECK (status IN ('ready', 'creating')),

  -- Position for FIFO ordering (monotonically increasing)
  -- Lower position = older = popped first (RPOP equivalent)
  position BIGSERIAL NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for FIFO ordering (oldest first for allocation)
CREATE INDEX idx_cache_idle_containers_position
  ON cache_idle_containers (position ASC);

-- RLS: service-role-only access
ALTER TABLE cache_idle_containers ENABLE ROW LEVEL SECURITY;
-- No RLS policies = only service role can access
```

### Table: `cache_dev_builds`

Replaces: `development:{prototypeId}` HASH

```sql
CREATE TABLE cache_dev_builds (
  -- One dev build per prototype
  prototype_id TEXT PRIMARY KEY,

  status TEXT DEFAULT NULL
    CHECK (status IS NULL OR status IN ('creating', 'updating', 'chatting', 'building', 'stable', 'error', 'cleaning')),
  url TEXT NOT NULL DEFAULT '',
  terminal_tunnel_hostname TEXT NOT NULL DEFAULT '',
  orchestration_token TEXT NOT NULL DEFAULT '',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: service-role-only access
ALTER TABLE cache_dev_builds ENABLE ROW LEVEL SECURITY;
-- No RLS policies = only service role can access
```

---

## 3. RPC Functions for Atomic Operations

### `cache_pop_oldest_idle_container` — Replaces RPOP (atomic FIFO dequeue)

```sql
-- Atomically pops the oldest idle container from the queue
-- Equivalent to Valkey RPOP idle_builds:list + DEL idle_builds:{taskArn}
CREATE OR REPLACE FUNCTION cache_pop_oldest_idle_container()
RETURNS TABLE (
  fargate_task_arn TEXT,
  fargate_private_ip TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  popped RECORD;
BEGIN
  -- SELECT ... FOR UPDATE SKIP LOCKED ensures atomicity under concurrent calls
  DELETE FROM cache_idle_containers
  WHERE fargate_task_arn = (
    SELECT c.fargate_task_arn
    FROM cache_idle_containers c
    ORDER BY c.position ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    cache_idle_containers.fargate_task_arn,
    cache_idle_containers.fargate_private_ip,
    cache_idle_containers.status
  INTO popped;

  IF popped IS NULL THEN
    RETURN;
  END IF;

  fargate_task_arn := popped.fargate_task_arn;
  fargate_private_ip := popped.fargate_private_ip;
  status := popped.status;
  RETURN NEXT;
END;
$$;
```

### `cache_pop_newest_idle_container` — Replaces LPOP (for capacity cleanup)

```sql
-- Atomically pops the newest idle container (used when trimming excess capacity)
-- Equivalent to Valkey LPOP idle_builds:list
CREATE OR REPLACE FUNCTION cache_pop_newest_idle_container()
RETURNS TABLE (
  fargate_task_arn TEXT,
  fargate_private_ip TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  popped RECORD;
BEGIN
  DELETE FROM cache_idle_containers
  WHERE fargate_task_arn = (
    SELECT c.fargate_task_arn
    FROM cache_idle_containers c
    ORDER BY c.position DESC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    cache_idle_containers.fargate_task_arn,
    cache_idle_containers.fargate_private_ip,
    cache_idle_containers.status
  INTO popped;

  IF popped IS NULL THEN
    RETURN;
  END IF;

  fargate_task_arn := popped.fargate_task_arn;
  fargate_private_ip := popped.fargate_private_ip;
  status := popped.status;
  RETURN NEXT;
END;
$$;
```

### `cache_set_current_build` — Atomic upsert of a new build as "current"

```sql
-- Atomically creates a new build and sets it as the current build for a prototype.
-- Unsets is_current on any previous current build for the same prototype.
CREATE OR REPLACE FUNCTION cache_set_current_build(
  p_build_id TEXT,
  p_prototype_id TEXT,
  p_url TEXT,
  p_status TEXT,
  p_last_touched BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Unset previous current build for this prototype
  UPDATE cache_active_builds
  SET is_current = false
  WHERE prototype_id = p_prototype_id AND is_current = true;

  -- Insert the new build as current
  INSERT INTO cache_active_builds (
    build_id, prototype_id, is_current,
    url, status, last_touched
  ) VALUES (
    p_build_id, p_prototype_id, true,
    p_url, p_status, p_last_touched
  );
END;
$$;
```

### `cache_remove_build` — Atomic removal of build data

```sql
-- Removes a build and clears the current pointer if it was the current build.
-- Replaces removeBuildDataFromCache in cacheInteractionUtils.ts
CREATE OR REPLACE FUNCTION cache_remove_build(
  p_build_id TEXT,
  p_prototype_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM cache_active_builds
  WHERE build_id = p_build_id;

  RETURN FOUND;
END;
$$;
```

### `cache_get_idle_container_count` — Replaces LLEN

```sql
CREATE OR REPLACE FUNCTION cache_get_idle_container_count()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT count(*) FROM cache_idle_containers;
$$;
```

---

## 4. Supabase Client Setup

### Service Role Client

Create a shared service-role Supabase client that all cache operations will use. This replaces the `GlideClient`.

```typescript
// server/control-plane/utils/cacheSupabaseClient.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase.js';

// Using service role key because these cache tables have RLS enabled with no policies,
// making them only accessible via the service role. This is intentional: cache state
// is internal server state that should never be directly accessible to end users.
let cacheClient: SupabaseClient<Database> | null = null;

export function getCacheClient(): SupabaseClient<Database> {
  if (!cacheClient) {
    cacheClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return cacheClient;
}
```

---

## 5. New `cacheInteractionUtils.ts` — Operation-by-Operation Mapping

This is the central file where we replace every Valkey operation with a Supabase equivalent. The function signatures stay as close to the current ones as possible to minimize downstream changes.

### Current → New Mapping

| Current Function | New Implementation |
|---|---|
| `hgetallAsActiveBuild(cache, key)` | `getActiveBuild(buildId)` — `SELECT * FROM cache_active_builds WHERE build_id = $1` |
| `activeBuildToStringRecord(build)` | No longer needed (Supabase handles serialization) |
| `removeBuildDataFromCache(cache, log2, protoId, buildId)` | `removeBuild(log2, protoId, buildId)` — calls `cache_remove_build` RPC |
| `updateBuildTunnelInfo(cache, key, ...)` | `updateBuildTunnelInfo(buildId, ...)` — `UPDATE cache_active_builds SET ... WHERE build_id = $1` |
| `hgetallAsDevBuild(cache, key)` | `getDevBuild(prototypeId)` — `SELECT * FROM cache_dev_builds WHERE prototype_id = $1` |

### New helper functions needed

| Function | SQL Equivalent |
|---|---|
| `getCurrentBuildForPrototype(prototypeId)` | `SELECT * FROM cache_active_builds WHERE prototype_id = $1 AND is_current = true` |
| `getCurrentBuildId(prototypeId)` | `SELECT build_id FROM cache_active_builds WHERE prototype_id = $1 AND is_current = true` |
| `getActiveBuild(buildId)` | `SELECT * FROM cache_active_builds WHERE build_id = $1` |
| `updateBuildStatus(buildId, status, lastTouched?)` | `UPDATE cache_active_builds SET status = $2, last_touched = $3 WHERE build_id = $1` |
| `updateBuildFields(buildId, fields)` | `UPDATE cache_active_builds SET ... WHERE build_id = $1` |
| `createNewBuild(buildId, prototypeId, data)` | Calls `cache_set_current_build` RPC |
| `removeBuild(log2, protoId, buildId)` | Calls `cache_remove_build` RPC |
| `getIdleContainerCount()` | Calls `cache_get_idle_container_count` RPC |
| `popOldestIdleContainer()` | Calls `cache_pop_oldest_idle_container` RPC |
| `popNewestIdleContainer()` | Calls `cache_pop_newest_idle_container` RPC |
| `insertIdleContainer(taskArn)` | `INSERT INTO cache_idle_containers ...` |
| `updateIdleContainerReady(taskArn, privateIp)` | `UPDATE cache_idle_containers SET status = 'ready', fargate_private_ip = $2 WHERE fargate_task_arn = $1` |
| `deleteIdleContainer(taskArn)` | `DELETE FROM cache_idle_containers WHERE fargate_task_arn = $1` |
| `idleContainerExists(taskArn)` | `SELECT EXISTS(SELECT 1 FROM cache_idle_containers WHERE fargate_task_arn = $1)` |
| `upsertDevBuild(prototypeId, fields)` | `UPSERT INTO cache_dev_builds ...` |
| `getDevBuild(prototypeId)` | `SELECT * FROM cache_dev_builds WHERE prototype_id = $1` |
| `deleteDevBuild(prototypeId)` | `DELETE FROM cache_dev_builds WHERE prototype_id = $1` |
| `deleteAllDevBuilds()` | `DELETE FROM cache_dev_builds` |

---

## 6. File-by-File Migration

### Phase 1: Foundation

#### 1a. Create Supabase migration with tables + RPC functions

Create a new Supabase migration file with all three tables and all RPC functions from sections 2 and 3 above.

#### 1b. Regenerate Supabase types

Run `npx supabase gen types typescript` to update `types/supabase.ts` with the new table types.

#### 1c. Create `utils/cacheSupabaseClient.ts`

Create the shared service-role client from section 4.

#### 1d. Rewrite `utils/cacheInteractionUtils.ts`

Replace all GlideClient-based functions with Supabase equivalents from section 5. Keep the same function names and return types where possible. Change the first parameter from `cache: GlideClient` to no parameter (using the shared service-role client internally).

### Phase 2: Core Services

#### 2a. `services/dispatcher/handlers/handleDispatch.ts`

**Changes:**
- Remove `cache: GlideClient` parameter from `handleDispatchImpl`
- Replace `cache.get(CACHE_KEYS.protoCurrentBuild(...))` → `getCurrentBuildForPrototype(prototypeId)` (returns the full build, not just the ID)
- Replace `hgetallAsActiveBuild(cache, ...)` → already returned from the query above
- Replace `setNewBuildCacheData(cache, ...)` → `createNewBuild(buildId, prototypeId, data)` using the `cache_set_current_build` RPC
- Replace `cache.hset(activeBuildKey, ...)` for status updates → `updateBuildFields(buildId, { status, last_touched, ... })`
- Replace ZADD commands → no longer needed (the `last_touched` column in `cache_active_builds` serves the same ordering purpose)
- Replace `removeBuildDataFromCache(cache, ...)` → `removeBuild(log2, protoId, buildId)`

**Sandbox simulator flow (`handleDispatchForSandboxSimulatorFlow`):**
- Replace `hgetallAsDevBuild(cache, devKey)` → `getDevBuild(prototypeId)`
- Replace `cache.hset(devKey, { status, url, ... })` → `upsertDevBuild(prototypeId, { status, url, ... })`

#### 2b. `services/dispatcher/handlers/handleDispatchPrecheck.ts`

**Changes:**
- Remove `cache: GlideClient` parameter
- Replace `cache.get(CACHE_KEYS.protoCurrentBuild(...))` + `hgetallAsActiveBuild(cache, ...)` → `getCurrentBuildForPrototype(prototypeId)` (single query)
- Replace `hgetallAsDevBuild(cache, devKey)` → `getDevBuild(prototypeId)` for dev mode

#### 2c. `services/idle-container-allocation-system/IdleContainerAllocationSystemService.ts`

**Changes:**
- Remove `this.cache: GlideClient` field
- `ensureIdleCapacity()`:
  - Replace `cache.llen(...)` → `getIdleContainerCount()`
  - Replace `cache.lpop(...)` for excess cleanup → `popNewestIdleContainer()`
  - Replace `cache.del([idleKey])` → already handled by pop (pop deletes the row)
- `allocateFargateDevServer()`:
  - Replace `cache.rpop(...)` → `popOldestIdleContainer()` (returns full row, no need to then read the hash)
  - Replace `cache.del([idleKey])` → already handled by pop
  - Replace `cache.hset(activeBuildKey, ...)` → `updateBuildFields(buildId, { fargate_task_arn, ... })`
- `launchIdleContainer()`:
  - Replace `cache.hset(idleKey, { status: 'creating', ... })` + `cache.lpush(...)` → `insertIdleContainer(taskArn)`
  - Replace `cache.exists([idleKey])` → `idleContainerExists(taskArn)`
  - Replace `cache.hset(idleKey, { status: 'ready', ... })` → `updateIdleContainerReady(taskArn, privateIp)`
  - Replace `cache.del([idleKey])` → `deleteIdleContainer(taskArn)`
- `launchFargateInstanceForDispatcherDirectly()`:
  - Replace `cache.hset(activeBuildKey, ...)` → `updateBuildFields(buildId, { fargate_task_arn, ... })`
- `scopeS3PermissionsAndTerminalTunnelsForContainer()`:
  - Replace `updateBuildTunnelInfo(this.cache, ...)` → `updateBuildTunnelInfo(buildId, ...)`
- `refreshAllIdleContainers()`:
  - Replace `cache.llen(...)` → `getIdleContainerCount()`
  - Replace `cache.lpop(...)` → `popNewestIdleContainer()` in a loop
  - Replace `cache.del([idleKey])` → already handled by pop
- `hgetallAsIdleBuild()`: Delete this private method (replaced by the pop functions returning full rows)

#### 2d. `services/cleanup/CleanupService.ts`

**Changes:**
- Remove `this.cache: GlideClient` field
- `getAllIdleActiveBuildsForCleanup()`:
  - Replace `scanKeys(CACHE_PATTERNS.allActiveBuilds)` + loop of `hgetallAsActiveBuild` → Single query: `SELECT * FROM cache_active_builds WHERE status NOT IN ('cleaning', 'chatting') AND last_touched < $idle_threshold`
- `cleanupSingleBuild()`:
  - Replace `setCacheActiveBuildData(buildKey, { status: 'cleaning' })` → `updateBuildStatus(buildId, 'cleaning')`
  - Replace `removeBuildDataFromCache(cache, ...)` → `removeBuild(log2, protoId, buildId)`
  - Replace status resets (`stable`, `building`) → `updateBuildFields(buildId, { status, clean_attempts })`
- `setCacheActiveBuildData()`: Replace with `updateBuildFields()`
- `scanKeys()`: Delete this method entirely (no longer needed)
- `dispatchKillDevServerRequest()` / `terminateFargateTask()`: No changes (these don't touch cache)

#### 2e. `services/orchestration/OrchestrationTokenValidationUtils.ts`

**Changes:**
- Remove `cache: GlideClient` parameter
- Replace `cache.get(CACHE_KEYS.protoCurrentBuild(...))` + `hgetallAsActiveBuild(cache, ...)` → `getCurrentBuildForPrototype(prototypeId)` (single query, returns full build with orchestration_token)
- Replace `hgetallAsDevBuild(cache, devKey)` → `getDevBuild(prototypeId)` for dev mode

#### 2f. `services/orchestration/handleStartChat.ts`

**Changes:**
- Remove `cache: GlideClient` parameter
- Replace `hgetallAsActiveBuild / hgetallAsDevBuild` → `getActiveBuild(buildId)` / `getDevBuild(prototypeId)` for the shutdown-stage check
- Replace `cache.hset(activeBuildKey, { status: 'chatting', ... })` → `updateBuildStatus(buildId, 'chatting', currentTime)` or `upsertDevBuild(prototypeId, { status: 'chatting', ... })`

#### 2g. `services/orchestration/handleEndChat.ts`

**Changes:**
- Remove `cache: GlideClient` parameter
- Replace `cache.hset(activeBuildKey, { status: 'stable', ... })` → `updateBuildStatus(buildId, 'stable', currentTime)` or `upsertDevBuild(prototypeId, { status: 'stable', ... })`

#### 2h. `services/orchestration/handleRefreshGitHubToken.ts`, `handleGetSupabaseOAuthToken.ts`, `handleFetchGitHubSourceRepo.ts`

**Changes:**
- Remove `cache: GlideClient` parameter
- These only pass cache to `validateOrchestrationToken`, which will no longer need it

### Phase 3: Supporting Services

#### 3a. `services/prototype-management/handlers/handleDeletePrototype.ts`

**Changes:**
- Remove `cache: GlideClient` parameter from `killActiveFargateInstanceIfItExists`
- Replace `cache.get(CACHE_KEYS.protoCurrentBuild(...))` + `hgetallAsActiveBuild` → `getCurrentBuildForPrototype(prototypeId)`

#### 3b. `services/prototype-management/handlers/handleFetchViewingUrl.ts`

**Changes:**
- Update to pass updated parameters to `dispatcherService.dispatchPrecheck()` (which no longer takes a cache param)

#### 3c. `services/dispatcher/DispatcherService.ts`

**Changes:**
- Remove `private cache: GlideClient` field
- Update `dispatch()` and `dispatchPrecheck()` to not pass cache

#### 3d. `services/orchestration/OrchestrationService.ts`

**Changes:**
- Remove `private cache: GlideClient` field
- Update all handler methods to not pass cache

### Phase 4: Internal Tools

#### 4a. `internal-services/InternalCacheManagementService.ts`

**Changes:**
- Remove `this.cache: GlideClient` field
- `handleClearCache()`: Replace `cache.flushall()` → Three `DELETE FROM` statements (one per table), or a single RPC that truncates all three tables
- `handleGetCacheStats()`: Replace `scanAllKeys()` → Three `SELECT count(*)` queries
- `handleGetPrototypeBuildData()`: Replace scan + filter → `SELECT * FROM cache_active_builds WHERE prototype_id = $1 ORDER BY last_touched DESC`
- `handleClearDevelopmentCache()`: Replace scan + filter → `DELETE FROM cache_dev_builds`
- `handleClearPrototypeDevelopmentCache()`: Replace `cache.del([devKey])` → `deleteDevBuild(prototypeId)`
- Delete `scanAllKeys()` and `hgetallAsActiveBuild()` private methods

#### 4b. `internal-services/InternalCleanupServiceManagement.ts`

**Changes:**
- Remove `this.cache: GlideClient` field
- Replace `cache.get(CACHE_KEYS.protoCurrentBuild(...))` + `hgetallAsActiveBuild` → `getCurrentBuildForPrototype(prototypeId)`

### Phase 5: Server Initialization

#### 5a. `server.ts`

**Changes:**
- Remove `GlideClient.createClient(...)` initialization
- Remove `cache.ping()` from health check (replace with a lightweight Supabase query like `SELECT 1 FROM cache_active_builds LIMIT 0` or just remove the cache health check since Supabase has its own health monitoring)
- Remove `cacheClient` from all service constructors
- Initialize the shared service-role client (or let it be lazily initialized via `getCacheClient()`)
- Update `IdleContainerAllocationSystemService`, `CleanupService`, `DispatcherService`, `PrototypeManagementService`, `OrchestrationService`, `InternalCacheManagementService`, `InternalCleanupServiceManagement` constructors

### Phase 6: Cleanup

#### 6a. Remove Valkey dependencies
- Remove `@valkey/valkey-glide` from `package.json`
- Remove all `GlideClient` imports across the codebase
- Remove `CACHE_KEYS`, `CACHE_PATTERNS` from `InternalTypes.ts`
- Remove the `activeBuildToStringRecord` function (no longer needed)
- Clean up any unused type imports

---

## 7. Key Behavioral Equivalences

### FIFO Queue (Idle Containers)

**Current:** Valkey LIST with `LPUSH` (add to front) + `RPOP` (remove from back = oldest first).

**New:** `cache_idle_containers` table with a `BIGSERIAL position` column. `INSERT` adds with auto-incrementing position. `cache_pop_oldest_idle_container()` RPC uses `ORDER BY position ASC LIMIT 1 FOR UPDATE SKIP LOCKED` + `DELETE` for atomic dequeue of the oldest entry. `cache_pop_newest_idle_container()` uses `ORDER BY position DESC` for trimming excess capacity.

**Why FOR UPDATE SKIP LOCKED:** Multiple control-plane instances may concurrently try to pop an idle container. `FOR UPDATE SKIP LOCKED` prevents two instances from popping the same container (equivalent to Redis's atomic `RPOP`).

### Current Build Pointer

**Current:** Separate `proto:{prototypeId}:current` STRING key pointing to a build ID.

**New:** `is_current BOOLEAN` column on `cache_active_builds` with a partial unique index `WHERE is_current = true`. The `cache_set_current_build` RPC atomically unsets the old current and sets the new one. Querying the current build is `SELECT * FROM cache_active_builds WHERE prototype_id = $1 AND is_current = true` — a single query that returns the full build (no need for a separate GET + HGETALL).

### Build History (ZSET)

**Current:** `proto:{prototypeId}:builds` ZSET with timestamp scores, used for ordering and the internal tools build history view.

**New:** The `created_at` and `last_touched` columns on `cache_active_builds` provide the same ordering. `SELECT * FROM cache_active_builds WHERE prototype_id = $1 ORDER BY last_touched DESC` replaces `ZRANGE ... WITHSCORES`. No separate ZSET maintenance (ZADD/ZREM) is needed.

### Scanning for All Active Builds (Cleanup)

**Current:** `SCAN active_build:*` pattern match, then HGETALL each key.

**New:** `SELECT * FROM cache_active_builds WHERE status NOT IN ('cleaning', 'chatting') AND last_touched < $threshold`. Single indexed query, no scanning. More efficient.

### Atomic Status Transitions

**Current:** `cache.hset(key, { status: 'chatting' })` — Valkey HSET is atomic per field.

**New:** `UPDATE cache_active_builds SET status = 'chatting', last_touched = $now WHERE build_id = $1`. Single row UPDATE is atomic in PostgreSQL.

### Dev Mode Builds

**Current:** `development:{prototypeId}` HASH with `status`, `url`, `terminal_tunnel_hostname`, `orchestration_token`.

**New:** `cache_dev_builds` table with same fields. `UPSERT` (INSERT ... ON CONFLICT ... DO UPDATE) for writes, `SELECT` for reads.

---

## 8. Performance Considerations

| Concern | Mitigation |
|---|---|
| Supabase is slower than Valkey for simple reads | The cache data is small (< 100 rows typically). Index-backed single-row lookups are sub-millisecond within the same region. Network latency to Supabase is the main factor. |
| Cleanup scan is O(n) in Valkey | The SQL query with a WHERE clause is more efficient than SCAN + HGETALL for each key. |
| FIFO atomicity | `FOR UPDATE SKIP LOCKED` provides the same atomicity as Redis RPOP under concurrency. |
| Connection pooling | The Supabase JS client handles connection pooling internally via the REST API. No connection pool management needed. |
| Health check latency | A simple `SELECT 1` query to Supabase is comparable to `PING` latency. |

---

## 9. Migration / Rollout Strategy

1. **Deploy tables + RPCs first** (Supabase migration). No impact on running system.
2. **Deploy the code changes** in a single release. Since the Valkey cache is ephemeral (no persistent data needs to be migrated — builds are short-lived and idle containers are recreated), we can do a clean cutover:
   - All existing Valkey state will naturally expire/be cleaned up.
   - New builds will be created in Supabase.
   - The idle container pool will repopulate in Supabase within 5 minutes (the maintenance interval).
3. **After deployment:** Remove the Valkey instance from infrastructure once confirmed stable.

No dual-write or gradual migration is needed because:
- Cache data is ephemeral (builds last minutes to hours, not days)
- Idle containers are recreated on a 5-minute cycle
- A brief gap during deployment (no active cache) is equivalent to a cache flush, which is a supported operation today

---

## 10. Testing Checklist

- [ ] Create a new build (dispatch) → verify row created in `cache_active_builds` with `is_current = true`
- [ ] Dispatch precheck → verify current build is returned correctly
- [ ] Start chat → verify status transitions to `'chatting'` and `last_touched` updates
- [ ] End chat → verify status transitions to `'stable'`
- [ ] Idle container launch → verify row in `cache_idle_containers` transitions from `'creating'` to `'ready'`
- [ ] Idle container allocation → verify FIFO order (oldest container allocated first)
- [ ] Concurrent allocation → verify no two requests get the same idle container
- [ ] Cleanup service → verify idle builds are detected and cleaned up
- [ ] Cleanup with `clean_attempts` incrementing → verify retry logic works
- [ ] Prototype deletion → verify active build is cleaned up
- [ ] Orchestration token validation → verify token comparison works
- [ ] Internal tools: cache stats → verify counts are correct
- [ ] Internal tools: clear cache → verify all three tables are emptied
- [ ] Internal tools: force clean → verify build cleanup works
- [ ] Dev mode flows → verify `cache_dev_builds` CRUD works
- [ ] Multiple prototypes with current builds → verify partial unique index prevents conflicts
- [ ] Build history query → verify ordering by `last_touched`
