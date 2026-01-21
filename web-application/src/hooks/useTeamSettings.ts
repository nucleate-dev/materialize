import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/supabase";
import { teamSettingsQueryKey } from "@/lib/react-query/queryKeys";
import { useActiveTeam } from "@/contexts/TeamContext";

type TeamSettingKey = Database["public"]["Enums"]["team_setting_key"];
type TeamSettingValue = Database["public"]["Enums"]["team_setting_value"];

export type TeamSettings = Record<TeamSettingKey, TeamSettingValue>;

const TEAM_SETTING_KEYS: TeamSettingKey[] = ["block_public_prototypes"];

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

      const dbSettings = (data ?? []).reduce<
        Partial<Record<TeamSettingKey, TeamSettingValue>>
      >((acc, setting) => {
        acc[setting.setting_key] = setting.setting_value;
        return acc;
      }, {});

      return TEAM_SETTING_KEYS.reduce<TeamSettings>((acc, key) => {
        acc[key] = dbSettings[key] ?? getDefaultTeamSettingValue(key);
        return acc;
      }, {} as TeamSettings);
    },
    enabled: Boolean(teamId),
    staleTime: 3 * 60 * 1000,
  });

  return {
    settings: query.data ?? getTeamSettingsDefaults(),
    isLoading: Boolean(teamId) ? query.isFetching || query.isLoading : false,
  };
}

function getTeamSettingsDefaults(): TeamSettings {
  return TEAM_SETTING_KEYS.reduce<TeamSettings>((acc, key) => {
    acc[key] = getDefaultTeamSettingValue(key);
    return acc;
  }, {} as TeamSettings);
}

function getDefaultTeamSettingValue(
  settingKey: TeamSettingKey,
): TeamSettingValue {
  switch (settingKey) {
    case "block_public_prototypes":
      return "team_settings_false";
    default:
      return "team_settings_false";
  }
}
