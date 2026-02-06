import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/supabase";
import { teamSkillsQueryKey } from "@/lib/react-query/queryKeys";
import { useActiveTeam } from "@/contexts/TeamContext";

type TeamSkill = Database["public"]["Tables"]["team_skills"]["Row"];
type TeamSkillInsert = Database["public"]["Tables"]["team_skills"]["Insert"];
type TeamSkillUpdate = Database["public"]["Tables"]["team_skills"]["Update"];

export function useTeamSkills() {
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();
  const teamId = activeTeam?.id ?? null;

  const query = useQuery({
    queryKey: teamSkillsQueryKey(teamId),
    queryFn: async () => {
      if (!teamId) return [];

      const { data, error } = await supabase
        .from("team_skills")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch team skills:", error);
        return [];
      }

      return data ?? [];
    },
    enabled: Boolean(teamId),
    staleTime: 3 * 60 * 1000,
  });

  const createSkill = useMutation({
    mutationFn: async (skill: Omit<TeamSkillInsert, "team_id">) => {
      if (!teamId) throw new Error("No team selected");

      const { data, error } = await supabase
        .from("team_skills")
        .insert({ ...skill, team_id: teamId })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamSkillsQueryKey(teamId) });
    },
  });

  const updateSkill = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: TeamSkillUpdate;
    }) => {
      const { data, error } = await supabase
        .from("team_skills")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamSkillsQueryKey(teamId) });
    },
  });

  const deleteSkill = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_skills").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamSkillsQueryKey(teamId) });
    },
  });

  const toggleSkill = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const { data, error } = await supabase
        .from("team_skills")
        .update({ is_enabled: isEnabled })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamSkillsQueryKey(teamId) });
    },
  });

  return {
    skills: query.data ?? [],
    isLoading: Boolean(teamId) ? query.isFetching || query.isLoading : false,
    error: query.error,
    createSkill,
    updateSkill,
    deleteSkill,
    toggleSkill,
  };
}
