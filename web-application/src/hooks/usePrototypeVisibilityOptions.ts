import { Database } from "@/lib/types/supabase";
import { useSubscriptionAccess } from "./useSubscriptionAccess";
import { useState } from "react";

export type PrototypeVisibility = Database["public"]["Enums"]["visibility_level"];

export interface VisibilityOption {
  value: PrototypeVisibility;
  label: string;
  description: string;
  isLocked: boolean;
}

export interface UsePrototypeVisibilityOptionsReturn {
  visibilityOptions: VisibilityOption[];
  visibility: PrototypeVisibility;
  handleVisibilityChange: (value: PrototypeVisibility) => void;
  showUpsellModal: boolean;
  setShowUpsellModal: (show: boolean) => void;
}

/**
 * Hook to manage prototype visibility options and state
 *
 * Handles:
 * - Free users: defaults to PUBLIC, shows lock icons on TEAM/SELF
 * - Paid users: defaults to TEAM, all options unlocked
 * - Shows upsell modal when free users try to select locked options
 *
 * @returns Visibility options, state, and handlers
 */
export function usePrototypeVisibilityOptions(): UsePrototypeVisibilityOptionsReturn {
  const { userPlan } = useSubscriptionAccess();
  const isFreePlan = userPlan === "free";

  // Default visibility: PUBLIC for free users, TEAM for paid users
  const defaultVisibility: PrototypeVisibility = isFreePlan ? "PUBLIC" : "TEAM";

  const [visibility, setVisibility] = useState<PrototypeVisibility>(defaultVisibility);
  const [showUpsellModal, setShowUpsellModal] = useState(false);

  const visibilityOptions: VisibilityOption[] = [
    {
      value: "PUBLIC",
      label: "Public",
      description: "Anyone with the link can view",
      isLocked: false,
    },
    {
      value: "TEAM",
      label: "Team",
      description: "Only team members can view",
      isLocked: isFreePlan,
    },
    {
      value: "SELF",
      label: "Private",
      description: "Only you can view",
      isLocked: isFreePlan,
    },
  ];

  const handleVisibilityChange = (value: PrototypeVisibility) => {
    // Check if trying to select a locked option
    if (isFreePlan && (value === "SELF" || value === "TEAM")) {
      setShowUpsellModal(true);
      return;
    }

    setVisibility(value);
  };

  return {
    visibilityOptions,
    visibility,
    handleVisibilityChange,
    showUpsellModal,
    setShowUpsellModal,
  };
}
