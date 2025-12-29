begin;

-- Update credit_grants SELECT policy to allow team members to view team grants
drop policy if exists "Users can view their own credit grants" on public.credit_grants;

create policy "Users can view their teams credit grants"
on public.credit_grants
for select
to authenticated
using (
  -- Can view team credit grants if member of that team
  public.is_team_member(team_id)
);

-- Update api_usage SELECT policy to allow team members to view team usage
drop policy if exists "Users can view their own API usage" on public.api_usage;

create policy "Users can view their teams api usage"
on public.api_usage
for select
to authenticated
using (
  -- Can view own API usage
  auth.uid() = user_id
  OR
  -- Can view team API usage if member of that team
  (team_id is not null and public.is_team_member(team_id))
);

-- Update api_usage INSERT policy to allow team members to insert team usage
drop policy if exists "Users can insert their own api usage" on public.api_usage;

create policy "Users can insert their teams API usage"
on public.api_usage
for insert
to authenticated
with check (
  -- Must be inserting own user_id
  auth.uid() = user_id
  AND
  -- Must be a member of the team (if team_id is provided)
  (team_id is null or public.is_team_member(team_id))
);

commit;
