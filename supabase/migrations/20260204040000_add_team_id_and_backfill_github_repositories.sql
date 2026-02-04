-- Fix: add team_id to github_repositories, then backfill from prototype_github_repositories.

begin;

alter table if exists public.github_repositories
  add column if not exists team_id uuid;

create unique index if not exists github_repositories_repo_team_unique_idx
  on public.github_repositories(github_repo_id, team_id);

-- Ensure legacy table has team_id so we can backfill
alter table if exists public.prototype_github_repositories
  add column if not exists team_id uuid;

update public.prototype_github_repositories pgr
set team_id = p.team_id
from public.prototypes p
where pgr.team_id is null
  and p.id = pgr.prototype_id;

-- Backfill canonical table
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

commit;
