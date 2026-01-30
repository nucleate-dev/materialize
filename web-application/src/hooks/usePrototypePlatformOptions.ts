import { Database } from "@/lib/types/supabase";
import { useState } from "react";
import { Globe, Smartphone, LucideIcon } from "lucide-react";

export type PrototypeFramework = Database["public"]["Enums"]["prototype_framework"];

export interface PlatformOption {
  value: PrototypeFramework;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface UsePrototypePlatformOptionsReturn {
  platformOptions: PlatformOption[];
  framework: PrototypeFramework;
  setFramework: (value: PrototypeFramework) => void;
  isWebFramework: boolean;
  isMobileFramework: boolean;
}

export const DEFAULT_FRAMEWORK: PrototypeFramework = "web_vite_react";

export const PLATFORM_OPTIONS: PlatformOption[] = [
  {
    value: "web_vite_react",
    label: "Web",
    description: "Build responsive web apps with React and Vite",
    icon: Globe,
  },
  {
    value: "mobile_expo_react_native",
    label: "Mobile (beta)",
    description: "Create native iOS and Android apps with Expo and React Native",
    icon: Smartphone,
  },
];

/**
 * Hook to manage prototype platform/framework options and state
 *
 * Handles:
 * - Platform options with icons, labels, and descriptions
 * - Framework state management
 * - Helper booleans for checking current framework type
 *
 * @param initialFramework - Optional initial framework, defaults to web_vite_react
 * @returns Platform options, state, and helpers
 */
export function usePrototypePlatformOptions(
  initialFramework: PrototypeFramework = DEFAULT_FRAMEWORK
): UsePrototypePlatformOptionsReturn {
  const [framework, setFramework] = useState<PrototypeFramework>(initialFramework);

  const isWebFramework =
    framework === "web_nextjs_react" || framework === "web_vite_react";
  const isMobileFramework = framework === "mobile_expo_react_native";

  return {
    platformOptions: PLATFORM_OPTIONS,
    framework,
    setFramework,
    isWebFramework,
    isMobileFramework,
  };
}
