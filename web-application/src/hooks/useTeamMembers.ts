import { useQuery } from "@tanstack/react-query";
import { Database } from "@/lib/types/supabase";
import { supabase } from "@/ClientConstants";
import { teamMembersQueryKey } from "@/lib/react-query/queryKeys";

type TeamMembership = Database["public"]["Tables"]["team_memberships"]["Row"];

export function useTeamMembers(teamId: string | null | undefined) {
  const query = useQuery({
    queryKey: teamMembersQueryKey(teamId),
    queryFn: async () => {
      if (!teamId) return [];

      const { data, error } = await supabase
        .from("team_memberships")
        .select("*")
        .eq("team_id", teamId);

      if (error) {
        console.error("Error fetching team members:", error);
        return [];
      }

      return data ?? [];
    },
    enabled: Boolean(teamId),
    staleTime: 5 * 60 * 1000,
  });

  return {
    members: query.data ?? [],
    isLoading: query.isFetching || query.isLoading,
  };
}
