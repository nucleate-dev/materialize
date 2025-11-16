# Credit Consumption Transactional Plan

## Goals
- Guarantee FIFO credit consumption without double-spending when multiple chats/builds run concurrently.
- Keep `credit_grants` immutable (grant rows are append-only, no balance columns).
- Expose a single RPC that both the control plane and build workers call so all credit mutations live in the database.
- Preserve detailed `api_usage` history tied to each grant for analytics/billing.

## Proposed Architecture
1. **Postgres Stored Procedure**
   - New function `consume_credits(p_user_id UUID, p_prototype_id UUID, p_credits NUMERIC, p_metadata JSONB)`:
     1. Select eligible grants `FOR UPDATE` ordered by `expires_at` (scoped to `user_id` to avoid cross-user contention).
     3. Loop through grants, decrement `credits_remaining` computed via `credits_granted - COALESCE(SUM(credits_used), 0)` inside the transaction.
     4. Insert one `api_usage` row per grant chunk with `credit_grant_id`.
     5. Return the new total remaining credits plus metadata (e.g., grant ids consumed).
   - Wrap all logic in a single transaction so concurrent executions wait on the row-level locks instead of overspending.

2. **Supabase RPC Wrapper**
   - Expose the function via `supabase.rpc('consume_credits', ...)`.
   - Allow calls from:
     - Control-plane server (service role key).
     - Build worker (user JWT) by creating a SECURITY DEFINER wrapper function that enforces `auth.uid() = p_user_id`.

3. **API Usage Model Changes**
   - Keep `api_usage` insert logic entirely inside the procedure.
   - Remove ad-hoc TypeScript logic that loops through grants; clients simply call RPC and use the returned summary.

4. **Observability**
   - Add logging table (or emit `RAISE LOG`) capturing failures or insufficient balance attempts with `user_id`, `credits_requested`, `credits_available`.
   - Emit Prometheus/PostHog event whenever RPC throws due to insufficient credits.

## Implementation Steps
1. **DB Layer**
   - Write the SQL function with explicit transaction handling and row-level locking.
   - Add helper view `credit_grant_balances` (`credits_granted - used`) to simplify queries both inside/outside the function.
   - Update RLS/policies so only the function mutates usage; raw inserts from the client should be blocked afterwards.

2. **Server Code**
   - Replace `recordCreditUsage`, `trackChatUsage`, and `trackApiUsageBuildWorker` to call `supabase.rpc('consume_credits', ...)`.
   - Handle RPC errors (insufficient credits, expired grant set) and bubble them up to paywall logic.
   - Update TypeScript types to reflect the RPC response payload.

3. **Backfill & Deployment**
   - Deploy SQL function first, then switch servers/workers to the RPC.
   - Remove obsolete code paths that directly insert into `api_usage`.
   - Add feature flag to fall back to legacy path during rollout if needed.

4. **Testing Plan**
   - Unit test SQL procedure with pgTAP or script: parallel invocations requesting overlapping credits.
   - Integration tests:
     - Simulate concurrent chat + build worker usage for same user to ensure final balance matches expectation.
     - Verify insufficient credit error path returns deterministic error message.
   - Load test: stress RPC with dozens of concurrent requests to ensure no deadlocks/timeouts.

## Open Questions (Resolved)
- We will **not** delete expired grants yet; table cleanup can be revisited later once usage patterns are clearer.
- The RPC response should include per-grant metadata (granted, used, remaining, expiration) so clients can optionally surface detailed usage visuals.
- Supabase RPC latency is acceptable for this scope—no dedicated app-server proxy is planned; optimizations should focus on the SQL function itself.
