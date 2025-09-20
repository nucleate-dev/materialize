"use client";

import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/classNames";

interface HorizontalModeToggleProps {
  sidebarExpanded?: boolean;
}

export function HorizontalModeToggle({
  sidebarExpanded = true,
}: HorizontalModeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

  // Don't render theme-specific content until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <SidebarMenuButton
        size="lg"
        className={cn(
          "w-full justify-start gap-3",
          !sidebarExpanded && "justify-center",
        )}
        disabled
      >
        <SunIcon className="h-[1.2rem] w-[1.2rem]" />
        {sidebarExpanded && <span>System</span>}
      </SidebarMenuButton>
    );
  }

  const getThemeLabel = () => {
    switch (theme) {
      case "light":
        return "Light";
      case "dark":
        return "Dark";
      default:
        return "System";
    }
  };

  return (
    <SidebarMenuButton
      onClick={toggleTheme}
      size="lg"
      className={cn(
        "w-full justify-start gap-3",
        !sidebarExpanded && "justify-center",
      )}
    >
      <SunIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <MoonIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      {sidebarExpanded && <span>{getThemeLabel()}</span>}
    </SidebarMenuButton>
  );
}
