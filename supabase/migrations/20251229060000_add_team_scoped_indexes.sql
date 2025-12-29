begin;

-- Importance 6/10: prototypes are read whenever dashboards load, inserts are far less frequent than reads.
create index if not exists prototypes_team_updated_at_idx
  on public.prototypes (team_id, updated_at desc);

-- Serves every active-subscription lookup filtered by team_id + period (useSubscriptionAccess.ts, TeamSelector.tsx,
-- subscriptionChecks.ts, usage-tracking.ts, credit-checks.ts)
-- Importance 8/10: subscription checks happen on most gated actions while writes to subscriptions are rare.
create index if not exists subscriptions_team_active_period_idx
  on public.subscriptions (team_id, current_period_start desc, current_period_end desc, updated_at desc)
  where status = 'active';

-- Helps credit_grant_balances view filter by team and expiration (CreditUtils.ts, subscriptionChecks.ts, credit-checks.ts)
-- Importance 7/10: credit grant balances are queried for every credit display or check, and grant inserts are relatively infrequent.
create index if not exists credit_grants_team_expires_idx
  on public.credit_grants (team_id, expires_at desc);

-- Covers the many free-tier/team usage scans with created_at ranges (useCreditUsage.ts, subscriptionChecks.ts,
-- credit-checks.ts, usage-tracking.ts, PeopleTab.tsx)
-- Importance 5/10: api_usage writes are heavy, but these per-team aggregates power multiple UX surfaces; acceptable tradeoff.
create index if not exists api_usage_team_freetier_created_idx
  on public.api_usage (team_id, is_free_tier, created_at);

-- Optimizes overage reconciliation scans (handle-subscription/route.ts, CreditUtils.ts)
-- Importance 4/10: overage reconciliation is rarer but expensive when it happens; index reduces lock time despite extra write cost.
create index if not exists api_usage_team_overage_idx
  on public.api_usage (team_id, created_at)
  where credit_grant_id is null and is_free_tier = false;

-- Covers both duplicate checks and pending-invite lists with minimal write overhead (handleSendInvite.ts, useTeamInvites.ts)
-- Importance 4/10: few invites per team, so a partial index on team_id alone keeps inserts cheap while avoiding table scans.
create index if not exists team_invites_pending_team_idx
  on public.team_invites (team_id)
  where accepted_at is null;

commit;
