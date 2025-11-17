import { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import type { Database } from "../../types/supabase.js";
import { ProductKeys } from "../../types/constants.js";

export interface UsageTrackingResult {
  totalRemainingCredits: number;
  grantBalances?: unknown;
}

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

async function fetchUserPlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  log2: SystemLogger,
): Promise<string> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    log2.error(error, "Failed to fetch user plan for usage tracking", {
      functionName: "fetchUserPlan",
      userId,
    });
    return ProductKeys.FREE_SUBSCRIPTION;
  }

  const planId = data?.[0]?.plan_id;
  return planId ?? ProductKeys.FREE_SUBSCRIPTION;
}

async function trackFreeTierUsage(
  supabase: SupabaseClient<Database>,
  userId: string,
  prototypeId: string | null,
  creditsUsed: number,
  log2: SystemLogger,
): Promise<UsageTrackingResult> {
  const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
  const periodStart = startOfMonth.toISOString();
  const periodEnd = endOfMonth.toISOString();

  const { error: insertError } = await supabase.from("api_usage").insert({
    user_id: userId,
    prototype_id: prototypeId || null,
    credits_used: creditsUsed,
    credit_grant_id: null,
    is_free_tier: true,
  });

  if (insertError) {
    log2.error(insertError, "Failed to insert free-tier api_usage row", {
      functionName: "trackFreeTierUsage",
      userId,
    });
    return {
      totalRemainingCredits: 0,
    };
  }

  const { data: usageRows, error: usageError } = await supabase
    .from("api_usage")
    .select("credits_used")
    .eq("user_id", userId)
    .eq("is_free_tier", true)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd);

  if (usageError) {
    log2.error(usageError, "Failed to fetch free-tier usage totals", {
      functionName: "trackFreeTierUsage",
      userId,
    });
    return {
      totalRemainingCredits: 0,
    };
  }

  const totalUsed =
    usageRows?.reduce((sum, row) => sum + (row.credits_used || 0), 0) ?? 0;
  return {
    totalRemainingCredits: Math.max(FREE_TIER_CREDITS - totalUsed, 0),
  };
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

  const userPlan = await fetchUserPlan(supabase, userId, log2);
  if (userPlan === ProductKeys.FREE_SUBSCRIPTION) {
    return trackFreeTierUsage(supabase, userId, prototypeId, creditsUsed, log2);
  }

  const insertFallbackUsage = async (): Promise<void> => {
    const { error: insertError } = await supabase.from("api_usage").insert({
      user_id: userId,
      prototype_id: prototypeId || null,
      credits_used: creditsUsed,
      credit_grant_id: null,
      is_free_tier: false,
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
      log2.error(
        new Error(payload?.error ?? "consume_credits RPC returned failure"),
        "consume_credits RPC returned failure",
        {
          functionName: "trackApiUsageBuildWorker",
          userId,
        },
      );
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
