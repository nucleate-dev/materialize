"use client";

import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  // Don't render theme-specific content until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <SidebarMenuButton
        className={cn(
          "w-full justify-start",
          !sidebarExpanded && "justify-center",
        )}
        disabled
      >
        <Sun className="h-4 w-4" />
        {sidebarExpanded && <span>Theme</span>}
      </SidebarMenuButton>
    );
  }

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <Sun className="h-4 w-4" />;
      case "dark":
        return <Moon className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          tooltip={!sidebarExpanded ? "Theme" : undefined}
          className={cn(
            "w-full",
            sidebarExpanded ? "justify-between" : "justify-center",
          )}
        >
          <div className="flex items-center gap-2">
            {getThemeIcon()}
            {sidebarExpanded && <span>{getThemeLabel()}</span>}
          </div>
          {sidebarExpanded && (
            <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/50" />
          )}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="h-4 w-4 mr-2" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="h-4 w-4 mr-2" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="h-4 w-4 mr-2" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
