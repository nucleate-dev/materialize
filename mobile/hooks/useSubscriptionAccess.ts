import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useActiveTeam } from '../stores/teamStore';
import { useAuthStore } from '../stores/authStore';

type SubscriptionPlanType = 'free' | 'plus' | 'team' | 'pro' | 'max';

interface SubscriptionAccessResult {
  userPlan: SubscriptionPlanType;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  seatQuantity: number | null;
}

const SUBSCRIPTION_STATUS_ACTIVE = 'active';

/**
 * Helper function to get the start and end of the current month
 */
function getCurrentMonthPeriod() {
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

function getFreeTierAccess(): SubscriptionAccessResult {
  const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
  return {
    userPlan: 'free',
    currentPeriodStart: startOfMonth,
    currentPeriodEnd: endOfMonth,
    seatQuantity: null,
  };
}

async function fetchSubscriptionAccess(
  teamId: string,
): Promise<SubscriptionAccessResult> {
  const freeTierAccess = getFreeTierAccess();
  try {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', SUBSCRIPTION_STATUS_ACTIVE)
      .lte('current_period_start', nowInSeconds)
      .gte('current_period_end', nowInSeconds)
      .order('updated_at', {
        ascending: false,
      });

    if (error) {
      console.error('Error fetching subscription:', error);
      return freeTierAccess;
    }

    if (!data || data.length === 0) {
      return freeTierAccess;
    }

    const latestSubscription = data[0];
    const plan = latestSubscription.plan_id as SubscriptionPlanType | null;
    const seatQuantity = latestSubscription.seat_quantity ?? null;

    if (!plan) {
      return freeTierAccess;
    }

    if (
      latestSubscription.current_period_start &&
      latestSubscription.current_period_end
    ) {
      const periodStart = latestSubscription.current_period_start * 1000;
      const periodEnd = latestSubscription.current_period_end * 1000;
      const now = Date.now();

      if (periodStart <= now && now <= periodEnd) {
        return {
          userPlan: plan,
          currentPeriodStart: new Date(periodStart),
          currentPeriodEnd: new Date(periodEnd),
          seatQuantity,
        };
      }

      return freeTierAccess;
    }

    const { startOfMonth, endOfMonth } = getCurrentMonthPeriod();
    return {
      userPlan: plan,
      currentPeriodStart: startOfMonth,
      currentPeriodEnd: endOfMonth,
      seatQuantity,
    };
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return freeTierAccess;
  }
}

/**
 * A custom hook that fetches and determines the current team's subscription plan and billing period.
 * Returns subscription plan and current period dates.
 */
export function useSubscriptionAccess() {
  const activeTeam = useActiveTeam();
  const session = useAuthStore((state) => state.session);
  const userId = session?.user?.id;
  const teamId = activeTeam?.id;
  const queryEnabled = Boolean(userId && teamId);

  const subscriptionQuery = useQuery({
    queryKey: ['subscriptionAccess', teamId],
    queryFn: () => fetchSubscriptionAccess(teamId as string),
    enabled: queryEnabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const subscriptionData = subscriptionQuery.data ?? getFreeTierAccess();
  const loadingSubscriptionData = queryEnabled ? subscriptionQuery.isPending : false;

  return {
    userPlan: subscriptionData.userPlan,
    loadingSubscriptionData,
    currentPeriodStart: subscriptionData.currentPeriodStart,
    currentPeriodEnd: subscriptionData.currentPeriodEnd,
    seatQuantity: subscriptionData.seatQuantity,
    isFreePlan: subscriptionData.userPlan === 'free',
  };
}
