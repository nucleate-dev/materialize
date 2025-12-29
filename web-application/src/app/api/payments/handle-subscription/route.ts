import { SubscriptionStatuses } from "@/GlobalConstants";
import {
  triggerSubscriptionFreeTrialWillEndEmail,
  triggerSubscriptionPaymentFailedEmail,
} from "@/lib/utils/emails/ResendEmailUtils";
import {
  ExceptionEvents,
  LoggingEventSource,
  SuccessEvents,
} from "@/LoggingEvents";
import { Database } from "@/lib/types/supabase";
import { CreditLimits } from "@/lib/types/serverAPITypes";
import { sendMetaPurchaseEvent } from "@/lib/utils/analytics/MetaConversionsAPI";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { PostHog } from "posthog-node";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
});
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

type StripeMetadataLike = Record<string, string | undefined> | null | undefined;

function requireUserAndTeamIds(
  metadata: StripeMetadataLike,
  context: string,
  exceptionEvent: string = ExceptionEvents.SUSBCRIPTION_UPDATE_ERROR,
): { userId: string; teamId: string } | null {
  const userId = metadata?.user_id;
  const teamId = metadata?.team_id;

  if (!userId || !teamId) {
    const missing: string[] = [];
    if (!userId) missing.push("user_id");
    if (!teamId) missing.push("team_id");
    const errorMessage = `Missing ${
      missing.join(" and ")
    } in Stripe metadata for ${context}`;
    console.error(errorMessage);
    posthog.capture({
      distinctId: userId ?? "unknown",
      event: exceptionEvent,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        error: errorMessage,
        context,
      },
    });
    return null;
  }

  return { userId, teamId };
}

/**
 * Handles Stripe webhook events sent to the server. This function verifies that the incoming
 * webhook request is genuinely from Stripe using the Stripe signature, and processes different
 * types of Stripe events accordingly.
 *
 * Supported Stripe events:
 *  - `invoice.paid`: Triggered when an invoice is successfully paid. Calls `handleInvoicePaid`.
 *  - `invoice.payment_failed`: Triggered when an invoice payment fails. Calls `handleInvoicePaymentFailed`.
 *  - `customer.subscription.updated`: Triggered when a subscription is updated. Calls `handleSubscriptionUpdated`.
 *  - `customer.subscription.trial_will_end`: Triggered when a subscription trial is about to end. Calls `handleSubscriptionTrialWillEnd`.
 *  - `customer.subscription.deleted`: Triggered when a subscription is canceled or deleted. Calls `handleSubscriptionDeleted`.
 *  - `checkout.session.completed`: Triggered when a Checkout Session finishes. Used here for one-time credit pack purchases.
 *
 * If the request method is not `POST`, it returns a `405 Method Not Allowed` response.
 *
 * @param {NextRequest} req - The incoming HTTP request object, containing event data from Stripe.
 *
 * @returns {Promise<NextResponse>} - The response is sent directly through NextResponse after handling the Stripe event.
 *
 * Error Handling:
 *  - If Stripe's webhook verification fails, logs an event to PostHog and returns an error response.
 *  - Calls the relevant handler functions for each Stripe event.
 *  - Gracefully shuts down PostHog analytics on error or completion.
 */
export async function POST(req: NextRequest) {
  // verify stripe sent the event and not a malicious third-party
  const stripeVerification = await verifyStripeSignature(req);
  if (stripeVerification.event === null) {
    posthog.capture({
      distinctId: "stripe",
      event: ExceptionEvents.STRIPE_WEBHOOK_VERIFICATION_FAILED,
      properties: {
        message: stripeVerification.message,
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
      },
    });
    return NextResponse.json(
      { error: stripeVerification.message },
      { status: stripeVerification.status },
    );
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
      // Though there is no harm, this does not need to be handled if the prorated amount is charged immediately.
      // in this case, the invoice.paid event will trigger and handle database updates.
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
    default:
      break;
  }
  // await posthog.shutdown();
  return NextResponse.json({ message: "Stripe event received successfully" });
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 1,
  });
  const priceId = lineItems.data[0]?.price?.id;
  if (!priceId) {
    return;
  }

  if (session.mode === "payment") {
    // Handle one-time credit pack purchases
    const ids = requireUserAndTeamIds(
      session.metadata ?? null,
      "checkout.session.completed:payment",
      ExceptionEvents.CREDIT_GRANT_ERROR,
    );
    if (!ids) {
      return;
    }

    const creditPackAmount = getCreditPackAmount(priceId);
    if (creditPackAmount === null) {
      return;
    }
    await handleCreditPackPurchase(session, creditPackAmount, ids);
    posthog.capture({
      distinctId: ids.userId,
      event: "server_stripe_webhook_checkout_payment_completed",
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        session_id: session.id,
        mode: session.mode,
        product_type: "credit_pack",
        credit_amount: creditPackAmount,
        amount_total: session.amount_total ?? 0,
        currency: session.currency ?? "usd",
        price_id: priceId,
        team_id: ids.teamId,
      },
    });
  } else if (session.mode === "subscription") {
    // Handle subscription checkout - send Meta Purchase event
    // The actual subscription setup is handled by invoice.paid event
    const ids = requireUserAndTeamIds(
      session.metadata ?? null,
      "checkout.session.completed:subscription",
    );
    if (!ids) {
      return;
    }

    const { userId, teamId } = ids;
    const { data: userData } = await supabase
      .from("users")
      .select("email")
      .eq("user_id", userId)
      .single();

    const planKey = getPlanKey(priceId);

    // Send Meta Conversions API Purchase event for initial subscription purchase
    // Using session.id as transactionId for deduplication with client-side pixel
    await sendMetaPurchaseEvent({
      email: userData?.email,
      userId: userId,
      value: (session.amount_total ?? 0) / 100, // Convert cents to dollars
      currency: session.currency ?? "usd",
      transactionId: session.id, // Same ID used by client-side pixel for deduplication
      contentName: `${
        planKey.charAt(0).toUpperCase() + planKey.slice(1)
      } Subscription`,
      eventSourceUrl: process.env.NEXT_PUBLIC_SITE_BASE_URL ?? "",
    });
    posthog.capture({
      distinctId: userId,
      event: "server_stripe_webhook_subscription_payment_completed",
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        session_id: session.id,
        subscription_id: session.subscription ?? null,
        plan_key: planKey,
        amount_total: session.amount_total ?? 0,
        currency: session.currency ?? "usd",
        price_id: priceId,
        team_id: teamId,
      },
    });
  }
}

/**
 * Handles a credit pack purchase (one-time payment).
 * Creates a credit grant for the purchased credits with a 90-day expiration.
 *
 * @param {Stripe.Checkout.Session} session - The Stripe checkout session describing the purchase
 * @param {number} creditAmount - The number of credits to grant
 *
 * @returns {Promise<void>}
 */
async function handleCreditPackPurchase(
  session: Stripe.Checkout.Session,
  creditAmount: number,
  ids: { userId: string; teamId: string },
): Promise<void> {
  const { userId, teamId } = ids;

  // Record the payment first so retries cannot re-grant credits
  const { error: paymentError } = await supabase.from("payments").insert({
    invoice_id: session.id,
    user_id: userId,
    subscription_id: null,
    stripe_customer_id: getCustomerIdFromCheckoutSession(session),
    amount: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    status: session.payment_status === "paid" ? "paid" : session.payment_status,
  });

  if (paymentError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.PAYMENT_UPDATE_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        error: paymentError,
        context: "credit_pack_purchase",
        team_id: teamId,
      },
    });
    console.error("Error recording payment for credit pack:", paymentError);
    return;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90); // 90 days from now

  // Insert credit grant only after payment was recorded
  const { error: creditGrantError } = await supabase
    .from("credit_grants")
    .insert({
      team_id: teamId,
      credits_granted: creditAmount,
      subscription_id: null,
      grant_reason: "one_time_credit_pack",
      grant_type: "one_time",
      billing_period_start: null,
      billing_period_end: null,
      expires_at: expiresAt.toISOString(),
    });

  if (creditGrantError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.CREDIT_GRANT_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        error: creditGrantError,
        context: "credit_pack_purchase",
        team_id: teamId,
      },
    });
    console.error("Error granting credits for credit pack:", creditGrantError);
    return;
  }

  posthog.capture({
    distinctId: userId,
    event: SuccessEvents.HANDLED_STRIPE_SUBSCRIPTION_INVOICE_PAID,
    properties: {
      source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
      credit_pack_amount: creditAmount,
      team_id: teamId,
    },
  });

  // Send Meta Conversions API Purchase event for credit pack
  const { data: userData } = await supabase
    .from("users")
    .select("email")
    .eq("user_id", userId)
    .single();

  // Send Meta Conversions API Purchase event
  // Using session.id as transactionId for deduplication with client-side pixel
  await sendMetaPurchaseEvent({
    email: userData?.email,
    userId: userId,
    value: (session.amount_total ?? 0) / 100, // Convert cents to dollars
    currency: session.currency ?? "usd",
    transactionId: session.id, // Same ID used by client-side pixel for deduplication
    contentName: `Credit Pack - ${creditAmount} credits`,
    eventSourceUrl: process.env.NEXT_PUBLIC_SITE_BASE_URL ?? "",
  });
}

/**
 * Handles the "invoice.paid" event from Stripe, which is triggered when an invoice is successfully paid.
 * This function retrieves the associated subscription, updates the subscription information in the database,
 * and records the payment in the payments table.
 *
 * @param {Stripe.Invoice} invoice - The invoice object from the Stripe webhook event containing details of the paid invoice.
 *
 * Steps:
 *  1. Retrieves the Stripe subscription associated with the invoice (if the subscription is a string, it retrieves the full object).
 *  2. If the subscription is successfully retrieved, it extracts the user ID from the subscription metadata.
 *  3. Updates the `subscriptions` table with the latest subscription details, marking it as "active".
 *  4. Inserts the payment information (invoice) into the `payments` table for future reference.
 *
 * Error Handling:
 *  - If the subscription cannot be retrieved or there is an issue with updating the database, the function logs the error via PostHog and stops further processing.
 *  - Errors are captured for both subscription updates and payment insertions.
 *
 * Analytics:
 *  - Captures specific events via PostHog for tracking any issues, such as failing to retrieve the subscription, failing to update the database, or failing to record the payment.
 *
 * @returns {Promise<void>} - The function does not return any value, but logs relevant information in case of errors.
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Credit packs are now handled via checkout.session.completed event
  // This function only handles subscription invoices
  let subscription = invoice.parent?.subscription_details?.subscription;
  if (typeof subscription === "string") {
    subscription = await stripe.subscriptions.retrieve(subscription);
  }
  if (subscription === null || subscription === undefined) {
    console.error(
      "Could not retrieve Stripe subscription for invoice:",
      invoice.id,
    );
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.COULD_NOT_RETRIEVE_STRIPE_SUBSCRIPTION,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
      },
    });
    return;
  }
  const metadataIds = requireUserAndTeamIds(
    subscription.metadata ?? null,
    "invoice.paid",
  );
  if (!metadataIds) {
    return;
  }
  const { userId, teamId } = metadataIds;
  const posthogBaseProps = {
    source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
    team_id: teamId,
  };

  // update the database with the new subscription info and record the payment for access later
  const { error: subscriptionUpdateError } = await supabase
    .from("subscriptions")
    .upsert({
      id: subscription.id, // primary key
      team_id: teamId,
      stripe_customer_id: getCustomerIdFromInvoice(invoice),
      status: SubscriptionStatuses.ACTIVE,
      current_period_start: subscription.items.data[0].current_period_start,
      current_period_end: subscription.items.data[0].current_period_end,
      price_id: subscription.items.data[0].price.id,
      plan_id: getPlanKey(subscription.items.data[0].price.id),
      stripe_subscription_item_id: subscription.items.data[0].id,
    } as Database["public"]["Tables"]["subscriptions"]["Insert"]);
  if (subscriptionUpdateError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.SUSBCRIPTION_UPDATE_ERROR,
      properties: {
        ...posthogBaseProps,
        error: subscriptionUpdateError,
      },
    });
    console.error(
      "Error updating subscription in database:",
      subscriptionUpdateError,
    );
    return;
  }

  // Grant credits to the user with expiration date
  const planKey = getPlanKey(subscription.items.data[0].price.id);
  const creditsToGrant = getCreditsForPlan(planKey);
  const billingPeriodStart = new Date(
    subscription.items.data[0].current_period_start * 1000,
  ).toISOString();
  const billingPeriodEnd = new Date(
    subscription.items.data[0].current_period_end * 1000,
  ).toISOString();
  const expiresAt = billingPeriodEnd;

  // Check if grant already exists for this subscription + billing period
  const { data: existingGrant, error: existingGrantError } = await supabase
    .from("credit_grants")
    .select("id")
    .eq("subscription_id", subscription.id)
    .eq("billing_period_start", billingPeriodStart)
    .maybeSingle();

  if (existingGrantError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.CREDIT_GRANT_ERROR,
      properties: {
        ...posthogBaseProps,
        error: existingGrantError,
        context: "check_existing_grant",
      },
    });
    console.error("Error checking existing credit grant:", existingGrantError);
    return;
  }

  let grantRows;
  let creditGrantError;
  let isDowngrade = false;

  if (existingGrant) {
    // First, get the old credits_granted value to detect downgrades
    const { data: oldGrantData } = await supabase
      .from("credit_grants")
      .select("credits_granted")
      .eq("id", existingGrant.id)
      .single();

    const oldCreditsGranted = oldGrantData?.credits_granted || 0;
    isDowngrade = creditsToGrant < oldCreditsGranted;

    // Update existing grant
    const { data: updatedGrant, error: updateError } = await supabase
      .from("credit_grants")
      .update({
        credits_granted: creditsToGrant,
        grant_reason: "subscription_renewal",
        grant_type: "subscription",
        billing_period_end: billingPeriodEnd,
        expires_at: expiresAt,
        team_id: teamId,
      })
      .eq("id", existingGrant.id)
      .select();

    grantRows = updatedGrant;
    creditGrantError = updateError;

    // If this is a downgrade, reconcile usage that exceeds the new limit
    if (isDowngrade && !updateError && grantRows && grantRows.length > 0) {
      await reconcileCreditUsageForDowngrade(
        userId,
        existingGrant.id,
        creditsToGrant,
        teamId,
      );
    }
  } else {
    // Create new grant
    const { data: newGrant, error: insertError } = await supabase
      .from("credit_grants")
      .insert({
        team_id: teamId,
        credits_granted: creditsToGrant,
        subscription_id: subscription.id,
        grant_reason: "subscription_renewal",
        grant_type: "subscription",
        billing_period_start: billingPeriodStart,
        billing_period_end: billingPeriodEnd,
        expires_at: expiresAt,
      })
      .select();

    grantRows = newGrant;
    creditGrantError = insertError;
  }

  if (creditGrantError || !grantRows || grantRows.length === 0) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.CREDIT_GRANT_ERROR,
      properties: {
        ...posthogBaseProps,
        error: creditGrantError,
      },
    });
    console.error("Error granting credits to user:", creditGrantError);
  } else {
    const newGrant = grantRows[0];
    let remainingCredits = newGrant.credits_granted;

    // Skip overage reconciliation if this was a downgrade - we want those overages to remain unpaid
    if (remainingCredits > 0 && !isDowngrade) {
      const { data: overageRows, error: overageFetchError } = await supabase
        .from("api_usage")
        .select("id, credits_used, prototype_id")
        .eq("team_id", teamId)
        .eq("is_free_tier", false)
        .is("credit_grant_id", null)
        .order("created_at", { ascending: true });

      if (overageFetchError) {
        posthog.capture({
          distinctId: userId,
          event: ExceptionEvents.CREDIT_GRANT_ERROR,
          properties: {
            ...posthogBaseProps,
            error: overageFetchError,
            context: "fetch_overage_usage",
          },
        });
        console.error("Error fetching overage usage:", overageFetchError);
      } else if (overageRows && overageRows.length > 0) {
        for (const usageRow of overageRows) {
          if (remainingCredits <= 0) break;

          const usageCredits = Math.max(usageRow.credits_used || 0, 0);

          if (usageCredits === 0) {
            const { error: assignZeroError } = await supabase
              .from("api_usage")
              .update({ credit_grant_id: newGrant.id, is_free_tier: false })
              .eq("id", usageRow.id);

            if (assignZeroError) {
              posthog.capture({
                distinctId: userId,
                event: ExceptionEvents.CREDIT_GRANT_ERROR,
                properties: {
                  ...posthogBaseProps,
                  error: assignZeroError,
                  context: "assign_zero_overage",
                },
              });
              console.error(
                "Error assigning zero-credit usage to grant:",
                assignZeroError,
              );
            }
            continue;
          }

          if (usageCredits <= remainingCredits + Number.EPSILON) {
            const { error: assignError } = await supabase
              .from("api_usage")
              .update({ credit_grant_id: newGrant.id, is_free_tier: false })
              .eq("id", usageRow.id);

            if (assignError) {
              posthog.capture({
                distinctId: userId,
                event: ExceptionEvents.CREDIT_GRANT_ERROR,
                properties: {
                  ...posthogBaseProps,
                  error: assignError,
                  context: "assign_full_overage",
                },
              });
              console.error(
                "Error assigning overage usage to grant:",
                assignError,
              );
              break;
            }

            remainingCredits -= usageCredits;
          } else {
            const partialCredits = remainingCredits;
            const residualCredits = usageCredits - partialCredits;

            const { error: residualUpdateError } = await supabase
              .from("api_usage")
              .update({ credits_used: residualCredits, is_free_tier: false })
              .eq("id", usageRow.id);

            if (residualUpdateError) {
              posthog.capture({
                distinctId: userId,
                event: ExceptionEvents.CREDIT_GRANT_ERROR,
                properties: {
                  source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
                  error: residualUpdateError,
                  context: "reduce_overage_row",
                },
              });
              console.error(
                "Error reducing overage usage row:",
                residualUpdateError,
              );
              break;
            }

            const { error: partialInsertError } = await supabase
              .from("api_usage")
              .insert({
                user_id: userId,
                team_id: teamId,
                prototype_id: usageRow.prototype_id,
                credits_used: partialCredits,
                credit_grant_id: newGrant.id,
                is_free_tier: false,
              });

            if (partialInsertError) {
              posthog.capture({
                distinctId: userId,
                event: ExceptionEvents.CREDIT_GRANT_ERROR,
                properties: {
                  ...posthogBaseProps,
                  error: partialInsertError,
                  context: "insert_partial_overage",
                },
              });
              console.error(
                "Error inserting partial overage coverage row:",
                partialInsertError,
              );
              break;
            }

            remainingCredits = 0;
            break;
          }
        }
      }
    }
  }

  const { error: paymentUpdateError } = await supabase.from("payments").insert({
    invoice_id: invoice.id, // should be the primary key
    user_id: userId,
    subscription_id: subscription.id,
    stripe_customer_id: getCustomerIdFromInvoice(invoice),
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: invoice.status, // should be 'paid'
  });
  if (paymentUpdateError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.PAYMENT_UPDATE_ERROR,
      properties: {
        ...posthogBaseProps,
        error: paymentUpdateError,
      },
    });
    return;
  }

  posthog.capture({
    distinctId: userId,
    event: "server_stripe_webhook_subscription_payment_completed",
    properties: {
      ...posthogBaseProps,
      subscription_id: subscription.id,
      plan_key: planKey,
      amount_total: invoice.amount_paid,
      currency: invoice.currency,
    },
  });

  // Note: Meta Purchase tracking for initial subscription is handled in
  // checkout.session.completed event to enable deduplication with client-side pixel.
  // Recurring subscription payments (renewals) are not tracked to Meta to avoid
  // counting renewals as new purchases.

  return;
}

/**
 * Handles the "invoice.payment_failed" event from Stripe, triggered when a payment attempt fails for an invoice.
 * This function updates the subscription status in the database to "past_due" and notifies the user about the failed payment.
 *
 * @param {Stripe.Invoice} invoice - The invoice object from the Stripe webhook event containing details of the failed invoice.
 *
 * Steps:
 *  1. Retrieves the Stripe subscription associated with the invoice (if the subscription is a string, it retrieves the full object).
 *  2. If the subscription is successfully retrieved, it updates the subscription status in the `subscriptions` table to "past_due".
 *  3. Fetches the user's email and name from the `users` table using the user ID stored in the subscription metadata.
 *  4. Triggers an email to the user notifying them that their subscription is paused due to the failed payment.
 *
 * Error Handling:
 *  - If the subscription cannot be retrieved or there are issues with updating the database or sending the email, the function logs the error via PostHog.
 *  - Specific errors are captured for subscription updates, user data fetching, and email failures.
 *
 * Analytics:
 *  - Captures events via PostHog for tracking both errors (e.g., failed updates, email triggers) and success events such as handling a failed payment.
 *
 * @returns {Promise<void>} - The function does not return any value but logs relevant information and interacts with the database and external services.
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // update subscription in database to 'past_due'
  let subscription = invoice.parent?.subscription_details?.subscription;
  if (typeof subscription === "string") {
    subscription = await stripe.subscriptions.retrieve(subscription);
  }
  if (subscription === null || subscription === undefined) {
    console.error(
      "Could not retrieve Stripe subscription for invoice:",
      invoice.id,
    );
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.COULD_NOT_RETRIEVE_STRIPE_SUBSCRIPTION,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
      },
    });
    return;
  }

  const metadataIds = requireUserAndTeamIds(
    subscription.metadata ?? null,
    "invoice.payment_failed",
  );
  if (!metadataIds) {
    return;
  }
  const { userId, teamId } = metadataIds;

  const { error: subscriptionUpdateError } = await supabase
    .from("subscriptions")
    .update({
      status: SubscriptionStatuses.PAST_DUE,
    })
    .eq("id", subscription.id);
  if (subscriptionUpdateError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.SUSBCRIPTION_UPDATE_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        error: subscriptionUpdateError,
        function: "handleInvoicePaymentFailed",
        team_id: teamId,
      },
    });
    return;
  }

  const { data: userData, error: userFetchError } = await supabase
    .from("users")
    .select("email, name")
    .eq("user_id", userId)
    .single();
  if (userFetchError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.USER_FETCH_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        error: userFetchError,
        function: "handleInvoicePaymentFailed",
        team_id: teamId,
      },
    });
    return;
  }

  let retryUrl = null;
  try {
    const stripeCustomerId = getCustomerIdFromSubscription(subscription);
    if (stripeCustomerId != null) {
      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${process.env.NEXT_PUBLIC_SITE_BASE_URL}dashboard/account`, // Change this to your actual return URL
      });
      retryUrl = session.url;
    }
  } catch (err) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.STRIPE_CUSTOMER_BILLING_PORTAL_CREATION_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        error: err,
        team_id: teamId,
      },
    });
  }

  // trigger email to the user that their subscription is paused until the invoice payment is resolved
  const resendError = await triggerSubscriptionPaymentFailedEmail(
    userData?.email,
    userData?.name,
    getPlanKey(subscription.items.data[0].price.id),
    retryUrl,
  );
  if (resendError) {
    posthog.capture({
      event: ExceptionEvents.SEND_PAYMENT_FAILURE_EMAIL_ERROR,
      distinctId: userId,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        error: resendError,
        team_id: teamId,
      },
    });
  }

  posthog.capture({
    distinctId: userId,
    event: SuccessEvents.HANDLED_STRIPE_INVOICE_PAYMENT_FAILED,
    properties: {
      source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
      team_id: teamId,
    },
  });
}

/**
 * Handles the "customer.subscription.updated" event from Stripe, triggered when a subscription is updated.
 * This function updates the subscription details in the database with the latest information from the Stripe event.
 *
 * NOTE: THIS DOES NOT NEED TO BE HANDLED IF THE INVOICE IS CHARGED IMMEDIATELY INSTEAD OF AT THE START OF THE NEXT BILLING CYCLE.
 * In this case, the invoice.payment_succeeded event will handle the database updates.
 *
 * @param {Stripe.Subscription} subscription - The subscription object from the Stripe webhook event containing updated subscription details.
 *
 * Steps:
 *  1. Extracts the `user_id` from the subscription's metadata.
 *  2. Updates the `subscriptions` table with the latest subscription details, including:
 *     - `subscription_id`
 *     - `current_period_start` and `current_period_end`
 *     - `price_id` and the associated `plan_id` based on the price ID.
 *  3. If the subscription update fails, logs the error using PostHog for analytics and debugging.
 *  4. If the user is downgrading, reconciles credit usage to nullify credit_grant_id for any usage exceeding the new limit.
 *
 * Error Handling:
 *  - If the database update fails, captures the error in PostHog and stops further execution.
 *
 * Analytics:
 *  - Logs the event of a subscription update error using PostHog, capturing details about the failure, including the error message and user ID (if available).
 *
 * @returns {Promise<void>} - The function does not return any value, but logs relevant information and updates the database.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const metadataIds = requireUserAndTeamIds(
    subscription.metadata ?? null,
    "customer.subscription.updated",
  );
  if (!metadataIds) {
    return;
  }
  const { userId, teamId } = metadataIds;

  const newPlanKey = getPlanKey(subscription.items.data[0].price.id);

  // update the database with the new subscription info. The handleInvoicePayment function should handle recording the payment
  const { error: subscriptionUpdateError } = await supabase
    .from("subscriptions")
    .update({
      current_period_start: subscription.items.data[0].current_period_start,
      current_period_end: subscription.items.data[0].current_period_end,
      price_id: subscription.items.data[0].price.id,
      plan_id: newPlanKey,
      scheduled_for_cancellation: subscription.cancel_at_period_end,
      stripe_subscription_item_id: subscription.items.data[0].id,
    } as Database["public"]["Tables"]["subscriptions"]["Update"])
    .eq("id", subscription.id);
  if (subscriptionUpdateError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.SUSBCRIPTION_UPDATE_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        function: "handleSubscriptionUpdated",
        error: subscriptionUpdateError,
        team_id: teamId,
      },
    });
    return;
  }
}

/**
 * Reconciles credit usage when a user downgrades their plan.
 * If the user has used more than the new credit limit, this function nullifies the credit_grant_id
 * for any usage exceeding the new amount, splitting rows if necessary.
 *
 * This function is called AFTER the credit grant has already been updated with the new lower limit.
 *
 * @param {string} userId - The user ID
 * @param {string} grantId - The credit grant ID that was just downgraded
 * @param {number} newCreditLimit - The new (lower) credit limit for the downgraded plan
 */
async function reconcileCreditUsageForDowngrade(
  userId: string,
  grantId: string,
  newCreditLimit: number,
  teamId: string,
) {
  // Get all api_usage rows for this grant, ordered by creation time
  const { data: usageRows, error: usageError } = await supabase
    .from("api_usage")
    .select("id, credits_used, prototype_id, created_at")
    .eq("credit_grant_id", grantId)
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (usageError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.CREDIT_GRANT_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        error: usageError,
        context: "reconcile_downgrade_fetch_usage",
        team_id: teamId,
      },
    });
    console.error(
      "Error fetching usage for downgrade reconciliation:",
      usageError,
    );
    return;
  }

  if (!usageRows || usageRows.length === 0) {
    // No usage to reconcile
    return;
  }

  // Calculate total usage and determine which rows need to be nullified or split
  let accumulatedCredits = 0;

  for (const usageRow of usageRows) {
    const usageCredits = Math.max(usageRow.credits_used || 0, 0);
    const previousAccumulated = accumulatedCredits;
    accumulatedCredits += usageCredits;

    if (previousAccumulated >= newCreditLimit) {
      // This entire row is beyond the limit, nullify its credit_grant_id
      const { error: nullifyError } = await supabase
        .from("api_usage")
        .update({ credit_grant_id: null })
        .eq("id", usageRow.id);

      if (nullifyError) {
        posthog.capture({
          distinctId: userId,
          event: ExceptionEvents.CREDIT_GRANT_ERROR,
          properties: {
            source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
            error: nullifyError,
            context: "reconcile_downgrade_nullify_row",
            team_id: teamId,
          },
        });
        console.error(
          "Error nullifying usage row for downgrade:",
          nullifyError,
        );
      }
    } else if (accumulatedCredits > newCreditLimit) {
      // This row straddles the limit, need to split it
      const creditsWithinLimit = newCreditLimit - previousAccumulated;
      const creditsBeyondLimit = usageCredits - creditsWithinLimit;

      // Update the existing row to only contain credits within the limit
      const { error: updateError } = await supabase
        .from("api_usage")
        .update({ credits_used: creditsWithinLimit })
        .eq("id", usageRow.id);

      if (updateError) {
        posthog.capture({
          distinctId: userId,
          event: ExceptionEvents.CREDIT_GRANT_ERROR,
          properties: {
            source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
            error: updateError,
            context: "reconcile_downgrade_split_update",
            team_id: teamId,
          },
        });
        console.error(
          "Error updating split usage row for downgrade:",
          updateError,
        );
        continue;
      }

      // Insert a new row for the credits beyond the limit (with null credit_grant_id)
      const { error: insertError } = await supabase.from("api_usage").insert({
        user_id: userId,
        team_id: teamId,
        prototype_id: usageRow.prototype_id,
        credits_used: creditsBeyondLimit,
        credit_grant_id: null,
        is_free_tier: false,
        created_at: usageRow.created_at, // Preserve the original creation time
      });

      if (insertError) {
        posthog.capture({
          distinctId: userId,
          event: ExceptionEvents.CREDIT_GRANT_ERROR,
          properties: {
            source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
            error: insertError,
            context: "reconcile_downgrade_split_insert",
            team_id: teamId,
          },
        });
        console.error(
          "Error inserting split usage row for downgrade:",
          insertError,
        );
      }
    }
    // If accumulatedCredits <= newCreditLimit, the row is fine as-is
  }
}

/**
 * Handles the "customer.subscription.trial_will_end" event from Stripe, triggered when a subscription trial is nearing its end.
 * This function retrieves the user's information from the database and sends an email notification to inform them that their trial is about to end.
 *
 * @param {Stripe.Subscription} subscription - The subscription object from the Stripe webhook event containing details of the subscription.
 *
 * Steps:
 *  1. Extracts the `user_id` from the subscription's metadata.
 *  2. Retrieves the user's email and name from the `users` table using the `user_id`.
 *  3. Sends an email to the user informing them that their free trial is about to end.
 *
 * Error Handling:
 *  - If the user data cannot be retrieved from the database, logs the error in PostHog and stops further processing.
 *  - If sending the email fails, captures the error in PostHog and stops execution.
 *
 * Analytics:
 *  - Logs events via PostHog for both user data fetch errors and email sending errors, capturing details such as the error message and user ID (if available).
 *
 * @returns {Promise<void>} - The function does not return any value but interacts with the database and external email services.
 */
async function handleSubscriptionTrialWillEnd(
  subscription: Stripe.Subscription,
) {
  const metadataIds = requireUserAndTeamIds(
    subscription.metadata ?? null,
    "customer.subscription.trial_will_end",
  );
  if (!metadataIds) {
    return;
  }
  const { userId, teamId } = metadataIds;
  const { data: userData, error: userFetchError } = await supabase
    .from("users")
    .select("email, name")
    .eq("user_id", userId)
    .single();
  if (userFetchError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.USER_FETCH_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        error: userFetchError,
        function: "handleSubscriptionTrialWillEnd",
        team_id: teamId,
      },
    });
  }

  // trigger email to the user that their free trial will end
  const resendError = await triggerSubscriptionFreeTrialWillEndEmail(
    userData?.email,
    userData?.name,
    getPlanKey(subscription.items.data[0].price.id),
  );
  if (resendError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.SEND_FREE_TRIAL_WILL_END_EMAIL_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        error: userFetchError,
        function: "handleSubscriptionTrialWillEnd",
        team_id: teamId,
      },
    });
    return;
  }
}

/**
 * Handles the "customer.subscription.deleted" event from Stripe, triggered when a subscription is canceled or deleted.
 * This function updates the subscription status in the database to reflect the cancellation.
 *
 * @param {Stripe.Subscription} subscription - The subscription object from the Stripe webhook event containing details of the deleted subscription.
 *
 * Steps:
 *  1. Extracts the `user_id` from the subscription's metadata.
 *  2. Updates the `subscriptions` table in the database, setting the status of the subscription to "canceled".
 *  3. If the database update fails, logs the error using PostHog for analytics and debugging.
 *
 * Error Handling:
 *  - If updating the subscription status in the database fails, the function logs the error in PostHog and stops further processing.
 *
 * Analytics:
 *  - Captures an event via PostHog if an error occurs during the database update, including the error message and the user ID (if available).
 *
 * @returns {Promise<void>} - The function does not return any value but logs relevant information and updates the database.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const metadataIds = requireUserAndTeamIds(
    subscription.metadata ?? null,
    "customer.subscription.deleted",
  );
  if (!metadataIds) {
    return;
  }
  const { userId, teamId } = metadataIds;

  const { error: subscriptionUpdateError } = await supabase
    .from("subscriptions")
    .update({
      status: SubscriptionStatuses.CANCELED, // note: usually, the user should have benefits until the period end, unless they are refunded prorated amount
    })
    .eq("id", subscription.id);
  if (subscriptionUpdateError) {
    posthog.capture({
      distinctId: userId,
      event: ExceptionEvents.SUSBCRIPTION_UPDATE_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_SUBSCRIPTION,
        function: "handleSubscriptionDeleted",
        error: subscriptionUpdateError,
        team_id: teamId,
      },
    });
    return;
  }
}

/**
 * Verifies the Stripe signature for incoming webhook requests to ensure that the event is legitimately sent by Stripe.
 * This function checks the Stripe signature using the secret and validates the event payload.
 *
 * @param {NextRequest} req - The incoming HTTP request object, which contains the Stripe event payload and signature.
 *
 * @returns {Promise<{status: number; message: string | null; event: Stripe.Event | null}>} -
 *  - `status`: The HTTP status code representing the result of the verification (e.g., 200 for success, 400 for failure).
 *  - `message`: An error message if the signature verification fails, or `null` if successful.
 *  - `event`: The verified Stripe event object if verification is successful, or `null` if it fails.
 *
 * Steps:
 *  1. Reads the request body buffer to prepare for signature verification.
 *  2. Extracts the `stripe-signature` from the request headers and the `STRIPE_WEBHOOK_SECRET` from the environment variables.
 *  3. If the signature or secret is missing, returns an error response with status 400.
 *  4. Attempts to verify the event using Stripe's `constructEvent` method. If the verification fails, returns an error response with status 400.
 *  5. If verification is successful, returns the verified event along with a status of 200.
 *
 * Error Handling:
 *  - If the Stripe signature is missing or the verification process fails, the function returns a status of 400 and an appropriate error message.
 *
 * Security:
 *  - This function ensures that only valid requests from Stripe are processed by verifying the signature against the event payload.
 *
 * @throws Will return an error message if the signature verification fails, but the function does not throw any unhandled exceptions.
 */
async function verifyStripeSignature(req: NextRequest): Promise<{
  status: number;
  message: string | null;
  event: Stripe.Event | null;
}> {
  // load key info
  const requestBuffer = await req.text();
  const sig = req.headers.get("stripe-signature") as string;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string;
  if (!sig || !endpointSecret) {
    return {
      status: 400,
      message: "Webhook Error: Missing signature or secret",
      event: null,
    };
  }

  // verify event was sent from stripe
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(requestBuffer, sig, endpointSecret);
  } catch (err: unknown) {
    return {
      status: 400,
      message: `Stripe signature verification failed: ${err}`,
      event: null,
    };
  }

  return {
    status: 200,
    message: null,
    event,
  };
}

function getCustomerIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // Check if invoice.customer is a string or an expanded object
  if (typeof invoice.customer === "string") {
    return invoice.customer; // It's a customer ID (string)
  } else if (invoice.customer === null) {
    return null;
  } else {
    return invoice.customer.id; // It's an expanded customer object
  }
}

function getCustomerIdFromCheckoutSession(
  session: Stripe.Checkout.Session,
): string | null {
  if (typeof session.customer === "string") {
    return session.customer;
  }
  return session.customer?.id ?? null;
}

function getCustomerIdFromSubscription(
  subscription: Stripe.Subscription,
): string | null {
  // Check if invoice.customer is a string or an expanded object
  if (typeof subscription.customer === "string") {
    return subscription.customer; // It's a customer ID (string)
  } else {
    return subscription.customer.id; // It's an expanded customer object
  }
}

function getPlanKey(
  priceID: string,
): Database["public"]["Enums"]["subscription_plan_type"] {
  switch (priceID) {
    case process.env.STRIPE_PLUS_PRICE_ID:
      return "plus";
    case process.env.STRIPE_PRO_PRICE_ID:
      return "pro";
    case process.env.STRIPE_MAX_PRICE_ID:
      return "max";
    case process.env.STRIPE_TEAM_PRICE_ID:
      return "team";
    default:
      return "free";
  }
}

/**
 * Get the number of credits to grant based on the subscription plan
 */
function getCreditsForPlan(
  planKey: Database["public"]["Enums"]["subscription_plan_type"],
): number {
  switch (planKey) {
    case "free":
      return CreditLimits.FREE;
    case "plus":
      return CreditLimits.PLUS;
    case "pro":
      return CreditLimits.PRO;
    case "max":
      return CreditLimits.MAX;
    case "team":
      return CreditLimits.TEAM;
  }
}

/**
 * Check if a price ID is for a credit pack (one-time purchase)
 * and return the number of credits if it is
 */
function getCreditPackAmount(priceID: string): number | null {
  switch (priceID) {
    case process.env.STRIPE_CREDIT_PACK_100_PRICE_ID:
      return 100;
    case process.env.STRIPE_CREDIT_PACK_500_PRICE_ID:
      return 500;
    case process.env.STRIPE_CREDIT_PACK_1000_PRICE_ID:
      return 1000;
    default:
      return null;
  }
}
