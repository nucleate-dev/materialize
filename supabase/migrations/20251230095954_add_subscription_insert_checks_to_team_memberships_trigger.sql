-- OLD trigger for reference:
-- name of function: enforce_team_memberships_rules
-- schema: public
-- definition:
-- declare
--   actor_is_owner boolean;
--   actor_is_admin_owner boolean;
--   owner_count int;
--   target_team_id uuid;
--   team_exists boolean;
--   is_bootstrap_owner_insert boolean;
-- begin
--   target_team_id := coalesce(old.team_id, new.team_id);

--   -- ✅ Service role / backend / system context bypass
--   -- (auth.uid() is NULL when request is made with the service role key or from system jobs)
--   if auth.uid() is null then
--     if tg_op = 'DELETE' then
--       return old;
--     else
--       return new;
--     end if;
--   end if;

--   -- Membership identity immutable
--   if (tg_op = 'UPDATE') then
--     if new.team_id is distinct from old.team_id then
--       raise exception 'team_id cannot be changed for team_memberships';
--     end if;
--     if new.user_id is distinct from old.user_id then
--       raise exception 'user_id cannot be changed for team_memberships';
--     end if;
--   end if;

--   -- Detect whether the team still exists (avoid blocking cascade deletes)
--   select exists(select 1 from public.teams t where t.id = target_team_id)
--     into team_exists;

--   -- Bootstrap insert: allow team creator to insert the first membership as owner
--   is_bootstrap_owner_insert := false;
--   if tg_op = 'INSERT' then
--     if new.role = 'owner'
--        and exists (
--          select 1
--          from public.teams t
--          where t.id = new.team_id
--            and t.created_by = new.user_id
--        )
--        and not exists (
--          select 1
--          from public.team_memberships existing
--          where existing.team_id = new.team_id
--        )
--     then
--       -- Allow first owner insert even if auth.uid() is null (e.g., system triggers)
--       is_bootstrap_owner_insert := true;
--     end if;
--   end if;

--   -- Determine actor role (on this team) using helper functions
--   actor_is_owner := public.is_team_owner(target_team_id);
--   actor_is_admin_owner := public.is_team_owner_or_admin(target_team_id);

--   -- Allow bootstrap insert even though actor isn't yet owner/admin
--   if is_bootstrap_owner_insert then
--     return new;
--   end if;

--   -- Only owners can grant owner role (prevents admins from creating more owners)
--   if tg_op in ('INSERT','UPDATE') then
--     if new.role = 'owner' and not actor_is_owner then
--       raise exception 'only an owner can grant owner role';
--     end if;
--   end if;

--   -- Prevent deleting/demoting the last owner
--   -- Do not block cascade deletes when team itself is being deleted
--   if tg_op = 'DELETE' then
--     if team_exists and old.role = 'owner' then
--       select count(*) into owner_count
--       from public.team_memberships
--       where team_id = old.team_id
--         and role = 'owner';
--       if owner_count <= 1 then
--         raise exception 'cannot remove the last owner of a team';
--       end if;
--     end if;
--   elsif tg_op = 'UPDATE' then
--     if old.role = 'owner' and new.role <> 'owner' then
--       select count(*) into owner_count
--       from public.team_memberships
--       where team_id = old.team_id
--         and role = 'owner';
--       if owner_count <= 1 then
--         raise exception 'cannot demote the last owner of a team';
--       end if;
--     end if;
--   end if;

--   -- For insert/update/delete, ensure actor is at least admin/owner.
--   if tg_op in ('INSERT','UPDATE','DELETE') and not actor_is_admin_owner then
--     -- Allow cascade deletes when the team no longer exists (team delete in progress)
--     if not (tg_op = 'DELETE' and not team_exists) then
--       raise exception 'only team admins/owners may modify team memberships';
--     end if;
--   end if;

--   if tg_op = 'DELETE' then
--     return old;
--   end if;

--   return new;
-- end;

-- ==============================================================================
-- NEW TRIGGER FUNCTION: enforce_team_memberships_rules
-- ==============================================================================

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
  is_personal_team_owner boolean;
  has_recent_accepted_invite boolean;
begin
  target_team_id := coalesce(old.team_id, new.team_id);

  -- ✅ Service role / backend / system context bypass
  -- (auth.uid() is NULL when request is made with the service role key or from system jobs)
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;

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

  -- Allow bootstrap insert even though actor isn't yet owner/admin
  if is_bootstrap_owner_insert then
    return new;
  end if;

  -- NEW REQUIREMENT 2: Check if user has a recently accepted invite (within 1 hour)
  has_recent_accepted_invite := false;
  if tg_op = 'INSERT' and auth.uid() = new.user_id then
    select exists(
      select 1
      from public.team_invites ti
      where ti.team_id = new.team_id
        and ti.accepted_at is not null
        and ti.accepted_at >= now() - interval '1 hour'
        and (
          ti.invited_user_id = new.user_id
          or (
            ti.email is not null
            and exists (
              select 1
              from public.users u
              where u.id = new.user_id
                and u.email is not null
                and u.email::citext = ti.email
            )
          )
        )
    ) into has_recent_accepted_invite;
  end if;

  -- Allow insert if user has recently accepted invite
  if has_recent_accepted_invite then
    return new;
  end if;

  -- NEW REQUIREMENT 1: Check if this is a personal team owner
  -- Personal team owners cannot be removed or have their role changed
  if tg_op = 'DELETE' then
    select exists(
      select 1
      from public.teams t
      where t.id = old.team_id
        and t.personal_owner_user_id = old.user_id
    ) into is_personal_team_owner;

    if is_personal_team_owner then
      raise exception 'cannot remove the personal team owner from their personal team';
    end if;
  elsif tg_op = 'UPDATE' then
    select exists(
      select 1
      from public.teams t
      where t.id = old.team_id
        and t.personal_owner_user_id = old.user_id
    ) into is_personal_team_owner;

    if is_personal_team_owner and (old.role <> new.role) then
      raise exception 'cannot change the role of the personal team owner in their personal team';
    end if;
  end if;

  -- Determine actor role (on this team) using helper functions
  actor_is_owner := public.is_team_owner(target_team_id);
  actor_is_admin_owner := public.is_team_owner_or_admin(target_team_id);

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

-- Drop existing trigger if it exists
drop trigger if exists trg_enforce_team_memberships_rules on public.team_memberships;

-- Create the trigger
create trigger trg_enforce_team_memberships_rules
before insert or update or delete on public.team_memberships
for each row
execute function public.enforce_team_memberships_rules();

-- Tighten function privileges
revoke all on function public.enforce_team_memberships_rules() from public;
