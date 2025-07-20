import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { PostHog } from "posthog-node";
import {
  ExceptionEvents,
  LoggingEventSource,
  SuccessEvents,
} from "@/LoggingEvents";
import jwt from "jsonwebtoken";

// in most cases, only your service should be able to insert rows into your users table
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1, // since this is a serverless function, we have to specify this flushAt and flushInterval
  flushInterval: 0,
});

/**
 * USE THIS HANDLER IF YOUR USER IS REQUIRED TO BE AUTHENTICATED TO MAKE A PAYMENT. OTHERWISE,
 * USE THE HANDLER COMMENTED OUT BELOW.
 *
 * API Route to handle user registration in the database.
 *
 * This serverless function handles HTTP POST requests to register a user by inserting
 * the user information into the "users" table in the Supabase database. It captures any
 * errors or successes in the PostHog analytics tool.
 *
 * @param {NextApiRequest} req - The incoming request object. It expects a JSON body with:
 *  - userId (string): The unique ID of the user (required).
 *  - firstName (string): The user's first name (optional).
 *  - lastName (string): The user's last name (optional).
 *  - email (string): The user's email address (optional).
 *  - phoneNumber (string): The user's phone number (optional).
 *
 * @param {NextApiResponse} res - The outgoing response object. It returns:
 *  - 200 if the user is successfully created.
 *  - 400 if the userId is not provided.
 *  - 500 if there's an error during user creation.
 *  - 405 if the method is not allowed (only POST is allowed).
 *
 * Error and success events are captured in PostHog:
 *  - REGISTER_USER_INSERT_USER_ERROR: Captured when an error occurs during user creation.
 *  - REGISTER_USER_SUCCESSFUL_USER_REGISTRATION: Captured when the user is successfully created.
 *
 * Method:
 *  - POST: Creates a new user in the database with the provided user information.
 *  - Any other method will return a 405 Method Not Allowed response.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (!token || !req.headers.authorization?.startsWith("Bearer")) {
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.NO_JWT_TOKEN_PROVIDED,
      properties: {
        source: LoggingEventSource.API_REGISTRATION_REGISTER_USER,
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
  } catch (error) {
    posthog.capture({
      distinctId: "unknown",
      event: ExceptionEvents.INVALID_JWT_TOKEN,
      properties: {
        source: LoggingEventSource.API_REGISTRATION_REGISTER_USER,
        error: error,
      },
    });
    await posthog.shutdown();
    console.error("Invalid token: ", error);
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }

  if (userID === null || userID === undefined) {
    return res.status(400).send("userID provided");
  }

  const body = JSON.parse(req.body);
  // create a user in your database with the provided information
  const { error: user_creation_error } = await supabase.from("users").insert({
    user_id: userID,
    name: body.firstName + " " + body.lastName,
    email: body.email,
    phone_number: body.phoneNumber ?? "",
  });
  if (user_creation_error) {
    posthog.capture({
      distinctId: userID as string,
      event: ExceptionEvents.USER_CREATION_ERROR,
      properties: {
        source: LoggingEventSource.API_REGISTRATION_REGISTER_USER,
      },
    });
    await posthog.shutdown();
    return res
      .status(500)
      .send(`Could not create user: ${user_creation_error}`);
  }

  posthog.capture({
    distinctId: userID as string,
    event: SuccessEvents.REGISTRATION_CREATED_NEW_USER,
  });
  await posthog.shutdown();
  return res.status(200).send("User created");
}

/**
 * USE THIS VERSION OF THE HANDLER IF THE USER DOES NOT NEED TO BE AUTHENTICATED TO MAKE A PAYMENT.
 * THIS FUNCTION CHECKS THAT A VALID PAYMENT HAS BEEN MADE BEFORE REGISTERING A USER.
 *
 * API Route to handle user registration with payment verification.
 *
 * This serverless function processes HTTP POST requests to register a user by verifying the provided
 * Stripe Checkout session ID and creating a user in the database. It updates the payment record to associate
 * it with the newly created user. The function captures analytics events in PostHog for both successes and errors.
 *
 * @param {NextApiRequest} req - The incoming request object. It expects a JSON body with:
 *  - sessionId (string): The Stripe Checkout session ID (required).
 *  - userId (string): The unique ID of the user (required).
 *  - firstName (string): The user's first name (optional).
 *  - lastName (string): The user's last name (optional).
 *  - email (string): The user's email address (optional).
 *  - phoneNumber (string): The user's phone number (optional).
 *
 * @param {NextApiResponse} res - The outgoing response object. It returns:
 *  - 200 if the user is successfully created and payment is updated.
 *  - 400 if the sessionId or userId is missing from the request.
 *  - 402 if the payment record cannot be retrieved or if it is already linked to a user.
 *  - 500 if there is an error during user creation.
 *  - 405 if the method is not allowed (only POST is allowed).
 *
 * Flow:
 *  1. Verifies the Stripe Checkout session ID exists and hasn't already been used for registration.
 *  2. Inserts the new user into the "users" table in Supabase.
 *  3. Updates the "payments" table with the user's ID once registration is successful.
 *  4. Errors are captured in PostHog for debugging purposes:
 *     - REGISTER_USER_LOAD_PAYMENT_ERROR: Captured when retrieving the payment record fails.
 *     - REGISTER_USER_INSERT_USER_ERROR: Captured when inserting the user record fails.
 *     - REGISTER_USER_PAYMENT_UPDATE_ERROR: Captured when updating the payment record fails.
 *  5. On successful registration, the event REGISTER_USER_SUCCESSFUL_USER_REGISTRATION is captured in PostHog.
 *
 * Method:
 *  - POST: Registers a user with payment verification and updates payment record.
 *  - Any other method will return a 405 Method Not Allowed response.
 */
// export default async function handler(
//   req: NextApiRequest,
//   res: NextApiResponse
// ) {
//   if (req.method === "POST") {
//     const body = JSON.parse(req.body);
//     if (!body.sessionId || !body.userId) {
//       return res.status(400).send("No sessionID or userID provided");
//     }

//     // Verify that a valid payment id is being used to register and that the payment ID has not already been used
//     const { data, error } = await supabase
//       .from("payments")
//       .select("*")
//       .eq("stripe_checkout_session_id", body.sessionId)
//       .single();
//     if (error) {
//       await logDatabaseErrorWithLoggingProviderShutdown({
//         ...loggingProviderConstant,
//         distinctId: body.userId,
//         event: ExceptionEvents.REGISTER_USER_LOAD_PAYMENT_ERROR,
//         error: error,
//       });
//       return res.status(402).send("Could not retrieve payment");
//     }
//     if (data?.user_id) {
//       return res
//         .status(402)
//         .send(
//           "Payment ID does not exist in database, or users have already registered with the payment ID"
//         );
//     }

//     // create a user in your database with the provided information
//     const { error: user_creation_error } = await supabase.from("users").insert({
//       user_id: body.userId,
//       first_name: body.firstName,
//       last_name: body.lastName,
//       email: body.email,
//       phone_number: body.phoneNumber ?? "",
//       payment_ids: [body.sessionId],
//     });
//     if (user_creation_error) {
//       await logDatabaseErrorWithLoggingProviderShutdown({
//         ...loggingProviderConstant,
//         distinctId: body.userId,
//         event: ExceptionEvents.REGISTER_USER_INSERT_USER_ERROR,
//         error: user_creation_error,
//       });
//       return res
//         .status(500)
//         .send(`Could not create user: ${user_creation_error}`);
//     }

//     // update their payment in the database with their user ID
//     const { error: payment_update_error } = await supabase
//       .from("payments")
//       .update({ user_id: body.userId })
//       .eq("stripe_checkout_session_id", body.sessionId);
//     if (payment_update_error) {
//       await logDatabaseErrorWithLoggingProviderShutdown({
//         ...loggingProviderConstant,
//         distinctId: body.userId,
//         event: ExceptionEvents.REGISTER_USER_PAYMENT_UPDATE_ERROR,
//         error: payment_update_error,
//       });
//       return res
//         .status(400)
//         .send(`Could not update payment table: ${payment_update_error}`);
//     }

//     await logSuccessEventWithLoggingProviderShutdown({
//       ...loggingProviderConstant,
//       distinctId: body.userId,
//       event: SuccessEvents.REGISTER_USER_SUCCESSFUL_USER_REGISTRATION,
//     });
//     return res.status(200).send("User created");
//   } else {
//     res.setHeader("Allow", "POST");
//     return res.status(405).send("Method Not Allowed");
//   }
// }
