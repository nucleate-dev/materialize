import { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../loggers/SystemLogger.js";
import type { Database } from "../types/supabase.js";
import { CreditLimits } from "../types/ControlPlaneTypes.js";

const FREE_TIER_CREDITS = CreditLimits.FREE; // Free tier users get 5 credits per billing period

/**
 * Helper function to get the start and end of the current month
 */
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
 * Fetch the user's personal team
 */
export async function getPersonalTeam(
  supabase: SupabaseClient<Database>,
  userId: string,
  log2: SystemLogger,
): Promise<Database["public"]["Tables"]["teams"]["Row"]> {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("personal_owner_user_id", userId)
    .single();

  if (error) {
    log2.error(error, "Error fetching personal team for user", {
      functionName: "getPersonalTeam",
      userId,
    });
    throw error;
  }

  return data;
}

/**
 * Fetch user's subscription plan
 */
export async function fetchUserPlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  log2: SystemLogger,
  teamId: string,
): Promise<string> {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_id, current_period_start, current_period_end")
    .eq("team_id", teamId)
    .eq("status", "active")
    .lte("current_period_start", nowInSeconds)
    .gte("current_period_end", nowInSeconds)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    log2.error(error, "Failed to fetch user plan for credit check", {
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

/**
 * Calculate free tier credit information
 */
async function calculateFreeTierCreditInfo(
  supabase: SupabaseClient<Database>,
  userId: string,
  log2: SystemLogger,
  teamId: string,
): Promise<{ remaining: number; granted: number; used: number }> {
  // Check if this is a personal team (only personal teams get free credits)
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("personal_owner_user_id")
    .eq("id", teamId)
    .single();

  if (teamError) {
    log2.error(teamError, "Error fetching team for free-tier check", {
      functionName: "calculateFreeTierCreditInfo",
      userId,
      teamId,
    });
    // On error, deny credits to be safe
    return {
      remaining: 0,
      granted: 0,
      used: 0,
    };
  }

  // Non-personal teams don't get free credits
  if (!team?.personal_owner_user_id) {
    return {
      remaining: 0,
      granted: 0,
      used: 0,
    };
  }

  // Personal team - calculate free tier credits
  const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
  const periodStart = startOfMonth.toISOString();
  const periodEnd = endOfMonth.toISOString();

  const { data: usageRows, error } = await supabase
    .from("api_usage")
    .select("credits_used")
    .eq("team_id", teamId)
    .eq("is_free_tier", true)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd);

  if (error) {
    log2.error(error, "Error fetching free-tier usage", {
      functionName: "calculateFreeTierCreditInfo",
      userId,
      teamId,
    });
  }

  const totalUsed =
    usageRows?.reduce((sum, row) => sum + (row.credits_used || 0), 0) ?? 0;
  const remaining = Math.max(FREE_TIER_CREDITS - totalUsed, 0);

  return {
    remaining,
    granted: FREE_TIER_CREDITS,
    used: totalUsed,
  };
}

/**
 * Get remaining credits for paid users from credit grants
 */
async function calculatePaidUserCreditInfo(
  supabase: SupabaseClient<Database>,
  userId: string,
  log2: SystemLogger,
  teamId: string,
): Promise<{ remaining: number; granted: number; used: number }> {
  const nowIso = new Date().toISOString();
  const { data: balances, error: balancesError } = await supabase
    .from("credit_grant_balances")
    .select("credits_granted, credits_remaining")
    .eq("team_id", teamId)
    .gt("expires_at", nowIso);

  if (balancesError) {
    log2.error(balancesError, "Error fetching credit grant balances", {
      functionName: "calculatePaidUserCreditInfo",
      userId,
    });
    return { remaining: 0, granted: 0, used: 0 };
  }

  const totalGranted =
    balances?.reduce(
      (sum, balance) => sum + (balance.credits_granted || 0),
      0,
    ) || 0;
  const totalRemaining =
    balances?.reduce(
      (sum, balance) => sum + (balance.credits_remaining || 0),
      0,
    ) || 0;
  const totalUsed = totalGranted - totalRemaining;

  return {
    remaining: totalRemaining,
    granted: totalGranted,
    used: totalUsed,
  };
}

/**
 * Check if user has remaining credits before allowing chat
 * Returns true if user has credits available, false otherwise
 */
export async function hasRemainingCredits(
  supabase: SupabaseClient<Database>,
  userId: string,
  teamId: string,
  log2: SystemLogger,
): Promise<{
  hasCredits: boolean;
  remaining: number;
  granted: number;
  used: number;
  plan: string;
}> {
  try {
    const userPlan = await fetchUserPlan(supabase, userId, log2, teamId);

    if (userPlan === "free") {
      const freeCreditInfo = await calculateFreeTierCreditInfo(
        supabase,
        userId,
        log2,
        teamId,
      );
      return {
        hasCredits: freeCreditInfo.remaining > 0,
        remaining: freeCreditInfo.remaining,
        granted: freeCreditInfo.granted,
        used: freeCreditInfo.used,
        plan: userPlan,
      };
    }

    // Paid user - check credit grants
    const paidCreditInfo = await calculatePaidUserCreditInfo(
      supabase,
      userId,
      log2,
      teamId!,
    );

    return {
      hasCredits: paidCreditInfo.remaining > 0,
      remaining: paidCreditInfo.remaining,
      granted: paidCreditInfo.granted,
      used: paidCreditInfo.used,
      plan: userPlan,
    };
  } catch (error) {
    log2.error(
      error instanceof Error ? error : new Error(String(error)),
      "Error checking remaining credits",
      {
        functionName: "hasRemainingCredits",
        userId,
        teamId,
      },
    );
    // On error, deny access to be safe
    return {
      hasCredits: false,
      remaining: 0,
      granted: 0,
      used: 0,
      plan: "free",
    };
  }
}
