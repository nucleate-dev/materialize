import Stripe from 'stripe';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import {
  type ManageBillingRequestBody,
  type CheckoutRequestBody,
  HTTP_STATUS,
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
 * Product Keys for subscription plans
 */
const ProductKeys = Object.freeze({
  FREE_SUBSCRIPTION: 'free',
  TEAM_SUBSCRIPTION: 'team',
  PRO_SUBSCRIPTION: 'pro',
});

/**
 * Exception Events for logging (migrated from web-application)
 */
const ExceptionEvents = Object.freeze({
  NO_JWT_TOKEN_PROVIDED: 'NO_JWT_TOKEN_PROVIDED',
  INVALID_JWT_TOKEN: 'INVALID_JWT_TOKEN',
  NULL_USER_ID_FROM_JWT_TOKEN: 'NULL_USER_ID_FROM_JWT_TOKEN',
  USER_FETCH_ERROR: 'USER_FETCH_ERROR',
  STRIPE_CUSTOMER_BILLING_PORTAL_CREATION_ERROR:
    'STRIPE_CUSTOMER_BILLING_PORTAL_CREATION_ERROR',
  STRIPE_CHECKOUT_SESSION_CREATED: 'STRIPE_CHECKOUT_SESSION_CREATED',
  STRIPE_CHECKOUT_SESSION_CREATION_ERROR:
    'STRIPE_CHECKOUT_SESSION_CREATION_ERROR',
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
    // POST /payments/checkout
    app.post<{ Body: CheckoutRequestBody }>(
      '/payments/checkout',
      {
        schema: {
          body: {
            type: 'object',
            required: ['productID'],
            properties: {
              productID: {
                type: 'string',
                enum: ['free', 'team', 'pro'],
              },
            },
          },
        },
      },
      this.handleCheckout.bind(this),
    );

    // POST /payments/manage-billing
    app.post<{ Body: ManageBillingRequestBody }>(
      '/payments/manage-billing',
      this.handleManageBilling.bind(this),
    );
  }

  /**
   * API Route Handler for Stripe Checkout Session creation.
   *
   * This function handles HTTP POST requests to create a Stripe Checkout session based on the product ID
   * and payment flow. It configures the subscription options, sets the success and cancel URLs, and creates
   * the checkout session for the user. The product can be "team" or "pro," determining which price ID to use.
   *
   * @param {FastifyRequest} request - The incoming request object. It expects a JSON body with:
   *  - productID (string): The product ID ("team" or "pro") to determine the price (required).
   *
   * @param {FastifyReply} reply - The outgoing response object. It returns:
   *  - HTTP 200 with the created Stripe session ID in the response body.
   *  - HTTP 400 if there's an error creating the checkout session.
   *  - HTTP 401 if JWT token is missing or invalid.
   *
   * Flow:
   *  1. Validates JWT token and extracts user ID.
   *  2. Determines the Stripe price ID based on the provided `productID`.
   *  3. Creates a Stripe Checkout session with subscription mode.
   *  4. Returns the session ID for frontend integration.
   */
  private async handleCheckout(
    request: FastifyRequest<{ Body: CheckoutRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    // Extract JWT token from Authorization header
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token || !authHeader?.startsWith('Bearer ')) {
      this.logError(
        ExceptionEvents.NO_JWT_TOKEN_PROVIDED,
        'unknown',
        'No token provided',
      );
      console.error('No token provided');
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        error: 'Unauthorized',
        message: 'No token provided',
      });
    }

    // Decode and validate JWT token
    let userID: string | undefined;
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!,
      ) as jwt.JwtPayload;
      userID = decoded.sub;

      // Validate that userID is present and valid
      if (!userID || typeof userID !== 'string') {
        console.error('Invalid or missing user ID from JWT token:', {
          userID,
          decodedPayload: decoded,
        });
        this.logError(
          ExceptionEvents.INVALID_JWT_TOKEN,
          'unknown',
          'Invalid user ID in token',
        );
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'Unauthorized',
          message: 'Invalid user ID in token',
        });
      }
    } catch (error) {
      this.logError(
        ExceptionEvents.INVALID_JWT_TOKEN,
        'unknown',
        'Invalid token',
        error,
      );
      console.error('Invalid token: ', error);
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }

    const { productID } = request.body;

    // Determine price ID based on product
    let priceID = process.env.STRIPE_BASE_PRICE_ID as string;
    if (productID === ProductKeys.TEAM_SUBSCRIPTION) {
      priceID = process.env.STRIPE_TEAM_PRICE_ID as string;
    } else if (productID === ProductKeys.PRO_SUBSCRIPTION) {
      priceID = process.env.STRIPE_PRO_PRICE_ID as string;
    }

    try {
      console.log('🔄 [StripeManagementService] Creating checkout session...');
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card', 'us_bank_account'],
        line_items: [
          {
            price: priceID,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.SITE_BASE_URL}/dashboard`,
        cancel_url: `${process.env.SITE_BASE_URL}`,
        subscription_data: {
          metadata: {
            user_id: userID,
          },
        },
      });

      this.logSuccess(
        ExceptionEvents.STRIPE_CHECKOUT_SESSION_CREATED,
        userID,
        'Checkout session created',
        {
          product: productID,
          sessionId: session.id,
        },
      );

      return reply.status(HTTP_STATUS.OK).send({
        id: session.id,
      });
    } catch (error) {
      this.logError(
        ExceptionEvents.STRIPE_CHECKOUT_SESSION_CREATION_ERROR,
        userID,
        'Exception creating checkout session',
        error,
      );
      console.error('Exception creating checkout session: ', error);
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        id: null,
        error: 'Checkout session creation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
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
      this.logError(
        ExceptionEvents.NO_JWT_TOKEN_PROVIDED,
        'unknown',
        'No token provided',
      );
      console.error('No token provided');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'No token provided',
      });
    }

    // Decode and validate JWT token
    let userID: string | undefined;
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!,
      ) as jwt.JwtPayload;
      userID = decoded.sub;
    } catch (error) {
      this.logError(
        ExceptionEvents.INVALID_JWT_TOKEN,
        'unknown',
        'Invalid token',
        error,
      );
      console.error('Invalid token: ', error);
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }

    // Validate user ID
    if (userID === null || userID === undefined) {
      this.logError(
        ExceptionEvents.NULL_USER_ID_FROM_JWT_TOKEN,
        'unknown',
        'Missing user ID',
      );
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
  private logError(
    event: string,
    userId: string,
    message: string,
    error?: unknown,
  ): void {
    console.error(
      `[${event}] User: ${userId}, Message: ${message}`,
      error || '',
    );
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

  /**
   * Log success events (simplified version of PostHog logging)
   * TODO: Consider integrating with a proper logging service like PostHog
   */
  private logSuccess(
    event: string,
    userId: string,
    message: string,
    properties?: Record<string, unknown>,
  ): void {
    console.log(
      `[${event}] User: ${userId}, Message: ${message}`,
      properties || '',
    );
    // TODO: Add PostHog or other analytics integration here
    // posthog.capture({
    //   distinctId: userId,
    //   event: event,
    //   properties: {
    //     source: LoggingEventSource.API_PAYMENTS_CHECKOUT,
    //     message: message,
    //     ...properties,
    //   },
    // });
  }
}
