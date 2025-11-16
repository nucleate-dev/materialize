import { SystemLogger } from '../../../loggers/SystemLogger.js';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/supabase.js';

export interface UsageTrackingResult {
  totalRemainingCredits: number;
  grantBalances?: unknown;
}

/**
 * Records API usage in Supabase with FIFO credit consumption
 * @param creditsUsed - The number of credits consumed by this operation (default 1.0)
 */
export async function trackChatUsage(
  userId: string,
  prototypeId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  log2: SystemLogger,
  creditsUsed: number = 1.0,
): Promise<UsageTrackingResult> {
  log2 = log2.child({
    function: 'trackChatUsage',
  });

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

  const insertFallbackUsage = async () => {
    const { error: insertError } = await supabase.from('api_usage').insert({
      user_id: userId,
      prototype_id: prototypeId || null,
      credits_used: creditsUsed,
      credit_grant_id: null,
    });

    if (insertError) {
      log2.error(insertError, 'Fallback api_usage insert failed', {
        functionName: 'trackChatUsage',
        userId,
      });
    }
  };

  try {
    const { data, error: rpcError } = await supabase.rpc('consume_credits', {
      p_user_id: userId,
      p_prototype_id: prototypeId,
      p_credits: creditsUsed,
    });

    if (rpcError) {
      log2.error(rpcError, 'consume_credits RPC failed', {
        functionName: 'trackChatUsage',
        userId,
      });
      await insertFallbackUsage();
      return {
        totalRemainingCredits: 0,
      };
    }

    const payload = data?.[0];

    if (!payload || !payload.success) {
      log2.error(payload?.error ?? 'consume_credits returned failure', {
        functionName: 'trackChatUsage',
        userId,
      });
      await insertFallbackUsage();
      return {
        totalRemainingCredits: 0,
      };
    }

    return {
      totalRemainingCredits: payload.total_remaining ?? 0,
      grantBalances: payload.grant_balances ?? null,
    };
  } catch (error) {
    log2.error(error, 'Exception in trackChatUsage:', {
      functionName: 'trackChatUsage',
      userId,
    });
    await insertFallbackUsage();
    return {
      totalRemainingCredits: 0,
    };
  }
}
