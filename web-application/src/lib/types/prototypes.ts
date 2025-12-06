import { Database } from "./supabase";

export type PrototypeVisibility =
  Database["public"]["Enums"]["visibility_level"];

export const normalizePrototypeVisibility = (
  visibility?: string | null,
): PrototypeVisibility => {
  const lower = visibility?.toString().toLowerCase();
  if (lower === "private" || lower === "self") {
    return "SELF";
  }
  if (lower === "team_subset" || lower === "unlisted") {
    return "TEAM_SUBSET";
  }
  if (lower === "team") {
    return "TEAM";
  }
  return "PUBLIC";
};
