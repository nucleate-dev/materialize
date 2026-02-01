-- Rename prototype-sensitive tables to align naming with source repositories

begin;

-- Rename tables
alter table if exists public.prototype_sensitive_metadata
  rename to prototype_source_repositories;

alter table if exists public.github_repositories
  rename to prototype_github_repositories;

-- Rename constraints for clarity
alter table if exists public.prototype_source_repositories
  rename constraint prototype_sensitive_metadata_prototype_id_fkey
  to prototype_source_repositories_prototype_id_fkey;

alter table if exists public.prototype_github_repositories
  rename constraint github_repositories_prototype_id_fkey
  to prototype_github_repositories_prototype_id_fkey;

-- Rename indexes
alter index if exists prototype_sensitive_metadata_prototype_id_idx
  rename to prototype_source_repositories_prototype_id_idx;

alter index if exists github_repositories_installation_id_idx
  rename to prototype_github_repositories_installation_id_idx;

alter index if exists github_repositories_prototype_id_idx
  rename to prototype_github_repositories_prototype_id_idx;

commit;
