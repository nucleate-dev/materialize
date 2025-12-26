begin;

-- Update enforce_team_memberships_rules to relax bootstrap insert requirements.
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
    if new.role = 'owner'
       and exists (
         select 1
         from public.teams t
         where t.id = new.team_id
           and t.created_by = new.user_id
       )
       and not exists (
         select 1
         from public.team_memberships existing
         where existing.team_id = new.team_id
       )
    then
      -- Allow first owner insert even if auth.uid() is null (e.g., system triggers)
      is_bootstrap_owner_insert := true;
    end if;
  end if;

  -- Determine actor role (on this team)
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = target_team_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
  ) into actor_is_owner;

  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = target_team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  ) into actor_is_admin_owner;

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

commit;
