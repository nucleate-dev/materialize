-- Add nullable GitHub repository metadata columns to prototype_source_repositories
-- Match the columns/types from prototype_github_repositories (but keep them nullable).

alter table if exists public.prototype_source_repositories
  add column if not exists installation_id bigint,
  add column if not exists account_login text,
  add column if not exists account_type text,
  add column if not exists owner_login text,
  add column if not exists repo_name text,
  add column if not exists full_name text,
  add column if not exists html_url text,
  add column if not exists default_branch text,
  add column if not exists is_private boolean,
  add column if not exists is_archived boolean;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'prototype_source_repositories'
      and constraint_name = 'prototype_source_repositories_account_type_check'
  ) then
    alter table public.prototype_source_repositories
      add constraint prototype_source_repositories_account_type_check
      check (account_type is null or account_type in ('User', 'Organization'));
  end if;
end $$;
