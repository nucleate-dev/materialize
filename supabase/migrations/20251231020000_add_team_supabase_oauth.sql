begin;

create table if not exists public.team_supabase_connections (
  team_id uuid primary key references public.teams(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  organization_id text,
  organization_slug text,
  organization_name text,
  connected_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_supabase_oauth_states (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id),
  state text not null unique,
  code_verifier text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists team_supabase_oauth_states_team_id_idx
  on public.team_supabase_oauth_states (team_id);

create index if not exists team_supabase_oauth_states_expires_at_idx
  on public.team_supabase_oauth_states (expires_at);

alter table public.team_supabase_connections enable row level security;
alter table public.team_supabase_oauth_states enable row level security;

create policy "Team members with edit privileges can read supabase connections"
  on public.team_supabase_connections
  for select
  using (public.is_team_member_with_edit_privileges(team_id));

create policy "Team members with edit privileges can create supabase connections"
  on public.team_supabase_connections
  for insert
  with check (public.is_team_member_with_edit_privileges(team_id));

create policy "Team members with edit privileges can update supabase connections"
  on public.team_supabase_connections
  for update
  using (public.is_team_member_with_edit_privileges(team_id))
  with check (public.is_team_member_with_edit_privileges(team_id));

create policy "Team members with edit privileges can delete supabase connections"
  on public.team_supabase_connections
  for delete
  using (public.is_team_member_with_edit_privileges(team_id));

create policy "Team members with edit privileges can read supabase oauth states"
  on public.team_supabase_oauth_states
  for select
  using (public.is_team_member_with_edit_privileges(team_id));

create policy "Team members with edit privileges can create supabase oauth states"
  on public.team_supabase_oauth_states
  for insert
  with check (public.is_team_member_with_edit_privileges(team_id));

create policy "Team members with edit privileges can update supabase oauth states"
  on public.team_supabase_oauth_states
  for update
  using (public.is_team_member_with_edit_privileges(team_id))
  with check (public.is_team_member_with_edit_privileges(team_id));

create policy "Team members with edit privileges can delete supabase oauth states"
  on public.team_supabase_oauth_states
  for delete
  using (public.is_team_member_with_edit_privileges(team_id));

commit;
