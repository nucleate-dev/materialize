begin;

-- Ensure UUID generation is available (Supabase typically already has this)
create extension if not exists "pgcrypto";

-- 1) Role enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'team_role') then
    create type public.team_role as enum ('owner', 'admin', 'member');
  end if;
end $$;

-- 2) teams
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.users(id) on update cascade on delete restrict,

  -- If set, this marks the "personal team" for a user.
  -- UNIQUE enforces: at most one personal team per user.
  personal_owner_user_id uuid unique references public.users(id) on update cascade on delete set null
);

comment on column public.teams.personal_owner_user_id is
  'If non-null, this is the owning user for a personal team. UNIQUE enforces one personal team per user.';

-- Optional: basic index for name search (not required)
create index if not exists teams_name_idx on public.teams (name);

-- 3) team_memberships
create table if not exists public.team_memberships (
  team_id uuid not null references public.teams(id) on update cascade on delete cascade,
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  role public.team_role not null default 'member',
  created_at timestamptz not null default now(),
  invited_by uuid null references public.users(id) on update cascade on delete set null,

  primary key (team_id, user_id)
);

-- Fast “list teams for user”
create index if not exists team_memberships_user_id_idx
  on public.team_memberships (user_id);

-- Optional: fast “find admins/owners in a team”
create index if not exists team_memberships_team_role_idx
  on public.team_memberships (team_id, role);

commit;