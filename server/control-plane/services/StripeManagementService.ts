import Stripe from 'stripe';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import {
  type ManageBillingRequestBody,
} from '../types/PublicAPITypes.js';
import type { Database } from '../types/supabase.js';

dotenv.config();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Initialize Supabase client
const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Exception Events for logging (migrated from web-application)
 */
const ExceptionEvents = Object.freeze({
  NO_JWT_TOKEN_PROVIDED: 'NO_JWT_TOKEN_PROVIDED',
  INVALID_JWT_TOKEN: 'INVALID_JWT_TOKEN',
  NULL_USER_ID_FROM_JWT_TOKEN: 'NULL_USER_ID_FROM_JWT_TOKEN',
  USER_FETCH_ERROR: 'USER_FETCH_ERROR',
  STRIPE_CUSTOMER_BILLING_PORTAL_CREATION_ERROR: 'STRIPE_CUSTOMER_BILLING_PORTAL_CREATION_ERROR',
});

// const LoggingEventSource = Object.freeze({
//   API_PAYMENTS_MANAGE_BILLING: 'API_PAYMENTS_MANAGE_BILLING',
// });

export class StripeManagementService {
  constructor() {
    // Initialize any required dependencies
  }

  /**
   * Register routes with Fastify
   */
  public registerRoutes(app: FastifyInstance): void {
    // POST /payments/manage-billing
    app.post<{ Body: ManageBillingRequestBody }>(
      '/payments/manage-billing',
      this.handleManageBilling.bind(this),
    );
  }

  /**
   * API Route Handler for Stripe Billing Portal Session creation.
   *
   * This function handles HTTP POST requests to create a Stripe Billing Portal session
   * for a user, allowing them to manage their subscription details such as payment methods,
   * subscription upgrades/downgrades, and cancellations. The session URL is returned to the client
   * for redirection.
   *
   * @param {FastifyRequest} request - The incoming request object. It expects:
   *  - A POST method.
   *  - Authorization header with Bearer JWT token
   *  - JSON body (empty, user ID comes from JWT)
   *
   * @param {FastifyReply} reply - The outgoing response object. It returns:
   *  - HTTP 200 with a JSON object containing `redirect_url` if the session is successfully created.
   *  - HTTP 400 if the userID is missing or there is a Stripe session creation error.
   *  - HTTP 401 if JWT token is missing or invalid.
   *  - HTTP 500 if there is an internal server error (e.g., issue with fetching user or Stripe API call).
   *
   * Error Handling:
   *  - Logs errors to the console on the following events:
   *    - Missing JWT token: Logs `NO_JWT_TOKEN_PROVIDED`.
   *    - Invalid JWT token: Logs `INVALID_JWT_TOKEN`.
   *    - Missing userID: Logs `NULL_USER_ID_FROM_JWT_TOKEN`.
   *    - Database fetch error for the user's Stripe customer ID: Logs `USER_FETCH_ERROR`.
   *    - Stripe API failure when creating the billing portal session: Logs `STRIPE_CUSTOMER_BILLING_PORTAL_CREATION_ERROR`.
   *
   * Usage:
   *  - Sends a request to Stripe to create a billing portal session.
   *  - Returns the session URL which allows the user to manage their subscription.
   *
   * Flow:
   *  1. Extracts and validates JWT token from Authorization header.
   *  2. Decodes JWT to get the `userID`.
   *  3. Fetches the Stripe customer ID from the database based on the `userID`.
   *  4. Creates a Stripe Billing Portal session.
   *  5. Returns the session URL to the client.
   *  6. Handles and logs errors appropriately, such as missing user IDs or database/Stripe errors.
   */
  private async handleManageBilling(
    request: FastifyRequest<{ Body: ManageBillingRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    // Extract JWT token from Authorization header
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    if (!token || !authHeader?.startsWith('Bearer ')) {
      this.logError(ExceptionEvents.NO_JWT_TOKEN_PROVIDED, 'unknown', 'No token provided');
      console.error('No token provided');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'No token provided',
      });
    }

    // Decode and validate JWT token
    let userID: string | undefined;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
      userID = decoded.sub;
    } catch (error) {
      this.logError(ExceptionEvents.INVALID_JWT_TOKEN, 'unknown', 'Invalid token', error);
      console.error('Invalid token: ', error);
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }

    // Validate user ID
    if (userID === null || userID === undefined) {
      this.logError(ExceptionEvents.NULL_USER_ID_FROM_JWT_TOKEN, 'unknown', 'Missing user ID');
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Missing user ID. User is not authenticated.',
      });
    }

    try {
      // Fetch the stripe customer ID from the database
      const { data: userData, error: userFetchError } = await supabase
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userID)
        .single();

      if (userFetchError) {
        this.logError(
          ExceptionEvents.USER_FETCH_ERROR,
          userID,
          'Could not fetch user data',
          userFetchError,
        );
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Could not fetch user data.',
        });
      }

      const stripeCustomerId = userData?.stripe_customer_id;
      if (!stripeCustomerId) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'No Stripe customer ID found for user.',
        });
      }

      // Create Stripe billing portal session
      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${process.env.SITE_BASE_URL}/dashboard/account`,
      });

      return reply.send({
        redirect_url: session.url,
      });

    } catch (error) {
      this.logError(
        ExceptionEvents.STRIPE_CUSTOMER_BILLING_PORTAL_CREATION_ERROR,
        userID,
        'Could not create stripe billing portal session',
        error,
      );
      console.error('Could not create stripe billing portal session: ', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Could not create stripe billing portal session',
      });
    }
  }

  /**
   * Log error events (simplified version of PostHog logging)
   * TODO: Consider integrating with a proper logging service like PostHog
   */
  private logError(event: string, userId: string, message: string, error?: unknown): void {
    console.error(`[${event}] User: ${userId}, Message: ${message}`, error || '');
    // TODO: Add PostHog or other analytics integration here
    // posthog.capture({
    //   distinctId: userId,
    //   event: event,
    //   properties: {
    //     source: LoggingEventSource.API_PAYMENTS_MANAGE_BILLING,
    //     error: error,
    //     message: message,
    //   },
    // });
  }
}