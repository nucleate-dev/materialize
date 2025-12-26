begin;

alter table public.subscriptions
  add column if not exists team_id uuid references public.teams(id) on update cascade on delete set null;

alter table public.credit_grants
  add column if not exists team_id uuid references public.teams(id) on update cascade on delete cascade;

alter table public.prototypes
  add column if not exists team_id uuid references public.teams(id) on update cascade on delete cascade;

alter table public.api_usage
  add column if not exists team_id uuid references public.teams(id) on update cascade on delete cascade;

drop view if exists public.credit_grant_balances;

create view public.credit_grant_balances as
select
  g.id,
  g.user_id,
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
  g.user_id,
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
