-- Infrastructure Configuration Table
--
-- Stores server-level configuration as key-value pairs.
-- Uses text keys (not enums) since config keys will grow over time.
--
-- SECURITY: RLS enabled with no policies = service-role-only access.

begin;

create table if not exists public.infra_config (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

-- RLS: service-role-only access (enabled with no policies)
alter table public.infra_config enable row level security;

-- Auto-update updated_at on changes
create or replace function public.update_infra_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_update_infra_config_updated_at
  on public.infra_config;
create trigger trg_update_infra_config_updated_at
before update on public.infra_config
for each row
execute function public.update_infra_config_updated_at();

revoke all on function public.update_infra_config_updated_at() from public;

-- Seed default values
insert into public.infra_config (key, value, description)
values ('max_idle_fargate_builds', '0', 'Maximum number of pre-warmed idle Fargate containers to maintain')
on conflict (key) do nothing;

commit;
