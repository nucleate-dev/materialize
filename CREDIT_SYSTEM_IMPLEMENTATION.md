# Credit-Based Usage System Implementation Summary

## Overview
Successfully implemented a flexible credit-based system to replace the message-count based usage tracking. The system supports variable credit costs (e.g., 1.2 credits per operation), monthly billing periods with no rollover, and automatic credit grants on subscription renewals.

---

## What Was Implemented

### 1. Database Schema Changes ✅
**Location:** `database/migrations/`

Created two migration files:
- **001_add_credits_to_api_usage.sql** - Adds `credits_used` column (DECIMAL) to existing `api_usage` table
  - Includes RLS policies for authenticated users to insert/view their own usage
  - Service role has full access for backend operations
- **002_create_credit_grants_table.sql** - Creates new `credit_grants` table to track when credits are granted to users
  - Includes RLS policies for authenticated users to view their own grants
  - Only service role can insert grants (via Stripe webhooks)

**Security Features:**
- Row Level Security (RLS) enabled on both tables
- Authenticated users can only access their own data (user_id matches auth.uid())
- Service role bypasses RLS for backend operations
- Users can insert their own API usage events but cannot insert credit grants

**Next Step:** Run these migrations in your Supabase database (see `database/migrations/README.md` for instructions)

### 2. TypeScript Type Definitions ✅
**Location:** `server/control-plane/types/supabase.ts`

Updated Supabase types to include:
- `credits_used` field in `api_usage` table types
- Complete `credit_grants` table type definitions

### 3. Credit Constants ✅
**Location:** `web-application/src/GlobalConstants.ts`

Added `CreditLimits` constant:
```typescript
CreditLimits = {
  FREE: 15,
  PLUS: 50,
  PRO: 100,
  MAX: 500,
  TEAM: 100
}
```

Deprecated `MessageLimits` in favor of the new credit system.

### 4. Credit Management Utilities ✅
**Location:** `server/control-plane/utils/subscriptionChecks.ts`

Added new functions:
- **`getTotalCreditsGranted()`** - Calculates total credits granted in current billing period
- **`getTotalCreditsUsed()`** - Calculates total credits consumed in current billing period
- **`getRemainingCredits()`** - Returns remaining credit balance with metadata
- **`hasExceededCreditLimit()`** - Checks if user has exceeded their credit limit (replaces `hasExceededChatUsageLimit`)

### 5. Stripe Webhook Integration ✅
**Location:** `web-application/src/app/api/payments/handle-subscription/route.ts`

Updated `handleInvoicePaid()` to:
- Grant credits when invoice is paid (subscription renewal)
- Insert record into `credit_grants` table
- Calculate credit amount based on subscription plan
- Track billing period for each credit grant

Also updated:
- `getPlanKey()` - Now includes PLUS and MAX subscription tiers
- Added `getCreditsForPlan()` - Maps plan to credit amount
- Added `CREDIT_GRANT_ERROR` event to logging

### 6. Usage Tracking Updates ✅

**Chat Usage Tracking**
**Location:** `server/control-plane/services/chat/utils/usage-tracking.ts`

Updated `trackChatUsage()`:
- Added optional `creditsUsed` parameter (default 1.0)
- Records `credits_used` in database
- Returns both `updatedMessageCount` and `totalCreditsUsed`
- Sends credit amount to Stripe meter events for Pro users

**Build Worker Usage Tracking**
**Location:** `server/build-workers/services/utils/usage-tracking.ts`

Updated `trackApiUsageBuildWorker()`:
- Added optional `creditsUsed` parameter (default 1.0)
- Records `credits_used` in database
- Returns both `updatedMessageCount` and `totalCreditsUsed`

### 7. Generic Credit Usage Utility ✅
**Location:** `server/control-plane/utils/creditUsage.ts` (NEW FILE)

Created reusable utility functions:
- **`recordCreditUsage()`** - Generic function to record any credit usage
- **`recordSingleCreditUsage()`** - Convenience function for 1.0 credit operations

---

## Files Modified

1. `database/migrations/001_add_credits_to_api_usage.sql` (NEW)
2. `database/migrations/002_create_credit_grants_table.sql` (NEW)
3. `database/migrations/README.md` (NEW)
4. `server/control-plane/types/supabase.ts` (MODIFIED)
5. `web-application/src/GlobalConstants.ts` (MODIFIED)
6. `server/control-plane/utils/subscriptionChecks.ts` (MODIFIED)
7. `web-application/src/app/api/payments/handle-subscription/route.ts` (MODIFIED)
8. `web-application/src/LoggingEvents.ts` (MODIFIED)
9. `server/control-plane/services/chat/utils/usage-tracking.ts` (MODIFIED)
10. `server/build-workers/services/utils/usage-tracking.ts` (MODIFIED)
11. `server/control-plane/utils/creditUsage.ts` (NEW)

---

## Next Steps

### 1. Run Database Migrations (REQUIRED)
Before deploying the code, you MUST run the SQL migrations:
```bash
# Option 1: Via Supabase Dashboard SQL Editor
# Run each file in order:
# - database/migrations/001_add_credits_to_api_usage.sql
# - database/migrations/002_create_credit_grants_table.sql

# Option 2: Via psql
psql $DATABASE_URL < database/migrations/001_add_credits_to_api_usage.sql
psql $DATABASE_URL < database/migrations/002_create_credit_grants_table.sql
```

### 2. Update API Endpoints to Use New Credit Functions
Search for all usages of `hasExceededChatUsageLimit` and replace with `hasExceededCreditLimit`:

```bash
# Find all occurrences
grep -r "hasExceededChatUsageLimit" server/ web-application/
```

Update these endpoints to:
- Import and use `hasExceededCreditLimit` instead
- Update error messages to mention "credits" instead of "messages"

### 3. Update Frontend to Display Credits
Find where usage limits are displayed in the UI and update to show:
- "X credits remaining" instead of "X messages remaining"
- Credit balance in user dashboard/settings
- Credit usage history (optional)

Search for:
```bash
# Find frontend components displaying usage
grep -r "MessageLimits\|message.*limit\|messages remaining" web-application/src/
```

### 4. Optional: Backfill Credits for Existing Users
If you want to grant credits to existing active subscriptions immediately:

```sql
-- Get all active subscriptions and grant credits
INSERT INTO credit_grants (user_id, credits_granted, subscription_id, grant_reason, billing_period_start, billing_period_end)
SELECT
  user_id,
  CASE plan_id
    WHEN 'free' THEN 15
    WHEN 'plus' THEN 50
    WHEN 'pro' THEN 100
    WHEN 'max' THEN 500
    WHEN 'team' THEN 100
  END as credits_granted,
  id as subscription_id,
  'backfill' as grant_reason,
  to_timestamp(current_period_start) as billing_period_start,
  to_timestamp(current_period_end) as billing_period_end
FROM subscriptions
WHERE status = 'active';
```

### 5. Testing Checklist

- [ ] Run migrations in development database
- [ ] Test subscription webhook with test Stripe events
- [ ] Verify credits are granted on subscription renewal
- [ ] Test credit usage tracking with different amounts (1.0, 1.5, etc.)
- [ ] Verify `hasExceededCreditLimit` correctly blocks users at 0 credits
- [ ] Test credit calculation across billing period boundaries
- [ ] Verify Stripe meter events still work for Pro users
- [ ] Check all API endpoints that previously used message limits

### 6. Environment Variables
Ensure these are set (should already exist):
```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_PLUS_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx
STRIPE_MAX_PRICE_ID=price_xxx
STRIPE_TEAM_PRICE_ID=price_xxx
```

---

## How the Credit System Works

### Credit Grant Flow
1. User subscribes or subscription renews
2. Stripe sends `invoice.paid` webhook
3. Webhook handler:
   - Updates `subscriptions` table
   - Determines credit amount from plan
   - Inserts record into `credit_grants` table with billing period
4. Credits are now available for the billing period

### Credit Usage Flow
1. User performs an action (chat message, code generation, etc.)
2. Application calls `trackChatUsage()` or `trackApiUsageBuildWorker()` with `creditsUsed` parameter
3. Function inserts into `api_usage` table with `credits_used` value
4. For Pro users, sends credit amount to Stripe meter

### Credit Checking Flow
1. Before allowing an action, call `hasExceededCreditLimit()`
2. Function calculates:
   - Total credits granted in current period
   - Total credits used in current period
   - Remaining = granted - used
3. Returns whether user has exceeded limit (remaining <= 0)

### Free Users
- Receive credits at start of each calendar month (not via Stripe)
- Credits calculated using `getCurrentMonthPeriod()`
- If no credit grants exist, `getRemainingCredits()` uses plan limit as granted amount

---

## Variable Credit Costs Examples

With this implementation, you can now charge different amounts for different operations:

```typescript
// Example 1: Simple chat message = 1 credit
await trackChatUsage(..., creditsUsed: 1.0);

// Example 2: Complex AI operation = 2.5 credits
await trackChatUsage(..., creditsUsed: 2.5);

// Example 3: Image generation = 5 credits
await recordCreditUsage(jwtToken, userId, 5.0, prototypeId, ...);

// Example 4: Light operation = 0.5 credits
await recordCreditUsage(jwtToken, userId, 0.5, prototypeId, ...);
```

---

## Migration Notes

### Backward Compatibility
The existing `hasExceededChatUsageLimit` function still exists but should be replaced with `hasExceededCreditLimit`. Update all references at your convenience.

### Existing Data
All existing rows in `api_usage` will default to `credits_used: 1.0` due to the migration's DEFAULT clause. This maintains backward compatibility.

### Free Users
Free users don't get credit grants via Stripe. The system handles this by:
- Using calendar month as billing period
- Treating plan limit as granted amount when no grants exist
- This is implemented in `getRemainingCredits()`

---

## Support

For questions or issues with this implementation:
1. Check the migration README: `database/migrations/README.md`
2. Review function documentation in source files
3. Test in development environment before production deployment

---

**Implementation Date:** 2025-11-15
**System Version:** Credit-based v1.0
