import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import { Database } from "@/lib/types/supabase";
import { supabase } from "@/ClientConstants";
import { currentUserMembershipQueryKey } from "@/lib/react-query/queryKeys";

type TeamMembership = Database["public"]["Tables"]["team_memberships"]["Row"];

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
