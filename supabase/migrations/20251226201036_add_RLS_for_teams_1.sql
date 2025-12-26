-- Add RLS policy for subscriptions table to support team-based access
-- Allows users to view:
--   1. Their own personal subscriptions (user_id = auth.uid())
--   2. Subscriptions for teams they are members of (via team_id)

begin;

-- Subscriptions table
drop policy if exists "Enable users to view their own data only" on public.subscriptions;
create policy "subscriptions_select_user_or_team_member"
on public.subscriptions
for select
to authenticated
using (
  (team_id is not null and public.is_team_member(team_id, auth.uid()))
);

-- ------------------------------------------------------------
-- Prototypes table
-- ------------------------------------------------------------

-- SELECT: owner can always view, PUBLIC visible to all, TEAM visible to team members
drop policy if exists "Users can view public or own prototypes" on public.prototypes;
create policy "prototypes_select_owner_public_or_team"
on public.prototypes
for select
to anon, authenticated
using (
  -- Owner can always view
  (auth.uid() = owner_id)
  OR
  -- Public prototypes visible to everyone
  (visibility = 'PUBLIC')
  OR
  -- Team prototypes visible to team members (authenticated only)
  (
    visibility = 'TEAM'
    and auth.uid() is not null
    and public.is_team_member(team_id, auth.uid())
  )
);

-- INSERT: user must insert for themselves AND be a member of the team
drop policy if exists "Users can insert own prototypes" on public.prototypes;
create policy "prototypes_insert_owner_and_team_member"
on public.prototypes
for insert
to authenticated
with check (
  -- Must be inserting for themselves
  (auth.uid() = owner_id)
  AND
  -- Must be a member of the team
  public.is_team_member(team_id, auth.uid())
);

-- DELETE: owner can always delete, team owners/admins can delete
drop policy if exists "Users can delete own prototypes" on public.prototypes;
create policy "prototypes_delete_owner_or_team_admin"
on public.prototypes
for delete
to authenticated
using (
  -- Owner can always delete
  (auth.uid() = owner_id)
  OR
  -- Team owners/admins can delete
  exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = prototypes.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
  )
);

-- UPDATE: owner can always update, team members can update if visibility is TEAM
drop policy if exists "Users can update own prototypes" on public.prototypes;
create policy "prototypes_update_owner_or_team_member"
on public.prototypes
for update
to authenticated
using (
  -- Owner can always update
  (auth.uid() = owner_id)
  OR
  -- Team members can update if visibility is TEAM
  (
    visibility = 'TEAM'
    and public.is_team_member(team_id, auth.uid())
  )
)
with check (
  -- Same rules for the updated row
  (auth.uid() = owner_id)
  OR
  (
    visibility = 'TEAM'
    and public.is_team_member(team_id, auth.uid())
  )
);

commit;
