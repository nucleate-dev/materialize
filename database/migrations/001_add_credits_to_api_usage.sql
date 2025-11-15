-- Migration: Add credits_used column to api_usage table
-- Description: Support variable credit costs per API usage event with FIFO consumption tracking
-- Date: 2025-11-15
-- Updated: 2025-11-15 - Added credit_grant_id for linking to specific credit grants

-- Add credits_used column with default value of 1.0
ALTER TABLE api_usage
ADD COLUMN IF NOT EXISTS credits_used DECIMAL(10,2) NOT NULL DEFAULT 1.0;

-- Add credit_grant_id to link usage to specific grant (for FIFO consumption tracking)
ALTER TABLE api_usage
ADD COLUMN IF NOT EXISTS credit_grant_id UUID REFERENCES credit_grants(id) ON DELETE SET NULL;

-- Add index for better query performance when summing credits
CREATE INDEX IF NOT EXISTS idx_api_usage_user_credits
ON api_usage(user_id, created_at, credits_used);

-- Add index for efficient lookups by credit grant
CREATE INDEX IF NOT EXISTS idx_api_usage_credit_grant
ON api_usage(credit_grant_id);

-- Add comment to document the columns
COMMENT ON COLUMN api_usage.credits_used IS 'Amount of credits consumed by this API usage event (supports decimal values like 1.2)';
COMMENT ON COLUMN api_usage.credit_grant_id IS 'Reference to the specific credit grant this usage consumed from (for FIFO tracking)';

-- ================================================================================================
-- Row Level Security (RLS) Policies
-- ================================================================================================

-- Enable RLS on api_usage table
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to insert their own API usage events
-- Users can only insert records where user_id matches their authenticated user ID
CREATE POLICY "Users can insert their own API usage"
  ON api_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

-- Policy: Allow authenticated users to read their own API usage records
-- Users can only view records where user_id matches their authenticated user ID
CREATE POLICY "Users can view their own API usage"
  ON api_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

-- Policy: Allow service role to bypass RLS (for server-side operations)
-- This allows your backend services to read/write all records using the service role key
CREATE POLICY "Service role has full access to API usage"
  ON api_usage
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
