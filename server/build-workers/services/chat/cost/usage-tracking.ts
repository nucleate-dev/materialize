import { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import type { Database } from "../../../types/supabase.js";

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
  teamId?: string,
): Promise<string> {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const planQuery = supabase
    .from("subscriptions")
    .select("plan_id, current_period_start, current_period_end")
    .eq("status", "active")
    .lte("current_period_start", nowInSeconds)
    .gte("current_period_end", nowInSeconds)
    .order("updated_at", { ascending: false })
    .limit(1);
  const { data, error } = await (teamId
    ? planQuery.eq("team_id", teamId)
    : planQuery.eq("user_id", userId));

  if (error) {
    log2.error(error, "Failed to fetch user plan for usage tracking", {
      functionName: "fetchUserPlan",
      userId,
      teamId,
    });
    return "free";
  }

  const latestSubscription = data?.[0];
  if (
    latestSubscription?.current_period_start &&
    latestSubscription.current_period_end
  ) {
    const now = Math.floor(Date.now() / 1000);
    const { current_period_start: periodStart, current_period_end: periodEnd } =
      latestSubscription;

    if (periodStart <= now && now <= periodEnd) {
      return latestSubscription.plan_id ?? "free";
    }
  }

  return "free";
}

async function trackFreeTierUsage(
  supabase: SupabaseClient<Database>,
  userId: string,
  prototypeId: string | null,
  creditsUsed: number,
  log2: SystemLogger,
  teamId?: string,
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
    team_id: teamId ?? null,
  });

  if (insertError) {
    log2.error(insertError, "Failed to insert free-tier api_usage row", {
      functionName: "trackFreeTierUsage",
      userId,
      teamId,
    });
    return {
      totalRemainingCredits: 0,
    };
  }

  const usageQuery = supabase
    .from("api_usage")
    .select("credits_used")
    .eq("is_free_tier", true)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd);
  const { data: usageRows, error: usageError } = await (teamId
    ? usageQuery.eq("team_id", teamId)
    : usageQuery.eq("user_id", userId));

  if (usageError) {
    log2.error(usageError, "Failed to fetch free-tier usage totals", {
      functionName: "trackFreeTierUsage",
      userId,
      teamId,
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
  teamId?: string,
): Promise<UsageTrackingResult> {
  log2 = log2.child({
    function: "trackCodeUsage",
  });

  const insertFallbackUsage = async (): Promise<void> => {
    const { error: insertError } = await supabase.from("api_usage").insert({
      user_id: userId,
      prototype_id: prototypeId || null,
      credits_used: creditsUsed,
      credit_grant_id: null,
      is_free_tier: false,
      team_id: teamId ?? null,
    });

    if (insertError) {
      log2.error(insertError, "Fallback api_usage insert failed", {
        functionName: "trackApiUsageBuildWorker",
        userId,
        teamId,
      });
    }
  };

  if (!teamId) {
    log2.error(
      new Error("Missing teamId for consume_credits_teams"),
      "Cannot track paid usage without team context",
      {
        userId,
        prototypeId,
      },
    );
    await insertFallbackUsage();
    return {
      totalRemainingCredits: 0,
    };
  }

  const userPlan = await fetchUserPlan(supabase, userId, log2, teamId);
  if (userPlan === "free") {
    return trackFreeTierUsage(
      supabase,
      userId,
      prototypeId,
      creditsUsed,
      log2,
      teamId,
    );
  }

  try {
    const { data, error: rpcError } = await supabase.rpc(
      "consume_credits_teams",
      {
        p_team_id: teamId,
        p_prototype_id: prototypeId,
        p_credits: creditsUsed,
      },
    );

    if (rpcError) {
      log2.error(rpcError, "consume_credits_teams RPC failed", {
        functionName: "trackApiUsageBuildWorker",
        userId,
        teamId,
      });
      await insertFallbackUsage();
      return {
        totalRemainingCredits: 0,
      };
    }

    const payload = data?.[0];

    if (!payload || !payload.success) {
      log2.error(
        new Error(payload?.error ?? "consume_credits_teams RPC returned failure"),
        "consume_credits_teams RPC returned failure",
        {
          functionName: "trackApiUsageBuildWorker",
          userId,
          teamId,
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
      teamId,
    });
    await insertFallbackUsage();
    return {
      totalRemainingCredits: 0,
    };
  }
}
