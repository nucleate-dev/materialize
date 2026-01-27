-- API Keys table for MCP and programmatic access
-- Run this migration in Supabase SQL Editor

-- Create the api_keys table
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    -- Store hashed key, never the raw key
    key_hash VARCHAR(64) NOT NULL,
    -- Key prefix for identification (first 8 chars of the key)
    key_prefix VARCHAR(12) NOT NULL,
    -- Scopes: comma-separated list like 'prototypes:read,prototypes:write,files:read,files:write'
    scopes TEXT NOT NULL DEFAULT 'prototypes:read,prototypes:write,files:read,files:write,dev-server:control',
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT api_keys_name_length CHECK (char_length(name) >= 1)
);

-- Index for fast lookups by key_hash (used during auth)
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);

-- Index for listing user's keys
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);

-- Index for listing team's keys
CREATE INDEX IF NOT EXISTS idx_api_keys_team_id ON public.api_keys(team_id);

-- RLS policies
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Users can view their own API keys
CREATE POLICY "Users can view own api keys"
    ON public.api_keys
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create API keys for teams they belong to
CREATE POLICY "Users can create api keys for their teams"
    ON public.api_keys
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.team_memberships
            WHERE team_memberships.team_id = api_keys.team_id
            AND team_memberships.user_id = auth.uid()
        )
    );

-- Users can update (revoke) their own API keys
CREATE POLICY "Users can update own api keys"
    ON public.api_keys
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own API keys
CREATE POLICY "Users can delete own api keys"
    ON public.api_keys
    FOR DELETE
    USING (auth.uid() = user_id);

-- Function to validate API key and return user info
-- This bypasses RLS since it's called during authentication
CREATE OR REPLACE FUNCTION public.validate_api_key(p_key_hash VARCHAR(64))
RETURNS TABLE (
    user_id UUID,
    team_id UUID,
    scopes TEXT,
    key_id UUID
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update last_used_at and return key info
    RETURN QUERY
    UPDATE public.api_keys
    SET last_used_at = NOW()
    WHERE api_keys.key_hash = p_key_hash
        AND api_keys.revoked_at IS NULL
        AND (api_keys.expires_at IS NULL OR api_keys.expires_at > NOW())
    RETURNING
        api_keys.user_id,
        api_keys.team_id,
        api_keys.scopes,
        api_keys.id;
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.validate_api_key(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_api_key(VARCHAR) TO service_role;
