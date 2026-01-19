# Login + Team SSO Implementation Plan

## 1. `/login` page: expose SSO flow
1. Audit the existing login UI (`web-application/src/app/(auth)/login/page.tsx` and `LoginForm.tsx`) to understand how the Supabase client is initialized and how redirects are handled after authentication.
2. Introduce a new `LoginWithSsoButton` component inside the login page that:
   - Presents a primary button labeled "Login with SSO".
   - When clicked, reveals a controlled input for the user’s company domain (ex: `acme.com`) plus a submit action; the UI should validate basic domain formatting and surface Supabase errors inline.
3. On submit, call `supabase.auth.signInWithSSO({ domain, options: { redirectTo: callbackUrl } })`, where `redirectTo` mirrors the email/password flow (honors `next` query param if present). Display a loading state until the browser begins the redirect provided by Supabase.
4. Track analytics/telemetry (same mechanism as other auth events) so we can monitor SSO attempts vs. completions.
5. Add empty-state messaging that points users without SSO access back to email/password, and document the new flow in internal auth docs so GTM and support can guide customers.

## 2. Supabase migration + trigger changes
1. Create a new timestamped SQL migration under `supabase/migrations` that:
   - Adds `is_sso_user boolean not null default false` to `public.users`.
   - Adds `sso_provider_id uuid default null` to `public.teams` plus an index for lookup from the trigger.
2. Update the `handle_new_user` trigger function in the migration:
   - Determine `v_is_sso_user` via `coalesce(new.raw_app_meta_data ->> 'provider', '') = 'saml'` or a custom flag (ex: `new.raw_user_meta_data ->> 'sso_provider_id'`). Store that value when upserting into `public.users`.
   - If `v_is_sso_user` is false, keep the existing personal-team creation path unchanged.
   - If `v_is_sso_user` is true:
     1. Skip inserting a personal team.
     2. Resolve `v_team_id` by matching `new.raw_user_meta_data ->> 'sso_provider_id'` (sent through the SAML assertion / Supabase metadata) to `teams.sso_provider_id`.
     3. Insert a membership row with role `viewer` for that team (idempotent on `team_id, user_id`), and raise an exception/log if no matching team is found so we know to pre-provision teams before enabling SSO.
3. Extend automated tests or seed scripts (if any) to cover both flows: personal team creation and SSO-driven membership creation.
4. Document the metadata contract (which SAML attribute carries `sso_provider_id`) so identity administrators can configure their IdP appropriately.

## 3. Bootstrapping the first SSO organization
1. Provision an SSO-ready team manually (via SQL, Supabase SQL editor, or an internal tool):
   - Generate a UUID to serve as the `sso_provider_id`.
   - Insert a `teams` row with that `sso_provider_id`, mark the creator as an internal admin user, and optionally seed default resources (projects, billing info, etc.).
2. Configure the customer’s IdP (Okta/AAD/etc.) so that every authentication response sends the generated UUID in a dedicated SAML attribute (e.g., `nucleate:sso_provider_id`). Map that attribute into Supabase `raw_user_meta_data` by updating the Supabase SAML attribute mapping.
3. For the very first SSO user:
   - Invite them via Supabase magic link (or create the user admin-side) using their corporate email so that the new auth record exists.
   - Manually insert a `team_memberships` row granting them `owner` role for the provisioned team, update `teams.created_by` if necessary, and set `users.is_sso_user = true`.
   - Verify they can sign in via SSO and land inside the shared team with owner permissions.
4. Build an internal admin script (e.g., under `internal-tools`) that can:
   - Create/update teams with `sso_provider_id`.
   - Promote/demote members and toggle `is_sso_user`.
   - Trigger backfills if multiple SSO orgs need to be onboarded.
5. Document the onboarding checklist so CSMs know how to generate UUIDs, configure IdPs, seed the first owner, and confirm the trigger-driven membership flow works before opening access to the rest of the org.
