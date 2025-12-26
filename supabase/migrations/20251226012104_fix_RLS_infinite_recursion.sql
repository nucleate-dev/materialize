-- Fix infinite recursion in team_memberships SELECT policy
-- by using a SECURITY DEFINER helper function

begin;

-- Helper function to check team membership (bypasses RLS)
create or replace function public.is_team_member(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships
    where team_id = p_team_id
      and user_id = p_user_id
  );
$$;

revoke all on function public.is_team_member(uuid, uuid) from public;
grant execute on function public.is_team_member(uuid, uuid) to authenticated;

-- Recreate the SELECT policy using the helper function
drop policy if exists "team_memberships_select_team_members" on public.team_memberships;
create policy "team_memberships_select_team_members"
on public.team_memberships
for select
to authenticated
using (
  public.is_team_member(team_memberships.team_id, auth.uid())
);

-- Also fix the teams SELECT policy to use the same helper
drop policy if exists "teams_select_team_members" on public.teams;
create policy "teams_select_team_members"
on public.teams
for select
to authenticated
using (
  public.is_team_member(teams.id, auth.uid())
);

commit;
