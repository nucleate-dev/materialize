-- Add RLS policies for prototype_files and prototype_assets tables to support team-based access
-- Both tables follow the same pattern:
--   SELECT: users can view from prototypes they can view (owner, PUBLIC, or TEAM member)
--   INSERT/UPDATE: users can modify prototypes they can update (owner or TEAM member if visibility is TEAM)
--   DELETE: owner, TEAM members if visibility is TEAM, or team owners/admins can always delete
-- Note: Uses can_edit_prototype() helper function defined in earlier migration

begin;

-- ------------------------------------------------------------
-- Prototype Files table
-- ------------------------------------------------------------

-- SELECT: users can view files from prototypes they can view
drop policy if exists "Users can view files from accessible prototypes" on public.prototype_files;
create policy "prototype_files_select_accessible_prototypes"
on public.prototype_files
for select
to authenticated
using (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_files.prototype_id
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
        OR
        (
          -- Owners and admins can always view
          public.is_team_owner_or_admin(p.team_id, auth.uid())
        )
      )
  )
);

-- INSERT: users can insert files to prototypes they can update
drop policy if exists "Only prototype owners can insert files" on public.prototype_files;
create policy "prototype_files_insert_updatable_prototypes"
on public.prototype_files
for insert
to authenticated
with check (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_files.prototype_id
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

-- UPDATE: users can update files from prototypes they can update
drop policy if exists "Only prototype owners can update files" on public.prototype_files;
create policy "prototype_files_update_updatable_prototypes"
on public.prototype_files
for update
to authenticated
using (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_files.prototype_id
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
    where p.id = prototype_files.prototype_id
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

-- DELETE: owner, team members (if TEAM visibility), or team owners/admins can delete
drop policy if exists "Only prototype owners can delete files" on public.prototype_files;
create policy "prototype_files_delete_updatable_prototypes"
on public.prototype_files
for delete
to authenticated
using (
  public.can_edit_prototype(prototype_files.prototype_id, auth.uid())
);

-- ------------------------------------------------------------
-- Prototype Assets table
-- ------------------------------------------------------------

-- SELECT: users can view assets from prototypes they can view
drop policy if exists "Users can view assets from accessible prototypes" on public.prototype_assets;
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
drop policy if exists "Only prototype owners can insert assets" on public.prototype_assets;
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
drop policy if exists "Only prototype owners can update assets" on public.prototype_assets;
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

-- DELETE: owner, team members (if TEAM visibility), or team owners/admins can delete
drop policy if exists "Only prototype owners can delete assets" on public.prototype_assets;
create policy "prototype_assets_delete_updatable_prototypes"
on public.prototype_assets
for delete
to authenticated
using (
  public.can_edit_prototype(prototype_assets.prototype_id, auth.uid())
);

commit;
