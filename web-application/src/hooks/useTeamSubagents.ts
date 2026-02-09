import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/supabase";
import { teamSubagentsQueryKey } from "@/lib/react-query/queryKeys";
import { useActiveTeam } from "@/contexts/TeamContext";

type TeamSubagent = Database["public"]["Tables"]["team_subagents"]["Row"];
type TeamSubagentInsert =
  Database["public"]["Tables"]["team_subagents"]["Insert"];
type TeamSubagentUpdate =
  Database["public"]["Tables"]["team_subagents"]["Update"];

export function useTeamSubagents() {
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();
  const teamId = activeTeam?.id ?? null;

  const query = useQuery({
    queryKey: teamSubagentsQueryKey(teamId),
    queryFn: async () => {
      if (!teamId) return [];

      const { data, error } = await supabase
        .from("team_subagents")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch team subagents:", error);
        return [];
      }

      return data ?? [];
    },
    enabled: Boolean(teamId),
    staleTime: 3 * 60 * 1000,
  });

  const createSubagent = useMutation({
    mutationFn: async (subagent: Omit<TeamSubagentInsert, "team_id">) => {
      if (!teamId) throw new Error("No team selected");

      const { data, error } = await supabase
        .from("team_subagents")
        .insert({ ...subagent, team_id: teamId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: teamSubagentsQueryKey(teamId),
      });
    },
  });

  const updateSubagent = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: TeamSubagentUpdate;
    }) => {
      const { data, error } = await supabase
        .from("team_subagents")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: teamSubagentsQueryKey(teamId),
      });
    },
  });

  const deleteSubagent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("team_subagents")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: teamSubagentsQueryKey(teamId),
      });
    },
  });

  const toggleSubagent = useMutation({
    mutationFn: async ({
      id,
      isEnabled,
    }: {
      id: string;
      isEnabled: boolean;
    }) => {
      const { data, error } = await supabase
        .from("team_subagents")
        .update({ is_enabled: isEnabled })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: teamSubagentsQueryKey(teamId),
      });
    },
  });

  return {
    subagents: query.data ?? [],
    isLoading: Boolean(teamId) ? query.isFetching || query.isLoading : false,
    error: query.error,
    createSubagent,
    updateSubagent,
    deleteSubagent,
    toggleSubagent,
  };
}
