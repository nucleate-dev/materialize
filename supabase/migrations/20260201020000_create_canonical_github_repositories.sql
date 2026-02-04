-- Create canonical github_repositories table keyed by (github_repo_id, team_id)
-- and backfill from prototype_github_repositories / prototype_source_repositories.

begin;

create table if not exists public.github_repositories (
  github_repo_id bigint not null,
  team_id uuid not null
    references public.teams(id)
    on update cascade
    on delete cascade,
  installation_id bigint,
  account_login text,
  account_type text check (account_type in ('User', 'Organization')),
  owner_login text,
  repo_name text,
  full_name text,
  html_url text,
  default_branch text,
  is_private boolean,
  is_archived boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (github_repo_id, team_id)
);

-- Ensure prototype_* tables carry team_id for FK linking
alter table if exists public.prototype_github_repositories
  add column if not exists team_id uuid;

alter table if exists public.prototype_source_repositories
  add column if not exists team_id uuid;

-- Backfill team_id from prototypes
update public.prototype_github_repositories pgr
set team_id = p.team_id
from public.prototypes p
where pgr.team_id is null
  and p.id = pgr.prototype_id;

update public.prototype_source_repositories psr
set team_id = p.team_id
from public.prototypes p
where psr.team_id is null
  and p.id = psr.prototype_id;

-- Backfill canonical GitHub repositories from prototype_github_repositories
insert into public.github_repositories (
  github_repo_id,
  team_id,
  installation_id,
  account_login,
  account_type,
  owner_login,
  repo_name,
  full_name,
  html_url,
  default_branch,
  is_private,
  is_archived
)
select distinct
  pgr.github_repo_id,
  pgr.team_id,
  pgr.installation_id,
  pgr.account_login,
  pgr.account_type,
  pgr.owner_login,
  pgr.repo_name,
  pgr.full_name,
  pgr.html_url,
  pgr.default_branch,
  pgr.is_private,
  pgr.is_archived
from public.prototype_github_repositories pgr
where pgr.github_repo_id is not null
  and pgr.team_id is not null
on conflict (github_repo_id, team_id) do update
set installation_id = excluded.installation_id,
    account_login = excluded.account_login,
    account_type = excluded.account_type,
    owner_login = excluded.owner_login,
    repo_name = excluded.repo_name,
    full_name = excluded.full_name,
    html_url = excluded.html_url,
    default_branch = excluded.default_branch,
    is_private = excluded.is_private,
    is_archived = excluded.is_archived,
    updated_at = now();

-- Backfill canonical GitHub repositories from prototype_source_repositories
insert into public.github_repositories (
  github_repo_id,
  team_id
)
select distinct
  psr.source_repo_id,
  psr.team_id
from public.prototype_source_repositories psr
where psr.source_repo_id is not null
  and psr.team_id is not null
on conflict (github_repo_id, team_id) do nothing;

-- Link prototype_github_repositories to canonical github_repositories
alter table if exists public.prototype_github_repositories
  drop constraint if exists prototype_github_repositories_github_repo_id_fkey;

alter table if exists public.prototype_github_repositories
  add constraint prototype_github_repositories_github_repo_id_fkey
  foreign key (github_repo_id, team_id)
  references public.github_repositories(github_repo_id, team_id)
  on update cascade
  on delete cascade;

-- Link prototype_source_repositories to canonical github_repositories
alter table if exists public.prototype_source_repositories
  drop constraint if exists prototype_source_repositories_source_repo_id_fkey;

alter table if exists public.prototype_source_repositories
  add constraint prototype_source_repositories_source_repo_id_fkey
  foreign key (source_repo_id, team_id)
  references public.github_repositories(github_repo_id, team_id)
  on update cascade
  on delete cascade;

-- Trigger to auto-update updated_at timestamp (uses existing helper)
drop trigger if exists trg_update_github_repositories_updated_at
  on public.github_repositories;
create trigger trg_update_github_repositories_updated_at
before update on public.github_repositories
for each row
execute function public.update_github_repositories_updated_at();

-- Enable RLS and policies
alter table public.github_repositories enable row level security;

drop policy if exists "github_repositories_select" on public.github_repositories;
create policy "github_repositories_select"
on public.github_repositories
for select
to authenticated
using (
  public.is_team_member_with_edit_privileges(github_repositories.team_id)
);

drop policy if exists "github_repositories_insert" on public.github_repositories;
create policy "github_repositories_insert"
on public.github_repositories
for insert
to authenticated
with check (
  public.is_team_member_with_edit_privileges(github_repositories.team_id)
);

drop policy if exists "github_repositories_update" on public.github_repositories;
create policy "github_repositories_update"
on public.github_repositories
for update
to authenticated
using (
  public.is_team_member_with_edit_privileges(github_repositories.team_id)
)
with check (
  public.is_team_member_with_edit_privileges(github_repositories.team_id)
);

drop policy if exists "github_repositories_delete" on public.github_repositories;
create policy "github_repositories_delete"
on public.github_repositories
for delete
to authenticated
using (
  public.is_team_member_with_edit_privileges(github_repositories.team_id)
);

commit;
