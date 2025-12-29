begin;

-- Helper function to check if user is a team member with edit privileges (owner, admin, or editor)
create or replace function public.is_team_member_with_edit_privileges(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships
    where team_id = p_team_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'editor')
  );
$$;

revoke all on function public.is_team_member_with_edit_privileges(uuid) from public;
grant execute on function public.is_team_member_with_edit_privileges(uuid) to authenticated;

commit;
