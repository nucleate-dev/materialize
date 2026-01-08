# Supabase OAuth (Team-Level) Setup

## Redirect URL
- `https://<app-domain>/settings/supabase/callback`

## Required environment variables
- `SUPABASE_OAUTH_AUTHORIZE_URL`
- `SUPABASE_OAUTH_TOKEN_URL`
- `SUPABASE_OAUTH_CLIENT_ID`
- `SUPABASE_OAUTH_CLIENT_SECRET`
- `SUPABASE_OAUTH_REDIRECT_URL`
- `SUPABASE_OAUTH_SCOPES`
- `SUPABASE_MANAGEMENT_API_URL`

## Manual test steps
1. Enable the `supabase-backend` feature flag in PostHog for your user.
2. Open the dashboard and navigate to the Team settings modal.
3. Open the **Supabase** tab and click **Connect Supabase**.
4. Complete the Supabase OAuth flow and verify you return to the dashboard with a success toast.
5. Confirm the connection details show the organization name/slug.
6. Click **Disconnect Supabase** and verify the connection resets.
