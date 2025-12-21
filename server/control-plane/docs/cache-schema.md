# Control Plane Cache Schema

This document summarizes how the control plane uses Redis/Valkey to track the
state of prototype builds based on
`server/control-plane/utils/cacheInteractionUtils.ts`,
`server/control-plane/services/dispatcher/handlers/handleDispatch.ts`, and the
development helpers in `InternalCacheManagementService`.

## Naming Conventions

- **Prototype scoped keys** begin with `proto:{prototypeId}`.
- **Build scoped keys** begin with `active_build:{buildId}`.
- **Build identifiers** follow the pattern
  `build_{prototypeId}_{timestamp}_{randomSuffix}` (`setNewBuildCacheData`).

## Prototype Scoped Keys

| Key | Type | Purpose |
| --- | ---- | ------- |
| `proto:{prototypeId}:current` | String | Points to the build ID that should be treated as the current dev server for a prototype. Read first in `handleDispatch` to decide whether to reuse an existing build or create a new one. |
| `proto:{prototypeId}:builds` | Sorted Set | Tracks every build ever created for that prototype. The score is the Unix timestamp that represents the last time the build was touched. Updated via `ZADD` whenever a build transitions to `stable` and used by cleanup jobs to find idle builds. |

### Current Pointer Workflow

1. `handleDispatch` looks up `proto:{id}:current`.  
2. If a build exists, it loads `active_build:{buildId}` for details.  
3. `setNewBuildCacheData` updates the `current` pointer whenever a new build is created.  
4. `removeBuildDataFromCache` clears the pointer when its build is deleted.

### Build History Sorted Set Workflow

1. When `setNewBuildCacheData` creates a build it immediately `ZADD`s the build ID with the creation timestamp.  
2. When dispatch finishes successfully, `handleDispatch` refreshes the score with the latest `last_touched` timestamp.  
3. `removeBuildDataFromCache` uses `ZREM` to drop a build ID from the set when it is retired.

## Build Scoped Hash

Key: `active_build:{buildId}` (Hash).  
Fields mirror the `ActiveBuild` interface and are read/written through
`hgetallAsActiveBuild` and `activeBuildToStringRecord`.

| Field | Description |
| ----- | ----------- |
| `fargate_task_arn` | ARN of the task backing this dev server. |
| `fargate_private_ip` | Internal IP address used to dispatch requests. |
| `url` | Latest viewing/tunnel URL; initialized to the static S3 render URL. |
| `status` | `BuildStatus` enum (`creating`, `updating`, `stable`, `chatting`, `cleaning`, `building`, `error`). Controls dispatch behavior (e.g., `isDispatchInProgress`). |
| `last_touched` | Unix seconds tracking activity. Bumped during dispatch success, chat orchestration, etc. |
| `terminal_tunnel_id` / `terminal_tunnel_hostname` | Identifiers for the tunnel that exposes the terminal. |
| `orchestration_token` | Token required by sandboxes to call orchestration endpoints. |
| `clean_attempts` | Counter used by cleanup routines to avoid infinite retries. |

### Lifecycle

1. **Creation** – `handleDispatch` calls `setNewBuildCacheData` which writes a
   hash with blank infrastructure fields and `status: "creating"`.
2. **Allocation** – After `IdleContainerAllocationSystemService` provisions a
   Fargate task, `handleDispatch` updates the hash with ARN/IP/tunnel/token and
   moves `status` to `"updating"`.
3. **Dispatch completion** – Successful responses from the build worker update
   `status` to `"stable"`, refresh `url`, and bump `last_touched`.
4. **Error paths** – Failures set `status: "error"` so callers know the build
   cannot be reused.
5. **Removal** – `removeBuildDataFromCache` deletes the hash and cleans up the
   prototype scoped indexes.

## Supporting Utilities

- `hgetallAsActiveBuild` converts the hash into the typed `ActiveBuild`
  structure, gracefully handling missing fields.
- `activeBuildToStringRecord` serializes `ActiveBuild` values into strings
  before storing them.
- `removeBuildDataFromCache` is a transactional helper that deletes the build
  hash, removes it from the sorted set, and clears the current pointer if
  necessary.

Together these keys create a lightweight schema that lets the dispatcher quickly
decide whether it can reuse an existing sandbox, launch a new one, or clean up
stale state.

## Development Mode Keys (`development:{prototypeId}`)

When `NODE_ENV=development` with the sandbox simulator enabled, the dispatcher
short-circuits into `handleDispatchForSandboxSimulatorFlow`. Instead of the
standard `proto:*`/`active_build:*` hierarchy it stores a simplified record:

| Field | Description |
| ----- | ----------- |
| `status` | Same `BuildStatus` enum, used to block concurrent dispatches (`isDispatchInProgress`). |
| `url` | Last known viewing URL (defaults to the static S3 URL until the dev tunnel responds). |
| `terminal_tunnel_hostname` | HTTP endpoint to reach the developer EC2 terminal (built from `DEVELOPMENT_EC2_IP`). |

Workflow:

1. `hgetallAsDevBuild` reads the hash before each dispatch to determine whether
   there is an inflight dev build.
2. Dispatcher seeds the hash with `status: "updating"`, the current `url`, and
   the dev terminal hostname before calling `/allocate` on the dev Fargate IP.
3. On success it sets `status: "stable"` and updates `url`. On failure the hash
   is left in `status: "error"` so the operator knows to intervene.

These keys are intentionally scoped outside the normal schema to avoid polluting
production cleanup logic. They can be removed safely at any time.

## Internal Cache Management Service

`server/control-plane/internal-services/InternalCacheManagementService.ts`
provides authenticated endpoints used by internal tooling to inspect and
maintain the cache:

- **`GET /internal/cache/stats`** scans all keys, classifies them by prefix
  (`active_build:*`, `proto:*:builds`, `proto:*:current`, `idle_builds:*`,
  `development:*`, other), and returns counts plus sample keys. This relies on
  the naming conventions documented above.
- **`GET /internal/cache/prototype/:id`** fetches
  `proto:{id}:current`, iterates through `active_build:*` keys that include the
  prototype ID, hydrates each hash via `hgetallAsActiveBuild`, and also returns
  the sorted-set timeline from `proto:{id}:builds`.
- **`POST /internal/cache/clear`** wipes all keys (admin emergency lever).
- **`DELETE /internal/cache/development`** and
  **`DELETE /internal/cache/development/:id`** iterate over the
  `development:*` keys (dev-mode hashes described above) and delete them while
  reporting counts/durations.

Understanding these maintenance flows is important because they assume the
schema described in this document—renaming keys requires updating the internal
service predicates to keep observability accurate.
