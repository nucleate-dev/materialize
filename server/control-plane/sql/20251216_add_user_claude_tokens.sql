-- Migration: Add user_claude_tokens table for storing Claude Code OAuth tokens
-- This allows users to connect their Claude Pro/Max subscriptions

CREATE TABLE IF NOT EXISTS public.user_claude_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The token from `claude setup-token`
  oauth_token TEXT NOT NULL,

  -- Token metadata
  token_type TEXT DEFAULT 'setup-token' CHECK (token_type IN ('setup-token', 'oauth')),

  -- Status tracking
  is_valid BOOLEAN DEFAULT true NOT NULL,
  last_used_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  validation_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Ensure one token per user
  CONSTRAINT user_claude_tokens_user_id_unique UNIQUE (user_id)
);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_user_claude_tokens_user_id ON public.user_claude_tokens(user_id);

-- Create index for validity checks
CREATE INDEX IF NOT EXISTS idx_user_claude_tokens_is_valid ON public.user_claude_tokens(is_valid) WHERE is_valid = true;

-- Enable Row Level Security
ALTER TABLE public.user_claude_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own tokens
CREATE POLICY "Users can read own tokens"
  ON public.user_claude_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own tokens
CREATE POLICY "Users can insert own tokens"
  ON public.user_claude_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own tokens
CREATE POLICY "Users can update own tokens"
  ON public.user_claude_tokens
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own tokens
CREATE POLICY "Users can delete own tokens"
  ON public.user_claude_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_user_claude_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
CREATE TRIGGER update_user_claude_tokens_updated_at
  BEFORE UPDATE ON public.user_claude_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_claude_tokens_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_claude_tokens TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.user_claude_tokens IS 'Stores Claude Code OAuth tokens for users to connect their Pro/Max subscriptions';
COMMENT ON COLUMN public.user_claude_tokens.oauth_token IS 'The OAuth token from claude setup-token command';
COMMENT ON COLUMN public.user_claude_tokens.is_valid IS 'Whether the token is currently valid and usable';
COMMENT ON COLUMN public.user_claude_tokens.validation_error IS 'Error message if token validation failed';
