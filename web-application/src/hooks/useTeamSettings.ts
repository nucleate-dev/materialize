import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/supabase";
import { teamSettingsQueryKey } from "@/lib/react-query/queryKeys";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useSubscriptionAccess } from "./useSubscriptionAccess";

type TeamSettingKey = Database["public"]["Enums"]["team_setting_key"];
type TeamSettingValue = Database["public"]["Enums"]["team_setting_value"];
type TeamRole = Database["public"]["Enums"]["team_role"];

type RawTeamSettings = Partial<Record<TeamSettingKey, TeamSettingValue>>;

export type TeamSettingDetails = {
  value: TeamSettingValue;
  is_editing_disabled: boolean;
  editing_disabled_user_message: string | null;
};

export type TeamSettings = Record<TeamSettingKey, TeamSettingDetails>;

const TEAM_SETTING_KEYS: TeamSettingKey[] = ["block_public_prototypes"];

interface TeamSettingContext {
  userPlan: string | null | undefined;
  membershipRole: TeamRole | null | undefined;
}

export function useTeamSettings() {
  const { activeTeam, currentUserMembership } = useActiveTeam();
  const { userPlan } = useSubscriptionAccess();
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

      return (data ?? []).reduce<RawTeamSettings>((acc, setting) => {
        acc[setting.setting_key] = setting.setting_value;
        return acc;
      }, {});
    },
    enabled: Boolean(teamId),
    staleTime: 3 * 60 * 1000,
  });

  const context: TeamSettingContext = {
    userPlan,
    membershipRole: currentUserMembership?.role,
  };

  const rawSettings =
    Boolean(teamId) && query.data ? query.data : ({} as RawTeamSettings);

  return {
    settings: buildTeamSettingsWithDefaults(rawSettings, context),
    isLoading: Boolean(teamId) ? query.isFetching || query.isLoading : false,
  };
}

function buildTeamSettingsWithDefaults(
  rawSettings: RawTeamSettings,
  context: TeamSettingContext,
): TeamSettings {
  return TEAM_SETTING_KEYS.reduce<TeamSettings>((acc, key) => {
    const value = rawSettings[key] ?? getDefaultTeamSettingValue(key);
    acc[key] = getTeamSettingDetails(key, value, context);
    return acc;
  }, {} as TeamSettings);
}

function getTeamSettingDetails(
  key: TeamSettingKey,
  value: TeamSettingValue,
  context: TeamSettingContext,
): TeamSettingDetails {
  switch (key) {
    case "block_public_prototypes":
      return getBlockPublicPrototypesDetails(value, context);
    default:
      return {
        value,
        is_editing_disabled: false,
        editing_disabled_user_message: null,
      };
  }
}

function getDefaultTeamSettingValue(
  settingKey: TeamSettingKey,
): TeamSettingValue {
  switch (settingKey) {
    case "block_public_prototypes":
      return "team_setting_generic_value_false";
    default:
      return "team_setting_generic_value_false";
  }
}

function getBlockPublicPrototypesDetails(
  value: TeamSettingValue,
  context: TeamSettingContext,
): TeamSettingDetails {
  if (context.userPlan !== "team") {
    return {
      value,
      is_editing_disabled: true,
      editing_disabled_user_message: "Upgrade to team plan to change this setting",
    };
  }

  const role = context.membershipRole;
  const isAdminOrOwner = role === "admin" || role === "owner";

  if (!isAdminOrOwner) {
    return {
      value,
      is_editing_disabled: true,
      editing_disabled_user_message: "Only admins and owners can change this setting",
    };
  }

  return {
    value,
    is_editing_disabled: false,
    editing_disabled_user_message: null,
  };
}
