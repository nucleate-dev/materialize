import Stripe from "stripe";
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient, PostgrestError } from "@supabase/supabase-js";
import { buffer } from "micro";
import { PostHog } from "posthog-node";
import { triggerOneTimePaymentConfirmationEmail } from "@/lib/utils/emails/ResendEmailUtils";
import {
  ExceptionEvents,
  LoggingEventSource,
  SuccessEvents,
} from "@/LoggingEvents";

// nextjs automatically parses some of the JSON body. However, stripe webhook verification
// requires the raw input. So we set the config here for the bodyParser to be false.
export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
});

/**
 * API Route to handle Stripe webhook events and process successful ONE TIME payments.
 *
 * This serverless function handles HTTP POST requests for Stripe webhook events, specifically the `checkout.session.completed`
 * event. It verifies that the event was sent by Stripe, updates the database with the payment information, and triggers
 * a payment confirmation email to the customer. Additionally, the function captures success and error events in PostHog.
 *
 * @param {NextApiRequest} req - The incoming request object, which should include the Stripe webhook event payload.
 * @param {NextApiResponse} res - The outgoing response object, which returns:
 *  - 200 for successful processing of the payment and email sending.
 *  - 500 if an error occurs during database updates or email triggering.
 *  - 400/401/403 based on Stripe verification failure.
 *  - 405 if the method is not POST.
 *
 * Flow:
 *  1. **Stripe Event Verification**: Verifies that the event originated from Stripe using `verifyStripeSignature`.
 *     - If verification fails, it logs the error in PostHog and returns an appropriate status and error message.
 *  2. **Event Type Handling**: If the event type is not `checkout.session.completed`, it returns a 200 status without further processing.
 *  3. **Database Update**: Calls `handleDatabaseUpdate` to update the "payments" table with the Stripe payment information.
 *     - If an error occurs during the database update, it logs the error in PostHog and returns a 500 status.
 *  4. **Email Trigger**: Calls `triggerPaymentConfirmationEmail` to send a payment confirmation email to the customer.
 *     - If an error occurs while sending the email, it logs the error in PostHog and returns a 500 status.
 *  5. **Success Logging**: If all steps succeed, it logs the successful payment event in PostHog and returns a 200 status.
 *
 * Error Handling:
 *  - If Stripe signature verification fails, returns the corresponding status and message from `verifyStripeSignature`.
 *  - If an error occurs during the database update or email sending, the function captures the error in PostHog and returns a 500 status.
 *
 * Example Usage:
 *  - This function is used as a webhook handler for Stripe events, primarily for handling successful payments.
 *  - It is triggered when Stripe sends a `checkout.session.completed` event, indicating a successful checkout.
 *
 * Method:
 *  - POST: Processes the Stripe webhook event and performs the necessary actions.
 *  - Any other method will return a 405 Method Not Allowed response.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    await posthog.shutdown();
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }
  // verify stripe sent the event and not a malicious third-party
  const stripeVerification = await verifyStripeSignature(req);
  if (stripeVerification.event === null) {
    posthog.capture({
      distinctId: "stripe",
      event: ExceptionEvents.STRIPE_WEBHOOK_VERIFICATION_FAILED,
      properties: {
        message: stripeVerification.message,
        source: LoggingEventSource.API_PAYMENTS_HANDLE_PAYMENT,
      },
    });
    await posthog.shutdown();
    return res
      .status(stripeVerification.status)
      .send(stripeVerification.message);
  }

  const event = stripeVerification.event;
  if (event.type === "checkout.session.completed") {
    handleStripeCheckoutSessionCompleted(event.data.object);
  }
  await posthog.shutdown();
  return res.status(200).send("Event received");
}

async function handleStripeCheckoutSessionCompleted(
  checkoutSession: Stripe.Checkout.Session
) {
  // update the database
  const { products, error, receipt_url } = await handleDatabaseUpdate(
    checkoutSession
  );
  if (error) {
    posthog.capture({
      event: ExceptionEvents.DATABASE_FETCH_OR_UPDATE_ERROR,
      distinctId: checkoutSession.metadata?.user_id ?? "unknown",
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_PAYMENT,
        error,
      },
    });
    return;
  }

  // trigger email
  const resendError = await triggerOneTimePaymentConfirmationEmail(
    checkoutSession,
    products,
    receipt_url
  );
  if (resendError) {
    posthog.capture({
      event: ExceptionEvents.SEND_PAYMENT_CONFIRMATION_EMAIL_ERROR,
      distinctId: checkoutSession.metadata?.user_id ?? "unknown",
      properties: {
        source: LoggingEventSource.API_PAYMENTS_HANDLE_PAYMENT,
        error: resendError,
      },
    });
    return;
  }

  posthog.capture({
    distinctId: checkoutSession.metadata?.user_id ?? "unknown",
    event: SuccessEvents.HANDLED_STRIPE_CHECKOUT_SESSION_COMPLETED,
    properties: {
      source: LoggingEventSource.API_PAYMENTS_HANDLE_PAYMENT,
    },
  });
  return;
}

/**
 * Helper function to verify the signature of incoming Stripe webhook events.
 *
 * This function verifies that an incoming request is a legitimate webhook from Stripe by
 * checking the signature in the request headers against Stripe's secret. It ensures the event
 * was sent by Stripe and hasn't been tampered with.
 *
 * @param {NextApiRequest} req - The incoming request object from Stripe, expected to contain:
 *  - The raw body (used to construct the request buffer for signature verification).
 *  - The "stripe-signature" header, which contains the signature Stripe uses to sign the event.
 *
 * @returns {Promise<{status: number, message: string | null, event: Stripe.Event | null}>} - A promise resolving to:
 *  - `status`: HTTP status code (200 if successful, 400 if verification fails).
 *  - `message`: A string message describing the error (null if successful).
 *  - `event`: The verified Stripe event object (null if verification fails).
 *
 * Flow:
 *  1. Extracts the request body as a buffer to verify the signature.
 *  2. Retrieves the `stripe-signature` header and the webhook secret from the environment variables.
 *  3. If the signature or secret is missing, it returns a 400 error with an appropriate message.
 *  4. Uses Stripe's `constructEvent` method to verify the signature and parse the event.
 *  5. If the verification fails (e.g., due to a mismatch in the signature), it returns a 400 status with an error message.
 *  6. On successful verification, it returns a 200 status and the parsed Stripe event.
 *
 * Errors:
 *  - Returns a 400 status if the signature or secret is missing or if the signature verification fails.
 */
async function verifyStripeSignature(req: NextApiRequest): Promise<{
  status: number;
  message: string | null;
  event: Stripe.Event | null;
}> {
  // load key info
  const requestBuffer = await buffer(req);
  const sig = req.headers["stripe-signature"] as string;
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
    event = stripe.webhooks.constructEvent(
      requestBuffer.toString(),
      sig,
      endpointSecret
    );
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

/**
 * Helper function to update the database after a successful Stripe Checkout webhook event.
 *
 * This function handles updating the "payments" table with payment information from a Stripe Checkout session,
 * and if the user is authenticated (i.e., a `user_id` is provided), it updates the "users" table with the associated
 * payment IDs. It also retrieves and returns the products purchased and the payment receipt URL.
 *
 * @param {Stripe.Checkout.Session} checkoutSession - The Stripe Checkout session object received from the Stripe webhook event.
 *  - Contains payment information such as the session ID, user metadata, payment status, and other details.
 *
 * @returns {Promise<{error: PostgrestError | null, products: Array<string>, receipt_url: any}>} - A promise resolving to:
 *  - `error`: Any error encountered during the database update process (null if successful).
 *  - `products`: An array of product identifiers based on the items in the checkout session (e.g., "base", "pro").
 *  - `receipt_url`: The URL to the receipt for the payment, retrieved from the Stripe Payment Intent (if available).
 *
 * Flow:
 *  1. Retrieves the user ID from the metadata of the checkout session (if provided).
 *  2. Retrieves the line items from the Stripe Checkout session to determine which products were purchased.
 *  3. Attempts to retrieve the receipt URL by querying the Payment Intent associated with the session.
 *  4. Inserts a new record into the "payments" table, storing details such as the user ID, session ID, amount, currency, products, and receipt URL.
 *  5. If the user is authenticated (i.e., a `user_id` is available), it updates the "users" table by appending the stripe checkoutsession ID to the user's list of payment IDs.
 *
 * Error Handling:
 *  - If any error occurs during the database operations (inserting the payment or updating the user), the error is returned alongside the other results.
 *  - If successful, the function returns the list of products and the receipt URL.
 */
async function handleDatabaseUpdate(
  checkoutSession: Stripe.Checkout.Session
): Promise<{
  error: PostgrestError | null;
  products: Array<string>;
  receipt_url: string | null;
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  );
  const user_id = checkoutSession.metadata?.user_id;

  // ---- UPDATE PAYMENTS TABLE WITH NEW PAYMENT ----
  // get line items.
  //    If you have some sort of shopping cart functionality, you may want to check
  //    if there are multiple line items (using has_more). This API call will return the first handful
  //    In this starter pack, there will always be one.
  const lineItems = await stripe.checkout.sessions.listLineItems(
    checkoutSession.id
  );
  const products: Array<string> = [];
  lineItems.data.forEach((item: Stripe.LineItem) => {
    if (item.price?.id === process.env.STRIPE_BASE_PRICE_ID) {
      products.push("base");
    } else if (item.price?.id === process.env.STRIPE_PRO_PRICE_ID) {
      products.push("pro");
    }
  });

  // get receipt url
  let paymentIntent = checkoutSession.payment_intent;
  let receiptUrl = null;
  if (typeof paymentIntent === "string") {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent, {
      expand: ["latest_charge"],
    });
  } else if (paymentIntent !== null) {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id, {
      expand: ["latest_charge"],
    });
  }
  if (paymentIntent !== null) {
    const latest_charge = paymentIntent.latest_charge;
    if (latest_charge !== null && typeof latest_charge !== "string")
      receiptUrl = latest_charge.receipt_url;
  }

  // create a new payment
  const { error: payment_insert_error } = await supabase
    .from("payments")
    .insert({
      user_id: user_id || null, // will be null if auth is not required to make the payment. user_id passed in from api/payments/checkout
      stripe_checkout_session_id: checkoutSession.id,
      email:
        checkoutSession.customer_details?.email ||
        checkoutSession.customer_email,
      amount_total: checkoutSession.amount_total,
      currency: checkoutSession.currency,
      paid: checkoutSession.payment_status === "paid",
      payment_status: checkoutSession.payment_status,
      products: products,
      receipt_url: receiptUrl,
    });
  if (payment_insert_error) {
    return {
      products: [],
      error: payment_insert_error,
      receipt_url: receiptUrl,
    };
  }

  // ---- UPDATE USERS TABLE WITH NEW PAYMENT IDS IF USER IS AUTHENTICATED PRIOR TO PAYMENT ----
  // retrieve user row to get existing payment ids if any
  if (user_id) {
    const { data: currentUser, error: userFetchError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", user_id)
      .single();
    if (userFetchError) {
      return {
        products,
        error: userFetchError,
        receipt_url: receiptUrl,
      };
    }
    const current_payment_ids = currentUser?.payment_ids || [];
    current_payment_ids.push(checkoutSession.id);

    // update user row
    const { error: user_update_error } = await supabase
      .from("users")
      .update({
        payment_ids: current_payment_ids,
      })
      .eq("user_id", user_id);
    if (user_update_error) {
      return {
        products,
        error: user_update_error,
        receipt_url: receiptUrl,
      };
    }
  }

  return {
    products,
    error: null,
    receipt_url: receiptUrl,
  };
}
