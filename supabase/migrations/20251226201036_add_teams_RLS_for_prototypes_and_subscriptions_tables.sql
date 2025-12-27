-- Add RLS policy for subscriptions table to support team-based access
-- Allows users to view:
--   1. Their own personal subscriptions (user_id = auth.uid())
--   2. Subscriptions for teams they are members of (via team_id)

begin;

-- Helper function to check if user is a team owner or admin
create or replace function public.is_team_owner_or_admin(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = p_team_id
      and tm.user_id = p_user_id
      and tm.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_team_owner_or_admin(uuid, uuid) from public;
grant execute on function public.is_team_owner_or_admin(uuid, uuid) to authenticated;

-- Helper function to check if user can edit/delete prototype-related resources
-- Returns true if:
--   - User is the prototype owner
--   - User is a team member and prototype visibility is TEAM
--   - User is a team owner/admin (regardless of visibility)
create or replace function public.can_edit_prototype(p_prototype_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.prototypes p
    where p.id = p_prototype_id
      and (
        -- Owner can edit
        p.owner_id = p_user_id
        OR
        -- Team members can edit if visibility is TEAM
        (
          p.visibility = 'TEAM'
          and public.is_team_member(p.team_id, p_user_id)
        )
        OR
        -- Team owners/admins can always edit
        public.is_team_owner_or_admin(p.team_id, p_user_id)
      )
  );
$$;

revoke all on function public.can_edit_prototype(uuid, uuid) from public;
grant execute on function public.can_edit_prototype(uuid, uuid) to authenticated;

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
  -- Owners and admins can always view
  OR 
  (
    auth.uid() is not null
    and public.is_team_owner_or_admin(team_id, auth.uid())
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

-- DELETE: owner, team members (if TEAM visibility), or team owners/admins can delete
drop policy if exists "Users can delete own prototypes" on public.prototypes;
create policy "prototypes_delete_owner_or_team_admin"
on public.prototypes
for delete
to authenticated
using (
  owner_id = auth.uid()
  OR
  -- Team members can edit if visibility is TEAM
  (
    visibility = 'TEAM'
    and public.is_team_member(team_id, auth.uid())
  )
  OR
  -- Team owners/admins can always edit
  public.is_team_owner_or_admin(team_id, auth.uid())
);

-- UPDATE: owner can always update, team members can update if visibility is TEAM
drop policy if exists "Users can update own prototypes" on public.prototypes;
create policy "prototypes_update_owner_or_team_member"
on public.prototypes
for update
to authenticated
using (
 owner_id = auth.uid()
  OR
  -- Team members can edit if visibility is TEAM
  (
    visibility = 'TEAM'
    and public.is_team_member(team_id, auth.uid())
  )
  OR
  -- Team owners/admins can always edit
  public.is_team_owner_or_admin(team_id, auth.uid())
)
with check (
  -- Same rules for the updated row
  owner_id = auth.uid()
  OR
  -- Team members can edit if visibility is TEAM
  (
    visibility = 'TEAM'
    and public.is_team_member(team_id, auth.uid())
  )
  OR
  -- Team owners/admins can always edit
  public.is_team_owner_or_admin(team_id, auth.uid())
);

commit;
