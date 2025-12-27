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


-- Helper function to check if user can view prototype-related resources
-- Returns true if:
--   - Prototype is PUBLIC
--   - User is the prototype owner
--   - User is a team member and prototype visibility is TEAM
--   - User is a team owner/admin (regardless of visibility)
create or replace function public.can_view_prototype(p_prototype_id uuid, p_user_id uuid)
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
        -- Public prototypes
        p.visibility = 'PUBLIC'
        OR
        -- Owner can view
        p.owner_id = p_user_id
        OR
        -- Team prototypes where user is a team member
        (
          p.visibility = 'TEAM'
          and public.is_team_member(p.team_id, p_user_id)
        )
        OR
        (
          -- Owners and admins can always view
          public.is_team_owner_or_admin(p.team_id, p_user_id)
        )
      )
  );
$$;

revoke all on function public.can_view_prototype(uuid, uuid) from public;
grant execute on function public.can_view_prototype(uuid, uuid) to authenticated;