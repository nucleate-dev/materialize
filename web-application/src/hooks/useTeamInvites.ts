import { useQuery } from "@tanstack/react-query";
import { Database } from "@/lib/types/supabase";
import { supabase } from "@/ClientConstants";
import { teamInvitesQueryKey } from "@/lib/react-query/queryKeys";

type TeamInvite = Database["public"]["Tables"]["team_invites"]["Row"];

export function useTeamInvites(teamId: string | null | undefined) {
  const query = useQuery({
    queryKey: teamInvitesQueryKey(teamId),
    queryFn: async () => {
      if (!teamId) return [];

      const { data, error } = await supabase
        .from("team_invites")
        .select("*")
        .eq("team_id", teamId)
        .is("accepted_at", null) // Only fetch pending invites
        .order("created_at", { ascending: false });

      if (error) {
        return [];
      }

      return data ?? [];
    },
    enabled: Boolean(teamId),
    staleTime: 5 * 60 * 1000,
  });

  return {
    invites: query.data ?? [],
    isLoading: query.isFetching || query.isLoading,
  };
}
