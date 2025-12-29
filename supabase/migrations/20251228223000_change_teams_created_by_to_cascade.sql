begin;

-- Change teams.created_by foreign key from ON DELETE RESTRICT to ON DELETE CASCADE
-- This is a temporary solution until we implement proper user deletion flow
-- with ownership transfer and subscription cleanup

-- Drop the old constraint
alter table public.teams
  drop constraint teams_created_by_fkey;

-- Add the new constraint with CASCADE
alter table public.teams
  add constraint teams_created_by_fkey
  foreign key (created_by)
  references public.users(id)
  on update cascade
  on delete cascade;

commit;
