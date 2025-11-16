-- Adds a flag to distinguish free-tier usage rows.
ALTER TABLE public.api_usage
ADD COLUMN IF NOT EXISTS is_free_tier BOOLEAN NOT NULL DEFAULT false;
