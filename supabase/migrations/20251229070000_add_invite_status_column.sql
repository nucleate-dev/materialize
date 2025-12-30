-- Add invite_status column to team_invites table
-- This migration adds a new enum type and column to track invite status
-- instead of relying on the accepted_at timestamp

begin;

-- ------------------------------------------------------------
-- Create enum type for invite status
-- ------------------------------------------------------------
create type public.team_invite_status as enum ('pending', 'accepted', 'cancelled');

-- ------------------------------------------------------------
-- Add invite_status column to team_invites table
-- ------------------------------------------------------------
alter table public.team_invites
  add column invite_status public.team_invite_status not null default 'pending';

-- ------------------------------------------------------------
-- Migrate existing data
-- Set invite_status to 'accepted' where accepted_at is not null
-- ------------------------------------------------------------
update public.team_invites
  set invite_status = 'accepted'
  where accepted_at is not null;

-- ------------------------------------------------------------
-- Add index on invite_status for better query performance
-- ------------------------------------------------------------
create index if not exists team_invites_invite_status_idx
  on public.team_invites (invite_status);

-- ------------------------------------------------------------
-- Add composite index for common query pattern (team_id, invite_status)
-- ------------------------------------------------------------
create index if not exists team_invites_team_id_status_idx
  on public.team_invites (team_id, invite_status);

commit;
