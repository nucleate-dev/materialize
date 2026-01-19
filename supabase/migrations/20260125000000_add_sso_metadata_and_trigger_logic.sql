-- Add SSO metadata to users/teams and add SSO identity trigger logic.

alter table public.users
  add column if not exists is_sso_user boolean not null default false;

alter table public.teams
  add column if not exists sso_provider_id uuid default null;

create unique index if not exists teams_sso_provider_id_key
  on public.teams (sso_provider_id)
  where sso_provider_id is not null;

-- Modified handle_new_user to detect and skip personal team creation for SSO users
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_team_id uuid;
  v_team_name text;
  v_is_sso_user boolean;
begin
  -- Detect if this is an SSO/SAML user
  v_is_sso_user := coalesce(new.raw_app_meta_data ->> 'provider', '') = 'saml';

  -- 1) Upsert into public.users (with is_sso_user flag)
  insert into public.users (id, email, name, avatar_url, created_at, is_sso_user)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    now(),
    v_is_sso_user
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(excluded.name, public.users.name),
        avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url),
        is_sso_user = public.users.is_sso_user or excluded.is_sso_user;

  -- Skip personal team creation for SSO users
  if v_is_sso_user then
    return new;
  end if;

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

revoke all on function handle_new_user() from public;
grant execute on function handle_new_user() to postgres, service_role;

-- Handle SSO identity creation and team assignment
create or replace function handle_sso_identity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_sso_provider_id uuid;
  v_team_id uuid;
  v_user_email text;
begin
  -- Extract SSO provider UUID from provider column (format: sso:<uuid>)
  if new.provider like 'sso:%' then
    begin
      v_sso_provider_id := substring(new.provider from 5)::uuid;
    exception
      when others then
        -- Get user email for better error message
        select email into v_user_email from auth.users where id = new.user_id;
        raise warning 'Invalid SSO provider format for user % (email: %): %', new.user_id, v_user_email, new.provider;
        return new;
    end;

    -- Get user email for error messages
    select email into v_user_email from auth.users where id = new.user_id;

    -- Find team with this SSO provider
    select id
      into v_team_id
      from public.teams
      where sso_provider_id = v_sso_provider_id
      limit 1;

    if v_team_id is null then
      raise exception 'No team configured for sso_provider_id % (user: %, email: %)', v_sso_provider_id, new.user_id, v_user_email;
    end if;

    -- Mark user as SSO user
    update public.users
      set is_sso_user = true
      where id = new.user_id;

    -- Add user to team as viewer
    insert into public.team_memberships (team_id, user_id, role, created_at)
    values (v_team_id, new.user_id, 'viewer', now())
    on conflict (team_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function handle_sso_identity() from public;
grant execute on function handle_sso_identity() to postgres, service_role;

-- Create trigger on auth.identities for SSO identity handling
drop trigger if exists on_sso_identity_created on auth.identities;
create trigger on_sso_identity_created
  after insert on auth.identities
  for each row
  execute function handle_sso_identity();
