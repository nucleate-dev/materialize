import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.js';
import type { SubscriptionInfo } from '../types/InternalTypes.js';

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
      console.error('Error fetching subscription:', error);
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
    console.error('Error in getSubscriptionInfo:', error);
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
      console.error('Error fetching API usage:', error);
      return 0; // Default to 0 on error
    }

    return count || 0;
  } catch (error) {
    console.error('Error in getCurrentPeriodApiUsage:', error);
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
    const subscriptionInfo = await getSubscriptionInfo(jwtToken, userId);
    const currentUsage = await getCurrentPeriodApiUsage(
      jwtToken,
      userId,
      subscriptionInfo.currentPeriodStart,
      subscriptionInfo.currentPeriodEnd,
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
    console.error('Error in hasExceededUsageLimit:', error);
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
): Promise<{
  exceeded: boolean;
  current: number;
  limit: number;
  plan: string;
}> {
  const subscriptionInfo = await getSubscriptionInfo(jwtToken, userId);

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
    console.error('Error counting user prototypes:', error);
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
