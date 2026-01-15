-- Vercel Integration Tables for team-level Vercel connections
--
-- SECURITY ARCHITECTURE:
-- Tokens are stored in a separate table (vercel_integration_tokens) with NO RLS policies.
-- This ensures that regular users can NEVER access encrypted tokens, even with RLS bypass attempts.
-- Only the service role (backend with SUPABASE_SERVICE_ROLE_KEY) can read/write tokens.
--
-- This migration creates:
--   1. vercel_connect_sessions - tracks OAuth flow state
--   2. vercel_integrations - stores metadata (account info, team/user ID)
--   3. vercel_integration_tokens - stores encrypted tokens (NO RLS, service role only)
--   4. vercel_projects - links Vercel projects to prototypes
--   5. vercel_deployments - deployment history
--
-- RLS Policies:
--   - vercel_connect_sessions: only creator and team owner/admin can read/write
--   - vercel_integrations: team members can read, only owner/admin can write
--   - vercel_integration_tokens: NO RLS (table is completely inaccessible to regular users)
--   - vercel_projects: team members can read, owner/admin can write
--   - vercel_deployments: team members can read, owner/admin can write

begin;

-- 1) vercel_connect_sessions table
-- Tracks the state of Vercel OAuth connection flows
create table if not exists public.vercel_connect_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by_user_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('started', 'connected', 'expired', 'failed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for efficient queries
create index if not exists vercel_connect_sessions_team_id_idx
  on public.vercel_connect_sessions(team_id);
create index if not exists vercel_connect_sessions_expires_at_idx
  on public.vercel_connect_sessions(expires_at);

-- 2) vercel_integrations table
-- Stores the Vercel integration metadata for each team (1:1 mapping)
-- NOTE: Does NOT contain encrypted tokens - those are in vercel_integration_tokens
create table if not exists public.vercel_integrations (
  team_id uuid primary key references public.teams(id) on delete cascade,
  vercel_user_id text not null,
  vercel_team_id text, -- nullable: null for personal accounts
  configuration_id text not null,
  account_name text not null,
  account_type text not null check (account_type in ('user', 'team')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for configuration_id lookups (for webhook processing)
create index if not exists vercel_integrations_configuration_id_idx
  on public.vercel_integrations(configuration_id);

-- 3) vercel_integration_tokens table
-- Stores encrypted Vercel tokens separately from metadata
-- NO RLS POLICIES - this table is completely inaccessible to regular users
-- Only service role can read/write
create table if not exists public.vercel_integration_tokens (
  team_id uuid primary key references public.vercel_integrations(team_id)
    on update cascade
    on delete cascade,
  token_encrypted text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.vercel_integration_tokens is
  'Stores encrypted Vercel tokens. NO RLS - only accessible via service role. Regular users cannot access this table.';

-- 4) vercel_projects table
-- Links Vercel projects to prototypes
create table if not exists public.vercel_projects (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null references public.prototypes(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  vercel_project_id text not null,
  vercel_project_name text not null,
  production_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(prototype_id) -- one Vercel project per prototype
);

create index if not exists vercel_projects_prototype_id_idx
  on public.vercel_projects(prototype_id);
create index if not exists vercel_projects_team_id_idx
  on public.vercel_projects(team_id);
create index if not exists vercel_projects_vercel_project_id_idx
  on public.vercel_projects(vercel_project_id);

-- 5) vercel_deployments table
-- Tracks deployment history
create table if not exists public.vercel_deployments (
  id uuid primary key default gen_random_uuid(),
  vercel_project_id uuid not null references public.vercel_projects(id) on delete cascade,
  prototype_id uuid not null references public.prototypes(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  vercel_deployment_id text not null,
  vercel_deployment_url text,
  status text not null check (status in ('queued', 'building', 'ready', 'error', 'canceled')),
  git_ref text, -- branch or commit SHA
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vercel_deployments_vercel_project_id_idx
  on public.vercel_deployments(vercel_project_id);
create index if not exists vercel_deployments_prototype_id_idx
  on public.vercel_deployments(prototype_id);
create index if not exists vercel_deployments_team_id_idx
  on public.vercel_deployments(team_id);
create index if not exists vercel_deployments_vercel_deployment_id_idx
  on public.vercel_deployments(vercel_deployment_id);
create index if not exists vercel_deployments_status_idx
  on public.vercel_deployments(status);

-- 6) Triggers to auto-update updated_at timestamps
create or replace function public.update_vercel_connect_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_vercel_integrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_vercel_integration_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_vercel_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_vercel_deployments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_update_vercel_connect_sessions_updated_at
  on public.vercel_connect_sessions;
create trigger trg_update_vercel_connect_sessions_updated_at
before update on public.vercel_connect_sessions
for each row
execute function public.update_vercel_connect_sessions_updated_at();

drop trigger if exists trg_update_vercel_integrations_updated_at
  on public.vercel_integrations;
create trigger trg_update_vercel_integrations_updated_at
before update on public.vercel_integrations
for each row
execute function public.update_vercel_integrations_updated_at();

drop trigger if exists trg_update_vercel_integration_tokens_updated_at
  on public.vercel_integration_tokens;
create trigger trg_update_vercel_integration_tokens_updated_at
before update on public.vercel_integration_tokens
for each row
execute function public.update_vercel_integration_tokens_updated_at();

drop trigger if exists trg_update_vercel_projects_updated_at
  on public.vercel_projects;
create trigger trg_update_vercel_projects_updated_at
before update on public.vercel_projects
for each row
execute function public.update_vercel_projects_updated_at();

drop trigger if exists trg_update_vercel_deployments_updated_at
  on public.vercel_deployments;
create trigger trg_update_vercel_deployments_updated_at
before update on public.vercel_deployments
for each row
execute function public.update_vercel_deployments_updated_at();

revoke all on function public.update_vercel_connect_sessions_updated_at() from public;
revoke all on function public.update_vercel_integrations_updated_at() from public;
revoke all on function public.update_vercel_integration_tokens_updated_at() from public;
revoke all on function public.update_vercel_projects_updated_at() from public;
revoke all on function public.update_vercel_deployments_updated_at() from public;

-- 7) Enable RLS on tables that need it
alter table public.vercel_connect_sessions enable row level security;
alter table public.vercel_integrations enable row level security;
alter table public.vercel_projects enable row level security;
alter table public.vercel_deployments enable row level security;

-- CRITICAL: vercel_integration_tokens has NO RLS policies at all
-- This means:
-- - Regular users (authenticated) CANNOT access this table
-- - Service role BYPASSES RLS and CAN access this table
-- - This is the most secure approach - tokens are completely isolated
alter table public.vercel_integration_tokens enable row level security;
-- Note: No policies created = no one can access except service_role

-- ============================================================
-- RLS POLICIES FOR vercel_connect_sessions
-- ============================================================

-- SELECT: creator can read their own sessions, or team owner/admin can read sessions for their team
drop policy if exists "vercel_connect_sessions_select" on public.vercel_connect_sessions;
create policy "vercel_connect_sessions_select"
on public.vercel_connect_sessions
for select
to authenticated
using (
  created_by_user_id = auth.uid()
  or public.is_team_owner_or_admin(vercel_connect_sessions.team_id)
);

-- INSERT: only team owner/admin can start a connect session
drop policy if exists "vercel_connect_sessions_insert" on public.vercel_connect_sessions;
create policy "vercel_connect_sessions_insert"
on public.vercel_connect_sessions
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and public.is_team_owner_or_admin(vercel_connect_sessions.team_id)
);

-- UPDATE: only team owner/admin can update sessions (backend will update status)
drop policy if exists "vercel_connect_sessions_update" on public.vercel_connect_sessions;
create policy "vercel_connect_sessions_update"
on public.vercel_connect_sessions
for update
to authenticated
using (
  public.is_team_owner_or_admin(vercel_connect_sessions.team_id)
)
with check (
  public.is_team_owner_or_admin(vercel_connect_sessions.team_id)
);

-- DELETE: only team owner/admin can delete sessions
drop policy if exists "vercel_connect_sessions_delete" on public.vercel_connect_sessions;
create policy "vercel_connect_sessions_delete"
on public.vercel_connect_sessions
for delete
to authenticated
using (
  public.is_team_owner_or_admin(vercel_connect_sessions.team_id)
);

-- ============================================================
-- RLS POLICIES FOR vercel_integrations
-- ============================================================

-- SELECT: any team member can read the integration metadata
drop policy if exists "vercel_integrations_select" on public.vercel_integrations;
create policy "vercel_integrations_select"
on public.vercel_integrations
for select
to authenticated
using (
  public.is_team_member(vercel_integrations.team_id)
);

-- INSERT: only team owner/admin can connect Vercel
drop policy if exists "vercel_integrations_insert" on public.vercel_integrations;
create policy "vercel_integrations_insert"
on public.vercel_integrations
for insert
to authenticated
with check (
  public.is_team_owner_or_admin(vercel_integrations.team_id)
);

-- UPDATE: only team owner/admin can update Vercel integration
drop policy if exists "vercel_integrations_update" on public.vercel_integrations;
create policy "vercel_integrations_update"
on public.vercel_integrations
for update
to authenticated
using (
  public.is_team_owner_or_admin(vercel_integrations.team_id)
)
with check (
  public.is_team_owner_or_admin(vercel_integrations.team_id)
);

-- DELETE: only team owner/admin can disconnect Vercel
drop policy if exists "vercel_integrations_delete" on public.vercel_integrations;
create policy "vercel_integrations_delete"
on public.vercel_integrations
for delete
to authenticated
using (
  public.is_team_owner_or_admin(vercel_integrations.team_id)
);

-- ============================================================
-- RLS POLICIES FOR vercel_projects
-- ============================================================

-- SELECT: any team member can read vercel projects
drop policy if exists "vercel_projects_select" on public.vercel_projects;
create policy "vercel_projects_select"
on public.vercel_projects
for select
to authenticated
using (
  public.is_team_member(vercel_projects.team_id)
);

-- INSERT: only team owner/admin can create vercel projects
drop policy if exists "vercel_projects_insert" on public.vercel_projects;
create policy "vercel_projects_insert"
on public.vercel_projects
for insert
to authenticated
with check (
  public.is_team_owner_or_admin(vercel_projects.team_id)
);

-- UPDATE: only team owner/admin can update vercel projects
drop policy if exists "vercel_projects_update" on public.vercel_projects;
create policy "vercel_projects_update"
on public.vercel_projects
for update
to authenticated
using (
  public.is_team_owner_or_admin(vercel_projects.team_id)
)
with check (
  public.is_team_owner_or_admin(vercel_projects.team_id)
);

-- DELETE: only team owner/admin can delete vercel projects
drop policy if exists "vercel_projects_delete" on public.vercel_projects;
create policy "vercel_projects_delete"
on public.vercel_projects
for delete
to authenticated
using (
  public.is_team_owner_or_admin(vercel_projects.team_id)
);

-- ============================================================
-- RLS POLICIES FOR vercel_deployments
-- ============================================================

-- SELECT: any team member can read deployments
drop policy if exists "vercel_deployments_select" on public.vercel_deployments;
create policy "vercel_deployments_select"
on public.vercel_deployments
for select
to authenticated
using (
  public.is_team_member(vercel_deployments.team_id)
);

-- INSERT: only team owner/admin can create deployments
drop policy if exists "vercel_deployments_insert" on public.vercel_deployments;
create policy "vercel_deployments_insert"
on public.vercel_deployments
for insert
to authenticated
with check (
  public.is_team_owner_or_admin(vercel_deployments.team_id)
);

-- UPDATE: only team owner/admin can update deployments
drop policy if exists "vercel_deployments_update" on public.vercel_deployments;
create policy "vercel_deployments_update"
on public.vercel_deployments
for update
to authenticated
using (
  public.is_team_owner_or_admin(vercel_deployments.team_id)
)
with check (
  public.is_team_owner_or_admin(vercel_deployments.team_id)
);

-- DELETE: only team owner/admin can delete deployments
drop policy if exists "vercel_deployments_delete" on public.vercel_deployments;
create policy "vercel_deployments_delete"
on public.vercel_deployments
for delete
to authenticated
using (
  public.is_team_owner_or_admin(vercel_deployments.team_id)
);

-- ============================================================
-- NO RLS POLICIES FOR vercel_integration_tokens
-- ============================================================
-- This table has RLS enabled but NO policies defined.
-- Result: Regular users cannot access it at all.
-- Service role bypasses RLS and can read/write freely.

commit;
