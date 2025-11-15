import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.js';
import { SystemLogger } from '../loggers/SystemLogger.js';

/**
 * Result of recording credit usage with FIFO consumption
 */
export interface RecordCreditUsageResult {
  success: boolean;
  creditsUsed: number;
  totalRemainingCredits: number;
  error?: string;
}

/**
 * Internal interface for credit grant with remaining balance
 */
interface CreditGrantBalance {
  id: string;
  creditsGranted: number;
  creditsRemaining: number;
  expires_at: string;
}

async function fetchGrantBalances(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  log2: SystemLogger,
): Promise<{ grants: CreditGrantBalance[]; totalAvailable: number }> {
  const nowIso = new Date().toISOString();
  const { data: grants, error: grantsError } = await supabaseClient
    .from('credit_grants')
    .select('id, credits_granted, expires_at')
    .eq('user_id', userId)
    .gt('expires_at', nowIso)
    .order('expires_at', { ascending: true });

  if (grantsError) {
    throw grantsError;
  }

  if (!grants || grants.length === 0) {
    return { grants: [], totalAvailable: 0 };
  }

  const grantIds = grants.map(grant => grant.id);
  const usageMap = new Map<string, number>();

  if (grantIds.length > 0) {
    const { data: usageRows, error: usageError } = await supabaseClient
      .from('api_usage')
      .select('credit_grant_id, credits_used')
      .eq('user_id', userId)
      .in('credit_grant_id', grantIds);

    if (usageError) {
      throw usageError;
    }

    usageRows?.forEach(row => {
      if (!row.credit_grant_id) return;
      const current = usageMap.get(row.credit_grant_id) || 0;
      usageMap.set(row.credit_grant_id, current + row.credits_used);
    });
  }

  const grantsWithBalances: CreditGrantBalance[] = grants
    .map(grant => {
      const used = usageMap.get(grant.id) || 0;
      const remaining = Math.max(0, grant.credits_granted - used);
      return {
        id: grant.id,
        creditsGranted: grant.credits_granted,
        creditsRemaining: remaining,
        expires_at: grant.expires_at,
      };
    })
    .filter(grant => grant.creditsRemaining > 0);

  const totalAvailable = grantsWithBalances.reduce(
    (sum, grant) => sum + grant.creditsRemaining,
    0,
  );

  return { grants: grantsWithBalances, totalAvailable };
}

/**
 * Consumes credits using FIFO logic (First In, First Out / earliest expiring first)
 *
 * This function:
 * 1. Finds all unexpired credit grants ordered by expires_at ASC
 * 2. Aggregates api_usage rows to compute remaining balance for each grant
 * 3. Consumes from each grant until the requested credits are satisfied
 * 4. Creates multiple api_usage records (one per grant chunk) when needed
 * 5. Links each api_usage record to the specific credit_grant_id
 *
 * @param jwtToken - JWT token for authentication
 * @param userId - The user ID consuming credits
 * @param creditsUsed - The number of credits to consume (supports decimal values like 1.2)
 * @param prototypeId - Optional prototype ID if the usage is associated with a prototype
 * @param log2 - Logger instance
 * @returns Promise<RecordCreditUsageResult> - Result with success status and remaining credits
 */
export async function recordCreditUsage(
  jwtToken: string,
  userId: string,
  creditsUsed: number,
  prototypeId: string | null,
  log2: SystemLogger,
): Promise<RecordCreditUsageResult> {
  // Use service role for credit consumption to bypass RLS and ensure atomicity
  const supabaseClient = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const { grants, totalAvailable } = await fetchGrantBalances(
      supabaseClient,
      userId,
      log2,
    );

    if (grants.length === 0) {
      log2.error('No available credit grants found for user', {
        functionName: 'recordCreditUsage',
        userId,
        creditsUsed,
      });
      return {
        success: false,
        creditsUsed,
        totalRemainingCredits: 0,
        error: 'No available credits',
      };
    }

    let creditsRemaining = creditsUsed;
    const consumedGrants: Array<{ grantId: string; creditsConsumed: number }> = [];

    for (const grant of grants) {
      if (creditsRemaining <= 0) break;

      const creditsToConsume = Math.min(creditsRemaining, grant.creditsRemaining);
      consumedGrants.push({
        grantId: grant.id,
        creditsConsumed: creditsToConsume,
      });

      creditsRemaining -= creditsToConsume;
    }

    // Check if we have enough credits
    if (creditsRemaining > 0) {
      log2.error('Insufficient credits available', {
        functionName: 'recordCreditUsage',
        userId,
        creditsRequested: creditsUsed,
        creditsAvailable: totalAvailable,
      });
      return {
        success: false,
        creditsUsed,
        totalRemainingCredits: totalAvailable,
        error: `Insufficient credits: need ${creditsUsed}, have ${totalAvailable}`,
      };
    }

    // Insert api_usage records and update credit_grants atomically
    for (const { grantId, creditsConsumed } of consumedGrants) {
      // Insert usage record linked to the grant
      const { error: insertError } = await supabaseClient
        .from('api_usage')
        .insert({
          user_id: userId,
          prototype_id: prototypeId,
          credits_used: creditsConsumed,
          credit_grant_id: grantId,
        });

      if (insertError) {
        log2.error(insertError, 'Error inserting api_usage record:', {
          functionName: 'recordCreditUsage',
          userId,
          grantId,
          creditsConsumed,
        });
        return {
          success: false,
          creditsUsed,
          totalRemainingCredits: 0,
          error: insertError.message,
        };
      }

    }

    const totalRemainingCredits = Math.max(0, totalAvailable - creditsUsed);

    return {
      success: true,
      creditsUsed,
      totalRemainingCredits,
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
