import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/supabase";
import { prototypeAiConfigOverridesQueryKey } from "@/lib/react-query/queryKeys";

type ConfigOverride =
  Database["public"]["Tables"]["prototype_ai_config_overrides"]["Row"];
type ConfigOverrideInsert =
  Database["public"]["Tables"]["prototype_ai_config_overrides"]["Insert"];

type ConfigType = "skill" | "subagent" | "mcp_server";

export function usePrototypeAiConfigOverrides(prototypeId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: prototypeAiConfigOverridesQueryKey(prototypeId),
    queryFn: async () => {
      if (!prototypeId) return [];

      const { data, error } = await supabase
        .from("prototype_ai_config_overrides")
        .select("*")
        .eq("prototype_id", prototypeId);

      if (error) {
        console.error("Failed to fetch AI config overrides:", error);
        return [];
      }

      return data ?? [];
    },
    enabled: Boolean(prototypeId),
    staleTime: 3 * 60 * 1000,
  });

  const setOverride = useMutation({
    mutationFn: async ({
      configType,
      configId,
      isEnabled,
    }: {
      configType: ConfigType;
      configId: string;
      isEnabled: boolean;
    }) => {
      if (!prototypeId) throw new Error("No prototype selected");

      // Upsert the override
      const { data, error } = await supabase
        .from("prototype_ai_config_overrides")
        .upsert(
          {
            prototype_id: prototypeId,
            config_type: configType,
            config_id: configId,
            is_enabled: isEnabled,
          },
          {
            onConflict: "prototype_id,config_type,config_id",
          }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: prototypeAiConfigOverridesQueryKey(prototypeId),
      });
    },
  });

  const removeOverride = useMutation({
    mutationFn: async ({
      configType,
      configId,
    }: {
      configType: ConfigType;
      configId: string;
    }) => {
      if (!prototypeId) throw new Error("No prototype selected");

      const { error } = await supabase
        .from("prototype_ai_config_overrides")
        .delete()
        .eq("prototype_id", prototypeId)
        .eq("config_type", configType)
        .eq("config_id", configId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: prototypeAiConfigOverridesQueryKey(prototypeId),
      });
    },
  });

  // Helper to check if a config has an override
  const getOverride = (
    configType: ConfigType,
    configId: string
  ): boolean | null => {
    const override = query.data?.find(
      (o) => o.config_type === configType && o.config_id === configId
    );
    return override ? override.is_enabled : null;
  };

  // Helper to determine effective enabled state (override takes precedence)
  const isEffectivelyEnabled = (
    configType: ConfigType,
    configId: string,
    teamDefault: boolean
  ): boolean => {
    const override = getOverride(configType, configId);
    return override !== null ? override : teamDefault;
  };

  return {
    overrides: query.data ?? [],
    isLoading: Boolean(prototypeId)
      ? query.isFetching || query.isLoading
      : false,
    error: query.error,
    setOverride,
    removeOverride,
    getOverride,
    isEffectivelyEnabled,
  };
}
