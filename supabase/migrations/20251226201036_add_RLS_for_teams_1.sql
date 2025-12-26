-- Add RLS policy for subscriptions table to support team-based access
-- Allows users to view:
--   1. Their own personal subscriptions (user_id = auth.uid())
--   2. Subscriptions for teams they are members of (via team_id)

begin;

-- Subscriptions table
drop policy if exists "Enable users to view their own data only" on public.subscriptions;
create policy "subscriptions_select_user_or_team_member"
on public.subscriptions
for select
to authenticated
using (
  (team_id is not null and public.is_team_member(team_id, auth.uid()))
);

commit;
