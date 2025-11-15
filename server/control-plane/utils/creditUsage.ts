import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.js';
import { SystemLogger } from '../loggers/SystemLogger.js';

/**
 * Result of recording credit usage
 */
export interface RecordCreditUsageResult {
  success: boolean;
  creditsUsed: number;
  totalCreditsUsedInPeriod: number;
  error?: string;
}

/**
 * Generic utility to record credit usage in the database
 * This can be called from anywhere in the application when credits are consumed
 *
 * @param jwtToken - JWT token for authentication
 * @param userId - The user ID consuming credits
 * @param creditsUsed - The number of credits consumed (supports decimal values like 1.2)
 * @param prototypeId - Optional prototype ID if the usage is associated with a prototype
 * @param currentPeriodStart - Start of the billing period (for calculating total usage)
 * @param currentPeriodEnd - End of the billing period (for calculating total usage)
 * @param log2 - Logger instance
 * @returns Promise<RecordCreditUsageResult> - Result with success status and usage info
 */
export async function recordCreditUsage(
  jwtToken: string,
  userId: string,
  creditsUsed: number,
  prototypeId: string | null,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  log2: SystemLogger,
): Promise<RecordCreditUsageResult> {
  const supabaseClient = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      },
    },
  );

  try {
    // Insert the usage record
    const { error: insertError } = await supabaseClient
      .from('api_usage')
      .insert({
        user_id: userId,
        prototype_id: prototypeId,
        credits_used: creditsUsed,
      });

    if (insertError) {
      log2.error(insertError, 'Error recording credit usage in supabase:', {
        functionName: 'recordCreditUsage',
        userId,
        creditsUsed,
      });
      return {
        success: false,
        creditsUsed,
        totalCreditsUsedInPeriod: 0,
        error: insertError.message,
      };
    }

    // Get total credits used in the current period
    const periodStart = currentPeriodStart.toISOString();
    const periodEnd = currentPeriodEnd.toISOString();

    const { data, error: fetchError } = await supabaseClient
      .from('api_usage')
      .select('credits_used')
      .eq('user_id', userId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (fetchError) {
      log2.error(fetchError, 'Error fetching total credits used:', {
        functionName: 'recordCreditUsage',
        userId,
      });
      // Still return success since we did record the usage
      return {
        success: true,
        creditsUsed,
        totalCreditsUsedInPeriod: 0,
        error: 'Failed to fetch total usage',
      };
    }

    const totalCreditsUsedInPeriod = data?.reduce(
      (sum, row) => sum + row.credits_used,
      0,
    ) || 0;

    return {
      success: true,
      creditsUsed,
      totalCreditsUsedInPeriod,
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
      totalCreditsUsedInPeriod: 0,
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
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  log2: SystemLogger,
): Promise<RecordCreditUsageResult> {
  return recordCreditUsage(
    jwtToken,
    userId,
    1.0,
    prototypeId,
    currentPeriodStart,
    currentPeriodEnd,
    log2,
  );
}
