"use client";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/classNames";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { TeamSelectorDialog } from "./TeamSelectorDialog";

interface TeamSelectorProps {
  isCollapsed?: boolean;
}

export function TeamSelector({ isCollapsed = false }: TeamSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const teamName = "Personal"; // For now, we'll use a default name
  const teamInitials = getInitials(teamName);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => setDialogOpen(true)}
            tooltip={isCollapsed ? teamName : undefined}
            className={cn(
              "h-auto border border-sidebar-border bg-sidebar-accent/50 hover:bg-sidebar-accent",
              isCollapsed ? "justify-center py-1" : "justify-between py-1.5",
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary">
                  {teamInitials}
                </span>
              </div>
              {!isCollapsed && (
                <span className="text-sm font-medium truncate">{teamName}</span>
              )}
            </div>
            {!isCollapsed && (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <TeamSelectorDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
