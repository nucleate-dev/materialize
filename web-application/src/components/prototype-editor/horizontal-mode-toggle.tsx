"use client";

import * as React from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classNames";

interface HorizontalModeToggleProps {
  sidebarExpanded?: boolean;
}

export function HorizontalModeToggle({
  sidebarExpanded = true,
}: HorizontalModeToggleProps) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("dark");
    } else if (theme === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  };

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
    <Button
      variant="ghost"
      onClick={toggleTheme}
      className={cn(
        "w-full justify-start gap-3 h-auto py-3",
        !sidebarExpanded && "justify-center",
      )}
    >
      <SunIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <MoonIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      {sidebarExpanded && <span>{getThemeLabel()}</span>}
    </Button>
  );
}
