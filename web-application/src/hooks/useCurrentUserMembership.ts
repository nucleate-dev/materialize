import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/ClientConstants";
import { currentUserMembershipQueryKey } from "@/lib/react-query/queryKeys";

export function useCurrentUserMembership(teamId: string | null | undefined) {
  const { user, userIsLoading } = useUser();

  const query = useQuery({
    queryKey: currentUserMembershipQueryKey(user?.id, teamId),
    queryFn: async () => {
      if (!user?.id || !teamId) return null;

      const { data, error } = await supabase
        .from("team_memberships")
        .select("*")
        .eq("user_id", user.id)
        .eq("team_id", teamId)
        .maybeSingle();

      if (error) {
        return null;
      }

      return data;
    },
    enabled: !userIsLoading && Boolean(user?.id) && Boolean(teamId),
    staleTime: 5 * 60 * 1000,
  });

  return {
    membership: query.data ?? null,
    isLoading: query.isFetching || query.isLoading || userIsLoading,
  };
}
