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

-- ------------------------------------------------------------
-- Prototype Assets table
-- ------------------------------------------------------------

-- SELECT: users can view assets from prototypes they can view
drop policy if exists "Users can view files from accessible prototypes" on public.prototype_assets;
create policy "prototype_assets_select_accessible_prototypes"
on public.prototype_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_assets.prototype_id
      and (
        -- Owner can view
        p.owner_id = auth.uid()
        OR
        -- Public prototypes
        p.visibility = 'PUBLIC'
        OR
        -- Team prototypes where user is a team member
        (
          p.visibility = 'TEAM'
          and public.is_team_member(p.team_id, auth.uid())
        )
      )
  )
);

-- INSERT: users can insert assets to prototypes they can update
drop policy if exists "Only prototype owners can insert files" on public.prototype_assets;
create policy "prototype_assets_insert_updatable_prototypes"
on public.prototype_assets
for insert
to authenticated
with check (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_assets.prototype_id
      and (
        -- Owner can insert
        p.owner_id = auth.uid()
        OR
        -- Team members can insert if visibility is TEAM
        (
          p.visibility = 'TEAM'
          and public.is_team_member(p.team_id, auth.uid())
        )
      )
  )
);

-- UPDATE: users can update assets from prototypes they can update
drop policy if exists "Only prototype owners can update files" on public.prototype_assets;
create policy "prototype_assets_update_updatable_prototypes"
on public.prototype_assets
for update
to authenticated
using (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_assets.prototype_id
      and (
        -- Owner can update
        p.owner_id = auth.uid()
        OR
        -- Team members can update if visibility is TEAM
        (
          p.visibility = 'TEAM'
          and public.is_team_member(p.team_id, auth.uid())
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_assets.prototype_id
      and (
        -- Owner can update
        p.owner_id = auth.uid()
        OR
        -- Team members can update if visibility is TEAM
        (
          p.visibility = 'TEAM'
          and public.is_team_member(p.team_id, auth.uid())
        )
      )
  )
);

-- DELETE: users can delete assets from prototypes they can update
drop policy if exists "Only prototype owners can delete files" on public.prototype_assets;
create policy "prototype_assets_delete_updatable_prototypes"
on public.prototype_assets
for delete
to authenticated
using (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_assets.prototype_id
      and (
        -- Owner can delete
        p.owner_id = auth.uid()
        OR
        -- Team members can delete if visibility is TEAM
        (
          p.visibility = 'TEAM'
          and public.is_team_member(p.team_id, auth.uid())
        )
      )
  )
);

commit;
