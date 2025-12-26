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


-- OLD RPC FUNCTION FOR REFERENCE
-- CREATE OR REPLACE FUNCTION consume_credits(
--   p_user_id UUID,
--   p_prototype_id UUID,
--   p_credits NUMERIC
-- )
-- RETURNS TABLE (
--   success BOOLEAN,
--   total_remaining NUMERIC,
--   consumed_grants JSONB,
--   grant_balances JSONB,
--   error TEXT
-- )
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   credits_needed NUMERIC := COALESCE(p_credits, 0);
--   overage_amount NUMERIC := 0;
--   grant_row RECORD;
--   grant_remaining NUMERIC;
--   allocation NUMERIC;
--   total_available NUMERIC := 0;
--   consumed JSONB := '[]'::jsonb;
--   balances JSONB := '[]'::jsonb;
--   caller_uid UUID;
--   jwt_sub TEXT;
-- BEGIN
--   -- Validate caller matches target user when not using service role
--   IF current_user <> 'service_role' THEN
--     BEGIN
--       jwt_sub := current_setting('request.jwt.claim.sub', true);
--     EXCEPTION
--       WHEN OTHERS THEN
--         jwt_sub := NULL;
--     END;

--     IF jwt_sub IS NULL THEN
--       BEGIN
--         jwt_sub :=
--           (current_setting('request.jwt.claims', true)::jsonb ->> 'sub');
--       EXCEPTION
--         WHEN OTHERS THEN
--           jwt_sub := NULL;
--       END;
--     END IF;

--     IF jwt_sub IS NOT NULL THEN
--       caller_uid := jwt_sub::uuid;
--     END IF;

--     IF caller_uid IS NULL OR caller_uid <> p_user_id THEN
--       RETURN QUERY
--       SELECT false, 0::NUMERIC, consumed, balances, 'Unauthorized credit consumption attempt';
--       RETURN;
--     END IF;
--   END IF;

--   IF credits_needed <= 0 THEN
--     RETURN QUERY
--     SELECT false, 0::NUMERIC, consumed, balances, 'Credits requested must be greater than zero';
--     RETURN;
--   END IF;

--   -- Lock relevant grants and compute a consumption plan (FIFO by expires_at)
--   FOR grant_row IN
--     SELECT
--       g.id,
--       g.credits_granted,
--       g.expires_at,
--       g.billing_period_start,
--       g.billing_period_end,
--       (
--         SELECT COALESCE(SUM(u.credits_used), 0)
--         FROM api_usage u
--         WHERE u.credit_grant_id = g.id
--       ) AS credits_used
--     FROM credit_grants g
--     WHERE g.user_id = p_user_id
--       AND g.expires_at > NOW()
--     ORDER BY g.expires_at
--     FOR UPDATE OF g
--   LOOP
--     grant_remaining := GREATEST(grant_row.credits_granted - grant_row.credits_used, 0);

--     IF grant_remaining > 0 THEN
--       total_available := total_available + grant_remaining;
--       allocation := LEAST(credits_needed, grant_remaining);
--       IF allocation > 0 THEN
--         consumed := consumed || jsonb_build_object(
--           'grant_id', grant_row.id,
--           'credits', allocation,
--           'expires_at', grant_row.expires_at,
--           'billing_period_start', grant_row.billing_period_start,
--           'billing_period_end', grant_row.billing_period_end
--         );
--         credits_needed := credits_needed - allocation;
--         grant_row.credits_used := grant_row.credits_used + allocation;
--         grant_remaining := grant_remaining - allocation;
--       END IF;
--     END IF;

--     balances := balances || jsonb_build_object(
--       'grant_id', grant_row.id,
--       'credits_granted', grant_row.credits_granted,
--       'credits_used', LEAST(grant_row.credits_granted, grant_row.credits_used),
--       'credits_remaining', GREATEST(grant_row.credits_granted - grant_row.credits_used, 0),
--       'expires_at', grant_row.expires_at,
--       'billing_period_start', grant_row.billing_period_start,
--       'billing_period_end', grant_row.billing_period_end
--     );
--   END LOOP;

--   -- If still need credits, record an overage entry (no grant_id)
--   IF credits_needed > 0 THEN
--     overage_amount := credits_needed;
--     consumed := consumed || jsonb_build_object(
--       'grant_id', NULL,
--       'credits', credits_needed,
--       'overage', true
--     );
--     -- Credits accounted for via consumed JSON, ensure we don't double insert below
--     credits_needed := 0;
--   END IF;

--   -- Insert usage rows now that we know the consumption plan
--   FOR grant_row IN
--     SELECT
--       (entry->>'grant_id')::uuid AS grant_id,
--       (entry->>'credits')::NUMERIC AS credits_to_use
--     FROM jsonb_array_elements(consumed) AS entry
--   LOOP
--     INSERT INTO api_usage (user_id, prototype_id, credits_used, credit_grant_id)
--     VALUES (p_user_id, p_prototype_id, grant_row.credits_to_use, grant_row.grant_id);
--   END LOOP;

--   -- Safety: if logic ever changes and credits_needed is still > 0, record it as uncoupled usage
--   IF credits_needed > 0 THEN
--     INSERT INTO api_usage (user_id, prototype_id, credits_used, credit_grant_id)
--     VALUES (p_user_id, p_prototype_id, credits_needed, NULL);
--   END IF;

--   RETURN QUERY
--   SELECT
--     true,
--     total_available - p_credits,
--     consumed,
--     balances,
--     CASE
--       WHEN overage_amount > 0 THEN format('Overage recorded: %s credits beyond available balance', overage_amount)
--       ELSE NULL::TEXT
--     END;
-- END;
-- $$;

-- GRANT EXECUTE ON FUNCTION consume_credits(UUID, UUID, NUMERIC) TO authenticated, service_role;