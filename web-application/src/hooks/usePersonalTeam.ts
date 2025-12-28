import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/hooks/useUser";
import { Database } from "@/lib/types/supabase";
import { supabase } from "@/ClientConstants";

type Team = Database["public"]["Tables"]["teams"]["Row"];

const PERSONAL_TEAM_QUERY_KEY = ["personal-team"];

export function usePersonalTeam() {
  const { user, userIsLoading } = useUser();

  const query = useQuery({
    queryKey: [...PERSONAL_TEAM_QUERY_KEY, user?.id ?? "anonymous"],
    queryFn: async () => {
      if (!user?.id) return null;
      return await fetchPersonalTeam(user.id);
    },
    enabled: !userIsLoading && Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });

  return {
    team: query.data ?? null,
    isLoading: query.isFetching || query.isLoading || userIsLoading,
  };
}

// Note: fetchPersonalTeam is kept for potential backward compatibility or utility use
// All direct usage in components should use activeTeam from TeamProvider instead
async function fetchPersonalTeam(userId: string) {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("personal_owner_user_id", userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}
