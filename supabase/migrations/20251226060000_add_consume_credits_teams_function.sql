begin;

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
set search_path = public
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
  caller_team_id uuid;
  jwt_team text;
begin
  if current_user <> 'service_role' then
    begin
      jwt_team := current_setting('request.jwt.claim.team_id', true);
    exception
      when others then
        jwt_team := null;
    end;

    if jwt_team is null then
      begin
        jwt_team :=
          (current_setting('request.jwt.claims', true)::jsonb ->> 'team_id');
      exception
        when others then
          jwt_team := null;
      end;
    end if;

    if jwt_team is not null then
      caller_team_id := jwt_team::uuid;
    end if;

    if caller_team_id is null or caller_team_id <> p_team_id then
      return query
      select false, 0::numeric, consumed, balances,
        'Unauthorized credit consumption attempt';
      return;
    end if;
  end if;

  if credits_needed <= 0 then
    return query
    select false, 0::numeric, consumed, balances,
      'Credits requested must be greater than zero';
    return;
  end if;

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
      and g.expires_at > now()
    order by g.expires_at
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

  if credits_needed > 0 then
    overage_amount := credits_needed;
    consumed := consumed || jsonb_build_object(
      'grant_id', null,
      'credits', credits_needed,
      'overage', true
    );
    credits_needed := 0;
  end if;

  for grant_row in
    select
      (entry->>'grant_id')::uuid as grant_id,
      (entry->>'credits')::numeric as credits_to_use
    from jsonb_array_elements(consumed) as entry
  loop
    insert into public.api_usage (user_id, team_id, prototype_id, credits_used, credit_grant_id)
    values (null, p_team_id, p_prototype_id, grant_row.credits_to_use, grant_row.grant_id);
  end loop;

  if credits_needed > 0 then
    insert into public.api_usage (user_id, team_id, prototype_id, credits_used, credit_grant_id)
    values (null, p_team_id, p_prototype_id, credits_needed, null);
  end if;

  return query
  select
    true,
    total_available - p_credits,
    consumed,
    balances,
    case
      when overage_amount > 0 then format('Overage recorded: %s credits beyond available balance', overage_amount)
      else null::text
    end;
end;
$$;

grant execute on function public.consume_credits_teams(uuid, uuid, numeric) to authenticated, service_role;

commit;
