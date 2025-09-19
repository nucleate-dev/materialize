import Stripe from 'stripe';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase.js';

export interface UsageTrackingResult {
  updatedMessageCount: number;
}

/**
 * Records API usage in Supabase and sends usage data to Stripe for Pro users
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
): Promise<UsageTrackingResult> {
  // ------------------------------------------------------------------------------------------------
  // 1. Track API usage in Supabase
  // ------------------------------------------------------------------------------------------------
  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

  await supabase.from('api_usage').insert({
    user_id: userId,
    prototype_id: prototypeId || null,
  });

  // ------------------------------------------------------------------------------------------------
  // 2. Get updated message count for the current billing period
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

  // ------------------------------------------------------------------------------------------------
  // 3. Send usage data to Stripe for Pro users
  // ------------------------------------------------------------------------------------------------
  if (userTier === 'pro' && stripeCustomerId) {
    try {
      await stripe.billing.meterEvents.create({
        event_name: 'materialize_assistant_messages',
        payload: {
          stripe_customer_id: stripeCustomerId,
          value: '1',
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
  };
}