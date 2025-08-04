import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { PostHog } from "posthog-node";
import { createClient } from "@supabase/supabase-js";
import { ExceptionEvents, LoggingEventSource } from "@/LoggingEvents";
import jwt from "jsonwebtoken";

const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

/**
 * API Route Handler for Stripe Billing Portal Session creation.
 *
 * This function handles HTTP POST requests to create a Stripe Billing Portal session
 * for a user, allowing them to manage their subscription details such as payment methods,
 * subscription upgrades/downgrades, and cancellations. The session URL is returned to the client
 * for redirection.
 *
 * @param {NextRequest} req - The incoming request object. It expects:
 *  - A POST method.
 *  - A JSON body with:
 *    - userID (string): The ID of the authenticated user (required).
 *
 * @returns {NextResponse} - The outgoing response object. It returns:
 *  - HTTP 200 with a JSON object containing `redirect_url` if the session is successfully created.
 *  - HTTP 400 if the userID is missing or there is a Stripe session creation error.
 *  - HTTP 500 if there is an internal server error (e.g., issue with fetching user or Stripe API call).
 *  - HTTP 405 if any method other than POST is used.
 *
 * Error Handling:
 *  - Logs errors to the logging provider (PostHog) on the following events:
 *    - Missing userID: Logs `MANAGE_BILLING_USER_ID_NULL`.
 *    - Database fetch error for the user's Stripe customer ID: Logs `MANAGE_BILLING_SUBSCRIPTION_FETCH_ERROR`.
 *    - Stripe API failure when creating the billing portal session: Logs `MANAGE_BILLING_SUBSCRIPTION_FETCH_ERROR`.
 *
 * Usage:
 *  - Sends a request to Stripe to create a billing portal session.
 *  - Returns the session URL which allows the user to manage their subscription.
 *
 * Flow:
 *  1. Parses the `userID` from the request body.
 *  2. Fetches the Stripe customer ID from the database based on the `userID`.
 *  3. Creates a Stripe Billing Portal session.
 *  4. Returns the session URL to the client.
 *  5. Handles and logs errors appropriately, such as missing user IDs or database/Stripe errors.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.split(" ")[1];
  if (!token || !req.headers.get("authorization")?.startsWith("Bearer")) {
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.NO_JWT_TOKEN_PROVIDED,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_MANAGE_BILLING,
      },
    });
    await posthog.shutdown();
    console.error("No token provided");
    return NextResponse.json({ error: "Unauthorized: No token provided" }, { status: 401 });
  }

  let userID;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    userID = decoded.sub;
  } catch (error) {
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.INVALID_JWT_TOKEN,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_MANAGE_BILLING,
        error: error,
      },
    });
    await posthog.shutdown();
    console.error("Invalid token: ", error);
    return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
  }

  if (userID === null || userID === undefined) {
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.NULL_USER_ID_FROM_JWT_TOKEN,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_MANAGE_BILLING,
      },
    });
    await posthog.shutdown();
    return new NextResponse("Missing user ID. User is not authenticated.", { status: 400 });
  }

  // fetch the stripe customer ID from the database
  const { data: userData, error: userFetchError } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userID)
    .single();
  if (userFetchError) {
    posthog.capture({
      distinctId: userID as string,
      event: ExceptionEvents.USER_FETCH_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_MANAGE_BILLING,
        error: userFetchError,
        function: "manage-billing",
      },
    });
    await posthog.shutdown();
    return new NextResponse("Could not fetch user data.", { status: 400 });
  }

  const stripeCustomerId = userData?.stripe_customer_id;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_SITE_BASE_URL}/dashboard/account`, // Change this to your actual return URL
    });
    await posthog.shutdown();
    return NextResponse.json({ redirect_url: session.url });
  } catch (err) {
    posthog.capture({
      distinctId: userID as string,
      event: ExceptionEvents.STRIPE_CUSTOMER_BILLING_PORTAL_CREATION_ERROR,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_MANAGE_BILLING,
        error: err,
      },
    });
    await posthog.shutdown();
    console.error("Could not create stripe billing portal session: ", err);
    return new NextResponse("Could not create stripe billing portal session", { status: 500 });
  }
}