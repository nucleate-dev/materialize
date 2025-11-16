-- Migration: Create transactional credit consumption function
-- Description: Adds helper view for grant balances and stored procedure for FIFO credit usage via RPC
-- Date: 2025-11-16

-- View summarizing grant balances derived from api_usage
CREATE OR REPLACE VIEW credit_grant_balances AS
SELECT
  g.id,
  g.user_id,
  g.subscription_id,
  g.grant_reason,
  g.grant_type,
  g.billing_period_start,
  g.billing_period_end,
  g.expires_at,
  g.created_at,
  g.credits_granted,
  COALESCE(SUM(u.credits_used), 0) AS credits_used,
  GREATEST(g.credits_granted - COALESCE(SUM(u.credits_used), 0), 0)::DECIMAL(10,2) AS credits_remaining
FROM credit_grants g
LEFT JOIN api_usage u
  ON u.credit_grant_id = g.id
GROUP BY
  g.id,
  g.user_id,
  g.subscription_id,
  g.grant_reason,
  g.grant_type,
  g.billing_period_start,
  g.billing_period_end,
  g.expires_at,
  g.created_at,
  g.credits_granted;

COMMENT ON VIEW credit_grant_balances IS 'Aggregated credit grant usage (granted, used, remaining) computed from api_usage';
COMMENT ON COLUMN credit_grant_balances.credits_used IS 'Total credits consumed from this grant via api_usage';
COMMENT ON COLUMN credit_grant_balances.credits_remaining IS 'Credits still available for this grant (non-negative)';

GRANT SELECT ON credit_grant_balances TO authenticated;

-- Function to atomically consume credits FIFO style
CREATE OR REPLACE FUNCTION consume_credits(
  p_user_id UUID,
  p_prototype_id UUID DEFAULT NULL,
  p_credits NUMERIC
)
RETURNS TABLE (
  success BOOLEAN,
  total_remaining NUMERIC,
  consumed_grants JSONB,
  grant_balances JSONB,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  credits_needed NUMERIC := COALESCE(p_credits, 0);
  overage_amount NUMERIC := 0;
  grant_row RECORD;
  grant_remaining NUMERIC;
  allocation NUMERIC;
  total_available NUMERIC := 0;
  consumed JSONB := '[]'::jsonb;
  balances JSONB := '[]'::jsonb;
  caller_uid UUID;
  jwt_sub TEXT;
BEGIN
  -- Validate caller matches target user when not using service role
  IF current_user <> 'service_role' THEN
    BEGIN
      jwt_sub := current_setting('request.jwt.claim.sub', true);
    EXCEPTION
      WHEN OTHERS THEN
        jwt_sub := NULL;
    END;

    IF jwt_sub IS NULL THEN
      BEGIN
        jwt_sub :=
          (current_setting('request.jwt.claims', true)::jsonb ->> 'sub');
      EXCEPTION
        WHEN OTHERS THEN
          jwt_sub := NULL;
      END;
    END IF;

    IF jwt_sub IS NOT NULL THEN
      caller_uid := jwt_sub::uuid;
    END IF;

    IF caller_uid IS NULL OR caller_uid::text <> p_user_id::text THEN
      RETURN QUERY
      SELECT false, 0::NUMERIC, consumed, balances, 'Unauthorized credit consumption attempt';
      RETURN;
    END IF;
  END IF;

  IF credits_needed <= 0 THEN
    RETURN QUERY
    SELECT false, 0::NUMERIC, consumed, balances, 'Credits requested must be greater than zero';
    RETURN;
  END IF;

  FOR grant_row IN
    SELECT
      g.id,
      g.credits_granted,
      g.expires_at,
      g.billing_period_start,
      g.billing_period_end,
      (
        SELECT COALESCE(SUM(u.credits_used), 0)
        FROM api_usage u
        WHERE u.credit_grant_id = g.id
      ) AS credits_used
    FROM credit_grants g
    WHERE g.user_id = p_user_id
      AND g.expires_at > NOW()
    ORDER BY g.expires_at
    FOR UPDATE OF g
  LOOP
    grant_remaining := GREATEST(grant_row.credits_granted - grant_row.credits_used, 0);

    IF grant_remaining > 0 THEN
      total_available := total_available + grant_remaining;
      allocation := LEAST(credits_needed, grant_remaining);
      IF allocation > 0 THEN
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
      END IF;
    END IF;

    balances := balances || jsonb_build_object(
      'grant_id', grant_row.id,
      'credits_granted', grant_row.credits_granted,
      'credits_used', LEAST(grant_row.credits_granted, grant_row.credits_used),
      'credits_remaining', GREATEST(grant_row.credits_granted - grant_row.credits_used, 0),
      'expires_at', grant_row.expires_at,
      'billing_period_start', grant_row.billing_period_start,
      'billing_period_end', grant_row.billing_period_end
    );
  END LOOP;

  IF credits_needed > 0 THEN
    overage_amount := credits_needed;
    consumed := consumed || jsonb_build_object(
      'grant_id', NULL,
      'credits', credits_needed,
      'overage', true
    );
    -- Credits accounted for via consumed JSON, ensure we don't double insert below
    credits_needed := 0;
  END IF;

  -- Insert usage rows now that we know the consumption plan
  FOR grant_row IN
    SELECT
      (entry->>'grant_id')::uuid AS grant_id,
      (entry->>'credits')::NUMERIC AS credits_to_use
    FROM jsonb_array_elements(consumed) AS entry
  LOOP
    INSERT INTO api_usage (user_id, prototype_id, credits_used, credit_grant_id)
    VALUES (p_user_id, p_prototype_id, grant_row.credits_to_use, grant_row.grant_id);
  END LOOP;

  IF credits_needed > 0 THEN
    -- credits_needed reset to 0 above when overage entry added; this branch only runs if logic changes
    INSERT INTO api_usage (user_id, prototype_id, credits_used, credit_grant_id)
    VALUES (p_user_id, p_prototype_id, credits_needed, NULL);
  END IF;

  RETURN QUERY
  SELECT
    true,
    total_available - p_credits,
    consumed,
    balances,
    CASE
      WHEN overage_amount > 0 THEN format('Overage recorded: %s credits beyond available balance', overage_amount)
      ELSE NULL::TEXT
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION consume_credits(UUID, UUID, NUMERIC) TO authenticated, service_role;
