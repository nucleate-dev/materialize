-- Create prototype_sensitive_metadata table for storing sensitive metadata
-- that requires team-level access control
--
-- This migration creates:
--   1. prototype_sensitive_metadata table for sensitive prototype metadata
--   2. RLS policies that:
--      - Allow all team members to SELECT
--      - Allow users who can edit the prototype to INSERT/UPDATE/DELETE
--
-- Use case: Store sensitive information like source repository IDs that should
-- only be visible to team members, not public viewers

begin;

-- 1) Create prototype_sensitive_metadata table
create table if not exists public.prototype_sensitive_metadata (
  prototype_id uuid primary key,
  source_repo_id bigint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Foreign key to prototypes table with cascade delete
  constraint prototype_sensitive_metadata_prototype_id_fkey
    foreign key (prototype_id)
    references public.prototypes(id)
    on update cascade
    on delete cascade
);

-- 2) Create index for efficient lookups
create index if not exists prototype_sensitive_metadata_prototype_id_idx
  on public.prototype_sensitive_metadata(prototype_id);

-- 3) Trigger to auto-update updated_at timestamp
create or replace function public.update_prototype_sensitive_metadata_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_update_prototype_sensitive_metadata_updated_at
  on public.prototype_sensitive_metadata;
create trigger trg_update_prototype_sensitive_metadata_updated_at
before update on public.prototype_sensitive_metadata
for each row
execute function public.update_prototype_sensitive_metadata_updated_at();

revoke all on function public.update_prototype_sensitive_metadata_updated_at() from public;

-- 4) Enable RLS
alter table public.prototype_sensitive_metadata enable row level security;

-- ============================================================
-- RLS POLICIES FOR prototype_sensitive_metadata
-- ============================================================

-- Helper function to get the team_id for a prototype
-- This is used in the SELECT policy to check if the user is a team member
create or replace function public.get_prototype_team_id(p_prototype_id uuid)
returns uuid
language sql
stable
as $$
  select team_id
  from public.prototypes
  where id = p_prototype_id
  limit 1;
$$;

revoke all on function public.get_prototype_team_id(uuid) from public;
grant execute on function public.get_prototype_team_id(uuid) to authenticated;

-- SELECT: All team members can read sensitive metadata for prototypes owned by their team
drop policy if exists "prototype_sensitive_metadata_select" on public.prototype_sensitive_metadata;
create policy "prototype_sensitive_metadata_select"
on public.prototype_sensitive_metadata
for select
to authenticated
using (
  public.is_team_member(
    public.get_prototype_team_id(prototype_sensitive_metadata.prototype_id)
  )
);

-- INSERT: Only users who can edit the prototype can insert sensitive metadata
drop policy if exists "prototype_sensitive_metadata_insert" on public.prototype_sensitive_metadata;
create policy "prototype_sensitive_metadata_insert"
on public.prototype_sensitive_metadata
for insert
to authenticated
with check (
  public.can_edit_prototype(prototype_sensitive_metadata.prototype_id)
);

-- UPDATE: Only users who can edit the prototype can update sensitive metadata
drop policy if exists "prototype_sensitive_metadata_update" on public.prototype_sensitive_metadata;
create policy "prototype_sensitive_metadata_update"
on public.prototype_sensitive_metadata
for update
to authenticated
using (
  public.can_edit_prototype(prototype_sensitive_metadata.prototype_id)
)
with check (
  public.can_edit_prototype(prototype_sensitive_metadata.prototype_id)
);

-- DELETE: Only users who can edit the prototype can delete sensitive metadata
drop policy if exists "prototype_sensitive_metadata_delete" on public.prototype_sensitive_metadata;
create policy "prototype_sensitive_metadata_delete"
on public.prototype_sensitive_metadata
for delete
to authenticated
using (
  public.can_edit_prototype(prototype_sensitive_metadata.prototype_id)
);

commit;
