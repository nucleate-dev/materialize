-- Add GitHub repositories table and link to prototypes
--
-- This migration creates:
--   1. github_repositories - canonical storage for GitHub repos (keyed by GitHub repo ID)
--   2. Adds github_repo_id foreign key to prototypes table
--   3. Enforces at most one prototype per GitHub repo via UNIQUE constraint
--
-- RLS Policies:
--   - github_repositories:
--     * SELECT: team members can read repos linked to prototypes they can view
--     * INSERT: service role only (no authenticated user policy)
--     * UPDATE/DELETE: service role or team owner/admin (for repos linked to their team's prototypes)

begin;

-- 1) github_repositories table
-- Canonical storage for GitHub repositories we know about, keyed by GitHub repo ID
create table if not exists public.github_repositories (
  github_repo_id bigint primary key,
  installation_id bigint not null,
  account_login text not null,
  account_type text not null check (account_type in ('User', 'Organization')),
  owner_login text not null,
  repo_name text not null,
  full_name text not null,
  html_url text not null,
  default_branch text not null,
  is_private boolean,
  is_archived boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add prototype_id column with foreign key (idempotent for re-runs)
do $$
begin
  -- Add column if it doesn't exist
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'github_repositories'
      and column_name = 'prototype_id'
  ) then
    alter table public.github_repositories
      add column prototype_id uuid null;
  end if;

  -- Add foreign key constraint if it doesn't exist
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and constraint_name = 'github_repositories_prototype_id_fkey'
  ) then
    alter table public.github_repositories
      add constraint github_repositories_prototype_id_fkey
      foreign key (prototype_id)
      references public.prototypes(id)
      on delete cascade;
  end if;
end $$;

-- Index for installation_id lookups (for querying repos by installation)
create index if not exists github_repositories_installation_id_idx
  on public.github_repositories(installation_id);

-- Index for prototype_id lookups (for finding repo by prototype)
create index if not exists github_repositories_prototype_id_idx
  on public.github_repositories(prototype_id);

-- 2) Add github_repo_id column to prototypes table
-- This links a prototype to a GitHub repository (nullable, one-to-one)
alter table public.prototypes
  add column if not exists github_repo_id bigint null
    references public.github_repositories(github_repo_id)
    on delete set null;

-- UNIQUE constraint: enforce at most one prototype per GitHub repo
-- Using partial index for efficiency (only where github_repo_id is not null)
create unique index if not exists prototypes_github_repo_id_unique_idx
  on public.prototypes(github_repo_id)
  where github_repo_id is not null;

-- Index for efficient lookups of prototypes by github_repo_id
create index if not exists prototypes_github_repo_id_idx
  on public.prototypes(github_repo_id)
  where github_repo_id is not null;

-- 3) Trigger to auto-update updated_at timestamp on github_repositories
create or replace function public.update_github_repositories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_update_github_repositories_updated_at
  on public.github_repositories;
create trigger trg_update_github_repositories_updated_at
before update on public.github_repositories
for each row
execute function public.update_github_repositories_updated_at();

revoke all on function public.update_github_repositories_updated_at() from public;

-- 4) Enable RLS on github_repositories
alter table public.github_repositories enable row level security;

-- ============================================================
-- RLS POLICIES FOR github_repositories
-- ============================================================

-- SELECT: Only users who can edit the prototype can read repo metadata (Option B: stricter privacy)
-- Even if the prototype is PUBLIC, GitHub repo metadata is only visible to users with edit access
-- This prevents exposing GitHub usernames, repo names, and other metadata to public viewers
drop policy if exists "github_repositories_select" on public.github_repositories;
create policy "github_repositories_select"
on public.github_repositories
for select
to authenticated
using (
  public.can_edit_prototype(github_repositories.prototype_id)
);

-- INSERT: Service role only (no policy for authenticated users)
-- Authenticated users cannot insert - only backend via service role
-- This prevents users from creating arbitrary repository entries

-- UPDATE: Users who can edit the prototype can update the repo metadata
drop policy if exists "github_repositories_update" on public.github_repositories;
create policy "github_repositories_update"
on public.github_repositories
for update
to authenticated
using (
  public.can_edit_prototype(github_repositories.prototype_id)
)
with check (
  public.can_edit_prototype(github_repositories.prototype_id)
);

-- DELETE: Users who can edit the prototype can delete the repo metadata
drop policy if exists "github_repositories_delete" on public.github_repositories;
create policy "github_repositories_delete"
on public.github_repositories
for delete
to authenticated
using (
  public.can_edit_prototype(github_repositories.prototype_id)
);

commit;
