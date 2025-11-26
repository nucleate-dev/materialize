import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

/**
 * API Route to fetch Stripe Checkout Session details
 * Used by the success page to get purchase information for Meta Pixel tracking
 *
 * GET /api/checkout/session?session_id=xxx
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'Missing session_id parameter' },
      { status: 400 }
    );
  }

  try {
    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'line_items.data.price.product'],
    });

    // Extract relevant information for Meta Pixel tracking
    const lineItem = session.line_items?.data[0];
    const product = lineItem?.price?.product;
    const productName = typeof product === 'object' && 'name' in product ? product.name : 'Subscription';

    return NextResponse.json({
      amount_total: session.amount_total,
      currency: session.currency,
      content_name: productName,
      session_id: session.id,
    });
  } catch (error) {
    console.error('Error fetching checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session details' },
      { status: 500 }
    );
  }
}
