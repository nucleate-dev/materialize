import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.js';
import type { SubscriptionInfo } from '../types/InternalTypes.js';
import { SystemLogger } from '../loggers/SystemLogger.js';
import { CreditLimits, ProductKeys } from '../../../web-application/src/GlobalConstants.js';

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

/**
 * Server-side function to get user's subscription plan and billing period
 * Equivalent to the useSubscriptionAccess hook but for server-side use
 *
 * @param supabaseClient - Authenticated Supabase client
 * @param userId - The user ID to check subscription for
 * @returns Promise<SubscriptionInfo> - Subscription plan and billing period information
 */
export async function getSubscriptionInfo(
  jwtToken: string,
  userId: string,
  log2: SystemLogger,
): Promise<SubscriptionInfo> {
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
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', {
        ascending: false,
      });

    if (error) {
      log2.error(error, 'Error fetching subscription from supabase:', {
        functionName: 'getSubscriptionInfo',
      });
      // Default to free tier with current month period
      const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
      return {
        userPlan: 'free',
        currentPeriodStart: startOfMonth,
        currentPeriodEnd: endOfMonth,
        stripeCustomerId: '',
      };
    }

    if (!data || data.length === 0) {
      // No active subscription found, user is on free tier
      const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
      return {
        userPlan: 'free',
        currentPeriodStart: startOfMonth,
        currentPeriodEnd: endOfMonth,
        stripeCustomerId: '',
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
        currentPeriodStart = new Date(
          latestSubscription.current_period_start * 1000,
        );
        currentPeriodEnd = new Date(
          latestSubscription.current_period_end * 1000,
        );
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
        stripeCustomerId: latestSubscription.stripe_customer_id || '',
      };
    } else {
      // Fallback to free if no plan is found
      const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
      return {
        userPlan: 'free',
        currentPeriodStart: startOfMonth,
        currentPeriodEnd: endOfMonth,
        stripeCustomerId: '',
      };
    }
  } catch (error) {
    log2.error(error, 'Error in getSubscriptionInfo:', {
      functionName: 'getSubscriptionInfo',
    });
    // Default to free tier on any error
    const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
    return {
      userPlan: 'free',
      currentPeriodStart: startOfMonth,
      currentPeriodEnd: endOfMonth,
      stripeCustomerId: '',
    };
  }
}

/**
 * Get user's API usage count within a specific billing period
 *
 * @param jwtToken - JWT token for authentication
 * @param userId - The user ID to check usage for
 * @param currentPeriodStart - Start of the billing period
 * @param currentPeriodEnd - End of the billing period
 * @returns Promise<number> - Number of API calls in the specified period
 */
export async function getCurrentPeriodApiUsage(
  jwtToken: string,
  userId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  log2: SystemLogger,
): Promise<number> {
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
    const periodStart = currentPeriodStart.toISOString();
    const periodEnd = currentPeriodEnd.toISOString();

    // Query api_usage table for usage within the period
    const { count, error } = await supabaseClient
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (error) {
      log2.error(error, 'Error fetching API usage from supabase:', {
        functionName: 'getCurrentPeriodApiUsage',
      });
      return 0; // Default to 0 on error
    }

    return count || 0;
  } catch (error) {
    log2.error(error, 'Error in getCurrentPeriodApiUsage:', {
      functionName: 'getCurrentPeriodApiUsage',
    });
    return 0;
  }
}

/**
 * Check if user has exceeded their usage limit for current period
 * Free users: 15 messages per month
 * Paid users: No limit (returns false)
 *
 * @param jwtToken - JWT token for authentication
 * @param userId - The user ID to check
 * @returns Promise<{ exceeded: boolean; current: number; limit: number; plan: string }> - Usage limit status
 */
export async function hasExceededChatUsageLimit(
  jwtToken: string,
  userId: string,
  log2: SystemLogger,
): Promise<{
  exceeded: boolean;
  current: number;
  limit: number;
  plan: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  stripeCustomerId: string;
}> {
  try {
    const subscriptionInfo = await getSubscriptionInfo(jwtToken, userId, log2);
    const currentUsage = await getCurrentPeriodApiUsage(
      jwtToken,
      userId,
      subscriptionInfo.currentPeriodStart,
      subscriptionInfo.currentPeriodEnd,
      log2,
    );

    // Free users have a limit of 15 messages per month
    if (subscriptionInfo.userPlan === 'free') {
      const limit = 15;
      return {
        exceeded: currentUsage >= limit,
        current: currentUsage,
        limit: limit,
        plan: subscriptionInfo.userPlan,
        currentPeriodStart: subscriptionInfo.currentPeriodStart,
        currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
        stripeCustomerId: subscriptionInfo.stripeCustomerId,
      };
    }

    // Paid users have no limit
    return {
      exceeded: false,
      current: currentUsage,
      limit: -1, // -1 indicates unlimited
      plan: subscriptionInfo.userPlan,
      currentPeriodStart: subscriptionInfo.currentPeriodStart,
      currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
      stripeCustomerId: subscriptionInfo.stripeCustomerId,
    };
  } catch (error) {
    log2.error(error, 'Error in hasExceededUsageLimit:', {
      functionName: 'hasExceededUsageLimit',
    });
    const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
    // Default to free plan limits on error
    return {
      exceeded: true,
      current: 0,
      limit: 15,
      plan: 'free',
      currentPeriodStart: startOfMonth,
      currentPeriodEnd: endOfMonth,
      stripeCustomerId: '',
    };
  }
}

export async function hasExceededPrototypeCreationLimit(
  jwtToken: string,
  userId: string,
  log2: SystemLogger,
): Promise<{
  exceeded: boolean;
  current: number;
  limit: number;
  plan: string;
}> {
  const subscriptionInfo = await getSubscriptionInfo(jwtToken, userId, log2);

  // Paid users have no limit
  if (subscriptionInfo.userPlan !== 'free') {
    return {
      exceeded: false,
      current: 0,
      limit: -1, // -1 indicates unlimited
      plan: subscriptionInfo.userPlan,
    };
  }

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

  const { count, error } = await supabaseClient
    .from('prototypes')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', userId);
  if (error) {
    log2.error(error, 'Error counting user prototypes from supabase:', {
      functionName: 'hasExceededPrototypeCreationLimit',
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

/**
 * Get the total credits granted to a user for the current billing period
 *
 * @param jwtToken - JWT token for authentication
 * @param userId - The user ID to check
 * @param currentPeriodStart - Start of the billing period
 * @param currentPeriodEnd - End of the billing period
 * @param log2 - Logger instance
 * @returns Promise<number> - Total credits granted in the period
 */
export async function getTotalCreditsGranted(
  jwtToken: string,
  userId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  log2: SystemLogger,
): Promise<number> {
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
    const periodStart = currentPeriodStart.toISOString();
    const periodEnd = currentPeriodEnd.toISOString();

    const { data, error } = await supabaseClient
      .from('credit_grants')
      .select('credits_granted')
      .eq('user_id', userId)
      .gte('billing_period_start', periodStart)
      .lte('billing_period_end', periodEnd);

    if (error) {
      log2.error(error, 'Error fetching credit grants from supabase:', {
        functionName: 'getTotalCreditsGranted',
      });
      return 0;
    }

    if (!data || data.length === 0) {
      return 0;
    }

    // Sum all credits granted in this period
    const totalCredits = data.reduce(
      (sum, grant) => sum + grant.credits_granted,
      0,
    );
    return totalCredits;
  } catch (error) {
    log2.error(error, 'Error in getTotalCreditsGranted:', {
      functionName: 'getTotalCreditsGranted',
    });
    return 0;
  }
}

/**
 * Get the total credits used by a user in the current billing period
 *
 * @param jwtToken - JWT token for authentication
 * @param userId - The user ID to check
 * @param currentPeriodStart - Start of the billing period
 * @param currentPeriodEnd - End of the billing period
 * @param log2 - Logger instance
 * @returns Promise<number> - Total credits used in the period
 */
export async function getTotalCreditsUsed(
  jwtToken: string,
  userId: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  log2: SystemLogger,
): Promise<number> {
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
    const periodStart = currentPeriodStart.toISOString();
    const periodEnd = currentPeriodEnd.toISOString();

    const { data, error } = await supabaseClient
      .from('api_usage')
      .select('credits_used')
      .eq('user_id', userId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd);

    if (error) {
      log2.error(error, 'Error fetching API usage from supabase:', {
        functionName: 'getTotalCreditsUsed',
      });
      return 0;
    }

    if (!data || data.length === 0) {
      return 0;
    }

    // Sum all credits used in this period
    const totalCredits = data.reduce(
      (sum, usage) => sum + usage.credits_used,
      0,
    );
    return totalCredits;
  } catch (error) {
    log2.error(error, 'Error in getTotalCreditsUsed:', {
      functionName: 'getTotalCreditsUsed',
    });
    return 0;
  }
}

/**
 * Get the remaining credits for a user in the current billing period
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
  try {
    const subscriptionInfo = await getSubscriptionInfo(jwtToken, userId, log2);

    const creditsGranted = await getTotalCreditsGranted(
      jwtToken,
      userId,
      subscriptionInfo.currentPeriodStart,
      subscriptionInfo.currentPeriodEnd,
      log2,
    );

    const creditsUsed = await getTotalCreditsUsed(
      jwtToken,
      userId,
      subscriptionInfo.currentPeriodStart,
      subscriptionInfo.currentPeriodEnd,
      log2,
    );

    // Get the credit limit for this plan
    let creditLimit = 0;
    switch (subscriptionInfo.userPlan) {
      case ProductKeys.FREE_SUBSCRIPTION:
        creditLimit = CreditLimits.FREE;
        break;
      case ProductKeys.PLUS_SUBSCRIPTION:
        creditLimit = CreditLimits.PLUS;
        break;
      case ProductKeys.PRO_SUBSCRIPTION:
        creditLimit = CreditLimits.PRO;
        break;
      case ProductKeys.MAX_SUBSCRIPTION:
        creditLimit = CreditLimits.MAX;
        break;
      case ProductKeys.TEAM_SUBSCRIPTION:
        creditLimit = CreditLimits.TEAM;
        break;
      default:
        creditLimit = CreditLimits.FREE;
    }

    // If no credits have been granted yet, use the plan limit as granted
    const effectiveGranted = creditsGranted > 0 ? creditsGranted : creditLimit;
    const remaining = effectiveGranted - creditsUsed;

    return {
      remaining,
      granted: effectiveGranted,
      used: creditsUsed,
      limit: creditLimit,
      plan: subscriptionInfo.userPlan,
      currentPeriodStart: subscriptionInfo.currentPeriodStart,
      currentPeriodEnd: subscriptionInfo.currentPeriodEnd,
      stripeCustomerId: subscriptionInfo.stripeCustomerId,
    };
  } catch (error) {
    log2.error(error, 'Error in getRemainingCredits:', {
      functionName: 'getRemainingCredits',
    });
    const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
    return {
      remaining: 0,
      granted: 0,
      used: 0,
      limit: CreditLimits.FREE,
      plan: ProductKeys.FREE_SUBSCRIPTION,
      currentPeriodStart: startOfMonth,
      currentPeriodEnd: endOfMonth,
      stripeCustomerId: '',
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
    log2.error(error, 'Error in hasExceededCreditLimit:', {
      functionName: 'hasExceededCreditLimit',
    });
    const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
    return {
      exceeded: true,
      remaining: 0,
      granted: 0,
      used: 0,
      limit: CreditLimits.FREE,
      plan: ProductKeys.FREE_SUBSCRIPTION,
      currentPeriodStart: startOfMonth,
      currentPeriodEnd: endOfMonth,
      stripeCustomerId: '',
    };
  }
}
