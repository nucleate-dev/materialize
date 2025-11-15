-- Migration: Create credit_grants table
-- Description: Track when credits are granted to users (e.g., on subscription renewal)
-- Date: 2025-11-15

-- Create credit_grants table
CREATE TABLE IF NOT EXISTS credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits_granted DECIMAL(10,2) NOT NULL CHECK (credits_granted > 0),
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  grant_reason TEXT,
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure billing period is valid
  CONSTRAINT valid_billing_period CHECK (billing_period_end > billing_period_start)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_credit_grants_user_id
ON credit_grants(user_id);

CREATE INDEX IF NOT EXISTS idx_credit_grants_user_period
ON credit_grants(user_id, billing_period_start, billing_period_end);

CREATE INDEX IF NOT EXISTS idx_credit_grants_subscription
ON credit_grants(subscription_id);

CREATE INDEX IF NOT EXISTS idx_credit_grants_created_at
ON credit_grants(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE credit_grants IS 'Tracks credit grants to users, typically from subscription renewals';
COMMENT ON COLUMN credit_grants.credits_granted IS 'Number of credits granted to the user';
COMMENT ON COLUMN credit_grants.subscription_id IS 'Reference to the subscription that triggered this grant (nullable for admin grants)';
COMMENT ON COLUMN credit_grants.grant_reason IS 'Reason for the credit grant (e.g., subscription_renewal, admin_grant, promotion)';
COMMENT ON COLUMN credit_grants.billing_period_start IS 'Start of the billing period for these credits';
COMMENT ON COLUMN credit_grants.billing_period_end IS 'End of the billing period for these credits';

-- ================================================================================================
-- Row Level Security (RLS) Policies
-- ================================================================================================

-- Enable RLS on credit_grants table
ALTER TABLE credit_grants ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read their own credit grants
-- Users can only view records where user_id matches their authenticated user ID
CREATE POLICY "Users can view their own credit grants"
  ON credit_grants
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- Policy: Allow service role to bypass RLS (for server-side operations)
-- This allows your backend services to insert/read/update all records using the service role key
-- Credit grants should only be created by the system (via Stripe webhooks or admin actions)
CREATE POLICY "Service role has full access to credit grants"
  ON credit_grants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
