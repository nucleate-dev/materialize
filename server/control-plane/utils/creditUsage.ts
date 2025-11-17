import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.js';
import { SystemLogger } from '../loggers/SystemLogger.js';
import {
  CreditLimits,
  ProductKeys,
} from '../types/PublicAPITypes.js';
import { getSubscriptionInfo } from './subscriptionChecks.js';

type ConsumeCreditsResponse =
  Database['public']['Functions']['consume_credits']['Returns'];

type ConsumeCreditsItem = ConsumeCreditsResponse[number];

const FREE_TIER_CREDITS = 15;

function getCurrentMonthPeriod(): { startOfMonth: Date; endOfMonth: Date } {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { startOfMonth, endOfMonth };
}

/**
 * Result of recording credit usage with FIFO consumption
 */
export interface RecordCreditUsageResult {
  success: boolean;
  creditsUsed: number;
  totalRemainingCredits: number;
  error?: string;
}

async function callConsumeCredits(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  prototypeId: string | null,
  creditsUsed: number,
): Promise<ConsumeCreditsItem | null> {
  const { data, error } = await supabaseClient.rpc('consume_credits', {
    p_user_id: userId,
    p_prototype_id: prototypeId ?? '',
    p_credits: creditsUsed,
  });

  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
}

async function recordFreeTierUsage(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  prototypeId: string | null,
  creditsUsed: number,
  log2: SystemLogger,
): Promise<RecordCreditUsageResult> {
  const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
  const periodStart = startOfMonth.toISOString();
  const periodEnd = endOfMonth.toISOString();

  const { error: insertError } = await supabaseClient.from('api_usage').insert({
    user_id: userId,
    prototype_id: prototypeId,
    credits_used: creditsUsed,
    credit_grant_id: null,
    is_free_tier: true,
  });

  if (insertError) {
    log2.error(insertError, 'Failed to insert free-tier usage row', {
      functionName: 'recordFreeTierUsage',
      userId,
    });
    return {
      success: false,
      creditsUsed,
      totalRemainingCredits: 0,
      error: insertError.message,
    };
  }

  const { data: usageRows, error: usageError } = await supabaseClient
    .from('api_usage')
    .select('credits_used')
    .eq('user_id', userId)
    .eq('is_free_tier', true)
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd);

  if (usageError) {
    log2.error(usageError, 'Failed to fetch free-tier usage summary', {
      functionName: 'recordFreeTierUsage',
      userId,
    });
    return {
      success: true,
      creditsUsed,
      totalRemainingCredits: 0,
      error: usageError.message,
    };
  }

  const totalUsed =
    usageRows?.reduce((sum, row) => sum + (row.credits_used || 0), 0) ?? 0;
  const totalRemaining = Math.max(FREE_TIER_CREDITS - totalUsed, 0);

  return {
    success: true,
    creditsUsed,
    totalRemainingCredits: totalRemaining,
  };
}

/**
 * Consumes credits via the transactional consume_credits RPC
 */
export async function recordCreditUsage(
  jwtToken: string,
  userId: string,
  creditsUsed: number,
  prototypeId: string | null,
  log2: SystemLogger,
): Promise<RecordCreditUsageResult> {
  const supabaseClient = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const subscriptionInfo = await getSubscriptionInfo(jwtToken, userId, log2);
    if (subscriptionInfo.userPlan === ProductKeys.FREE_SUBSCRIPTION) {
      return recordFreeTierUsage(
        supabaseClient,
        userId,
        prototypeId,
        creditsUsed,
        log2,
      );
    }

    const rpcResult = await callConsumeCredits(
      supabaseClient,
      userId,
      prototypeId,
      creditsUsed,
    );

    if (!rpcResult || !rpcResult.success) {
      log2.error(
        new Error(rpcResult?.error ?? 'consume_credits RPC returned failure'),
        'consume_credits RPC returned failure',
        {
          functionName: 'recordCreditUsage',
          userId,
          creditsRequested: creditsUsed,
        },
      );
      const { error: insertError } = await supabaseClient
        .from('api_usage')
        .insert({
          user_id: userId,
          prototype_id: prototypeId,
          credits_used: creditsUsed,
          credit_grant_id: null,
          is_free_tier: false,
        });

      if (insertError) {
        log2.error(insertError, 'Fallback api_usage insert failed', {
          functionName: 'recordCreditUsage',
          userId,
        });
        return {
          success: false,
          creditsUsed,
          totalRemainingCredits: 0,
          error: insertError.message,
        };
      }

      return {
        success: true,
        creditsUsed,
        totalRemainingCredits: 0,
        error: rpcResult?.error,
      };
    }

    return {
      success: true,
      creditsUsed,
      totalRemainingCredits: rpcResult.total_remaining ?? 0,
      error: rpcResult.error ?? undefined,
    };
  } catch (error) {
    log2.error(error, 'Exception in recordCreditUsage:', {
      functionName: 'recordCreditUsage',
      userId,
      creditsUsed,
    });
    const insertFallback = await supabaseClient.from('api_usage').insert({
      user_id: userId,
      prototype_id: prototypeId,
      credits_used: creditsUsed,
      credit_grant_id: null,
      is_free_tier: false,
    });

    if (insertFallback.error) {
      log2.error(insertFallback.error, 'Fallback api_usage insert failed', {
        functionName: 'recordCreditUsage',
        userId,
      });
      return {
        success: false,
        creditsUsed,
        totalRemainingCredits: 0,
        error:
          insertFallback.error?.message ??
          (error instanceof Error ? error.message : 'Unknown error'),
      };
    }

    return {
      success: true,
      creditsUsed,
      totalRemainingCredits: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Convenience function to record a single credit usage (1.0 credits)
 */
export async function recordSingleCreditUsage(
  jwtToken: string,
  userId: string,
  prototypeId: string | null,
  log2: SystemLogger,
): Promise<RecordCreditUsageResult> {
  return recordCreditUsage(jwtToken, userId, 1.0, prototypeId, log2);
}
