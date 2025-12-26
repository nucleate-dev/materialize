begin;

-- Corrected: team-based FIFO credit consumption
-- Key fixes:
-- 1) Do NOT rely on team_id in JWT claims (you said it never exists)
-- 2) Authorize via auth.uid() + team membership (unless service_role)
-- 3) Use auth.role() (NOT current_user) to detect service_role in SECURITY DEFINER
-- 4) Attribute usage to the caller (user_id = auth.uid()) for non-service_role calls
--    (service_role calls will record user_id NULL unless you add a p_user_id param)
-- 5) Treat expires_at NULL as "never expires" (included), and order NULL last

create or replace function public.consume_credits_teams(
  p_team_id uuid,
  p_prototype_id uuid,
  p_credits numeric
)
returns table (
  success boolean,
  total_remaining numeric,
  consumed_grants jsonb,
  grant_balances jsonb,
  error text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  credits_needed numeric := coalesce(p_credits, 0);
  overage_amount numeric := 0;

  grant_row record;
  grant_remaining numeric;
  allocation numeric;

  total_available numeric := 0;
  consumed jsonb := '[]'::jsonb;
  balances jsonb := '[]'::jsonb;

  v_uid uuid := auth.uid();
  v_role text := auth.role();
begin
  -- Basic validation
  if credits_needed <= 0 then
    return query
    select false, 0::numeric, consumed, balances, 'Credits requested must be greater than zero';
    return;
  end if;

  -- Authorization:
  -- Do NOT trust a team_id claim. Require the caller be a member of p_team_id (unless service_role).
  if v_role is distinct from 'service_role' then
    if v_uid is null then
      return query
      select false, 0::numeric, consumed, balances, 'No auth context';
      return;
    end if;

    -- NOTE: Adjust table/columns if your membership table differs.
    -- Expected: public.team_memberships(team_id uuid, user_id uuid, ...)
    if not exists (
      select 1
      from public.team_memberships tm
      where tm.team_id = p_team_id
        and tm.user_id = v_uid
    ) then
      return query
      select false, 0::numeric, consumed, balances, 'Unauthorized credit consumption attempt';
      return;
    end if;
  end if;

  -- Lock relevant grants and compute FIFO consumption plan
  for grant_row in
    select
      g.id,
      g.credits_granted,
      g.expires_at,
      g.billing_period_start,
      g.billing_period_end,
      (
        select coalesce(sum(u.credits_used), 0)
        from public.api_usage u
        where u.credit_grant_id = g.id
      ) as credits_used
    from public.credit_grants g
    where g.team_id = p_team_id
      and (g.expires_at is null or g.expires_at > now())
    order by coalesce(g.expires_at, 'infinity'::timestamptz)
    for update of g
  loop
    grant_remaining := greatest(grant_row.credits_granted - grant_row.credits_used, 0);

    if grant_remaining > 0 then
      total_available := total_available + grant_remaining;

      allocation := least(credits_needed, grant_remaining);
      if allocation > 0 then
        consumed := consumed || jsonb_build_object(
          'grant_id', grant_row.id,
          'credits', allocation,
          'expires_at', grant_row.expires_at,
          'billing_period_start', grant_row.billing_period_start,
          'billing_period_end', grant_row.billing_period_end
        );

        credits_needed := credits_needed - allocation;
        grant_row.credits_used := grant_row.credits_used + allocation;
        grant_remaining := grant_remaining - allocation;
      end if;
    end if;

    balances := balances || jsonb_build_object(
      'grant_id', grant_row.id,
      'credits_granted', grant_row.credits_granted,
      'credits_used', least(grant_row.credits_granted, grant_row.credits_used),
      'credits_remaining', greatest(grant_row.credits_granted - grant_row.credits_used, 0),
      'expires_at', grant_row.expires_at,
      'billing_period_start', grant_row.billing_period_start,
      'billing_period_end', grant_row.billing_period_end
    );
  end loop;

  -- Overage: record usage with NULL credit_grant_id
  if credits_needed > 0 then
    overage_amount := credits_needed;
    consumed := consumed || jsonb_build_object(
      'grant_id', null,
      'credits', credits_needed,
      'overage', true
    );
    credits_needed := 0;
  end if;

  -- Insert usage rows
  for grant_row in
    select
      nullif(entry->>'grant_id','')::uuid as grant_id,
      (entry->>'credits')::numeric as credits_to_use
    from jsonb_array_elements(consumed) as entry
  loop
    insert into public.api_usage (user_id, team_id, prototype_id, credits_used, credit_grant_id)
    values (
      case when v_role = 'service_role' then null else v_uid end,
      p_team_id,
      p_prototype_id,
      grant_row.credits_to_use,
      grant_row.grant_id
    );
  end loop;

  return query
  select
    true,
    total_available - p_credits,
    consumed,
    balances,
    case
      when overage_amount > 0
        then format('Overage recorded: %s credits beyond available balance', overage_amount)
      else null::text
    end;
end;
$$;

grant execute on function public.consume_credits_teams(uuid, uuid, numeric) to authenticated, service_role;

commit;
