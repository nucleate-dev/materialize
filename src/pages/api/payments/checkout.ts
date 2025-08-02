import Stripe from "stripe";
import { NextApiRequest, NextApiResponse } from "next";
import { PostHog } from "posthog-node";
import {
  LoggingEventSource,
  ExceptionEvents,
  SuccessEvents,
} from "@/LoggingEvents";
import jwt from "jsonwebtoken";
import { ProductKeys } from "@/GlobalConstants";

const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

/**
 * USE THE CORRECT SESSION BASED ON WHETHER THE USER IS AUTHENTICATED OR NOT
 *
 * API Route to create a Stripe Checkout session for processing ONE TIME payments.
 *
 * This serverless function handles HTTP POST requests to create a Stripe Checkout session based on the product ID
 * and payment flow. It configures the payment options, sets the success and cancel URLs, and captures the session creation
 * event in PostHog for analytics. The product can either be "team" or "pro," determining which price ID to use.
 *
 * @param {NextApiRequest} req - The incoming request object. It expects a JSON body with:
 *  - productID (string): The product ID ("team" or "pro") to determine the price (required).
 *  - userID (string): The unique ID of the user for metadata purposes (optional if auth is not required (flow 3).
 *
 * @param {NextApiResponse} res - The outgoing response object. It returns:
 *  - 200 with the created Stripe session ID in the response body.
 *  - 405 if the method is not allowed (only POST is allowed).
 *
 * Flow:
 *  1. Determines the Stripe price ID to use based on the provided `productID`.
 *  2. Creates a Stripe Checkout session with the following parameters:
 *     - Payment methods: "card" and "us_bank_account."
 *     - Line items: Uses the selected price ID and quantity of 1.
 *     - Mode: "payment" (one-time payment).
 *     - Success URL: Redirects to the dashboard on payment success.
 *     - Cancel URL: Redirects to the homepage if payment is canceled.
 *     - Metadata: Attaches the `userID` to the session for tracking purposes.
 *  3. Optionally, another flow (commented out) provides a registration flow after payment success.
 *  4. Logs the successful creation of the checkout session in PostHog:
 *     - CHECKOUT_STRIPE_CHECKOUT_SESSION_CREATED: Captured with the `productID`.
 *  5. Responds with the session ID to be used on the frontend for Stripe Checkout.
 *
 * Method:
 *  - POST: Creates a Stripe Checkout session for payment processing.
 *  - Any other method will return a 405 Method Not Allowed response.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    // await posthog.shutdown();
    res.setHeader("Allow", "POST");
    res.status(405).end("Method Not Allowed");
  }

  // JWT Token Validation (verify its provided and that it is valid)
  const token = req.headers.authorization?.split(" ")[1];
  if (!token || !req.headers.authorization?.startsWith("Bearer")) {
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.NO_JWT_TOKEN_PROVIDED,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_CHECKOUT,
      },
    });
    await posthog.shutdown();
    console.error("No token provided");
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  let userID;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    userID = decoded.sub;

    // Validate that userID is present and valid
    if (!userID || typeof userID !== "string") {
      console.error("Invalid or missing user ID from JWT token:", {
        userID,
        decodedPayload: decoded,
      });
      posthog.capture({
        distinctId: "unknown",
        event: ExceptionEvents.INVALID_JWT_TOKEN,
        properties: {
          source: LoggingEventSource.API_PAYMENTS_CHECKOUT,
        },
      });
      await posthog.shutdown();
      return res
        .status(401)
        .json({ error: "Unauthorized: Invalid user ID in token" });
    }
  } catch (error) {
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.INVALID_JWT_TOKEN,
      properties: {
        source: LoggingEventSource.API_PAYMENTS_CHECKOUT,
        error: error,
      },
    });
    await posthog.shutdown();
    console.error("Invalid token: ", error);
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }

  const body = JSON.parse(req.body);
  let priceID = process.env.STRIPE_BASE_PRICE_ID as string;
  if (body.productID === ProductKeys.TEAM_SUBSCRIPTION) {
    priceID = process.env.STRIPE_TEAM_PRICE_ID as string;
  } else if (body.productID === ProductKeys.PRO_SUBSCRIPTION) {
    priceID = process.env.STRIPE_PRO_PRICE_ID as string;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "us_bank_account"],
      line_items: [
        {
          price: priceID,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.NEXT_PUBLIC_SITE_BASE_URL}/dashboard`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_BASE_URL}`,
      subscription_data: {
        metadata: {
          user_id: userID as string,
        },
      },
    });

    posthog.capture({
      distinctId: userID as string,
      event: SuccessEvents.STRIPE_CHECKOUT_SESSION_CREATED,
      properties: {
        product: body.productID,
        source: LoggingEventSource.API_PAYMENTS_CHECKOUT,
      },
    });
    await posthog.shutdown();
    return res.status(200).json({ id: session.id });
  } catch (error) {
    posthog.capture({
      distinctId: userID as string,
      event: ExceptionEvents.STRIPE_CHECKOUT_SESSION_CREATION_ERROR,
      properties: {
        error: error,
        source: LoggingEventSource.API_PAYMENTS_CHECKOUT,
      },
    });
    await posthog.shutdown();
    console.error("Exception creating checkout session: ", error);
    return res.status(400).json({ id: null });
  }
}
