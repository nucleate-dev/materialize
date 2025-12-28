import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/ClientConstants";
import { useUser } from "@/hooks/useUser";
import { Database } from "@/lib/types/supabase";
import { customUserRowQueryKey } from "@/lib/react-query/queryKeys";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

/**
 * Hook to fetch the user row from the users table
 * Uses tanstack query for caching and optimization
 */
export function useCustomUserRow() {
  const { user, userIsLoading } = useUser();

  const query = useQuery({
    queryKey: customUserRowQueryKey(user?.id),
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Error fetching user row:", error);
        return null;
      }

      return data;
    },
    enabled: !userIsLoading && Boolean(user?.id),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    userRow: query.data ?? null,
    isLoading: query.isFetching || query.isLoading || userIsLoading,
  };
}
