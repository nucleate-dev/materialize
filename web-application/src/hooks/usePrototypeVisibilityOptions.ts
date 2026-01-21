import { Database } from "@/lib/types/supabase";

export type PrototypeVisibility = Database["public"]["Enums"]["visibility_level"];

export interface VisibilityOption {
  value: PrototypeVisibility;
  label: string;
  description: string;
}

/**
 * Hook to get available prototype visibility options
 *
 * @returns Array of visibility options with value, label, and description
 */
export function usePrototypeVisibilityOptions(): VisibilityOption[] {
  // For now, return a static list of visibility options
  // In the future, this could be filtered based on user subscription plan
  return [
    {
      value: "PUBLIC",
      label: "Public",
      description: "Anyone with the link can view",
    },
    {
      value: "TEAM",
      label: "Team",
      description: "Only team members can view",
    },
    {
      value: "SELF",
      label: "Private",
      description: "Only you can view",
    },
  ];
}
