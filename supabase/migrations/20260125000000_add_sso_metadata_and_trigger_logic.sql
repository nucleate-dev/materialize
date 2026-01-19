-- Add SSO metadata to users/teams and extend handle_new_user trigger logic.

alter table public.users
  add column if not exists is_sso_user boolean not null default false;

alter table public.teams
  add column if not exists sso_provider_id uuid default null;

create unique index if not exists teams_sso_provider_id_key
  on public.teams (sso_provider_id)
  where sso_provider_id is not null;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_team_id uuid;
  v_team_name text;
  v_sso_provider_text text;
  v_sso_provider_id uuid;
  v_is_sso_user boolean;
begin
  v_sso_provider_text := nullif(new.raw_user_meta_data ->> 'sso_provider_id', '');

  if v_sso_provider_text is not null then
    begin
      v_sso_provider_id := v_sso_provider_text::uuid;
    exception
      when others then
        v_sso_provider_id := null;
    end;
  end if;

  v_is_sso_user :=
    coalesce(new.raw_app_meta_data ->> 'provider', '') = 'saml'
    or v_sso_provider_id is not null;

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

  if v_is_sso_user then
    if v_sso_provider_id is null then
      raise exception 'SSO user % missing sso_provider_id metadata', new.id;
    end if;

    select id
      into v_team_id
      from public.teams
      where sso_provider_id = v_sso_provider_id
      limit 1;

    if v_team_id is null then
      raise exception 'No team configured for sso_provider_id %', v_sso_provider_id;
    end if;

    insert into public.team_memberships (team_id, user_id, role, created_at)
    values (v_team_id, new.id, 'viewer', now())
    on conflict (team_id, user_id) do nothing;

    return new;
  end if;

  v_team_name :=
    coalesce(
      case
        when new.raw_user_meta_data ->> 'full_name' is not null
             and length(trim(new.raw_user_meta_data ->> 'full_name')) > 0
        then split_part(trim(new.raw_user_meta_data ->> 'full_name'), ' ', 1) || '''s Team'
        else null
      end,
      case
        when new.email is not null and position('@' in new.email) > 1
        then split_part(new.email, '@', 1) || '''s Team'
        else null
      end,
      'My Team'
    );

  insert into public.teams (name, created_by, personal_owner_user_id)
  values (v_team_name, new.id, new.id)
  on conflict (personal_owner_user_id) do update
    set name = excluded.name
  returning id into v_team_id;

  insert into public.team_memberships (team_id, user_id, role, created_at)
  values (v_team_id, new.id, 'owner', now())
  on conflict (team_id, user_id) do nothing;

  return new;
end;
$$;

revoke all on function handle_new_user() from public;
grant execute on function handle_new_user() to postgres, service_role;
