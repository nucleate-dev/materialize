-- Migration: Create user_onboarding_survey table
-- Created: 2025-12-08
-- Description: Stores user responses to the welcome survey shown after signup

-- Create the user_onboarding_survey table
CREATE TABLE IF NOT EXISTS user_onboarding_survey (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  use_cases TEXT[] NOT NULL DEFAULT '{}', -- Array for multi-select (e.g., {'personal_project', 'learning_development'})
  use_cases_other TEXT, -- Free text if user selects "Other" for use cases
  role TEXT NOT NULL, -- Single select (e.g., 'software_engineer')
  role_other TEXT, -- Free text if user selects "Other" for role
  ai_coding_experience TEXT NOT NULL, -- Single select (e.g., 'regular_user')
  referral_source TEXT NOT NULL, -- Single select (e.g., 'instagram')
  referral_source_other TEXT, -- Free text if user selects "Other" for referral source
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_onboarding_survey_user_id ON user_onboarding_survey(user_id);

-- Create index for analytics queries on referral_source
CREATE INDEX IF NOT EXISTS idx_user_onboarding_survey_referral_source ON user_onboarding_survey(referral_source);

-- Create index for analytics queries on role
CREATE INDEX IF NOT EXISTS idx_user_onboarding_survey_role ON user_onboarding_survey(role);

-- Enable Row Level Security
ALTER TABLE user_onboarding_survey ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own survey responses
CREATE POLICY "Users can read own survey"
  ON user_onboarding_survey
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own survey responses (one-time)
CREATE POLICY "Users can insert own survey"
  ON user_onboarding_survey
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own survey responses
CREATE POLICY "Users can update own survey"
  ON user_onboarding_survey
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add comment to table
COMMENT ON TABLE user_onboarding_survey IS 'Stores user responses to the welcome survey shown after signup';

-- Add comments to columns
COMMENT ON COLUMN user_onboarding_survey.use_cases IS 'Array of use case values selected by user (multi-select)';
COMMENT ON COLUMN user_onboarding_survey.use_cases_other IS 'Free text input if user selected "Other" for use cases';
COMMENT ON COLUMN user_onboarding_survey.role IS 'User role/experience level (single select)';
COMMENT ON COLUMN user_onboarding_survey.role_other IS 'Free text input if user selected "Other" for role';
COMMENT ON COLUMN user_onboarding_survey.ai_coding_experience IS 'User experience with AI coding tools (single select)';
COMMENT ON COLUMN user_onboarding_survey.referral_source IS 'Where user heard about Nucleate (single select)';
COMMENT ON COLUMN user_onboarding_survey.referral_source_other IS 'Free text input if user selected "Other" for referral source';
