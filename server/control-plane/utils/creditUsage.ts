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

    if (!rpcResult || !rpcResult.success) {
      log2.error(rpcResult?.error ?? 'consume_credits RPC returned failure', {
        functionName: 'recordCreditUsage',
        userId,
        creditsRequested: creditsUsed,
      });
      const { error: insertError } = await supabaseClient.from('api_usage').insert({
        user_id: userId,
        prototype_id: prototypeId,
        credits_used: creditsUsed,
        credit_grant_id: null,
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
    const insertFallback = await supabaseClient
      .from('api_usage')
      .insert({
        user_id: userId,
        prototype_id: prototypeId,
        credits_used: creditsUsed,
        credit_grant_id: null,
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
  return recordCreditUsage(
    jwtToken,
    userId,
    1.0,
    prototypeId,
    log2,
  );
}
