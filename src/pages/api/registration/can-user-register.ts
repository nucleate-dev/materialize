import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { PostHog } from "posthog-node";
import { ExceptionEvents, LoggingEventSource } from "@/LoggingEvents";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
});

/**
 * USE THIS FUNCTION IF YOUR USER DOES NOT NEED TO BE AUTHENTICATED TO MAKE A PAYMENT (FLOW #3)
 *
 * API Route to check if a user can register based on Stripe Checkout session ID.
 *
 * This serverless function processes HTTP POST requests to verify whether a user is eligible
 * to register using a provided Stripe Checkout session ID. It checks the "payments" table in the database
 * to ensure that the payment exists, has been marked as "paid," and has not already been associated with a user.
 *
 * @param {NextApiRequest} req - The incoming request object. It expects a JSON body with:
 *  - sessionID (string): The Stripe Checkout session ID (required).
 *
 * @param {NextApiResponse} res - The outgoing response object. It returns:
 *  - 200 with `canRegister: true` if the session ID exists, the payment is marked as paid, and no user has registered.
 *  - 200 with `canRegister: false` if the session ID is missing, the payment is not marked as paid, or a user is already registered.
 *  - 500 if there is an error retrieving the payment from the database.
 *  - 405 if the method is not allowed (only POST is allowed).
 *
 * Flow:
 *  1. Verifies the Stripe Checkout session ID is provided.
 *  2. Checks the "payments" table to see if the session ID exists, the payment is marked as "paid,"
 *     and no user has been associated with the payment (i.e., no user has registered).
 *  3. Sends a response indicating whether the user can register:
 *     - `canRegister: true`: The session ID is valid, the payment is paid, and no user is registered.
 *     - `canRegister: false`: The session ID is missing, the payment is unpaid, or a user is already registered.
 *  4. Errors are captured in PostHog for debugging purposes:
 *     - CAN_USER_REGISTER_LOAD_PAYMENT_ERROR: Captured when retrieving the payment record fails.
 *  5. If the method is not POST, a 405 Method Not Allowed response is sent.
 *
 * Method:
 *  - POST: Determines if a user can register based on the session ID.
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
  const body = JSON.parse(req.body);
  const sessionId = body.sessionID;
  if (!sessionId) {
    // require a sessionID
    await posthog.shutdown();
    return res
      .status(200)
      .json({ canRegister: false, reason: "no sessionID provided" });
  }

  // load payment from database
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("stripe_checkout_session_id", sessionId)
    .single();
  if (error) {
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.PAYMENT_FETCH_ERROR,
      properties: {
        source: LoggingEventSource.API_REGISTRATION_CAN_USER_REGISTER,
        checkout_session_id: sessionId,
      },
    });
    await posthog.shutdown();
    return res.status(500).json({
      canRegister: false,
      reason: "could not retrieve payment from database",
    });
  }

  if (data && data.paid === true && data.user_id === null) {
    // payment exists, and no user created an account from the payment
    await posthog.shutdown();
    return res.status(200).json({
      canRegister: true,
      reason: "sessionID exists in database with no associated user",
    });
  }
  await posthog.shutdown();
  return res.status(200).json({
    canRegister: false,
    reason:
      "sessionID exists in database but paid status is not true or at least one user has already registered",
  });
}
