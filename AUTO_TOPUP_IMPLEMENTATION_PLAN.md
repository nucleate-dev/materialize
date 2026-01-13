# Auto-Top-Up Credit Feature - Implementation Plan

## Executive Summary

This document outlines the complete implementation plan for an automatic credit balance top-up feature. When a paid subscriber's credit balance falls below a configured threshold, the system will automatically charge their saved payment method to purchase a credit pack.

### Key Design Decisions 

- **Eligibility:** Paid subscribers only (users with active subscriptions)
- **Payment Methods:** Support multiple saved payment methods with user selection
- **Failure Handling:** Send immediate email notification on payment failure (no auto-retry)
- **Spending Limits:** Optional monthly spending cap that users can configure

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Database Schema](#database-schema)
3. [Backend Services](#backend-services)
4. [Integration Points](#integration-points)
5. [Frontend Components](#frontend-components)
6. [Webhook Handlers](#webhook-handlers)
7. [Email Notifications](#email-notifications)
8. [Implementation Timeline](#implementation-timeline)
9. [Security & Compliance](#security--compliance)
10. [Testing Strategy](#testing-strategy)
11. [Monitoring & Analytics](#monitoring--analytics)

---

## System Architecture

### High-Level Flow

```
User Consumes Credits
    ↓
trackApiUsageBuildWorker() - consume_credits RPC
    ↓
Check remaining balance
    ↓
Balance ≤ threshold? → YES
    ↓
Fetch auto_topup_rule (if enabled)
    ↓
Validate monthly spending cap
    ↓
Call AutoTopUpService.processTopUp()
    ↓
Create Stripe Payment Intent (off_session=true)
    ↓
Stripe processes payment
    ↓
Webhook: payment_intent.succeeded
    ↓
Create credit_grant record
    ↓
Log auto_topup_transaction
    ↓
Send confirmation email
```

### Key Components

1. **Database:** 3 new tables for payment methods, rules, and transactions
2. **Backend Services:** 2 new services (PaymentMethodService, AutoTopUpService)
3. **Usage Tracking:** Modified to detect threshold crossing
4. **Stripe Integration:** Setup Intents for saving cards, Payment Intents for charging
5. **Webhooks:** New handlers for payment_intent events
6. **Frontend UI:** Account settings with payment method and rule management
7. **Emails:** 4 new email templates for notifications

---

## Database Schema

### 1. `saved_payment_methods` Table

Stores Stripe payment methods (cards, bank accounts) attached to users.

```sql
CREATE TABLE saved_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('card', 'us_bank_account')),
  last4 TEXT NOT NULL,
  brand TEXT,  -- e.g., 'visa', 'mastercard', 'amex'
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_payment_methods_user_id ON saved_payment_methods(user_id);
CREATE UNIQUE INDEX idx_one_default_per_user ON saved_payment_methods(user_id) WHERE is_default = true;
```

**Key Constraints:**

- One default payment method per user (enforced by unique partial index)
- Cascading delete when user is deleted
- `stripe_payment_method_id` must be unique globally

### 2. `auto_topup_rules` Table

Stores user-configured auto-top-up rules (one per user).

```sql
CREATE TABLE auto_topup_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  threshold_credits NUMERIC NOT NULL CHECK (threshold_credits >= 0),
  topup_credit_amount INTEGER NOT NULL CHECK (topup_credit_amount IN (100, 500, 1000)),
  payment_method_id UUID NOT NULL REFERENCES saved_payment_methods(id),
  max_topup_per_month NUMERIC NULL CHECK (max_topup_per_month IS NULL OR max_topup_per_month >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auto_topup_rules_enabled ON auto_topup_rules(enabled) WHERE enabled = true;
```

**Key Constraints:**

- One rule per user (enforced by UNIQUE on user_id)
- `topup_credit_amount` must be 100, 500, or 1000 (matching available credit packs)
- `threshold_credits` cannot be negative
- `max_topup_per_month` is optional but must be non-negative if set

**Example Row:**

```json
{
  "user_id": "abc-123",
  "enabled": true,
  "threshold_credits": 50,
  "topup_credit_amount": 500,
  "payment_method_id": "pm-xyz",
  "max_topup_per_month": 100.0
}
```

_Interpretation: When balance falls to 50 or below, charge $50 for 500 credits, max $100/month._

### 3. `auto_topup_transactions` Table

Audit log of all auto-top-up attempts (success and failure).

```sql
CREATE TABLE auto_topup_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  auto_topup_rule_id UUID NOT NULL REFERENCES auto_topup_rules(id),
  credit_grant_id UUID REFERENCES credit_grants(id),
  stripe_payment_intent_id TEXT UNIQUE,
  amount NUMERIC NOT NULL,  -- Dollar amount charged
  credits_purchased INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auto_topup_transactions_user_id ON auto_topup_transactions(user_id);
CREATE INDEX idx_auto_topup_transactions_created_at ON auto_topup_transactions(created_at);
CREATE INDEX idx_auto_topup_transactions_status ON auto_topup_transactions(status);
```

**Status Flow:**

1. `pending` - Payment Intent created, awaiting Stripe confirmation
2. `succeeded` - Payment confirmed, credits granted
3. `failed` - Payment failed, user notified

---

## Backend Services

### PaymentMethodService

**Location:** `server/control-plane/services/PaymentMethodService.ts`

#### Responsibilities

- Manage user's saved payment methods
- Interface with Stripe Setup Intents
- Attach/detach payment methods from Stripe Customers

#### API Endpoints

##### `POST /payments/setup-intent`

Create a Stripe Setup Intent for collecting payment method without charging.

**Request:**

```typescript
// Headers: Authorization: Bearer <JWT>
```

**Response:**

```typescript
{
  data: {
    client_secret: string  // Pass to Stripe Elements on frontend
  },
  error: null
}
```

**Implementation:**

```typescript
async createSetupIntent(userId: string): Promise<string> {
  const subscriptionInfo = await getSubscriptionInfo(token, userId, logger);

  const setupIntent = await stripe.setupIntents.create({
    customer: subscriptionInfo.stripeCustomerId,
    payment_method_types: ['card', 'us_bank_account'],
    metadata: {
      user_id: userId
    }
  });

  return setupIntent.client_secret;
}
```

##### `POST /payments/save-payment-method`

Save payment method to database after Setup Intent succeeds.

**Request:**

```typescript
{
  stripe_payment_method_id: string,
  set_as_default?: boolean
}
```

**Response:**

```typescript
{
  data: {
    id: string,
    type: 'card' | 'us_bank_account',
    last4: string,
    brand?: string,
    is_default: boolean
  },
  error: null
}
```

##### `GET /payments/payment-methods`

List all saved payment methods for authenticated user.

**Response:**

```typescript
{
  data: [
    {
      id: string,
      type: 'card' | 'us_bank_account',
      last4: string,
      brand?: string,
      is_default: boolean,
      created_at: string
    }
  ],
  error: null
}
```

##### `DELETE /payments/payment-method/:id`

Remove a saved payment method.

**Implementation:**

1. Verify user owns the payment method
2. Check if it's being used by an active auto-top-up rule → reject if true
3. Detach from Stripe customer: `stripe.paymentMethods.detach(stripePaymentMethodId)`
4. Delete from database

##### `PUT /payments/payment-method/:id/set-default`

Set a payment method as default.

**Implementation:**

1. Start transaction
2. Set all user's payment methods `is_default = false`
3. Set target payment method `is_default = true`
4. Commit transaction

---

### AutoTopUpService

**Location:** `server/control-plane/services/AutoTopUpService.ts`

#### Responsibilities

- Manage auto-top-up rules
- Trigger automatic credit purchases
- Validate spending limits
- Process off-session payments via Stripe

#### API Endpoints

##### `POST /auto-topup/configure`

Create or update auto-top-up rule for authenticated user.

**Request:**

```typescript
{
  enabled: boolean,
  threshold_credits: number,      // e.g., 50
  topup_credit_amount: 100 | 500 | 1000,
  payment_method_id: string,
  max_topup_per_month?: number   // Optional cap in dollars
}
```

**Response:**

```typescript
{
  data: {
    id: string,
    user_id: string,
    enabled: boolean,
    threshold_credits: number,
    topup_credit_amount: number,
    payment_method_id: string,
    max_topup_per_month?: number
  },
  error: null
}
```

**Validations:**

1. User must have active paid subscription
2. Payment method must belong to user
3. `threshold_credits` must be positive
4. `topup_credit_amount` must be 100, 500, or 1000
5. If `max_topup_per_month` set, must be ≥ price of one credit pack

##### `GET /auto-topup/rule`

Get current auto-top-up rule for authenticated user.

**Response:**

```typescript
{
  data: {
    id: string,
    enabled: boolean,
    threshold_credits: number,
    topup_credit_amount: number,
    payment_method_id: string,
    payment_method: {
      type: string,
      last4: string,
      brand?: string
    },
    max_topup_per_month?: number
  } | null,
  error: null
}
```

##### `DELETE /auto-topup/rule`

Disable auto-top-up (soft delete - set `enabled = false`).

##### `GET /auto-topup/transactions`

Get transaction history for authenticated user.

**Query Params:**

- `limit?: number` (default 50)
- `offset?: number` (default 0)

**Response:**

```typescript
{
  data: [
    {
      id: string,
      amount: number,
      credits_purchased: number,
      status: 'pending' | 'succeeded' | 'failed',
      failure_reason?: string,
      created_at: string
    }
  ],
  error: null
}
```

#### Core Internal Functions

##### `checkAndTriggerTopUp(userId: string, currentBalance: number): Promise<void>`

Called from `usage-tracking.ts` after consuming credits.

**Logic:**

```typescript
async checkAndTriggerTopUp(userId: string, currentBalance: number): Promise<void> {
  // 1. Fetch active rule
  const rule = await supabase
    .from('auto_topup_rules')
    .select('*, saved_payment_methods(*)')
    .eq('user_id', userId)
    .eq('enabled', true)
    .single();

  if (!rule.data) return;  // No active rule

  // 2. Check threshold
  if (currentBalance > rule.data.threshold_credits) return;

  // 3. Check rate limiting (max 1 top-up per hour)
  const recentTopup = await supabase
    .from('auto_topup_transactions')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(1);

  if (recentTopup.data?.length > 0) {
    logger.info('Rate limit: Auto-top-up triggered less than 1 hour ago');
    return;
  }

  // 4. Check monthly spending cap
  if (rule.data.max_topup_per_month) {
    const isWithinCap = await validateMonthlySpendingCap(userId, rule.data);
    if (!isWithinCap) {
      await sendMonthlyCapReachedEmail(userId);
      return;
    }
  }

  // 5. Trigger payment
  await processTopUp(userId, rule.data);
}
```

##### `validateMonthlySpendingCap(userId: string, rule: AutoTopUpRule): Promise<boolean>`

**Logic:**

```typescript
async validateMonthlySpendingCap(userId: string, rule: AutoTopUpRule): Promise<boolean> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: transactions } = await supabase
    .from('auto_topup_transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .gte('created_at', startOfMonth.toISOString());

  const totalSpent = transactions?.reduce((sum, t) => sum + t.amount, 0) || 0;
  const proposedAmount = getCreditPackPrice(rule.topup_credit_amount);

  return (totalSpent + proposedAmount) <= rule.max_topup_per_month;
}
```

##### `processTopUp(userId: string, rule: AutoTopUpRule): Promise<void>`

**Logic:**

```typescript
async processTopUp(userId: string, rule: AutoTopUpRule): Promise<void> {
  const priceId = getCreditPackPriceId(rule.topup_credit_amount);
  const amount = getCreditPackPrice(rule.topup_credit_amount);

  // 1. Create transaction record (status = 'pending')
  const { data: transaction } = await supabase
    .from('auto_topup_transactions')
    .insert({
      user_id: userId,
      auto_topup_rule_id: rule.id,
      amount: amount,
      credits_purchased: rule.topup_credit_amount,
      status: 'pending'
    })
    .select()
    .single();

  // 2. Create Stripe Payment Intent
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,  // Convert to cents
      currency: 'usd',
      customer: rule.user.stripe_customer_id,
      payment_method: rule.saved_payment_method.stripe_payment_method_id,
      off_session: true,  // Key flag for auto-charging
      confirm: true,      // Immediately confirm
      metadata: {
        user_id: userId,
        auto_topup: 'true',
        transaction_id: transaction.id,
        credit_amount: rule.topup_credit_amount.toString()
      }
    });

    // 3. Update transaction with Stripe Payment Intent ID
    await supabase
      .from('auto_topup_transactions')
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq('id', transaction.id);

    // 4. Send "processing" email
    await sendAutoTopUpTriggeredEmail(userId, rule.topup_credit_amount, amount);

  } catch (error) {
    // Payment failed immediately
    await supabase
      .from('auto_topup_transactions')
      .update({
        status: 'failed',
        failure_reason: error.message
      })
      .eq('id', transaction.id);

    await sendAutoTopUpFailedEmail(userId, error.message);
  }
}
```

**Helper Functions:**

```typescript
function getCreditPackPriceId(credits: number): string {
  switch (credits) {
    case 100:
      return process.env.STRIPE_CREDIT_PACK_100_PRICE_ID;
    case 500:
      return process.env.STRIPE_CREDIT_PACK_500_PRICE_ID;
    case 1000:
      return process.env.STRIPE_CREDIT_PACK_1000_PRICE_ID;
    default:
      throw new Error(`Invalid credit amount: ${credits}`);
  }
}

function getCreditPackPrice(credits: number): number {
  switch (credits) {
    case 100:
      return 10;
    case 500:
      return 50;
    case 1000:
      return 100;
    default:
      throw new Error(`Invalid credit amount: ${credits}`);
  }
}
```

---

## Integration Points

### 1. Usage Tracking Modification

**File:** `server/build-workers/services/utils/usage-tracking.ts`

**Current Function:** `trackApiUsageBuildWorker()`

**Modification:** Add threshold check after consuming credits

```typescript
export async function trackApiUsageBuildWorker(
  supabase: SupabaseClient<Database>,
  userId: string,
  prototypeId: string,
  log2: SystemLogger,
  creditsUsed: number = 1.0,
): Promise<UsageTrackingResult> {
  log2 = log2.child({ function: "trackApiUsageBuildWorker" });

  const userPlan = await fetchUserPlan(supabase, userId, log2);

  // Free tier users - no auto-top-up
  if (userPlan === "free") {
    return trackFreeTierUsage(supabase, userId, prototypeId, creditsUsed, log2);
  }

  try {
    const { data, error: rpcError } = await supabase.rpc("consume_credits", {
      p_user_id: userId,
      p_prototype_id: prototypeId,
      p_credits: creditsUsed,
    });

    if (rpcError) {
      log2.error(rpcError, "consume_credits RPC failed");
      await insertFallbackUsage();
      return { totalRemainingCredits: 0 };
    }

    const payload = data?.[0];

    if (!payload || !payload.success) {
      log2.error(new Error(payload?.error ?? "RPC returned failure"));
      await insertFallbackUsage();
      return { totalRemainingCredits: 0 };
    }

    // ============ NEW: Auto-Top-Up Threshold Check ============
    const remainingCredits = payload.total_remaining ?? 0;

    // Check if auto-top-up should trigger
    const { data: autoTopupRule } = await supabase
      .from("auto_topup_rules")
      .select("*, saved_payment_methods(*)")
      .eq("user_id", userId)
      .eq("enabled", true)
      .single();

    if (autoTopupRule && remainingCredits <= autoTopupRule.threshold_credits) {
      log2.info("Auto-top-up threshold reached, triggering top-up", {
        remainingCredits,
        threshold: autoTopupRule.threshold_credits,
      });

      // Trigger async auto-top-up via API call
      // Use fetch to call AutoTopUpService endpoint
      try {
        await fetch(
          `${process.env.CONTROL_PLANE_BASE_URL}/auto-topup/trigger`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Auth": process.env.INTERNAL_API_SECRET, // Internal auth
            },
            body: JSON.stringify({
              user_id: userId,
              current_balance: remainingCredits,
              rule_id: autoTopupRule.id,
            }),
          },
        );
      } catch (topupError) {
        log2.error(topupError, "Failed to trigger auto-top-up");
        // Don't fail the main request if top-up trigger fails
      }
    }
    // ==========================================================

    return {
      totalRemainingCredits: remainingCredits,
      grantBalances: payload.grant_balances ?? null,
    };
  } catch (error) {
    log2.error(error, "Exception in trackApiUsageBuildWorker");
    await insertFallbackUsage();
    return { totalRemainingCredits: 0 };
  }
}
```

**New Internal Endpoint in AutoTopUpService:**

```typescript
// POST /auto-topup/trigger (internal only, not exposed to public)
async handleTriggerTopUp(request: FastifyRequest, reply: FastifyReply) {
  // Verify internal auth header
  const authHeader = request.headers['x-internal-auth'];
  if (authHeader !== process.env.INTERNAL_API_SECRET) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const { user_id, current_balance, rule_id } = request.body;

  await this.checkAndTriggerTopUp(user_id, current_balance);

  return reply.status(200).send({ success: true });
}
```

### 2. Stripe Webhook Handlers

**File:** `web-application/src/app/api/payments/handle-subscription/route.ts`

**Add New Event Handlers:**

```typescript
export async function POST(req: NextRequest) {
  const stripeVerification = await verifyStripeSignature(req);
  if (stripeVerification.event === null) {
    // ... error handling
  }

  const event = stripeVerification.event;
  switch (event.type) {
    case "invoice.paid":
      await handleInvoicePaid(event.data.object);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object);
      break;
    case "customer.subscription.trial_will_end":
      await handleSubscriptionTrialWillEnd(event.data.object);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object);
      break;
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object);
      break;

    // ============ NEW: Auto-Top-Up Handlers ============
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object);
      break;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object);
      break;
    case "setup_intent.succeeded":
      await handleSetupIntentSucceeded(event.data.object);
      break;
    // ===================================================

    default:
      break;
  }

  return NextResponse.json({ message: "Stripe event received successfully" });
}
```

#### New Handler: `handlePaymentIntentSucceeded`

```typescript
async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  // Only process auto-top-up payments
  if (paymentIntent.metadata?.auto_topup !== "true") {
    return;
  }

  const userId = paymentIntent.metadata.user_id;
  const transactionId = paymentIntent.metadata.transaction_id;
  const creditAmount = parseInt(paymentIntent.metadata.credit_amount);

  if (!userId || !transactionId || !creditAmount) {
    console.error("Missing metadata in payment intent:", paymentIntent.id);
    return;
  }

  // 1. Create credit grant (90-day expiration like other one-time purchases)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  const { data: creditGrant, error: creditGrantError } = await supabase
    .from("credit_grants")
    .insert({
      user_id: userId,
      credits_granted: creditAmount,
      subscription_id: null,
      grant_reason: "auto_topup",
      grant_type: "one_time",
      billing_period_start: null,
      billing_period_end: null,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (creditGrantError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.CREDIT_GRANT_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        error: creditGrantError,
        context: "auto_topup_payment_intent_succeeded",
      },
    });
    console.error(
      "Error creating credit grant for auto-top-up:",
      creditGrantError,
    );
    return;
  }

  // 2. Update auto_topup_transaction record
  const { error: transactionUpdateError } = await supabase
    .from("auto_topup_transactions")
    .update({
      status: "succeeded",
      credit_grant_id: creditGrant.id,
      stripe_payment_intent_id: paymentIntent.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId);

  if (transactionUpdateError) {
    console.error(
      "Error updating auto-top-up transaction:",
      transactionUpdateError,
    );
  }

  // 3. Record payment in payments table (for consistency with other purchases)
  await supabase.from("payments").insert({
    invoice_id: paymentIntent.id,
    user_id: userId,
    subscription_id: null,
    stripe_customer_id: paymentIntent.customer as string,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: "paid",
  });

  // 4. Send success email
  const { data: userData } = await supabase
    .from("users")
    .select("email, name")
    .eq("id", userId)
    .single();

  if (userData?.email) {
    await triggerAutoTopUpSucceededEmail(
      userData.email,
      userData.name,
      creditAmount,
      paymentIntent.amount / 100, // Convert cents to dollars
    );
  }

  // 5. Analytics
  posthog.capture({
    distinctId: userId,
    event: SuccessEvents.AUTO_TOPUP_SUCCEEDED,
    properties: {
      source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
      credits_granted: creditAmount,
      amount_paid: paymentIntent.amount / 100,
    },
  });
}
```

#### New Handler: `handlePaymentIntentFailed`

```typescript
async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  // Only process auto-top-up payments
  if (paymentIntent.metadata?.auto_topup !== "true") {
    return;
  }

  const userId = paymentIntent.metadata.user_id;
  const transactionId = paymentIntent.metadata.transaction_id;
  const creditAmount = parseInt(paymentIntent.metadata.credit_amount);

  if (!userId || !transactionId) {
    console.error(
      "Missing metadata in failed payment intent:",
      paymentIntent.id,
    );
    return;
  }

  // Get failure reason
  const failureReason =
    paymentIntent.last_payment_error?.message || "Unknown error";

  // 1. Update transaction status
  await supabase
    .from("auto_topup_transactions")
    .update({
      status: "failed",
      failure_reason: failureReason,
      stripe_payment_intent_id: paymentIntent.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId);

  // 2. Send failure email with action link
  const { data: userData } = await supabase
    .from("users")
    .select("email, name")
    .eq("id", userId)
    .single();

  if (userData?.email) {
    await triggerAutoTopUpFailedEmail(
      userData.email,
      userData.name,
      creditAmount,
      failureReason,
      `${process.env.NEXT_PUBLIC_SITE_BASE_URL}/dashboard/account`, // Link to payment settings
    );
  }

  // 3. Analytics
  posthog.capture({
    distinctId: userId,
    event: ExceptionEvents.AUTO_TOPUP_FAILED,
    properties: {
      source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
      failure_reason: failureReason,
      credits_attempted: creditAmount,
    },
  });
}
```

#### New Handler: `handleSetupIntentSucceeded`

```typescript
async function handleSetupIntentSucceeded(
  setupIntent: Stripe.SetupIntent,
): Promise<void> {
  // Payment method is already attached to customer by Stripe
  // Frontend will poll for setup intent status and save to database
  // This handler is mainly for logging/analytics

  const userId = setupIntent.metadata?.user_id;

  if (!userId) {
    console.error("Missing user_id in setup intent metadata:", setupIntent.id);
    return;
  }

  posthog.capture({
    distinctId: userId,
    event: SuccessEvents.PAYMENT_METHOD_SAVED,
    properties: {
      source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
      payment_method_id: setupIntent.payment_method,
    },
  });
}
```

---

## Frontend Components

### Component Tree

```
AccountPage
├── SavedPaymentMethodsCard
│   ├── PaymentMethodList
│   │   └── PaymentMethodItem (for each saved method)
│   └── AddPaymentMethodButton → SetupPaymentMethodModal
│
├── AutoTopUpSettingsCard
│   ├── EnableToggle
│   ├── ThresholdSlider
│   ├── TopUpAmountSelector
│   ├── PaymentMethodDropdown
│   ├── MonthlyCapInput
│   └── PreviewText
│
└── AutoTopUpTransactionHistoryCard
    └── TransactionTable
```

### 1. SavedPaymentMethodsList Component

**File:** `web-application/src/components/SavedPaymentMethodsList.tsx`

```typescript
import { useState, useEffect } from 'react';
import { CreditCard, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SetupPaymentMethodModal } from './SetupPaymentMethodModal';

interface PaymentMethod {
  id: string;
  type: 'card' | 'us_bank_account';
  last4: string;
  brand?: string;
  is_default: boolean;
}

export function SavedPaymentMethodsList() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    const response = await fetch('/api/payments/payment-methods');
    const data = await response.json();
    setPaymentMethods(data.data || []);
    setLoading(false);
  };

  const handleSetDefault = async (id: string) => {
    await fetch(`/api/payments/payment-method/${id}/set-default`, {
      method: 'PUT',
    });
    fetchPaymentMethods();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to remove this payment method?')) {
      await fetch(`/api/payments/payment-method/${id}`, {
        method: 'DELETE',
      });
      fetchPaymentMethods();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Payment Methods</CardTitle>
        <CardDescription>
          Manage payment methods for auto-top-up
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {paymentMethods.map((method) => (
            <div
              key={method.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {method.brand || method.type} •••• {method.last4}
                  </p>
                  {method.is_default && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Check className="h-3 w-3" /> Default
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {!method.is_default && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetDefault(method.id)}
                  >
                    Set as Default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(method.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowAddModal(true)}
          >
            Add Payment Method
          </Button>
        </div>

        {showAddModal && (
          <SetupPaymentMethodModal
            onClose={() => setShowAddModal(false)}
            onSuccess={fetchPaymentMethods}
          />
        )}
      </CardContent>
    </Card>
  );
}
```

### 2. SetupPaymentMethodModal Component

**File:** `web-application/src/components/SetupPaymentMethodModal.tsx`

```typescript
import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function PaymentMethodForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'An error occurred');
      setLoading(false);
      return;
    }

    const { setupIntent, error: confirmError } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Payment method setup failed');
      setLoading(false);
    } else if (setupIntent?.status === 'succeeded') {
      // Save payment method to our database
      await fetch('/api/payments/save-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripe_payment_method_id: setupIntent.payment_method,
          set_as_default: false,
        }),
      });

      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <div className="text-sm text-destructive">{error}</div>
      )}
      <Button type="submit" disabled={!stripe || loading} className="w-full">
        {loading ? 'Saving...' : 'Save Payment Method'}
      </Button>
    </form>
  );
}

export function SetupPaymentMethodModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useState(() => {
    // Fetch Setup Intent client secret
    fetch('/api/payments/setup-intent', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => setClientSecret(data.data.client_secret));
  });

  const handleSuccess = () => {
    onSuccess();
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
        </DialogHeader>
        {clientSecret ? (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <PaymentMethodForm onSuccess={handleSuccess} />
          </Elements>
        ) : (
          <div>Loading...</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

### 3. AutoTopUpSettings Component

**File:** `web-application/src/components/AutoTopUpSettings.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AutoTopUpRule {
  id?: string;
  enabled: boolean;
  threshold_credits: number;
  topup_credit_amount: 100 | 500 | 1000;
  payment_method_id: string;
  max_topup_per_month?: number;
}

interface PaymentMethod {
  id: string;
  type: string;
  last4: string;
  brand?: string;
}

export function AutoTopUpSettings() {
  const [rule, setRule] = useState<AutoTopUpRule>({
    enabled: false,
    threshold_credits: 50,
    topup_credit_amount: 500,
    payment_method_id: '',
  });
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [ruleRes, methodsRes] = await Promise.all([
      fetch('/api/auto-topup/rule'),
      fetch('/api/payments/payment-methods'),
    ]);

    const ruleData = await ruleRes.json();
    const methodsData = await methodsRes.json();

    if (ruleData.data) {
      setRule(ruleData.data);
    }
    setPaymentMethods(methodsData.data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    await fetch('/api/auto-topup/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    fetchData();
  };

  const getCreditPackPrice = (credits: number) => {
    switch (credits) {
      case 100: return 10;
      case 500: return 50;
      case 1000: return 100;
      default: return 0;
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-Top-Up Settings</CardTitle>
        <CardDescription>
          Automatically purchase credits when your balance runs low
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <Label htmlFor="enabled">Enable Auto-Top-Up</Label>
          <Switch
            id="enabled"
            checked={rule.enabled}
            onCheckedChange={(checked) => setRule({ ...rule, enabled: checked })}
          />
        </div>

        {rule.enabled && (
          <>
            <div className="space-y-2">
              <Label>Trigger Threshold: {rule.threshold_credits} credits</Label>
              <Slider
                value={[rule.threshold_credits]}
                onValueChange={([value]) => setRule({ ...rule, threshold_credits: value })}
                min={0}
                max={1000}
                step={10}
              />
              <p className="text-sm text-muted-foreground">
                Top up when balance falls to or below this amount
              </p>
            </div>

            <div className="space-y-2">
              <Label>Top-Up Amount</Label>
              <Select
                value={rule.topup_credit_amount.toString()}
                onValueChange={(value) =>
                  setRule({ ...rule, topup_credit_amount: parseInt(value) as 100 | 500 | 1000 })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100 credits ($10)</SelectItem>
                  <SelectItem value="500">500 credits ($50)</SelectItem>
                  <SelectItem value="1000">1000 credits ($100)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={rule.payment_method_id}
                onValueChange={(value) => setRule({ ...rule, payment_method_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.brand || method.type} •••• {method.last4}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cap">Monthly Spending Cap (Optional)</Label>
              <Input
                id="cap"
                type="number"
                placeholder="No limit"
                value={rule.max_topup_per_month || ''}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    max_topup_per_month: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                Maximum amount to spend on auto-top-ups per month
              </p>
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">Preview</p>
              <p className="text-sm text-muted-foreground mt-1">
                When your balance falls to {rule.threshold_credits} credits or below, we'll
                automatically charge ${getCreditPackPrice(rule.topup_credit_amount)} for{' '}
                {rule.topup_credit_amount} credits.
                {rule.max_topup_per_month && (
                  <> Maximum ${rule.max_topup_per_month} per month.</>
                )}
              </p>
            </div>

            <Button onClick={handleSave} className="w-full">
              Save Auto-Top-Up Settings
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

### 4. AutoTopUpTransactionHistory Component

**File:** `web-application/src/components/AutoTopUpTransactionHistory.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface Transaction {
  id: string;
  amount: number;
  credits_purchased: number;
  status: 'pending' | 'succeeded' | 'failed';
  failure_reason?: string;
  created_at: string;
}

export function AutoTopUpTransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auto-topup/transactions')
      .then((res) => res.json())
      .then((data) => {
        setTransactions(data.data || []);
        setLoading(false);
      });
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <Badge className="bg-green-500">Success</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-Top-Up History</CardTitle>
        <CardDescription>Recent automatic credit purchases</CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No auto-top-up transactions yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>
                    {new Date(tx.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{tx.credits_purchased} credits</TableCell>
                  <TableCell>${tx.amount.toFixed(2)}</TableCell>
                  <TableCell>{getStatusBadge(tx.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Email Notifications

### Email Templates to Create

**Location:** `web-application/src/components/emails/`

#### 1. AutoTopUpTriggered.tsx

```typescript
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';

interface AutoTopUpTriggeredEmailProps {
  userName: string;
  credits: number;
  amount: number;
}

export default function AutoTopUpTriggered({
  userName,
  credits,
  amount,
}: AutoTopUpTriggeredEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>Auto-Top-Up In Progress</Text>
          <Text style={paragraph}>Hi {userName},</Text>
          <Text style={paragraph}>
            Your credit balance has fallen below your auto-top-up threshold. We're processing a
            charge of ${amount.toFixed(2)} for {credits} credits.
          </Text>
          <Text style={paragraph}>
            You'll receive another email once the payment is complete.
          </Text>
          <Button style={button} href={`${process.env.NEXT_PUBLIC_SITE_BASE_URL}/dashboard/account`}>
            View Account
          </Button>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: '#f6f9fc', fontFamily: 'Arial, sans-serif' };
const container = { margin: '0 auto', padding: '20px 0 48px' };
const heading = { fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' };
const paragraph = { fontSize: '16px', lineHeight: '26px' };
const button = {
  backgroundColor: '#000',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '16px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 20px',
};
```

#### 2. AutoTopUpSucceeded.tsx

```typescript
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';

interface AutoTopUpSucceededEmailProps {
  userName: string;
  credits: number;
  amount: number;
}

export default function AutoTopUpSucceeded({
  userName,
  credits,
  amount,
}: AutoTopUpSucceededEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>✅ Auto-Top-Up Successful</Text>
          <Text style={paragraph}>Hi {userName},</Text>
          <Text style={paragraph}>
            Your auto-top-up was successful! We've added {credits} credits to your account.
          </Text>
          <Text style={paragraph}>
            <strong>Amount Charged:</strong> ${amount.toFixed(2)}
            <br />
            <strong>Credits Added:</strong> {credits}
          </Text>
          <Button style={button} href={`${process.env.NEXT_PUBLIC_SITE_BASE_URL}/dashboard/account`}>
            View Account
          </Button>
        </Container>
      </Body>
    </Html>
  );
}

// Styles same as above
```

#### 3. AutoTopUpFailed.tsx

```typescript
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';

interface AutoTopUpFailedEmailProps {
  userName: string;
  credits: number;
  failureReason: string;
  actionUrl: string;
}

export default function AutoTopUpFailed({
  userName,
  credits,
  failureReason,
  actionUrl,
}: AutoTopUpFailedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>⚠️ Auto-Top-Up Failed</Text>
          <Text style={paragraph}>Hi {userName},</Text>
          <Text style={paragraph}>
            We attempted to automatically top up your account with {credits} credits, but the
            payment failed.
          </Text>
          <Text style={paragraph}>
            <strong>Reason:</strong> {failureReason}
          </Text>
          <Text style={paragraph}>
            Please update your payment method or manually purchase credits to continue using the
            service.
          </Text>
          <Button style={button} href={actionUrl}>
            Update Payment Method
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
```

#### 4. MonthlyCapReached.tsx

```typescript
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';

interface MonthlyCapReachedEmailProps {
  userName: string;
  monthlyCapAmount: number;
}

export default function MonthlyCapReached({
  userName,
  monthlyCapAmount,
}: MonthlyCapReachedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>Monthly Auto-Top-Up Cap Reached</Text>
          <Text style={paragraph}>Hi {userName},</Text>
          <Text style={paragraph}>
            You've reached your monthly auto-top-up spending cap of ${monthlyCapAmount.toFixed(2)}.
          </Text>
          <Text style={paragraph}>
            Auto-top-up will resume next month, or you can increase your cap or manually purchase
            credits anytime.
          </Text>
          <Button style={button} href={`${process.env.NEXT_PUBLIC_SITE_BASE_URL}/dashboard/account`}>
            Manage Settings
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
```

### Email Utility Functions

**File:** `web-application/src/lib/utils/emails/ResendEmailUtils.ts`

**Add New Functions:**

```typescript
export async function triggerAutoTopUpTriggeredEmail(
  email: string,
  name: string,
  credits: number,
  amount: number,
): Promise<ErrorOption | null> {
  try {
    await resend.emails.send({
      from: "Nucleate <noreply@nucleate.dev>",
      to: email,
      subject: "Auto-Top-Up In Progress",
      react: AutoTopUpTriggered({ userName: name, credits, amount }),
    });
    return null;
  } catch (error) {
    console.error("Error sending auto-top-up triggered email:", error);
    return { message: "Failed to send email" };
  }
}

export async function triggerAutoTopUpSucceededEmail(
  email: string,
  name: string,
  credits: number,
  amount: number,
): Promise<ErrorOption | null> {
  try {
    await resend.emails.send({
      from: "Nucleate <noreply@nucleate.dev>",
      to: email,
      subject: "✅ Auto-Top-Up Successful",
      react: AutoTopUpSucceeded({ userName: name, credits, amount }),
    });
    return null;
  } catch (error) {
    console.error("Error sending auto-top-up success email:", error);
    return { message: "Failed to send email" };
  }
}

export async function triggerAutoTopUpFailedEmail(
  email: string,
  name: string,
  credits: number,
  failureReason: string,
  actionUrl: string,
): Promise<ErrorOption | null> {
  try {
    await resend.emails.send({
      from: "Nucleate <noreply@nucleate.dev>",
      to: email,
      subject: "⚠️ Auto-Top-Up Payment Failed",
      react: AutoTopUpFailed({
        userName: name,
        credits,
        failureReason,
        actionUrl,
      }),
    });
    return null;
  } catch (error) {
    console.error("Error sending auto-top-up failed email:", error);
    return { message: "Failed to send email" };
  }
}

export async function triggerMonthlyCapReachedEmail(
  email: string,
  name: string,
  monthlyCapAmount: number,
): Promise<ErrorOption | null> {
  try {
    await resend.emails.send({
      from: "Nucleate <noreply@nucleate.dev>",
      to: email,
      subject: "Monthly Auto-Top-Up Cap Reached",
      react: MonthlyCapReached({ userName: name, monthlyCapAmount }),
    });
    return null;
  } catch (error) {
    console.error("Error sending monthly cap email:", error);
    return { message: "Failed to send email" };
  }
}
```

---

## Implementation Timeline

### Week 1: Database Foundation

- [ ] Create database migration files for 3 new tables
- [ ] Run migrations in development/staging
- [ ] Update TypeScript types in `supabase.ts`
- [ ] Create seed data for testing

### Week 2: Payment Method Management

- [ ] Implement `PaymentMethodService`
- [ ] Add API endpoints for payment method CRUD
- [ ] Implement Stripe Setup Intent flow
- [ ] Create `SavedPaymentMethodsList` component
- [ ] Create `SetupPaymentMethodModal` component
- [ ] Test saving/deleting payment methods

### Week 3: Auto-Top-Up Rule Configuration

- [ ] Implement `AutoTopUpService` core logic
- [ ] Add API endpoints for rule CRUD
- [ ] Implement validation (paid subscribers only)
- [ ] Create `AutoTopUpSettings` component
- [ ] Create `AutoTopUpTransactionHistory` component
- [ ] Test rule configuration UI

### Week 4: Usage Tracking Integration

- [ ] Modify `trackApiUsageBuildWorker` to check thresholds
- [ ] Add internal `/auto-topup/trigger` endpoint
- [ ] Implement `checkAndTriggerTopUp` function
- [ ] Implement monthly spending cap validation
- [ ] Test threshold detection in dev environment

### Week 5: Payment Processing & Webhooks

- [ ] Implement `processTopUp` function with Payment Intents
- [ ] Add webhook handlers for `payment_intent.succeeded`
- [ ] Add webhook handlers for `payment_intent.payment_failed`
- [ ] Add webhook handler for `setup_intent.succeeded`
- [ ] Test end-to-end payment flow with test cards
- [ ] Test webhook handling in Stripe CLI

### Week 6: Email Notifications & UI Polish

- [ ] Create 4 email templates
- [ ] Implement email utility functions
- [ ] Test emails in development
- [ ] Add loading states to UI components
- [ ] Add error handling and user feedback
- [ ] Create transaction history view

### Week 7: Security, Testing & Launch

- [ ] Security audit (PCI compliance, authorization checks)
- [ ] Rate limiting implementation (max 1 top-up/hour)
- [ ] Test edge cases (failed payments, caps, disabled rules)
- [ ] Add PostHog analytics events
- [ ] Write documentation
- [ ] Deploy to production
- [ ] Monitor initial rollout

---

## Security & Compliance

### PCI Compliance

- ✅ **Never store raw card data** - only Stripe `payment_method_id`
- ✅ **All payments via Stripe** - leverage their PCI Level 1 compliance
- ✅ **Stripe Elements for card collection** - no card data touches our servers
- ✅ **HTTPS only** for all payment-related endpoints

### Authorization & Authentication

- ✅ **JWT validation** on all endpoints
- ✅ **User ownership checks** - users can only manage their own payment methods/rules
- ✅ **Paid subscriber validation** - auto-top-up only for active subscriptions
- ✅ **Payment method ownership** - verify user owns payment method before charging

### Spending Protection

- ✅ **Optional monthly cap** - prevent runaway charges
- ✅ **Rate limiting** - max 1 auto-top-up per hour
- ✅ **Email notifications** - immediate alerts on all transactions
- ✅ **Transaction audit log** - complete history in `auto_topup_transactions`

### Webhook Security

- ✅ **Stripe signature verification** - already implemented in `verifyStripeSignature()`
- ✅ **Metadata validation** - check `user_id` matches payment method owner
- ✅ **Idempotency** - prevent duplicate credit grants on webhook retries

### Error Handling

- ✅ **Graceful degradation** - failed top-up doesn't break main request
- ✅ **User notifications** - immediate email on payment failure
- ✅ **Logging** - comprehensive error logging with PostHog
- ✅ **No auto-retry** - prevents spam, user must take action

---

## Testing Strategy

### Unit Tests

- [ ] `AutoTopUpService.validateMonthlySpendingCap()` - edge cases
- [ ] `getCreditPackPriceId()` - all credit amounts
- [ ] `getCreditPackPrice()` - pricing logic
- [ ] Payment method validation logic

### Integration Tests

- [ ] Setup Intent flow (save payment method)
- [ ] Payment Intent flow (charge saved method)
- [ ] Webhook event handling
- [ ] Credit grant creation
- [ ] Transaction logging

### End-to-End Tests

1. **Happy Path:**
   - User saves payment method
   - User enables auto-top-up
   - User consumes credits below threshold
   - Payment succeeds
   - Credits granted
   - Email sent

2. **Failed Payment:**
   - Trigger auto-top-up
   - Payment fails (test card)
   - Transaction marked failed
   - Failure email sent

3. **Monthly Cap:**
   - Set low monthly cap
   - Trigger multiple top-ups
   - Verify cap enforcement
   - Cap email sent

4. **Rate Limiting:**
   - Trigger auto-top-up
   - Immediately consume more credits
   - Verify second top-up blocked within 1 hour

### Stripe Test Cards

- `4242 4242 4242 4242` - Success
- `4000 0000 0000 0002` - Declined
- `4000 0000 0000 9995` - Insufficient funds

---

## Monitoring & Analytics

### PostHog Events

**Add to `LoggingEvents.ts`:**

```typescript
export const SuccessEvents = {
  // ... existing events
  AUTO_TOPUP_SUCCEEDED: "auto_topup_succeeded",
  PAYMENT_METHOD_SAVED: "payment_method_saved",
  AUTO_TOPUP_RULE_CONFIGURED: "auto_topup_rule_configured",
} as const;

export const ExceptionEvents = {
  // ... existing events
  AUTO_TOPUP_FAILED: "auto_topup_failed",
  AUTO_TOPUP_RATE_LIMITED: "auto_topup_rate_limited",
  AUTO_TOPUP_MONTHLY_CAP_REACHED: "auto_topup_monthly_cap_reached",
} as const;
```

### Key Metrics to Track

1. **Adoption Rate:** % of paid subscribers who enable auto-top-up
2. **Success Rate:** % of auto-top-ups that succeed
3. **Failure Reasons:** Distribution of payment failure causes
4. **Average Top-Up Amount:** Most popular credit pack size
5. **Monthly Cap Usage:** How often users hit their cap
6. **Rate Limit Hits:** Frequency of rate limiting triggers

### Dashboards to Create

- Auto-top-up health dashboard (success/failure rates)
- Revenue impact (total auto-top-up revenue)
- User engagement (adoption trends)
- Alert for failed payment spike

---

## Files Summary

### New Files (24 total)

**Database:**

1. `migrations/YYYYMMDD_create_saved_payment_methods.sql`
2. `migrations/YYYYMMDD_create_auto_topup_rules.sql`
3. `migrations/YYYYMMDD_create_auto_topup_transactions.sql`

**Backend Services:** 4. `server/control-plane/services/PaymentMethodService.ts` 5. `server/control-plane/services/AutoTopUpService.ts`

**Frontend Components:** 6. `web-application/src/components/SavedPaymentMethodsList.tsx` 7. `web-application/src/components/SetupPaymentMethodModal.tsx` 8. `web-application/src/components/AutoTopUpSettings.tsx` 9. `web-application/src/components/AutoTopUpTransactionHistory.tsx`

**Email Templates:** 10. `web-application/src/components/emails/AutoTopUpTriggered.tsx` 11. `web-application/src/components/emails/AutoTopUpSucceeded.tsx` 12. `web-application/src/components/emails/AutoTopUpFailed.tsx` 13. `web-application/src/components/emails/MonthlyCapReached.tsx`

### Modified Files (6 total)

1. `server/control-plane/services/StripeManagementService.ts` - Add Setup Intent endpoint
2. `server/build-workers/services/utils/usage-tracking.ts` - Add threshold check
3. `web-application/src/app/api/payments/handle-subscription/route.ts` - Add Payment Intent webhooks
4. `web-application/src/app/dashboard/account/page.tsx` - Add auto-top-up UI
5. `web-application/src/lib/types/supabase.ts` - Add new table types
6. `web-application/src/lib/types/serverAPITypes.ts` - Add new API types
7. `web-application/src/lib/utils/emails/ResendEmailUtils.ts` - Add email functions
8. `web-application/src/LoggingEvents.ts` - Add new analytics events

---

## Environment Variables

**Add to `.env`:**

```bash
# Existing Stripe variables
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CREDIT_PACK_100_PRICE_ID=price_...
STRIPE_CREDIT_PACK_500_PRICE_ID=price_...
STRIPE_CREDIT_PACK_1000_PRICE_ID=price_...

# New for internal API
INTERNAL_API_SECRET=your-random-secret-here

# Control plane URL for build workers to call
CONTROL_PLANE_BASE_URL=https://api.nucleate.dev
```

---

## FAQ & Edge Cases

### What if a user's subscription is canceled while auto-top-up is enabled?

Auto-top-up is restricted to paid subscribers only. If subscription status changes to "canceled", the system will reject the auto-top-up trigger and send an email asking the user to renew their subscription.

### What if a user deletes the payment method being used for auto-top-up?

The DELETE endpoint checks if the payment method is referenced by an active auto-top-up rule and rejects the deletion. User must first disable auto-top-up or switch to a different payment method.

### What happens if Stripe requires 3D Secure authentication?

The `off_session: true` flag tells Stripe to only charge payment methods that don't require authentication. If authentication is required, the Payment Intent will fail, and the user receives an email to update their payment method.

### Can a user have multiple auto-top-up rules?

No, the database schema enforces one rule per user (UNIQUE constraint on `user_id`). Users can modify their single rule at any time.

### What if the webhook arrives before the API response?

Webhooks may arrive out of order. The transaction status flow is:

1. API creates transaction with `status='pending'`
2. Webhook updates to `status='succeeded'` or `status='failed'`

Both operations are idempotent and handle missing records gracefully.

### How do we prevent double-charging if the webhook fires twice?

Stripe webhooks are idempotent by design. We use `stripe_payment_intent_id` as a unique identifier. If a webhook fires twice for the same Payment Intent, the second update will be a no-op.

---

## Appendix: Database ER Diagram

```
users
  ├─→ subscriptions (user_id)
  ├─→ saved_payment_methods (user_id)
  ├─→ auto_topup_rules (user_id) [UNIQUE]
  └─→ auto_topup_transactions (user_id)

saved_payment_methods
  └─→ auto_topup_rules (payment_method_id)

auto_topup_rules
  └─→ auto_topup_transactions (auto_topup_rule_id)

credit_grants
  └─→ auto_topup_transactions (credit_grant_id)
```

---

## Next Steps

1. **Review this plan** with team for feedback
2. **Prioritize features** - MVP vs nice-to-have
3. **Assign tasks** to developers
4. **Set up Stripe test environment** with credit pack products
5. **Create project board** with tasks from timeline
6. **Schedule kickoff meeting** to align on architecture

---

**Document Version:** 1.0
**Last Updated:** 2025-01-18
**Author:** Claude Code Planning Agent
**Status:** Ready for Implementation
