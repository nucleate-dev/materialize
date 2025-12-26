import { useQuery } from "@tanstack/react-query";
import { fetchPersonalTeamId } from "@/lib/utils/payments/CheckoutUtils";
import { useUser } from "@/hooks/useUser";

const PERSONAL_TEAM_QUERY_KEY = ["personal-team"];

export function usePersonalTeam() {
  const { user, userIsLoading } = useUser();

  const query = useQuery({
    queryKey: [...PERSONAL_TEAM_QUERY_KEY, user?.id ?? "anonymous"],
    queryFn: async () => {
      if (!user?.id) return null;
      return await fetchPersonalTeamId(user.id);
    },
    enabled: !userIsLoading && Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  });

  return {
    teamId: query.data ?? null,
    isLoading: query.isFetching || query.isLoading || userIsLoading,
  };
}
