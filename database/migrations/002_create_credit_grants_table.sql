-- Migration: Create credit_grants table
-- Description: Track when credits are granted to users with individual expiration dates
-- Date: 2025-11-15
-- Updated: 2025-11-15 - Added expirable credits with FIFO consumption support

CREATE TABLE IF NOT EXISTS credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits_granted DECIMAL(10,2) NOT NULL CHECK (credits_granted > 0),
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  grant_reason TEXT,
  grant_type TEXT NOT NULL DEFAULT 'subscription',
  billing_period_start TIMESTAMPTZ,
  billing_period_end TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_credit_grants_user_id
ON credit_grants(user_id);

-- Index for finding active (non-expired) credits
CREATE INDEX IF NOT EXISTS idx_credit_grants_active
ON credit_grants(user_id, expires_at) WHERE expires_at > NOW();

CREATE INDEX IF NOT EXISTS idx_credit_grants_subscription
ON credit_grants(subscription_id);

CREATE INDEX IF NOT EXISTS idx_credit_grants_created_at
ON credit_grants(created_at DESC);

-- Unique constraint to prevent duplicate grants for the same subscription period
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_grants_subscription_period
ON credit_grants(subscription_id, billing_period_start)
WHERE subscription_id IS NOT NULL AND billing_period_start IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE credit_grants IS 'Tracks credit grants to users with individual expiration dates and FIFO consumption';
COMMENT ON COLUMN credit_grants.credits_granted IS 'Total number of credits originally granted';
COMMENT ON COLUMN credit_grants.subscription_id IS 'Reference to the subscription that triggered this grant (nullable for credit packs/admin grants)';
COMMENT ON COLUMN credit_grants.grant_reason IS 'Reason for the credit grant (e.g., subscription_renewal, credit_pack_purchase, admin_grant, promotion)';
COMMENT ON COLUMN credit_grants.grant_type IS 'Type of grant: subscription, credit_pack, admin_grant';
COMMENT ON COLUMN credit_grants.billing_period_start IS 'Start of the billing period the credits apply to (used for idempotency)';
COMMENT ON COLUMN credit_grants.billing_period_end IS 'End of the billing period the credits apply to (used for expirations)';
COMMENT ON COLUMN credit_grants.expires_at IS 'When these credits expire (for FIFO consumption ordering)';

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
