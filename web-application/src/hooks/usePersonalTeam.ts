import { useQuery } from "@tanstack/react-query";
import { fetchPersonalTeam } from "@/lib/utils/payments/CheckoutUtils";
import { useUser } from "@/hooks/useUser";
import { Database } from "@/lib/types/supabase";

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
