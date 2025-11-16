import { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import type { Database } from "../../types/supabase.js";

export interface UsageTrackingResult {
  totalRemainingCredits: number;
  grantBalances?: unknown;
}

/**
 * Records API usage in Supabase with FIFO credit consumption
 * @param creditsUsed - The number of credits consumed by this operation (default 1.0)
 */
export async function trackApiUsageBuildWorker(
  supabase: SupabaseClient<Database>,
  userId: string,
  prototypeId: string,
  log2: SystemLogger,
  creditsUsed: number = 1.0,
): Promise<UsageTrackingResult> {
  log2 = log2.child({
    function: "trackCodeUsage",
  });

  const insertFallbackUsage = async () => {
    const { error: insertError } = await supabase.from("api_usage").insert({
      user_id: userId,
      prototype_id: prototypeId || null,
      credits_used: creditsUsed,
      credit_grant_id: null,
    });

    if (insertError) {
      log2.error(insertError, "Fallback api_usage insert failed", {
        functionName: "trackApiUsageBuildWorker",
        userId,
      });
    }
  };

  try {
    const { data, error: rpcError } = await supabase.rpc("consume_credits", {
      p_user_id: userId,
      p_prototype_id: prototypeId,
      p_credits: creditsUsed,
    });

    if (rpcError) {
      log2.error(rpcError, "consume_credits RPC failed", {
        functionName: "trackApiUsageBuildWorker",
        userId,
      });
      await insertFallbackUsage();
      return {
        totalRemainingCredits: 0,
      };
    }

    const payload = data?.[0];

    if (!payload || !payload.success) {
      log2.error(payload?.error ?? "consume_credits RPC returned failure", {
        functionName: "trackApiUsageBuildWorker",
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
    log2.error(error, "Exception in trackApiUsageBuildWorker:", {
      functionName: "trackApiUsageBuildWorker",
      userId,
    });
    await insertFallbackUsage();
    return {
      totalRemainingCredits: 0,
    };
  }
}
