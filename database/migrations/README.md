# Database Migrations

This directory contains SQL migration files for the credit-based usage system.

## Running Migrations

These migrations need to be executed in your Supabase database in order:

### Option 1: Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Run each migration file in numerical order:
   - `001_add_credits_to_api_usage.sql`
   - `002_create_credit_grants_table.sql`
   - `003_create_consume_credits_function.sql`

### Option 2: Supabase CLI
If you have the Supabase CLI installed and linked to your project:

```bash
# From the project root
supabase db push --include-all
```

Or run individually:
```bash
psql $DATABASE_URL < database/migrations/001_add_credits_to_api_usage.sql
psql $DATABASE_URL < database/migrations/002_create_credit_grants_table.sql
psql $DATABASE_URL < database/migrations/003_create_consume_credits_function.sql
```

## Migration Files

### 001_add_credits_to_api_usage.sql
- Adds `credits_used` column to the `api_usage` table
- Supports decimal values (e.g., 1.2 credits per operation)
- Default value: 1.0
- Adds index for performance
- **RLS Policies:**
  - Enables Row Level Security on `api_usage` table
  - Authenticated users can insert their own usage events (user_id must match auth.uid())
  - Authenticated users can read their own usage records
  - Service role has full access for backend operations

### 002_create_credit_grants_table.sql
- Creates new `credit_grants` table to track when credits are given to users
- Adds billing period start/end timestamps plus expiration timestamps
- Links to subscriptions table
- Includes indexes plus a unique constraint on `(subscription_id, billing_period_start)` so Stripe retries cannot double-grant credits

### 003_create_consume_credits_function.sql
- Adds `credit_grant_balances` view for live granted/used/remaining metrics
- Introduces `consume_credits` stored procedure that performs FIFO credit consumption in a single transaction
- Grants authenticated clients the ability to call the RPC while keeping detailed `consumed_grants` metadata in the response
- **RLS Policies:**
  - Enables Row Level Security on `credit_grants` table
  - Authenticated users can read their own credit grants
  - Only service role can insert credit grants (via Stripe webhooks or admin actions)
  - Service role has full access for backend operations

## After Running Migrations

After running these migrations, you'll need to:
1. Regenerate TypeScript types: See `server/control-plane/types/supabase.ts`
2. Deploy updated code that uses the credit system

## Rollback

If you need to rollback these changes:

```sql
-- Rollback 002: Drop credit_grants table and its policies
DROP POLICY IF EXISTS "Service role has full access to credit grants" ON credit_grants;
DROP POLICY IF EXISTS "Users can view their own credit grants" ON credit_grants;
DROP TABLE IF EXISTS credit_grants;

-- Rollback 001: Remove RLS policies, index, and credits_used column
DROP POLICY IF EXISTS "Service role has full access to API usage" ON api_usage;
DROP POLICY IF EXISTS "Users can view their own API usage" ON api_usage;
DROP POLICY IF EXISTS "Users can insert their own API usage" ON api_usage;
ALTER TABLE api_usage DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_api_usage_user_credits;
ALTER TABLE api_usage DROP COLUMN IF EXISTS credits_used;
```

**⚠️ Warning:** Rollback will:
- Delete all credit grant history
- Remove RLS policies (may affect security)
- Drop the credits_used column (data loss)

Make sure to backup your data first and understand the implications before rolling back.
