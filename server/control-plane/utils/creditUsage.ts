import { createClient } from '@supabase/supabase-js';
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
interface CreditGrant {
  id: string;
  credits_remaining: number;
  expires_at: string;
}

/**
 * Consumes credits using FIFO logic (First In, First Out / earliest expiring first)
 *
 * This function:
 * 1. Finds all credit grants with credits_remaining > 0, ordered by expires_at ASC
 * 2. Consumes from each grant until the requested credits are satisfied
 * 3. If one grant doesn't have enough, creates multiple api_usage records (one per grant)
 * 4. Updates credits_remaining on each consumed grant atomically
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
    let creditsRemaining = creditsUsed;
    const consumedGrants: Array<{ grantId: string; creditsConsumed: number }> = [];

    // Find all available credit grants ordered by expiration (FIFO)
    const { data: grants, error: grantsError } = await supabaseClient
      .from('credit_grants')
      .select('id, credits_remaining, expires_at')
      .eq('user_id', userId)
      .gt('credits_remaining', 0)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true });

    if (grantsError) {
      log2.error(grantsError, 'Error fetching credit grants:', {
        functionName: 'recordCreditUsage',
        userId,
        creditsUsed,
      });
      return {
        success: false,
        creditsUsed,
        totalRemainingCredits: 0,
        error: grantsError.message,
      };
    }

    if (!grants || grants.length === 0) {
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

    // Consume credits from grants using FIFO order
    for (const grant of grants) {
      if (creditsRemaining <= 0) break;

      const creditsToConsume = Math.min(creditsRemaining, grant.credits_remaining);
      consumedGrants.push({
        grantId: grant.id,
        creditsConsumed: creditsToConsume,
      });

      creditsRemaining -= creditsToConsume;
    }

    // Check if we have enough credits
    if (creditsRemaining > 0) {
      const totalAvailable = grants.reduce((sum, g) => sum + g.credits_remaining, 0);
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

      // Update credits_remaining on the grant
      const grant = grants.find(g => g.id === grantId);
      if (!grant) continue;

      const newCreditsRemaining = grant.credits_remaining - creditsConsumed;

      const { error: updateError } = await supabaseClient
        .from('credit_grants')
        .update({ credits_remaining: newCreditsRemaining })
        .eq('id', grantId);

      if (updateError) {
        log2.error(updateError, 'Error updating credit_grant:', {
          functionName: 'recordCreditUsage',
          userId,
          grantId,
          newCreditsRemaining,
        });
        return {
          success: false,
          creditsUsed,
          totalRemainingCredits: 0,
          error: updateError.message,
        };
      }
    }

    // Calculate total remaining credits across all grants
    const { data: allGrants, error: allGrantsError } = await supabaseClient
      .from('credit_grants')
      .select('credits_remaining')
      .eq('user_id', userId)
      .gt('credits_remaining', 0)
      .gt('expires_at', new Date().toISOString());

    const totalRemainingCredits = allGrants?.reduce(
      (sum, g) => sum + g.credits_remaining,
      0,
    ) || 0;

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
