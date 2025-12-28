begin;

-- ------------------------------------------------------------
-- Add helper function to check if user is a team owner (not just admin)
-- ------------------------------------------------------------
create or replace function public.is_team_owner(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
  );
$$;

revoke all on function public.is_team_owner(uuid) from public;
grant execute on function public.is_team_owner(uuid) to authenticated;

-- ------------------------------------------------------------
-- Update enforce_team_memberships_rules trigger to use helpers
-- ------------------------------------------------------------
create or replace function public.enforce_team_memberships_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_owner boolean;
  actor_is_admin_owner boolean;
  owner_count int;
  target_team_id uuid;
  team_exists boolean;
  is_bootstrap_owner_insert boolean;
begin
  target_team_id := coalesce(old.team_id, new.team_id);

  -- Membership identity immutable
  if (tg_op = 'UPDATE') then
    if new.team_id is distinct from old.team_id then
      raise exception 'team_id cannot be changed for team_memberships';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id cannot be changed for team_memberships';
    end if;
  end if;

  -- Detect whether the team still exists (avoid blocking cascade deletes)
  select exists(select 1 from public.teams t where t.id = target_team_id)
    into team_exists;

  -- Bootstrap insert: allow team creator to insert the first membership as owner
  is_bootstrap_owner_insert := false;
  if tg_op = 'INSERT' then
    if new.user_id = auth.uid()
       and new.role = 'owner'
       and exists (
         select 1
         from public.teams t
         where t.id = new.team_id
           and t.created_by = auth.uid()
       )
       and not exists (
         select 1
         from public.team_memberships existing
         where existing.team_id = new.team_id
       )
    then
      is_bootstrap_owner_insert := true;
    end if;
  end if;

  -- Determine actor role (on this team) using helper functions
  actor_is_owner := public.is_team_owner(target_team_id);
  actor_is_admin_owner := public.is_team_owner_or_admin(target_team_id);

  -- Allow bootstrap insert even though actor isn't yet owner/admin
  if is_bootstrap_owner_insert then
    return new;
  end if;

  -- Only owners can grant owner role (prevents admins from creating more owners)
  if tg_op in ('INSERT','UPDATE') then
    if new.role = 'owner' and not actor_is_owner then
      raise exception 'only an owner can grant owner role';
    end if;
  end if;

  -- Prevent deleting/demoting the last owner
  -- Do not block cascade deletes when team itself is being deleted
  if tg_op = 'DELETE' then
    if team_exists and old.role = 'owner' then
      select count(*) into owner_count
      from public.team_memberships
      where team_id = old.team_id
        and role = 'owner';
      if owner_count <= 1 then
        raise exception 'cannot remove the last owner of a team';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.role = 'owner' and new.role <> 'owner' then
      select count(*) into owner_count
      from public.team_memberships
      where team_id = old.team_id
        and role = 'owner';
      if owner_count <= 1 then
        raise exception 'cannot demote the last owner of a team';
      end if;
    end if;
  end if;

  -- For insert/update/delete, ensure actor is at least admin/owner.
  if tg_op in ('INSERT','UPDATE','DELETE') and not actor_is_admin_owner then
    -- Allow cascade deletes when the team no longer exists (team delete in progress)
    if not (tg_op = 'DELETE' and not team_exists) then
      raise exception 'only team admins/owners may modify team memberships';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_team_memberships_rules() from public;

-- ------------------------------------------------------------
-- Update TEAMS RLS policies to use helper functions
-- ------------------------------------------------------------

-- SELECT: any member of the team can read the team row
drop policy if exists "teams_select_team_members" on public.teams;
create policy "teams_select_team_members"
on public.teams
for select
to authenticated
using (
  public.is_team_member(teams.id)
);

-- UPDATE: only owners/admins of the team can update team fields
drop policy if exists "teams_update_admin_or_owner" on public.teams;
create policy "teams_update_admin_or_owner"
on public.teams
for update
to authenticated
using (
  public.is_team_owner_or_admin(teams.id)
)
with check (
  public.is_team_owner_or_admin(teams.id)
);

-- DELETE: only owners can delete, and only for non-personal teams
drop policy if exists "teams_delete_owner_non_personal" on public.teams;
create policy "teams_delete_owner_non_personal"
on public.teams
for delete
to authenticated
using (
  public.is_team_owner(teams.id)
  and teams.personal_owner_user_id is null
);

-- ------------------------------------------------------------
-- Update TEAM_MEMBERSHIPS RLS policies to use helper functions
-- ------------------------------------------------------------

-- SELECT: any team member can see memberships for that team
drop policy if exists "team_memberships_select_team_members" on public.team_memberships;
create policy "team_memberships_select_team_members"
on public.team_memberships
for select
to authenticated
using (
  public.is_team_member(team_memberships.team_id)
);

-- INSERT: owners/admins can add members OR bootstrap exception
drop policy if exists "team_memberships_insert_admin_or_owner" on public.team_memberships;
create policy "team_memberships_insert_admin_or_owner"
on public.team_memberships
for insert
to authenticated
with check (
  -- Normal case: admin/owner adds a member
  public.is_team_owner_or_admin(team_memberships.team_id)
  OR
  -- Bootstrap case: team creator inserts first membership as owner
  (
    team_memberships.user_id = auth.uid()
    and team_memberships.role = 'owner'
    and exists (
      select 1
      from public.teams t
      where t.id = team_memberships.team_id
        and t.created_by = auth.uid()
    )
    and not exists (
      select 1
      from public.team_memberships existing
      where existing.team_id = team_memberships.team_id
    )
  )
);

-- UPDATE: only owners/admins can update memberships (e.g., change role)
drop policy if exists "team_memberships_update_admin_or_owner" on public.team_memberships;
create policy "team_memberships_update_admin_or_owner"
on public.team_memberships
for update
to authenticated
using (
  public.is_team_owner_or_admin(team_memberships.team_id)
)
with check (
  public.is_team_owner_or_admin(team_memberships.team_id)
);

-- DELETE: only owners/admins can remove members
drop policy if exists "team_memberships_delete_admin_or_owner" on public.team_memberships;
create policy "team_memberships_delete_admin_or_owner"
on public.team_memberships
for delete
to authenticated
using (
  public.is_team_owner_or_admin(team_memberships.team_id)
);

commit;
