import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/supabase";
import { teamSettingsQueryKey } from "@/lib/react-query/queryKeys";
import { useActiveTeam } from "@/contexts/TeamContext";

export type TeamSettingsMap = Partial<
  Record<
    Database["public"]["Enums"]["team_setting_key"],
    Database["public"]["Enums"]["team_setting_value"]
  >
>;

export function useTeamSettings() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.id ?? null;

  const query = useQuery({
    queryKey: teamSettingsQueryKey(teamId),
    queryFn: async () => {
      if (!teamId) return {};

      const { data, error } = await supabase
        .from("team_settings")
        .select("setting_key, setting_value")
        .eq("team_id", teamId);

      if (error) {
        return {};
      }

      return (data ?? []).reduce<TeamSettingsMap>((acc, setting) => {
        acc[setting.setting_key] = setting.setting_value;
        return acc;
      }, {});
    },
    enabled: Boolean(teamId),
    staleTime: 3 * 60 * 1000,
  });

  return {
    settings: query.data ?? {},
    isLoading: Boolean(teamId) ? query.isFetching || query.isLoading : false,
  };
}
