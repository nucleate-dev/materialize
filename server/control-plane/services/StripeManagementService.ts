import Stripe from 'stripe';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  type APIResponse,
  type CheckoutErrorResponse,
  type CheckoutRequestBody,
  type CheckoutSuccessResponse,
  type GetCheckoutSessionErrorResponse,
  type GetCheckoutSessionSuccessResponse,
  HTTP_STATUS,
  type ManageBillingErrorResponse,
  type ManageBillingRequestBody,
  type ManageBillingSuccessResponse,
} from '../types/PublicAPITypes.js';
import { validateJWTToken } from '../utils/prototypeAuth.js';
import { getSubscriptionInfo } from '../utils/subscriptionChecks.js';
import { userIsTeamAdminOrOwner } from '../utils/teamUtils.js';
import { PostHogEvents } from '../loggers/PostHogEvents.js';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase.js';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export class StripeManagementService {
  constructor() {}

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
            required: ['productID', 'teamId'],
            properties: {
              productID: {
                type: 'string',
                enum: [
                  'free',
                  'plus',
                  'pro',
                  'max',
                  'team',
                  'credit_pack_100',
                  'credit_pack_500',
                  'credit_pack_1000',
                ],
              },
              seatQuantity: {
                type: 'integer',
                minimum: 1,
                nullable: true,
              },
            },
          },
        },
      },
      this.handleCheckout.bind(this),
    );

    // GET /payments/checkout/session
    app.get<{ Querystring: { session_id: string } }>(
      '/payments/checkout/session',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['session_id'],
            properties: {
              session_id: {
                type: 'string',
              },
            },
          },
        },
      },
      this.handleGetCheckoutSession.bind(this),
    );

    // POST /payments/manage-billing
    app.post<{ Body: ManageBillingRequestBody }>(
      '/payments/manage-billing',
      {
        schema: {
          body: {
            type: 'object',
            required: ['teamId'],
            properties: {
              teamId: { type: 'string' },
            },
          },
        },
      },
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
  ): Promise<APIResponse<CheckoutSuccessResponse, CheckoutErrorResponse>> {
    // Extract JWT token from Authorization header and validate it
    const token = request.headers.authorization?.split(' ')[1] ?? '';
    const { user } = await validateJWTToken(token, request.log2);
    if (!user) {
      request.log2.warn('Unauthorized user');
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          id: null,
          error: 'Unauthorized',
          message: 'Invalid token',
        },
      });
    }
    // update logger context
    request.log2 = request.log2.child({
      userId: user.id,
    });

    const { productID, teamId, seatQuantity } = request.body;

    const supabaseClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    );

    const hasTeamAccess = await userIsTeamAdminOrOwner(
      teamId,
      user.id,
      supabaseClient,
      request.log2,
    );
    if (!hasTeamAccess) {
      request.log2.warn('User is not owner/admin of requested team', {
        teamId,
      });
      return reply.status(HTTP_STATUS.FORBIDDEN).send({
        data: null,
        error: {
          id: null,
          error: 'Forbidden',
          message: 'You do not have permission to manage billing for this team',
        },
      });
    }

    // Setup PostHog logger with context
    const posthogLogger = request.posthogLogger.child({
      function: 'handleCheckout',
      service: 'StripeManagementService',
      productID,
      teamId,
    });

    // Handle free tier - no Stripe checkout needed
    if (productID === 'free') {
      request.log2.warn('Free tier selected - no Stripe checkout needed');
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        data: null,
        error: {
          id: null,
          error: 'Invalid product selection',
          message: 'Free tier does not require checkout',
        },
      });
    }

    // Check if user has an existing subscription
    const subscriptionInfo = await getSubscriptionInfo(
      token,
      user.id,
      request.log2,
      teamId,
    );

    // Determine price ID based on product
    let priceID: string;
    let mode: 'subscription' | 'payment' = 'subscription';

    if (productID === 'plus') {
      priceID = process.env.STRIPE_PLUS_PRICE_ID as string;
    } else if (productID === 'pro') {
      priceID = process.env.STRIPE_PRO_PRICE_ID as string;
    } else if (productID === 'max') {
      priceID = process.env.STRIPE_MAX_PRICE_ID as string;
    } else if (productID === 'team') {
      priceID = process.env.STRIPE_TEAM_PRICE_ID as string;
    } else if (productID === 'credit_pack_100') {
      priceID = process.env.STRIPE_CREDIT_PACK_100_PRICE_ID as string;
      mode = 'payment';
    } else if (productID === 'credit_pack_500') {
      priceID = process.env.STRIPE_CREDIT_PACK_500_PRICE_ID as string;
      mode = 'payment';
    } else if (productID === 'credit_pack_1000') {
      priceID = process.env.STRIPE_CREDIT_PACK_1000_PRICE_ID as string;
      mode = 'payment';
    } else {
      throw new Error('Invalid product ID');
    }

    // If user has an existing subscription and is trying to purchase a subscription product,
    // redirect them to the billing portal instead of creating a new checkout session
    if (subscriptionInfo.stripeCustomerId && mode === 'subscription') {
      request.log2.info(
        'User has existing subscription, redirecting to billing portal',
        {
          stripeCustomerId: subscriptionInfo.stripeCustomerId,
          currentPlan: subscriptionInfo.userPlan,
          requestedProduct: productID,
        },
      );

      try {
        // Create Stripe billing portal session
        const session = await stripe.billingPortal.sessions.create({
          customer: subscriptionInfo.stripeCustomerId,
          return_url: `${process.env.SITE_BASE_URL}/dashboard/account`,
        });

        // Return the billing portal URL in the same format as checkout session
        // This allows the frontend to handle both cases uniformly
        return reply.status(HTTP_STATUS.OK).send({
          data: {
            id: session.id,
            url: session.url,
          },
          error: null,
        });
      } catch (error) {
        request.log2.error(
          error,
          'Failed to create billing portal session, falling back to checkout',
        );
        // Fall through to create checkout session if billing portal fails
      }
    }

    // Check for any existing Stripe customer ID (including from canceled subscriptions)
    // to reuse it when creating the checkout session
    let existingStripeCustomerId: string | null = null;
    try {
      const { data: previousSubscriptions } = await supabaseClient
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('team_id', teamId)
        .not('stripe_customer_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (previousSubscriptions && previousSubscriptions.length > 0) {
        existingStripeCustomerId = previousSubscriptions[0].stripe_customer_id;
        request.log2.info(
          'Found existing Stripe customer ID from previous subscription',
          {
            stripeCustomerId: existingStripeCustomerId,
          },
        );
      }
    } catch (error) {
      request.log2.warn('Failed to check for existing Stripe customer ID', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue without customer ID - Stripe will create a new one
    }

    try {
      const result = await posthogLogger.timeAndRecord(
        user.id,
        PostHogEvents.server_stripe_checkout_session_creation,
        async () => {
          const normalizedSeatQuantity =
            productID === 'team' ? Math.max(1, seatQuantity ?? 1) : 1;

          const sessionMetadata: Stripe.MetadataParam = {
            user_id: user.id,
            team_id: teamId,
            ...(productID === 'team'
              ? { seat_quantity: normalizedSeatQuantity.toString() }
              : {}),
          };

          const sessionConfig: Stripe.Checkout.SessionCreateParams = {
            payment_method_types: ['card', 'us_bank_account'],
            line_items: [
              {
                price: priceID,
                quantity: normalizedSeatQuantity,
              },
            ],
            mode,
            success_url: `${process.env.SITE_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.SITE_BASE_URL}/dashboard/account`,
            allow_promotion_codes: true,
            metadata: sessionMetadata,
          };

          if (mode === 'subscription') {
            sessionConfig.subscription_data = {
              metadata: sessionMetadata,
            };
          }

          // If we found an existing Stripe customer ID, reuse it to prevent duplicates
          if (existingStripeCustomerId) {
            sessionConfig.customer = existingStripeCustomerId;
          }

          const session = await stripe.checkout.sessions.create(sessionConfig);
          return session;
        },
      );

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          id: result.id,
        },
        error: null,
      });
    } catch (error) {
      request.log2.error(error, 'Exception creating checkout session');
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        data: null,
        error: {
          id: null,
          error: 'Checkout session creation failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  /**
   * API Route Handler for fetching Stripe Checkout Session details.
   *
   * This function handles HTTP GET requests to retrieve Stripe Checkout session details
   * based on the session ID. It's used by the success page to get purchase information
   * for Meta Pixel tracking and other analytics purposes.
   *
   * @param {FastifyRequest} request - The incoming request object with session_id query parameter
   * @param {FastifyReply} reply - The outgoing response object
   *
   * @returns APIResponse with session details including amount, currency, and product name
   *
   * Flow:
   *  1. Extract session_id from query parameters
   *  2. Retrieve the checkout session from Stripe with expanded line items
   *  3. Extract product information from the session
   *  4. Return formatted session details
   */
  private async handleGetCheckoutSession(
    request: FastifyRequest<{ Querystring: { session_id: string } }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<
      GetCheckoutSessionSuccessResponse,
      GetCheckoutSessionErrorResponse
    >
  > {
    const { session_id } = request.query;

    if (!session_id) {
      request.log2.warn('Missing session_id parameter');
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        data: null,
        error: {
          error: 'Missing parameter',
          message: 'Missing session_id parameter',
        },
      });
    }

    try {
      // Retrieve the checkout session from Stripe
      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ['line_items', 'line_items.data.price.product'],
      });

      // Extract relevant information for Meta Pixel tracking
      const lineItem = session.line_items?.data[0];
      const product = lineItem?.price?.product;
      const productName =
        typeof product === 'object' && 'name' in product
          ? product.name
          : 'Subscription';

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          amount_total: session.amount_total,
          currency: session.currency,
          content_name: productName,
          session_id: session.id,
        },
        error: null,
      });
    } catch (error) {
      request.log2.error(error, 'Failed to fetch checkout session');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'Session fetch failed',
          message:
            error instanceof Error ? error.message : 'Failed to fetch session',
        },
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
  ): Promise<
    APIResponse<ManageBillingSuccessResponse, ManageBillingErrorResponse>
  > {
    // Extract JWT token from Authorization header
    const token = request.headers.authorization?.split(' ')[1] ?? '';
    const { user } = await validateJWTToken(token, request.log2);
    if (!user) {
      request.log2.warn('Unauthorized user');
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'Unauthorized',
          message: 'Invalid token',
        },
      });
    }
    // update logger context
    request.log2 = request.log2.child({
      userId: user.id,
    });

    const { teamId } = request.body;

    const supabaseClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    );

    const hasTeamAccess = await userIsTeamAdminOrOwner(
      teamId,
      user.id,
      supabaseClient,
      request.log2,
    );
    if (!hasTeamAccess) {
      request.log2.warn('User is not owner/admin of requested team', {
        teamId,
      });
      return reply.status(HTTP_STATUS.FORBIDDEN).send({
        data: null,
        error: {
          error: 'Forbidden',
          message: 'You do not have permission to manage billing for this team',
        },
      });
    }

    // Setup PostHog logger with context
    const posthogLogger = request.posthogLogger.child({
      function: 'handleManageBilling',
      service: 'StripeManagementService',
      teamId,
    });

    const subscriptionInfo = await getSubscriptionInfo(
      token,
      user.id,
      request.log2,
      teamId,
    );

    if (!subscriptionInfo.stripeCustomerId) {
      request.log2.warn('No Stripe customer found for team', { teamId });
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        data: null,
        error: {
          error: 'no_subscription',
          message:
            'This team does not have an active subscription to manage billing.',
        },
      });
    }

    try {
      const result = await posthogLogger.timeAndRecord(
        user.id,
        PostHogEvents.server_stripe_billing_portal_session_creation,
        async () => {
          // Create Stripe billing portal session
          const session = await stripe.billingPortal.sessions.create({
            customer: subscriptionInfo.stripeCustomerId,
            return_url: `${process.env.SITE_BASE_URL}/dashboard/account`,
          });
          return session;
        },
      );

      return reply.status(HTTP_STATUS.OK).send({
        data: {
          redirect_url: result.url,
        },
        error: null,
      });
    } catch (error) {
      request.log2.error(
        error,
        '[handleManageBilling] Could not create stripe billing portal session:',
      );
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        data: null,
        error: {
          error: 'Internal Server Error',
          message: 'Could not create stripe billing portal session',
        },
      });
    }
  }
}
