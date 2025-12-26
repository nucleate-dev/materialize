-- Update the existing auth.users trigger function to:
-- 1) upsert into public.users
-- 2) create a personal team named "[FirstName]'s Team" (fallbacks included)
-- 3) create a team_memberships row as owner
--
-- NOTE: You do NOT need to drop/recreate the trigger if it already calls handle_new_user().
-- Just run this to replace the function.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_team_id uuid;
  v_team_name text;
begin
  -- 1) Upsert into public.users
  insert into public.users (id, email, name, avatar_url, created_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(excluded.name, public.users.name),
        avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url);

  -- 2) Personal team name: "[FirstName]'s Team"
  v_team_name :=
    coalesce(
      -- First name from full_name
      case
        when new.raw_user_meta_data ->> 'full_name' is not null
             and length(trim(new.raw_user_meta_data ->> 'full_name')) > 0
        then split_part(trim(new.raw_user_meta_data ->> 'full_name'), ' ', 1) || '''s Team'
        else null
      end,

      -- Fallback: email prefix
      case
        when new.email is not null and position('@' in new.email) > 1
        then split_part(new.email, '@', 1) || '''s Team'
        else null
      end,

      -- Final fallback
      'My Team'
    );

  -- Create personal team (idempotent via unique personal_owner_user_id)
  insert into public.teams (name, created_by, personal_owner_user_id)
  values (v_team_name, new.id, new.id)
  on conflict (personal_owner_user_id) do update
    set name = excluded.name
  returning id into v_team_id;

  -- 3) Create membership row as owner (idempotent)
  insert into public.team_memberships (team_id, user_id, role, created_at)
  values (v_team_id, new.id, 'owner', now())
  on conflict (team_id, user_id) do nothing;

  return new;
end;
$$;

-- Optional: lock down direct execution (trigger will still run)
revoke all on function handle_new_user() from public;
grant execute on function handle_new_user() to postgres, service_role;
