import Stripe from 'stripe';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/supabase.js';

export interface UsageTrackingResult {
  updatedMessageCount: number;
  totalCreditsUsed: number;
}

/**
 * Records API usage in Supabase and sends usage data to Stripe for Pro users
 * @param creditsUsed - The number of credits consumed by this operation (default 1.0)
 */
export async function trackChatUsage(
  stripe: Stripe,
  userId: string,
  prototypeId: string,
  userTier: string,
  stripeCustomerId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  supabaseUrl: string,
  supabaseServiceKey: string,
  log2: SystemLogger,
  creditsUsed: number = 1.0,
): Promise<UsageTrackingResult> {
  log2 = log2.child({
    function: 'trackChatUsage',
  });
  // ------------------------------------------------------------------------------------------------
  // 1. Track API usage in Supabase with credits
  // ------------------------------------------------------------------------------------------------
  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

  await supabase.from('api_usage').insert({
    user_id: userId,
    prototype_id: prototypeId || null,
    credits_used: creditsUsed,
  });

  // ------------------------------------------------------------------------------------------------
  // 2. Get updated message count and total credits used for the current billing period
  // ------------------------------------------------------------------------------------------------
  const periodStart = currentPeriodStart.toISOString();
  const periodEnd = currentPeriodEnd.toISOString();

  const { count: newCount, error: countError } = await supabase
    .from('api_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd);

  if (countError) {
    log2.consoleLogDevOnly(
      'error',
      '[trackChatUsage] Error fetching updated message count:',
      { countError },
    );
  }

  const updatedMessageCount = newCount || 0;

  // Get total credits used in this period
  const { data: creditsData, error: creditsError } = await supabase
    .from('api_usage')
    .select('credits_used')
    .eq('user_id', userId)
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd);

  if (creditsError) {
    log2.consoleLogDevOnly(
      'error',
      '[trackChatUsage] Error fetching credits used:',
      { creditsError },
    );
  }

  const totalCreditsUsed = creditsData?.reduce(
    (sum, row) => sum + row.credits_used,
    0,
  ) || 0;

  // ------------------------------------------------------------------------------------------------
  // 3. Send usage data to Stripe for Pro users
  // ------------------------------------------------------------------------------------------------
  if (userTier === 'pro' && stripeCustomerId) {
    try {
      await stripe.billing.meterEvents.create({
        event_name: 'materialize_assistant_messages',
        payload: {
          stripe_customer_id: stripeCustomerId,
          value: creditsUsed.toString(),
        },
      });
    } catch (stripeError) {
      log2.error(
        stripeError,
        '[trackChatUsage] Error sending Stripe meter event:',
        {
          userId,
          stripeCustomerId,
        },
      );
    }
  }

  return {
    updatedMessageCount,
    totalCreditsUsed,
  };
}
