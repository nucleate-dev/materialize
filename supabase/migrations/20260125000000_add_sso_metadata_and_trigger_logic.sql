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
  -- Detect if this is an SSO user (enterprise SSO uses 'sso:<uuid>' format)
  v_is_sso_user := coalesce(new.raw_app_meta_data ->> 'provider', '') like 'sso:%';

  -- 1) Upsert into public.users (with is_sso_user flag)
  insert into public.users (id, email, name, avatar_url, created_at, is_sso_user)
  values (
    new.id,
    new.email,
    -- For OAuth/email users, use full_name. For SSO users, name will be set later in handle_sso_identity
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
  v_team_name text;
  v_email_domain text;
  v_team_exists boolean;
begin
  -- Extract SSO provider UUID from provider column (format: sso:<uuid>)
  if new.provider like 'sso:%' then
    begin
      v_sso_provider_id := substring(new.provider from 5)::uuid;
    exception
      when others then
        select email into v_user_email from auth.users where id = new.user_id;
        raise warning 'Invalid SSO provider UUID format for user % (email: %): %', new.user_id, v_user_email, new.provider;
        return new;
    end;

    -- Get user email
    select email into v_user_email from auth.users where id = new.user_id;

    -- Find team with this SSO provider
    select id
      into v_team_id
      from public.teams
      where sso_provider_id = v_sso_provider_id
      limit 1;

    v_team_exists := v_team_id is not null;

    -- Auto-create team if it doesn't exist (idempotent for concurrent logins)
    if not v_team_exists then
      -- Generate team name from email domain or use fallback
      v_team_name := coalesce(
        -- Try to extract domain and capitalize first letter
        case
          when v_user_email is not null and position('@' in v_user_email) > 1
          then
            (
              select
                initcap(split_part(split_part(v_user_email, '@', 2), '.', 1)) || ' Team'
            )
          else null
        end,
        -- Fallback to generic name
        'Organization Team'
      );

      -- Create team with SSO provider ID (handle concurrent inserts)
      insert into public.teams (name, created_by, sso_provider_id)
      values (v_team_name, new.user_id, v_sso_provider_id)
      on conflict on constraint teams_sso_provider_id_key do update
        set name = public.teams.name  -- no-op to allow RETURNING
      returning id into v_team_id;
    end if;

    -- Mark user as SSO user and update name from SAML attributes in identity_data
    update public.users
      set is_sso_user = true,
          name = coalesce(
            public.users.name,  -- Keep existing name if already set
            -- Construct name from given_name + family_name (SAML attributes from identity_data)
            nullif(trim(
              coalesce(new.identity_data ->> 'given_name', '') || ' ' ||
              coalesce(new.identity_data ->> 'family_name', '')
            ), '')
          )
      where id = new.user_id;

    -- Add user to team
    -- First user becomes owner, subsequent users are viewers
    -- Check if any memberships already exist to determine role (handles concurrent logins)
    insert into public.team_memberships (team_id, user_id, role, created_at)
    values (
      v_team_id,
      new.user_id,
      (case
        when exists (select 1 from public.team_memberships where team_id = v_team_id)
        then 'viewer'
        else 'owner'
      end)::team_role,
      now()
    )
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
