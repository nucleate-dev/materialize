begin;

-- Drop user_id column from subscriptions table
-- All subscriptions are now tied to teams only
alter table public.subscriptions
drop column if exists user_id;

-- Drop user_id column from credit_grants table
-- All credit grants are now tied to teams only
alter table public.credit_grants
drop column if exists user_id;

-- Recreate credit_grant_balances view without user_id column
drop view if exists public.credit_grant_balances;

create view public.credit_grant_balances as
select
  g.id,
  g.team_id,
  g.subscription_id,
  g.grant_reason,
  g.grant_type,
  g.billing_period_start,
  g.billing_period_end,
  g.expires_at,
  g.created_at,
  g.credits_granted,
  coalesce(sum(u.credits_used), 0) as credits_used,
  greatest(
    g.credits_granted - coalesce(sum(u.credits_used), 0),
    0
  )::decimal(10, 2) as credits_remaining
from public.credit_grants g
left join public.api_usage u
  on u.credit_grant_id = g.id
group by
  g.id,
  g.team_id,
  g.subscription_id,
  g.grant_reason,
  g.grant_type,
  g.billing_period_start,
  g.billing_period_end,
  g.expires_at,
  g.created_at,
  g.credits_granted;

comment on view public.credit_grant_balances is
  'Aggregated credit grant usage (granted, used, remaining) computed from api_usage';
comment on column public.credit_grant_balances.credits_used is
  'Total credits consumed from this grant via api_usage';
comment on column public.credit_grant_balances.credits_remaining is
  'Credits still available for this grant (non-negative)';

grant select on public.credit_grant_balances to authenticated;

commit;
