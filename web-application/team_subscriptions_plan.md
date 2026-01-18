# Teams Plan Subscription Implementation

## Stripe Checkout (web + control plane)

- Extend `productID` enums in `web-application/src/lib/utils/payments/CheckoutUtils.ts` and the source of `CheckoutRequestBody` (`server/control-plane/types/PublicAPITypes.ts`) to include `"team"` (or `"teams"` if the plan is named that way) and re-run the shared type sync so both apps compile.
- Update `StripeManagementService` validation (`server/control-plane/services/StripeManagementService.ts`) to recognize the Teams plan, map it to `process.env.STRIPE_TEAM_PRICE_ID`, and keep `mode: "subscription"`.
- Replace the hard-coded `quantity: 1` in the checkout session creation with the number of paid seats for the `teamId` (count owner/admin/editor memberships plus the acting user). Store that quantity in the checkout/session metadata so the webhook can reconcile it.
- Surface a Teams upgrade CTA in the dashboard (e.g., `web-application/src/components/dashboard/TeamAndAccountSettingsDialog/CreditsAndSubscriptionsTab.tsx`) that calls `handleCheckout("team", …)` for owners/admins.

## Database schema

- Add `seat_quantity integer not null default 0` and `stripe_subscription_item_id text` columns to `public.subscriptions`, plus any indexes needed for frequent lookups by `team_id`.
- Regenerate `supabase.ts` and `PublicAPITypes.ts` so both the Next.js app and control plane know about the new fields.

## Webhook updates

- In `web-application/src/app/api/payments/handle-subscription/route.ts`, persist the new columns in both `handleInvoicePaid` and `handleSubscriptionUpdated`, using the latest Stripe subscription item data (`items.data[0].id`, `quantity`).
- The existing `getPlanKey` already maps `STRIPE_TEAM_PRICE_ID` to `"team"` and `CreditLimits` includes `TEAM`, so no other webhook credit logic changes are required once seat counts are tracked.

## Team invite + role management

- **Send invite (`server/control-plane/services/team-management/handlers/handleSendInvite.ts`):** before inserting invites for editor/admin roles, read the current active Teams subscription for the `team_id`. If `seat_quantity` equals the number of paid members + pending paid invites, either block the invite or preemptively increment the Stripe quantity (preferred for auto-scaling seats).
- **Accept invite (`.../handleAcceptInvite.ts`):** right after creating the membership, if the invite role is `viewer`, do nothing. Otherwise, call a helper that increments the Stripe subscription item quantity, updates `seat_quantity`, and logs PostHog events. If Stripe fails, roll back the membership to avoid unbilled seats.
- **Change role (`.../handleUpdateMemberRole.ts`):** implement the existing TODO so any transition from viewer→paid role increments the Stripe quantity and any paid→viewer transition decrements it (never go below the number of existing paid members). Deleting a membership should also decrement seats.
- Consider extracting a shared seat-management helper that counts paid members, updates Stripe, persists `seat_quantity`, and emits analytics so all three flows stay consistent.

## Operational steps & testing

1. Configure `STRIPE_TEAM_PRICE_ID` to point to a per-seat $35 monthly price and ensure it is present in every environment (`.env` for the web app and control plane, any Supabase edge functions, etc.).
2. Run the schema migration, regenerate Supabase types, and re-sync public API types.
3. Implement the checkout + invite/role logic, then test end-to-end:
   - Purchase Teams with multiple seats.
   - Accept invites for editor/admins and confirm Stripe quantity increases instantly.
   - Downgrade a member to viewer and verify Stripe decrements the seat and the DB row updates.
   - Remove a member entirely and ensure you no longer pay for that seat.
4. Monitor the PostHog events/new logs for `StripeManagementService` and TeamManagement handlers to confirm seat adjustments are tracked; add alerts if seat counts drift from actual memberships.
