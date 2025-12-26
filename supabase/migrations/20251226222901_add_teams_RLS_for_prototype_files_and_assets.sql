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