-- Create prototype_backends table for tracking backend providers attached to prototypes
--
-- This migration creates:
--   1. prototype_backend_type enum (currently only 'supabase', extensible for convex, custom cloud, etc.)
--   2. prototype_backends table linking prototypes to their backend providers
--   3. RLS policies that allow only users who can edit the prototype to access/modify
--
-- The columns are designed to be generalizable across backend providers:
--   - provider_project_id: The project/app ID from the backend provider
--   - provider_project_url: External URL to access the project in the provider's dashboard
--   - provider_integration_id: Reference to the integration/connection (e.g., connectors_supabase_integrations.id)
--   - metadata: JSONB for any additional provider-specific information

begin;

-- 1) Create the backend type enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'prototype_backend_type') then
    create type public.prototype_backend_type as enum ('supabase');
  end if;
end
$$;

-- 2) Create prototype_backends table
create table if not exists public.prototype_backends (
  id uuid primary key default gen_random_uuid(),
  prototype_id uuid not null,
  backend_type public.prototype_backend_type not null,

  -- Generalizable columns for any backend provider
  provider_project_id text not null,              -- e.g., Supabase project ref, Convex deployment ID
  provider_project_url text,                      -- External link to provider dashboard
  provider_integration_id uuid,                   -- Reference to team-level integration (nullable for custom backends)

  -- Flexible metadata for provider-specific info
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Foreign key to prototypes table with cascade
  constraint prototype_backends_prototype_id_fkey
    foreign key (prototype_id)
    references public.prototypes(id)
    on update cascade
    on delete cascade,

  -- Each prototype can only have one backend of each type
  constraint prototype_backends_prototype_backend_type_unique
    unique (prototype_id, backend_type)
);

-- 3) Create indexes for efficient lookups
create index if not exists prototype_backends_prototype_id_idx
  on public.prototype_backends(prototype_id);
create index if not exists prototype_backends_backend_type_idx
  on public.prototype_backends(backend_type);
create index if not exists prototype_backends_provider_project_id_idx
  on public.prototype_backends(provider_project_id);

-- 4) Trigger to auto-update updated_at timestamp
create or replace function public.update_prototype_backends_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_update_prototype_backends_updated_at
  on public.prototype_backends;
create trigger trg_update_prototype_backends_updated_at
before update on public.prototype_backends
for each row
execute function public.update_prototype_backends_updated_at();

revoke all on function public.update_prototype_backends_updated_at() from public;

-- 5) Enable RLS
alter table public.prototype_backends enable row level security;

-- ============================================================
-- RLS POLICIES FOR prototype_backends
-- Only users who can edit the prototype can access backend info
-- ============================================================

-- SELECT: Only users who can edit the prototype can view backend info
drop policy if exists "prototype_backends_select" on public.prototype_backends;
create policy "prototype_backends_select"
on public.prototype_backends
for select
to authenticated
using (
  public.can_edit_prototype(prototype_backends.prototype_id)
);

-- INSERT: Only users who can edit the prototype can add backends
drop policy if exists "prototype_backends_insert" on public.prototype_backends;
create policy "prototype_backends_insert"
on public.prototype_backends
for insert
to authenticated
with check (
  public.can_edit_prototype(prototype_backends.prototype_id)
);

-- UPDATE: Only users who can edit the prototype can update backends
drop policy if exists "prototype_backends_update" on public.prototype_backends;
create policy "prototype_backends_update"
on public.prototype_backends
for update
to authenticated
using (
  public.can_edit_prototype(prototype_backends.prototype_id)
)
with check (
  public.can_edit_prototype(prototype_backends.prototype_id)
);

-- DELETE: Only users who can edit the prototype can delete backends
drop policy if exists "prototype_backends_delete" on public.prototype_backends;
create policy "prototype_backends_delete"
on public.prototype_backends
for delete
to authenticated
using (
  public.can_edit_prototype(prototype_backends.prototype_id)
);

commit;
