-- Convex Connector Tables for team-level Convex OAuth connections
--
-- SECURITY ARCHITECTURE:
-- Tokens are stored in a separate table (connectors_convex_integration_tokens) with NO RLS policies.
-- This ensures that regular users can NEVER access encrypted tokens, even with RLS bypass attempts.
-- Only the service role (backend with SUPABASE_SERVICE_ROLE_KEY) can read/write tokens.
--
-- This migration creates:
--   1. connectors_convex_integrations - stores metadata for multiple Convex connections per team
--   2. connectors_convex_integration_tokens - stores encrypted tokens (NO RLS, service role only)
--
-- RLS Policies:
--   - connectors_convex_integrations: team members can read, only owner/admin can write
--   - connectors_convex_integration_tokens: NO RLS (table is completely inaccessible to regular users)

begin;

-- 1) connectors_convex_integrations table
-- Stores Convex team integration metadata (multiple per team)
create table if not exists public.connectors_convex_integrations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  convex_team_id text not null,
  convex_team_name text,
  connected_by_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  status public.connector_status not null default 'active',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, convex_team_id)
);

-- Indexes for efficient queries
create index if not exists connectors_convex_integrations_team_id_idx
  on public.connectors_convex_integrations(team_id);
create index if not exists connectors_convex_integrations_convex_team_id_idx
  on public.connectors_convex_integrations(convex_team_id);
create index if not exists connectors_convex_integrations_status_idx
  on public.connectors_convex_integrations(status);

-- 2) connectors_convex_integration_tokens table
-- Stores encrypted Convex tokens separately from metadata
-- NO RLS POLICIES - this table is completely inaccessible to regular users
-- Only service role can read/write
create table if not exists public.connectors_convex_integration_tokens (
  integration_id uuid primary key references public.connectors_convex_integrations(id)
    on update cascade
    on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_type text,
  token_scopes text,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.connectors_convex_integration_tokens is
  'Stores encrypted Convex tokens. NO RLS - only accessible via service role. Regular users cannot access this table.';

-- 3) Triggers to auto-update updated_at timestamps
create or replace function public.update_connectors_convex_integrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_connectors_convex_integration_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_update_connectors_convex_integrations_updated_at
  on public.connectors_convex_integrations;
create trigger trg_update_connectors_convex_integrations_updated_at
before update on public.connectors_convex_integrations
for each row
execute function public.update_connectors_convex_integrations_updated_at();

drop trigger if exists trg_update_connectors_convex_integration_tokens_updated_at
  on public.connectors_convex_integration_tokens;
create trigger trg_update_connectors_convex_integration_tokens_updated_at
before update on public.connectors_convex_integration_tokens
for each row
execute function public.update_connectors_convex_integration_tokens_updated_at();

revoke all on function public.update_connectors_convex_integrations_updated_at() from public;
revoke all on function public.update_connectors_convex_integration_tokens_updated_at() from public;

-- 4) Enable RLS on tables that need it
alter table public.connectors_convex_integrations enable row level security;

-- CRITICAL: connectors_convex_integration_tokens has NO RLS policies at all
-- This means:
-- - Regular users (authenticated) CANNOT access this table
-- - Service role BYPASSES RLS and CAN access this table
-- - This is the most secure approach - tokens are completely isolated
alter table public.connectors_convex_integration_tokens enable row level security;
-- Note: No policies created = no one can access except service_role

-- ============================================================
-- RLS POLICIES FOR connectors_convex_integrations
-- ============================================================

-- SELECT: any team member can read the integration metadata
drop policy if exists "connectors_convex_integrations_select" on public.connectors_convex_integrations;
create policy "connectors_convex_integrations_select"
on public.connectors_convex_integrations
for select
to authenticated
using (
  public.is_team_member(connectors_convex_integrations.team_id)
);

-- INSERT: only team owner/admin can create integrations
drop policy if exists "connectors_convex_integrations_insert" on public.connectors_convex_integrations;
create policy "connectors_convex_integrations_insert"
on public.connectors_convex_integrations
for insert
to authenticated
with check (
  public.is_team_owner_or_admin(connectors_convex_integrations.team_id)
);

-- UPDATE: only team owner/admin can update integrations
drop policy if exists "connectors_convex_integrations_update" on public.connectors_convex_integrations;
create policy "connectors_convex_integrations_update"
on public.connectors_convex_integrations
for update
to authenticated
using (
  public.is_team_owner_or_admin(connectors_convex_integrations.team_id)
)
with check (
  public.is_team_owner_or_admin(connectors_convex_integrations.team_id)
);

-- DELETE: only team owner/admin can delete integrations
drop policy if exists "connectors_convex_integrations_delete" on public.connectors_convex_integrations;
create policy "connectors_convex_integrations_delete"
on public.connectors_convex_integrations
for delete
to authenticated
using (
  public.is_team_owner_or_admin(connectors_convex_integrations.team_id)
);

commit;
