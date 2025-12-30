-- existing trigger function: enforce_team_invites_update_rules
-- schema: public
-- currently runs on team_invites table before updates
-- declare
--   is_admin_owner boolean;
-- begin
--   -- ✅ Service role / backend / system context bypass
--   if auth.uid() is null then
--     return new;
--   end if;

--   -- Always immutable
--   if new.team_id is distinct from old.team_id then
--     raise exception 'team_id cannot be changed for team_invites';
--   end if;

--   -- Is the actor an owner/admin of this team? Use helper function
--   is_admin_owner := public.is_team_owner_or_admin(old.team_id);

--   -- Only admins/owners can change invite target fields
--   if not is_admin_owner then
--     if new.email is distinct from old.email then
--       raise exception 'only team owners/admins can change email on team_invites';
--     end if;

--     if new.invited_user_id is distinct from old.invited_user_id then
--       raise exception 'only team owners/admins can change invited_user_id on team_invites';
--     end if;
--   end if;

--   -- Still must satisfy basic invariant
--   if new.email is null and new.invited_user_id is null then
--     raise exception 'team_invites must have email or invited_user_id';
--   end if;

--   return new;
-- end;

-- ==============================================================================
-- NEW TRIGGER FUNCTION: enforce_team_invites_rules
-- ==============================================================================

create or replace function public.enforce_team_invites_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin_owner boolean;
  -- Seat capacity check variables
  subscription_plan text;
  subscription_seats int;
  total_members int;
  total_pending_invites int;
  total_edit_members int;
  total_edit_pending_invites int;
begin
  -- ✅ Service role / backend / system context bypass
  if auth.uid() is null then
    return new;
  end if;

  -- UPDATE-specific checks (from existing trigger)
  if tg_op = 'UPDATE' then
    -- team_id immutable
    if new.team_id is distinct from old.team_id then
      raise exception 'team_id cannot be changed for team_invites';
    end if;

    -- Is the actor an owner/admin of this team?
    is_admin_owner := public.is_team_owner_or_admin(old.team_id);

    -- Only admins/owners can change invite target fields
    if not is_admin_owner then
      if new.email is distinct from old.email then
        raise exception 'only team owners/admins can change email on team_invites';
      end if;

      if new.invited_user_id is distinct from old.invited_user_id then
        raise exception 'only team owners/admins can change invited_user_id on team_invites';
      end if;
    end if;

    -- Basic invariant
    if new.email is null and new.invited_user_id is null then
      raise exception 'team_invites must have email or invited_user_id';
    end if;
  end if;

  -- Prevent reactivating canceled invites
  if tg_op = 'UPDATE' and old.invite_status = 'cancelled' and new.invite_status = 'accepted' then
    raise exception 'cancelled invites cannot be reactivated';
  end if;

  -- SEAT CAPACITY CHECK: Verify team has available seats for invite
  -- Applies to: INSERT (new invite), UPDATE (pending->accepted), UPDATE (viewer->non-viewer)
  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and old.invite_status = 'pending' and new.invite_status = 'accepted')
     or (tg_op = 'UPDATE' and old.role = 'viewer' and new.role <> 'viewer') then

    -- Get subscription info for this team
    select s.plan_id, s.seat_quantity
    into subscription_plan, subscription_seats
    from public.subscriptions s
    where s.team_id = new.team_id
      and s.status = 'active';

    -- If no active subscription, treat as free plan
    if subscription_plan is null then
      subscription_plan := 'free';
    end if;

    -- Apply plan-specific seat limits
    if subscription_plan = 'free' then
      -- Free plans: cannot create or modify invites
      raise exception 'free plan teams cannot create or modify team invites';

    elsif subscription_plan = 'plus' then
      -- Plus plans: only check on INSERT (updates are allowed once invite exists)
      if tg_op = 'INSERT' then
        -- Max 2 total (members + pending invites), any role
        -- Optimize: limit to 3 since we only need to check if >= 2
        select count(*) into total_members
        from (
          select 1 from public.team_memberships
          where team_id = new.team_id
          limit 3
        ) as limited;

        select count(*) into total_pending_invites
        from (
          select 1 from public.team_invites
          where team_id = new.team_id
            and invite_status = 'pending'
          limit 3
        ) as limited;

        if (total_members + total_pending_invites) >= 2 then
          raise exception 'plus plan teams are limited to 2 total members';
        end if;
      end if;

    elsif subscription_plan = 'team' then
      -- Team plans: viewers always allowed, editor roles need seat check
      if new.role in ('owner', 'admin', 'editor') then
        -- Optimize: limit to subscription_seats + 1 since we only need to check if >= subscription_seats
        select count(*) into total_edit_members
        from (
          select 1 from public.team_memberships
          where team_id = new.team_id
            and role in ('owner', 'admin', 'editor')
          limit subscription_seats + 1
        ) as limited;

        select count(*) into total_edit_pending_invites
        from (
          select 1 from public.team_invites
          where team_id = new.team_id
            and invite_status = 'pending'
            and role in ('owner', 'admin', 'editor')
          limit subscription_seats + 1
        ) as limited;

        if (total_edit_members + total_edit_pending_invites) >= subscription_seats then
          raise exception 'team plan has no available seats for owner/admin/editor invites';
        end if;
      end if;
      -- Viewer invites are always allowed for team plans

    else
      -- Any other plan type (pro, max, etc.)
      raise exception 'cannot create or modify team invites with this subscription plan type';
    end if;
  end if;

  return new;
end;
$$;

-- Drop old trigger if it exists
drop trigger if exists trg_enforce_team_invites_update_rules on public.team_invites;

-- Drop new trigger if it exists (for idempotency)
drop trigger if exists trg_enforce_team_invites_rules on public.team_invites;

-- Create the new trigger
create trigger trg_enforce_team_invites_rules
before insert or update on public.team_invites
for each row
execute function public.enforce_team_invites_rules();

-- Tighten function privileges
revoke all on function public.enforce_team_invites_rules() from public;
