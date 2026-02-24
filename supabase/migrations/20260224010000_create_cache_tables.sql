-- Cache Tables Migration: Valkey -> Supabase
--
-- SECURITY ARCHITECTURE:
-- These tables store internal server state (build orchestration, idle container management).
-- RLS is enabled with NO policies, meaning only the service role (backend with
-- SUPABASE_SERVICE_ROLE_KEY) can access these tables. Regular users cannot read or write
-- any cache data.
--
-- This migration creates:
--   1. cache_active_builds - stores active build state (replaces Valkey active_build:* hashes,
--      proto:*:current pointers, and proto:*:builds sorted sets)
--   2. cache_idle_containers - FIFO queue for pre-warmed idle Fargate containers
--      (replaces Valkey idle_builds:list + idle_builds:* hashes)
--   3. cache_dev_builds - dev-mode-only build state (replaces Valkey development:* hashes)
--
-- RPC Functions:
--   - cache_pop_oldest_idle_container: atomic FIFO dequeue (oldest first, for allocation)
--   - cache_pop_newest_idle_container: atomic dequeue (newest first, for capacity trimming)
--   - cache_set_current_build: atomically insert a new build and mark it as current
--   - cache_remove_build: atomically remove a build row
--   - cache_get_idle_container_count: count idle containers

begin;

-- ============================================================================
-- 1) cache_active_builds table
-- ============================================================================
create table if not exists public.cache_active_builds (
  -- Primary key is the build_id (format: "build_{prototypeId}_{timestamp}_{random}")
  build_id text primary key,

  -- Prototype this build belongs to
  prototype_id text not null,

  -- Whether this is the "current" build for the prototype
  -- Replaces the proto:{prototypeId}:current STRING key in Valkey
  is_current boolean not null default false,

  -- Build state fields (formerly the ActiveBuild hash in Valkey)
  fargate_task_arn text not null default '',
  fargate_private_ip text not null default '',
  url text not null default '',
  status text not null default 'creating'
    check (status in ('creating', 'updating', 'chatting', 'building', 'stable', 'error', 'cleaning')),
  last_touched bigint not null,  -- Unix epoch seconds
  terminal_tunnel_id text not null default '',
  terminal_tunnel_hostname text not null default '',
  orchestration_token text not null default '',
  clean_attempts integer not null default 0,

  created_at timestamptz not null default now()
);

-- Partial unique index: at most one current build per prototype
create unique index if not exists idx_cache_active_builds_current
  on public.cache_active_builds (prototype_id)
  where is_current = true;

-- Index for finding builds by prototype
create index if not exists idx_cache_active_builds_prototype
  on public.cache_active_builds (prototype_id, last_touched desc);

-- Index for cleanup service scanning (find idle builds by status and last_touched)
create index if not exists idx_cache_active_builds_status_touched
  on public.cache_active_builds (status, last_touched);

-- RLS: service-role-only access (enabled with no policies)
alter table public.cache_active_builds enable row level security;

-- ============================================================================
-- 2) cache_idle_containers table
-- ============================================================================
create table if not exists public.cache_idle_containers (
  -- Primary key is the Fargate task ARN
  fargate_task_arn text primary key,

  -- Idle container state
  fargate_private_ip text not null default '',
  status text not null default 'creating'
    check (status in ('ready', 'creating')),

  -- Monotonically increasing position for FIFO ordering
  -- Lower position = older = popped first during allocation (RPOP equivalent)
  position bigserial not null,

  created_at timestamptz not null default now()
);

-- Index for FIFO ordering (oldest first)
create index if not exists idx_cache_idle_containers_position
  on public.cache_idle_containers (position asc);

-- RLS: service-role-only access (enabled with no policies)
alter table public.cache_idle_containers enable row level security;

-- ============================================================================
-- 3) cache_dev_builds table
-- ============================================================================
create table if not exists public.cache_dev_builds (
  -- One dev build per prototype
  prototype_id text primary key,

  status text default null
    check (status is null or status in ('creating', 'updating', 'chatting', 'building', 'stable', 'error', 'cleaning')),
  url text not null default '',
  terminal_tunnel_hostname text not null default '',
  orchestration_token text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: service-role-only access (enabled with no policies)
alter table public.cache_dev_builds enable row level security;

-- ============================================================================
-- 4) RPC Functions
-- ============================================================================

-- Atomically pop the oldest idle container (for allocation to a prototype)
-- Equivalent to Valkey: RPOP idle_builds:list + DEL idle_builds:{taskArn}
create or replace function public.cache_pop_oldest_idle_container()
returns table (
  fargate_task_arn text,
  fargate_private_ip text,
  status text
)
language plpgsql
security definer
as $$
begin
  return query
  delete from public.cache_idle_containers
  where cache_idle_containers.fargate_task_arn = (
    select c.fargate_task_arn
    from public.cache_idle_containers c
    order by c.position asc
    limit 1
    for update skip locked
  )
  returning
    cache_idle_containers.fargate_task_arn,
    cache_idle_containers.fargate_private_ip,
    cache_idle_containers.status;
end;
$$;

-- Atomically pop the newest idle container (for capacity trimming)
-- Equivalent to Valkey: LPOP idle_builds:list
create or replace function public.cache_pop_newest_idle_container()
returns table (
  fargate_task_arn text,
  fargate_private_ip text,
  status text
)
language plpgsql
security definer
as $$
begin
  return query
  delete from public.cache_idle_containers
  where cache_idle_containers.fargate_task_arn = (
    select c.fargate_task_arn
    from public.cache_idle_containers c
    order by c.position desc
    limit 1
    for update skip locked
  )
  returning
    cache_idle_containers.fargate_task_arn,
    cache_idle_containers.fargate_private_ip,
    cache_idle_containers.status;
end;
$$;

-- Atomically create a new build and set it as current for a prototype.
-- Unsets is_current on any previous current build for the same prototype.
create or replace function public.cache_set_current_build(
  p_build_id text,
  p_prototype_id text,
  p_url text,
  p_status text,
  p_last_touched bigint
)
returns void
language plpgsql
security definer
as $$
begin
  -- Unset previous current build for this prototype
  update public.cache_active_builds
  set is_current = false
  where prototype_id = p_prototype_id and is_current = true;

  -- Insert the new build as current
  insert into public.cache_active_builds (
    build_id, prototype_id, is_current,
    url, status, last_touched
  ) values (
    p_build_id, p_prototype_id, true,
    p_url, p_status, p_last_touched
  );
end;
$$;

-- Atomically remove a build row.
-- Replaces removeBuildDataFromCache in cacheInteractionUtils.ts
create or replace function public.cache_remove_build(
  p_build_id text,
  p_prototype_id text
)
returns boolean
language plpgsql
security definer
as $$
declare
  was_deleted boolean;
begin
  delete from public.cache_active_builds
  where build_id = p_build_id;

  was_deleted := found;
  return was_deleted;
end;
$$;

-- Count idle containers. Replaces Valkey LLEN idle_builds:list
create or replace function public.cache_get_idle_container_count()
returns bigint
language sql
security definer
stable
as $$
  select count(*) from public.cache_idle_containers;
$$;

commit;
