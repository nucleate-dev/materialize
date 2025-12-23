import { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_FLAGS, FeatureFlags, FlagName } from "../FLAGS.js";
import { SystemLogger } from "../loggers/SystemLogger.js";
import { Database } from "../types/supabase.js";

type FlagRow = {
  flag_name: string;
  is_enabled: boolean | null;
};

export class FlagsService {
  /**
   * Load feature flags from Supabase, merging into the provided base flags.
   * Unknown flags are ignored; on error, the base flags are returned.
   */
  public static async loadFlags(
    supabaseClient: SupabaseClient<Database>,
    logger: SystemLogger,
    baseFlags: FeatureFlags = DEFAULT_FLAGS,
  ): Promise<FeatureFlags> {
    try {
      const { data, error } = await supabaseClient
        .from("flags")
        .select("flag_name, is_enabled");

      if (error) {
        logger.warn(
          "Failed to load feature flags from Supabase - using defaults",
          { error },
        );
        return { ...baseFlags };
      }

      if (!data) {
        return { ...baseFlags };
      }

      const updatedFlags = FlagsService.applyRowsToFlags(data, baseFlags);

      logger.consoleLogDevOnly("info", "Feature flags refreshed", {
        featureFlags: updatedFlags,
      });

      return updatedFlags;
    } catch (error) {
      logger.warn("Unexpected error refreshing feature flags from Supabase", {
        error,
      });
      return { ...baseFlags };
    }
  }

  /**
   * Apply Supabase rows onto the base flags, ignoring unknown flag names.
   */
  public static applyRowsToFlags(
    rows: FlagRow[],
    baseFlags: FeatureFlags,
  ): FeatureFlags {
    const updatedFlags: FeatureFlags = { ...baseFlags };

    for (const row of rows) {
      const flagName = row.flag_name as FlagName;
      if (flagName in updatedFlags && typeof row.is_enabled === "boolean") {
        updatedFlags[flagName] = row.is_enabled;
      }
    }

    return updatedFlags;
  }
}
