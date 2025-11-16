import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.js';
import { SystemLogger } from '../loggers/SystemLogger.js';

type ConsumeCreditsResponse =
  Database['public']['Functions']['consume_credits']['Returns'];

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
): Promise<ConsumeCreditsResponse | null> {
  const { data, error } = await supabaseClient.rpc('consume_credits', {
    p_user_id: userId,
    p_prototype_id: prototypeId,
    p_credits: creditsUsed,
  });

  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
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
    const rpcResult = await callConsumeCredits(
      supabaseClient,
      userId,
      prototypeId,
      creditsUsed,
    );

    if (!rpcResult) {
      log2.error('consume_credits returned no data', {
        functionName: 'recordCreditUsage',
        userId,
      });
      return {
        success: false,
        creditsUsed,
        totalRemainingCredits: 0,
        error: 'Unable to record credit usage',
      };
    }

    if (!rpcResult.success) {
      log2.error(rpcResult.error ?? 'Unknown error from consume_credits', {
        functionName: 'recordCreditUsage',
        userId,
        creditsRequested: creditsUsed,
      });
      return {
        success: false,
        creditsUsed,
        totalRemainingCredits: rpcResult.total_remaining ?? 0,
        error: rpcResult.error ?? 'Credit consumption failed',
      };
    }

    return {
      success: true,
      creditsUsed,
      totalRemainingCredits: rpcResult.total_remaining ?? 0,
    };
  } catch (error) {
    log2.error(error, 'Exception in recordCreditUsage:', {
      functionName: 'recordCreditUsage',
      userId,
      creditsUsed,
    });
    return {
      success: false,
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
  return recordCreditUsage(
    jwtToken,
    userId,
    1.0,
    prototypeId,
    log2,
  );
}
