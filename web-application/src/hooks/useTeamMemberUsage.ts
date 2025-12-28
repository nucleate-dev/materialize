import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/ClientConstants";
import { teamMemberUsageQueryKey } from "@/lib/react-query/queryKeys";

export interface UserUsage {
  user_id: string;
  current_period_usage: number;
  total_usage: number;
}

export function useTeamMemberUsage(
  teamId: string | null | undefined,
  currentPeriodStart: Date | null | undefined,
  currentPeriodEnd: Date | null | undefined
) {
  const query = useQuery({
    queryKey: teamMemberUsageQueryKey(
      teamId,
      currentPeriodStart?.toISOString(),
      currentPeriodEnd?.toISOString()
    ),
    queryFn: async () => {
      if (!teamId) return [];

      // Fetch all API usage for the team
      const { data: allUsage, error: allError } = await supabase
        .from("api_usage")
        .select("user_id, credits_used, created_at")
        .eq("team_id", teamId);

      if (allError) {
        console.error("Error fetching team member usage:", allError);
        return [];
      }

      if (!allUsage || allUsage.length === 0) return [];

      // Aggregate by user_id
      const usageByUser = new Map<string, UserUsage>();

      allUsage.forEach((usage) => {
        const existing = usageByUser.get(usage.user_id) || {
          user_id: usage.user_id,
          current_period_usage: 0,
          total_usage: 0,
        };

        // Add to total usage
        existing.total_usage += usage.credits_used;

        // Add to current period usage if within the period
        if (currentPeriodStart && currentPeriodEnd && usage.created_at) {
          const usageDate = new Date(usage.created_at);
          if (usageDate >= currentPeriodStart && usageDate <= currentPeriodEnd) {
            existing.current_period_usage += usage.credits_used;
          }
        }

        usageByUser.set(usage.user_id, existing);
      });

      return Array.from(usageByUser.values());
    },
    enabled: Boolean(teamId),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    usageData: query.data ?? [],
    isLoading: query.isFetching || query.isLoading,
  };
}
