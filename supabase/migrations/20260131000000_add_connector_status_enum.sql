-- Add connector_status enum for tracking integration connection states
-- This enum is generic and can be reused across all connector integrations

begin;

-- 1) Create the generic connector_status enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'connector_status') then
    create type public.connector_status as enum (
      'active',
      'disconnected',
      'token_expired'
    );
  end if;
end $$;

comment on type public.connector_status is
  'Status of a connector integration. Used across all connector types (Supabase, GitHub, etc.)';

-- 2) Add status column to connectors_supabase_integrations
alter table public.connectors_supabase_integrations
add column if not exists status public.connector_status not null default 'active';

-- 3) Add index for efficient filtering by status
create index if not exists connectors_supabase_integrations_status_idx
  on public.connectors_supabase_integrations(status);

commit;
