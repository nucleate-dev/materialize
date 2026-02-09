import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/supabase";
import { teamMcpServersQueryKey } from "@/lib/react-query/queryKeys";
import { useActiveTeam } from "@/contexts/TeamContext";

type TeamMcpServer = Database["public"]["Tables"]["team_mcp_servers"]["Row"];
type TeamMcpServerInsert =
  Database["public"]["Tables"]["team_mcp_servers"]["Insert"];
type TeamMcpServerUpdate =
  Database["public"]["Tables"]["team_mcp_servers"]["Update"];

export function useTeamMcpServers() {
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();
  const teamId = activeTeam?.id ?? null;

  const query = useQuery({
    queryKey: teamMcpServersQueryKey(teamId),
    queryFn: async () => {
      if (!teamId) return [];

      const { data, error } = await supabase
        .from("team_mcp_servers")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch team MCP servers:", error);
        return [];
      }

      return data ?? [];
    },
    enabled: Boolean(teamId),
    staleTime: 3 * 60 * 1000,
  });

  const createMcpServer = useMutation({
    mutationFn: async (server: Omit<TeamMcpServerInsert, "team_id">) => {
      if (!teamId) throw new Error("No team selected");

      const { data, error } = await supabase
        .from("team_mcp_servers")
        .insert({ ...server, team_id: teamId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: teamMcpServersQueryKey(teamId),
      });
    },
  });

  const updateMcpServer = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: TeamMcpServerUpdate;
    }) => {
      const { data, error } = await supabase
        .from("team_mcp_servers")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: teamMcpServersQueryKey(teamId),
      });
    },
  });

  const deleteMcpServer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("team_mcp_servers")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: teamMcpServersQueryKey(teamId),
      });
    },
  });

  const toggleMcpServer = useMutation({
    mutationFn: async ({
      id,
      isEnabled,
    }: {
      id: string;
      isEnabled: boolean;
    }) => {
      const { data, error } = await supabase
        .from("team_mcp_servers")
        .update({ is_enabled: isEnabled })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: teamMcpServersQueryKey(teamId),
      });
    },
  });

  const updateHealthStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "healthy" | "unhealthy" | "unknown";
    }) => {
      const { data, error } = await supabase
        .from("team_mcp_servers")
        .update({
          health_status: status,
          last_health_check_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: teamMcpServersQueryKey(teamId),
      });
    },
  });

  return {
    mcpServers: query.data ?? [],
    isLoading: Boolean(teamId) ? query.isFetching || query.isLoading : false,
    error: query.error,
    createMcpServer,
    updateMcpServer,
    deleteMcpServer,
    toggleMcpServer,
    updateHealthStatus,
  };
}
