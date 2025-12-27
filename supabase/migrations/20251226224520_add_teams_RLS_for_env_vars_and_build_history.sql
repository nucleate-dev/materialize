-- Add RLS policies for prototype_env_vars, prototype_env_var_secrets, and prototype_build_history
-- to support team-based access
-- All policies maintain service_role access for system operations

begin;

-- ------------------------------------------------------------
-- Prototype Env Vars table
-- ------------------------------------------------------------

-- SELECT: service_role OR users can view from prototypes they can view (owner, PUBLIC, or TEAM member)
drop policy if exists "prototype_env_vars_select_policy" on public.prototype_env_vars;
create policy "prototype_env_vars_select_policy"
on public.prototype_env_vars
for select
to public
using (
  (auth.role() = 'service_role')
  OR
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_env_vars.prototype_id
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

-- INSERT: service_role OR users can insert to prototypes they can update (owner or TEAM member)
drop policy if exists "prototype_env_vars_insert_policy" on public.prototype_env_vars;
create policy "prototype_env_vars_insert_policy"
on public.prototype_env_vars
for insert
to public
with check (
  (auth.role() = 'service_role')
  OR
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_env_vars.prototype_id
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

-- UPDATE: service_role OR users can update from prototypes they can update (owner or TEAM member)
drop policy if exists "prototype_env_vars_update_policy" on public.prototype_env_vars;
create policy "prototype_env_vars_update_policy"
on public.prototype_env_vars
for update
to public
using (
  (auth.role() = 'service_role')
  OR
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_env_vars.prototype_id
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
  (auth.role() = 'service_role')
  OR
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_env_vars.prototype_id
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

-- DELETE: service_role OR users can delete from prototypes they can update (owner or TEAM member)
drop policy if exists "prototype_env_vars_delete_policy" on public.prototype_env_vars;
create policy "prototype_env_vars_delete_policy"
on public.prototype_env_vars
for delete
to public
using (
  (auth.role() = 'service_role')
  OR
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_env_vars.prototype_id
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

-- ------------------------------------------------------------
-- Prototype Env Var Secrets table
-- ------------------------------------------------------------
-- Note: This table joins through prototype_env_vars to get to prototypes
-- Scoped to authenticated users only, with service_role access maintained

-- SELECT: service_role OR owner OR team members if visibility is TEAM
drop policy if exists "prototype_env_var_secrets_select_policy" on public.prototype_env_var_secrets;
create policy "prototype_env_var_secrets_select_policy"
on public.prototype_env_var_secrets
for select
to public
using (
  (auth.role() = 'service_role')
  OR
  (
    auth.uid() is not null
    and exists (
      select 1
      from public.prototype_env_vars pev
      join public.prototypes p on p.id = pev.prototype_id
      where pev.id = prototype_env_var_secrets.env_var_id
        and (
          -- Owner can view
          p.owner_id = auth.uid()
          OR
          -- Team members can view if visibility is TEAM
          (
            p.visibility = 'TEAM'
            and public.is_team_member(p.team_id, auth.uid())
          )
        )
    )
  )
);

-- INSERT: service_role OR owner OR team members if visibility is TEAM
drop policy if exists "prototype_env_var_secrets_insert_policy" on public.prototype_env_var_secrets;
create policy "prototype_env_var_secrets_insert_policy"
on public.prototype_env_var_secrets
for insert
to public
with check (
  (auth.role() = 'service_role')
  OR
  (
    auth.uid() is not null
    and exists (
      select 1
      from public.prototype_env_vars pev
      join public.prototypes p on p.id = pev.prototype_id
      where pev.id = prototype_env_var_secrets.env_var_id
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
  )
);

-- UPDATE: service_role OR owner OR team members if visibility is TEAM
drop policy if exists "prototype_env_var_secrets_update_policy" on public.prototype_env_var_secrets;
create policy "prototype_env_var_secrets_update_policy"
on public.prototype_env_var_secrets
for update
to public
using (
  (auth.role() = 'service_role')
  OR
  (
    auth.uid() is not null
    and exists (
      select 1
      from public.prototype_env_vars pev
      join public.prototypes p on p.id = pev.prototype_id
      where pev.id = prototype_env_var_secrets.env_var_id
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
)
with check (
  (auth.role() = 'service_role')
  OR
  (
    auth.uid() is not null
    and exists (
      select 1
      from public.prototype_env_vars pev
      join public.prototypes p on p.id = pev.prototype_id
      where pev.id = prototype_env_var_secrets.env_var_id
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
);

-- DELETE: service_role OR owner OR team members if visibility is TEAM
drop policy if exists "prototype_env_var_secrets_delete_policy" on public.prototype_env_var_secrets;
create policy "prototype_env_var_secrets_delete_policy"
on public.prototype_env_var_secrets
for delete
to public
using (
  (auth.role() = 'service_role')
  OR
  (
    auth.uid() is not null
    and exists (
      select 1
      from public.prototype_env_vars pev
      join public.prototypes p on p.id = pev.prototype_id
      where pev.id = prototype_env_var_secrets.env_var_id
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
  )
);

-- ------------------------------------------------------------
-- Prototype Build History table
-- ------------------------------------------------------------

-- SELECT: owner OR team members if visibility is TEAM
drop policy if exists "prototype_build_history_select_own" on public.prototype_build_history;
create policy "prototype_build_history_select_own"
on public.prototype_build_history
for select
to public
using (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_build_history.prototype_id
      and (
        -- Owner can view
        p.owner_id = auth.uid()
        OR
        -- Team members can view if visibility is TEAM
        (
          p.visibility = 'TEAM'
          and public.is_team_member(p.team_id, auth.uid())
        )
      )
  )
);

-- INSERT: owner OR team members if visibility is TEAM
drop policy if exists "prototype_build_history_insert_own" on public.prototype_build_history;
create policy "prototype_build_history_insert_own"
on public.prototype_build_history
for insert
to public
with check (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_build_history.prototype_id
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

-- UPDATE: owner OR team members if visibility is TEAM
drop policy if exists "prototype_build_history_update_own" on public.prototype_build_history;
create policy "prototype_build_history_update_own"
on public.prototype_build_history
for update
to public
using (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_build_history.prototype_id
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
    where p.id = prototype_build_history.prototype_id
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

-- DELETE: owner OR team members if visibility is TEAM
drop policy if exists "prototype_build_history_delete_own" on public.prototype_build_history;
create policy "prototype_build_history_delete_own"
on public.prototype_build_history
for delete
to public
using (
  exists (
    select 1
    from public.prototypes p
    where p.id = prototype_build_history.prototype_id
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
