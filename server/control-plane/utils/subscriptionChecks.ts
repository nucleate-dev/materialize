import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase.js";
import type { SubscriptionInfo } from "../types/InternalTypes.js";
import { SystemLogger } from "../loggers/SystemLogger.js";
import { CreditLimits } from "../types/PublicAPITypes.js";

/**
 * Helper function to get the start and end of the current month
 * @returns Object with startOfMonth and endOfMonth Date objects
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

async function getPersonalTeamId(
  jwtToken: string,
  userId: string,
  log2: SystemLogger,
): Promise<string | null> {
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

  const { data, error } = await supabaseClient
    .from("teams")
    .select("id")
    .eq("personal_owner_user_id", userId)
    .maybeSingle();

  if (error) {
    log2.error(error, "Error fetching personal team for user", {
      functionName: "getPersonalTeamId",
      userId,
    });
    return null;
  }

  return data?.id ?? null;
}

export async function getSubscriptionInfo(
  jwtToken: string,
  userId: string,
  log2: SystemLogger,
  teamId?: string,
): Promise<SubscriptionInfo> {
  const nowInSeconds = Math.floor(Date.now() / 1000);
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
    let query = supabaseClient
      .from("subscriptions")
      .select("*")
      .eq("status", "active")
      .lte("current_period_start", nowInSeconds)
      .gte("current_period_end", nowInSeconds)
      .order("updated_at", {
        ascending: false,
      });

    if (teamId) {
      query = query.eq("team_id", teamId);
    } else {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      log2.error(error, "Error fetching subscription from supabase:", {
        functionName: "getSubscriptionInfo",
      });
      // Default to free tier with current month period
      const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
      return {
        userPlan: "free",
        currentPeriodStart: startOfMonth,
        currentPeriodEnd: endOfMonth,
        stripeCustomerId: "",
      };
    }

    if (!data || data.length === 0) {
      // No active subscription found, user is on free tier
      const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
      return {
        userPlan: "free",
        currentPeriodStart: startOfMonth,
        currentPeriodEnd: endOfMonth,
        stripeCustomerId: "",
      };
    }

    const latestSubscription = data[0];
    const plan = latestSubscription.plan_id;

    // User has an active subscription, use the plan from database
    if (plan) {
      let currentPeriodStart: Date;
      let currentPeriodEnd: Date;

      // Set subscription period from Stripe data (Unix timestamps in seconds)
      if (
        latestSubscription.current_period_start &&
        latestSubscription.current_period_end
      ) {
        const periodStart = latestSubscription.current_period_start * 1000;
        const periodEnd = latestSubscription.current_period_end * 1000;
        const now = Date.now();

        if (periodStart <= now && now <= periodEnd) {
          currentPeriodStart = new Date(periodStart);
          currentPeriodEnd = new Date(periodEnd);
        } else {
          const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
          return {
            userPlan: "free",
            currentPeriodStart: startOfMonth,
            currentPeriodEnd: endOfMonth,
            stripeCustomerId: "",
          };
        }
      } else {
        // Fallback to current month if period data is missing
        const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
        currentPeriodStart = startOfMonth;
        currentPeriodEnd = endOfMonth;
      }

      return {
        userPlan: plan,
        currentPeriodStart,
        currentPeriodEnd,
        stripeCustomerId: latestSubscription.stripe_customer_id || "",
      };
    } else {
      // Fallback to free if no plan is found
      const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
      return {
        userPlan: "free",
        currentPeriodStart: startOfMonth,
        currentPeriodEnd: endOfMonth,
        stripeCustomerId: "",
      };
    }
  } catch (error) {
    log2.error(error, "Error in getSubscriptionInfo:", {
      functionName: "getSubscriptionInfo",
    });
    // Default to free tier on any error
    const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
    return {
      userPlan: "free",
      currentPeriodStart: startOfMonth,
      currentPeriodEnd: endOfMonth,
      stripeCustomerId: "",
    };
  }
}

async function calculateFreeTierCreditInfo(
  supabaseClient: SupabaseClient<Database>,
  teamId: string,
  log2: SystemLogger,
): Promise<{ remaining: number; granted: number; used: number }> {
  const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
  const periodStart = startOfMonth.toISOString();
  const periodEnd = endOfMonth.toISOString();
  const { data: usageRows, error } = await supabaseClient
    .from("api_usage")
    .select("credits_used")
    .eq("team_id", teamId)
    .eq("is_free_tier", true)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd);

  if (error) {
    log2.error(error, "Error fetching free-tier usage:", {
      functionName: "calculateFreeTierCreditInfo",
      teamId,
    });
  }

  const totalUsed =
    usageRows?.reduce((sum, row) => sum + (row.credits_used || 0), 0) ?? 0;
  const remaining = Math.max(CreditLimits.FREE - totalUsed, 0);
  return {
    remaining,
    granted: CreditLimits.FREE,
    used: totalUsed,
  };
}

export async function hasExceededPrototypeCreationLimit(
  jwtToken: string,
  userId: string,
  log2: SystemLogger,
  teamId: string,
): Promise<{
  exceeded: boolean;
  current: number;
  limit: number;
  plan: string;
}> {
  const subscriptionInfo = await getSubscriptionInfo(
    jwtToken,
    userId,
    log2,
    teamId,
  );

  // Paid users have no limit
  if (subscriptionInfo.userPlan !== "free") {
    return {
      exceeded: false,
      current: 0,
      limit: -1, // -1 indicates unlimited
      plan: subscriptionInfo.userPlan,
    };
  }

  // must use service role key because it's possible that this team has prototypes that this user cannot view
  const supabaseClient = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { count, error } = await supabaseClient
    .from("prototypes")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId);
  if (error) {
    log2.error(error, "Error counting user prototypes from supabase:", {
      functionName: "hasExceededPrototypeCreationLimit",
    });
    // Default to exceeded on error to be safe
    return {
      exceeded: false,
      current: 0,
      limit: 5,
      plan: subscriptionInfo.userPlan,
    };
  }

  const currentCount = count || 0;
  return {
    exceeded: currentCount >= 5,
    current: currentCount,
    limit: 5,
    plan: subscriptionInfo.userPlan,
  };
}

// DEPRECATED: getTotalCreditsGranted and getTotalCreditsUsed
// These functions are no longer used with the new expirable credits system
// Credits are now tracked per-grant with individual expiration dates

/**
 * Get the remaining credits for a user across all unexpired credit grants
 *
 * @param jwtToken - JWT token for authentication
 * @param userId - The user ID to check
 * @param log2 - Logger instance
 * @returns Promise with remaining credits, granted, used, plan, and billing period info
 */
export async function getRemainingCredits(
  jwtToken: string,
  userId: string,
  log2: SystemLogger,
  teamId?: string,
): Promise<{
  remaining: number;
  granted: number;
  used: number;
  limit: number;
  plan: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  stripeCustomerId: string;
}> {
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
    const resolvedTeamId = teamId ??
      (await getPersonalTeamId(jwtToken, userId, log2));
    const subscriptionInfo = await getSubscriptionInfo(
      jwtToken,
      userId,
      log2,
      resolvedTeamId ?? undefined,
    );

    if (subscriptionInfo.userPlan === "free") {
      if (!resolvedTeamId) {
        log2.warn(
          "Unable to determine team for free-tier credit calculation; defaulting to zero",
          { userId },
        );
        return {
          remaining: 0,
          granted: CreditLimits.FREE,
          used: 0,
          limit: CreditLimits.FREE,
          plan: subscriptionInfo.userPlan,
          currentPeriodStart: subscriptionInfo.currentPeriodStart,
          currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
          stripeCustomerId: subscriptionInfo.stripeCustomerId,
        };
      }
      const freeCreditInfo = await calculateFreeTierCreditInfo(
        supabaseClient,
        resolvedTeamId,
        log2,
      );
      return {
        remaining: freeCreditInfo.remaining,
        granted: freeCreditInfo.granted,
        used: freeCreditInfo.used,
        limit: CreditLimits.FREE,
        plan: subscriptionInfo.userPlan,
        currentPeriodStart: subscriptionInfo.currentPeriodStart,
        currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
        stripeCustomerId: subscriptionInfo.stripeCustomerId,
      };
    }

    const nowIso = new Date().toISOString();
    const { data: balances, error: balancesError } = await supabaseClient
      .from("credit_grant_balances")
      .select("credits_granted, credits_remaining")
      .eq("user_id", userId)
      .gt("expires_at", nowIso);

    if (balancesError) {
      log2.error(balancesError, "Error fetching credit grant balances:", {
        functionName: "getRemainingCredits",
      });
    }

    const totalGranted = balances?.reduce(
      (sum, balance) => sum + (balance.credits_granted || 0),
      0,
    ) || 0;
    const totalRemaining = balances?.reduce(
      (sum, balance) => sum + (balance.credits_remaining || 0),
      0,
    ) || 0;
    const totalUsed = totalGranted - totalRemaining;

    // Get the credit limit for this plan
    let creditLimit = 0;
    switch (subscriptionInfo.userPlan as string) {
      case "free":
        creditLimit = CreditLimits.FREE;
        break;
      case "plus":
        creditLimit = CreditLimits.PLUS;
        break;
      case "pro":
        creditLimit = CreditLimits.PRO;
        break;
      case "max":
        creditLimit = CreditLimits.MAX;
        break;
      case "team":
        creditLimit = CreditLimits.TEAM;
        break;
      default:
        creditLimit = CreditLimits.FREE;
    }

    return {
      remaining: totalRemaining,
      granted: totalGranted,
      used: totalUsed,
      limit: creditLimit,
      plan: subscriptionInfo.userPlan,
      currentPeriodStart: subscriptionInfo.currentPeriodStart,
      currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
      stripeCustomerId: subscriptionInfo.stripeCustomerId,
    };
  } catch (error) {
    log2.error(error, "Error in getRemainingCredits:", {
      functionName: "getRemainingCredits",
    });
    const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
    return {
      remaining: 0,
      granted: 0,
      used: 0,
      limit: CreditLimits.FREE,
      plan: "free",
      currentPeriodStart: startOfMonth,
      currentPeriodEnd: endOfMonth,
      stripeCustomerId: "",
    };
  }
}

/**
 * Check if user has exceeded their credit limit for current period
 * Replaces hasExceededChatUsageLimit with credit-based system
 *
 * @param jwtToken - JWT token for authentication
 * @param userId - The user ID to check
 * @param log2 - Logger instance
 * @returns Promise with exceeded status and credit information
 */
export async function hasExceededCreditLimit(
  jwtToken: string,
  userId: string,
  log2: SystemLogger,
): Promise<{
  exceeded: boolean;
  remaining: number;
  granted: number;
  used: number;
  limit: number;
  plan: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  stripeCustomerId: string;
}> {
  try {
    const creditInfo = await getRemainingCredits(jwtToken, userId, log2);

    return {
      exceeded: creditInfo.remaining <= 0,
      ...creditInfo,
    };
  } catch (error) {
    log2.error(error, "Error in hasExceededCreditLimit:", {
      functionName: "hasExceededCreditLimit",
    });
    const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
    return {
      exceeded: true,
      remaining: 0,
      granted: 0,
      used: 0,
      limit: CreditLimits.FREE,
      plan: "free",
      currentPeriodStart: startOfMonth,
      currentPeriodEnd: endOfMonth,
      stripeCustomerId: "",
    };
  }
}
