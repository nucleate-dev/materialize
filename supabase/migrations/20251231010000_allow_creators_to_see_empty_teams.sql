begin;

-- ------------------------------------------------------------
-- Add helper function to check if a team has no members yet
-- This is used for bootstrap: allow team creator to see the team
-- they just created so they can add themselves as the first member
-- ------------------------------------------------------------
create or replace function public.is_team_empty(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = p_team_id
  );
$$;

revoke all on function public.is_team_empty(uuid) from public;
grant execute on function public.is_team_empty(uuid) to authenticated;

-- ------------------------------------------------------------
-- Update teams SELECT policy to allow creators to see empty teams
-- This enables the bootstrap flow:
-- 1. User creates team
-- 2. User can SELECT the team (because it's empty and they created it)
-- 3. User can insert themselves as first member (bootstrap check works)
-- 4. Team now has members, so creator must be a member to see it
-- ------------------------------------------------------------
drop policy if exists "teams_select_team_members" on public.teams;
create policy "teams_select_team_members"
on public.teams
for select
to authenticated
using (
  -- Normal case: user is a member of the team
  public.is_team_member(teams.id)
  OR
  -- Bootstrap case: user created the team and it has no members yet
  (teams.created_by = auth.uid() AND public.is_team_empty(teams.id))
);

commit;
