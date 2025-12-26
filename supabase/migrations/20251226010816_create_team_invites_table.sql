-- team_invites table + RLS policies (corrected)
-- Allows:
--   - INSERT: only team owners/admins
--   - SELECT: any team member OR the invitee
--   - UPDATE: team owners/admins OR invitee
--       * team_id can NEVER change
--       * email / invited_user_id can be changed ONLY by owners/admins (invitee cannot)
--   - DELETE: nobody (no delete policy)
--
-- Assumes these already exist:
--   public.users(id uuid, email text, ...)
--   public.teams(id uuid, ...)
--   public.team_memberships(team_id uuid, user_id uuid, role public.team_role, ...)
--   public.team_role enum includes: 'owner', 'admin', 'member'

begin;

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ------------------------------------------------------------
-- Table
-- ------------------------------------------------------------
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on update cascade on delete cascade,

  email citext,
  invited_user_id uuid null references public.users(id) on update cascade on delete set null,

  role public.team_role not null default 'member',
  token text not null unique,

  expires_at timestamptz not null,
  accepted_at timestamptz null,

  created_at timestamptz not null default now(),
  invited_by uuid null references public.users(id) on update cascade on delete set null,

  constraint team_invites_email_or_user_chk
    check (email is not null or invited_user_id is not null),

  constraint team_invites_accept_before_expiry_chk
    check (accepted_at is null or accepted_at <= expires_at)
);

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------
create index if not exists team_invites_team_id_idx
  on public.team_invites (team_id);

create index if not exists team_invites_invited_user_id_idx
  on public.team_invites (invited_user_id);

create index if not exists team_invites_email_idx
  on public.team_invites (email);

-- Optional: prevent multiple *pending* invites to the same target
-- (uncomment if desired)
-- create unique index if not exists team_invites_unique_pending_email
--   on public.team_invites (team_id, email)
--   where email is not null and accepted_at is null;
--
-- create unique index if not exists team_invites_unique_pending_user
--   on public.team_invites (team_id, invited_user_id)
--   where invited_user_id is not null and accepted_at is null;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.team_invites enable row level security;

-- SELECT: team member OR invitee
drop policy if exists "team_invites_select_team_member_or_invitee" on public.team_invites;
create policy "team_invites_select_team_member_or_invitee"
on public.team_invites
for select
to authenticated
using (
  -- any team member
  exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = team_invites.team_id
      and tm.user_id = auth.uid()
  )
  OR
  -- invitee by user_id
  (team_invites.invited_user_id is not null and team_invites.invited_user_id = auth.uid())
  OR
  -- invitee by email (match against your public.users table)
  (
    team_invites.invited_user_id is null
    and team_invites.email is not null
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.email is not null
        and u.email::citext = team_invites.email
    )
  )
);

-- INSERT: only admins/owners
drop policy if exists "team_invites_insert_admin_or_owner" on public.team_invites;
create policy "team_invites_insert_admin_or_owner"
on public.team_invites
for insert
to authenticated
with check (
  exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = team_invites.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
  )
);

-- UPDATE: admins/owners OR invitee
drop policy if exists "team_invites_update_admin_owner_or_invitee" on public.team_invites;
create policy "team_invites_update_admin_owner_or_invitee"
on public.team_invites
for update
to authenticated
using (
  -- admins/owners
  exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = team_invites.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
  )
  OR
  -- invitee by user_id
  (team_invites.invited_user_id is not null and team_invites.invited_user_id = auth.uid())
  OR
  -- invitee by email
  (
    team_invites.invited_user_id is null
    and team_invites.email is not null
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.email is not null
        and u.email::citext = team_invites.email
    )
  )
)
with check (
  -- keep the same eligibility after update
  exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = team_invites.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
  )
  OR
  (team_invites.invited_user_id is not null and team_invites.invited_user_id = auth.uid())
  OR
  (
    team_invites.invited_user_id is null
    and team_invites.email is not null
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.email is not null
        and u.email::citext = team_invites.email
    )
  )
);

-- DELETE: nobody (no delete policy)
drop policy if exists "team_invites_delete" on public.team_invites;

-- ------------------------------------------------------------
-- Trigger: enforce immutability rules
--   - team_id can never change
--   - email / invited_user_id can only change if current user is admin/owner
-- ------------------------------------------------------------
create or replace function public.enforce_team_invites_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin_owner boolean;
begin
  -- Always immutable
  if new.team_id is distinct from old.team_id then
    raise exception 'team_id cannot be changed for team_invites';
  end if;

  -- Is the actor an owner/admin of this team?
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = old.team_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
  )
  into is_admin_owner;

  -- Only admins/owners can change invite target fields
  if not is_admin_owner then
    if new.email is distinct from old.email then
      raise exception 'only team owners/admins can change email on team_invites';
    end if;

    if new.invited_user_id is distinct from old.invited_user_id then
      raise exception 'only team owners/admins can change invited_user_id on team_invites';
    end if;
  end if;

  -- Still must satisfy basic invariant
  if new.email is null and new.invited_user_id is null then
    raise exception 'team_invites must have email or invited_user_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_team_invites_update_rules on public.team_invites;
create trigger trg_enforce_team_invites_update_rules
before update on public.team_invites
for each row
execute function public.enforce_team_invites_update_rules();

-- Optional: tighten function privileges (triggers will still run)
revoke all on function public.enforce_team_invites_update_rules() from public;

commit;