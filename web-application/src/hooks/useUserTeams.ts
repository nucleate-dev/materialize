import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/ClientConstants";
import { useUser } from "@/hooks/useUser";
import { Database } from "@/lib/types/supabase";

type Team = Database["public"]["Tables"]["teams"]["Row"];

const USER_TEAMS_QUERY_KEY = ["user-teams"];

export function useUserTeams() {
  const { user, userIsLoading } = useUser();

  const query = useQuery({
    queryKey: [...USER_TEAMS_QUERY_KEY, user?.id ?? "anonymous"],
    queryFn: async () => {
      if (!user?.id) return [];

      // Fetch all teams where the user is a member
      const { data, error } = await supabase
        .from("team_memberships")
        .select(
          `
          role,
          team:teams (
            id,
            name,
            created_at,
            created_by,
            personal_owner_user_id,
            slug
          )
        `,
        )
        .eq("user_id", user.id);

      if (error) {
        return [];
      }

      // Extract teams from the result and filter out null values
      const teams = data
        .map((membership) => membership.team)
        .filter((team): team is Team => team !== null);

      return teams;
    },
    enabled: !userIsLoading && Boolean(user?.id),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    teams: query.data ?? [],
    isLoading: query.isFetching || query.isLoading || userIsLoading,
  };
}
