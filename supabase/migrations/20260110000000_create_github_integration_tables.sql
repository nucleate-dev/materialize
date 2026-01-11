-- GitHub Integration Tables for team-level GitHub App connections
--
-- This migration creates:
--   1. github_connect_sessions - tracks OAuth flow state
--   2. team_github_integrations - stores team-level GitHub App installation data
--
-- RLS Policies:
--   - github_connect_sessions: only creator and team owner/admin can read/write
--   - team_github_integrations: team members can read, only owner/admin can write

begin;

-- 1) github_connect_sessions table
-- Tracks the state of GitHub OAuth connection flows
create table if not exists public.github_connect_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by_user_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('started', 'connected', 'expired', 'failed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for efficient queries
create index if not exists github_connect_sessions_team_id_idx
  on public.github_connect_sessions(team_id);
create index if not exists github_connect_sessions_expires_at_idx
  on public.github_connect_sessions(expires_at);

-- 2) team_github_integrations table
-- Stores the GitHub App installation for each team (1:1 mapping)
create table if not exists public.team_github_integrations (
  team_id uuid primary key references public.teams(id) on delete cascade,
  installation_id bigint not null,
  account_login text not null,
  account_type text not null check (account_type in ('User', 'Organization')),
  installed_by_github_user_id bigint not null,
  token_encrypted text not null,
  refresh_encrypted text,
  token_expires_at timestamptz,
  is_suspended boolean not null default false,
  suspended_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for installation_id lookups (for webhook processing)
create index if not exists team_github_integrations_installation_id_idx
  on public.team_github_integrations(installation_id);

-- 3) Triggers to auto-update updated_at timestamps
create or replace function public.update_github_connect_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_team_github_integrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_update_github_connect_sessions_updated_at
  on public.github_connect_sessions;
create trigger trg_update_github_connect_sessions_updated_at
before update on public.github_connect_sessions
for each row
execute function public.update_github_connect_sessions_updated_at();

drop trigger if exists trg_update_team_github_integrations_updated_at
  on public.team_github_integrations;
create trigger trg_update_team_github_integrations_updated_at
before update on public.team_github_integrations
for each row
execute function public.update_team_github_integrations_updated_at();

revoke all on function public.update_github_connect_sessions_updated_at() from public;
revoke all on function public.update_team_github_integrations_updated_at() from public;

-- 4) Enable RLS
alter table public.github_connect_sessions enable row level security;
alter table public.team_github_integrations enable row level security;

-- ============================================================
-- RLS POLICIES FOR github_connect_sessions
-- ============================================================

-- SELECT: creator can read their own sessions, or team owner/admin can read sessions for their team
drop policy if exists "github_connect_sessions_select" on public.github_connect_sessions;
create policy "github_connect_sessions_select"
on public.github_connect_sessions
for select
to authenticated
using (
  created_by_user_id = auth.uid()
  or public.is_team_owner_or_admin(github_connect_sessions.team_id)
);

-- INSERT: only team owner/admin can start a connect session
drop policy if exists "github_connect_sessions_insert" on public.github_connect_sessions;
create policy "github_connect_sessions_insert"
on public.github_connect_sessions
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and public.is_team_owner_or_admin(github_connect_sessions.team_id)
);

-- UPDATE: only team owner/admin can update sessions (backend will update status)
drop policy if exists "github_connect_sessions_update" on public.github_connect_sessions;
create policy "github_connect_sessions_update"
on public.github_connect_sessions
for update
to authenticated
using (
  public.is_team_owner_or_admin(github_connect_sessions.team_id)
)
with check (
  public.is_team_owner_or_admin(github_connect_sessions.team_id)
);

-- DELETE: only team owner/admin can delete sessions
drop policy if exists "github_connect_sessions_delete" on public.github_connect_sessions;
create policy "github_connect_sessions_delete"
on public.github_connect_sessions
for delete
to authenticated
using (
  public.is_team_owner_or_admin(github_connect_sessions.team_id)
);

-- ============================================================
-- RLS POLICIES FOR team_github_integrations
-- ============================================================

-- SELECT: any team member can read the integration status
drop policy if exists "team_github_integrations_select" on public.team_github_integrations;
create policy "team_github_integrations_select"
on public.team_github_integrations
for select
to authenticated
using (
  public.is_team_member(team_github_integrations.team_id)
);

-- INSERT: only team owner/admin can connect GitHub
drop policy if exists "team_github_integrations_insert" on public.team_github_integrations;
create policy "team_github_integrations_insert"
on public.team_github_integrations
for insert
to authenticated
with check (
  public.is_team_owner_or_admin(team_github_integrations.team_id)
);

-- UPDATE: only team owner/admin can update GitHub integration
drop policy if exists "team_github_integrations_update" on public.team_github_integrations;
create policy "team_github_integrations_update"
on public.team_github_integrations
for update
to authenticated
using (
  public.is_team_owner_or_admin(team_github_integrations.team_id)
)
with check (
  public.is_team_owner_or_admin(team_github_integrations.team_id)
);

-- DELETE: only team owner/admin can disconnect GitHub
drop policy if exists "team_github_integrations_delete" on public.team_github_integrations;
create policy "team_github_integrations_delete"
on public.team_github_integrations
for delete
to authenticated
using (
  public.is_team_owner_or_admin(team_github_integrations.team_id)
);

commit;
