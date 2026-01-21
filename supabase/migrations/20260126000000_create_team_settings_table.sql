begin;

-- 1) Enumerations for team settings keys and values
do $$
begin
  if not exists (select 1 from pg_type where typname = 'team_setting_key') then
    create type public.team_setting_key as enum ('block_public_prototypes');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'team_setting_value') then
    create type public.team_setting_value as enum ('team_setting_generic_value_true', 'team_setting_generic_value_false');
  end if;
end $$;

-- 2) team_settings table that scopes each setting to a team
create table if not exists public.team_settings (
  team_id uuid not null
    references public.teams(id)
      on update cascade
      on delete cascade,
  setting_key public.team_setting_key not null,
  setting_value public.team_setting_value not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_settings_pkey primary key (team_id, setting_key)
);

-- 3) Trigger to keep updated_at fresh
create or replace function public.update_team_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_update_team_settings_updated_at
  on public.team_settings;
create trigger trg_update_team_settings_updated_at
before update on public.team_settings
for each row
execute function public.update_team_settings_updated_at();

revoke all on function public.update_team_settings_updated_at() from public;

-- 4) Enable RLS
alter table public.team_settings enable row level security;

-- 5) Policies
-- Allow any team member to read the settings for their team
drop policy if exists "team_settings_select" on public.team_settings;
create policy "team_settings_select"
on public.team_settings
for select
to authenticated
using (
  public.is_team_member(team_settings.team_id)
);

-- Only team owners or admins can insert new settings rows
drop policy if exists "team_settings_insert" on public.team_settings;
create policy "team_settings_insert"
on public.team_settings
for insert
to authenticated
with check (
  public.is_team_owner_or_admin(team_settings.team_id)
);

-- Only team owners or admins can update settings rows
drop policy if exists "team_settings_update" on public.team_settings;
create policy "team_settings_update"
on public.team_settings
for update
to authenticated
using (
  public.is_team_owner_or_admin(team_settings.team_id)
)
with check (
  public.is_team_owner_or_admin(team_settings.team_id)
);

-- Only team owners or admins can delete settings rows
drop policy if exists "team_settings_delete" on public.team_settings;
create policy "team_settings_delete"
on public.team_settings
for delete
to authenticated
using (
  public.is_team_owner_or_admin(team_settings.team_id)
);

commit;
