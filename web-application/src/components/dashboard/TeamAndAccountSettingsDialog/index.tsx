"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { X, User, CreditCard, Key, Users, LogOut } from "lucide-react";
import { useCustomUserRow } from "@/hooks/useCustomUserRow";
import { usePostHog } from "posthog-js/react";
import { useActiveTeam } from "@/contexts/TeamContext";
import { logout } from "@/lib/utils/auth/SupabaseAuthUtils";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ProfileTab } from "./ProfileTab";
import { ClaudeConnectionTab } from "./ClaudeConnectionTab";
import { CreditsAndSubscriptionsTab } from "./CreditsAndSubscriptionsTab";
import { TeamTab } from "./TeamTab";
import { PeopleTab } from "./PeopleTab";

type SettingsTab = "profile" | "credits" | "claude" | "team" | "people";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: SettingsTab;
}

export function TeamAndAccountsSettingsDialog({
  open,
  onOpenChange,
  defaultTab = "profile",
}: SettingsDialogProps) {
  const { userRow } = useCustomUserRow();
  const { activeTeam } = useActiveTeam();
  const posthog = usePostHog();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  const isClaudeConnectionEnabled =
    posthog?.isFeatureEnabled("claude-code-cli-with-personal-token") ?? false;
  const isTeamsUIEnabled = posthog?.isFeatureEnabled("teams-ui") ?? false;

  // Get initials for team avatar
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const teamName = activeTeam?.name || "Team";
  const teamInitials = getInitials(teamName);

  // Update active tab when dialog opens with a new defaultTab
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  const handleLogout = async () => {
    const error = await logout();
    if (error) {
      console.error("Logout failed:", error.message);
      alert("Failed to log out. Please try again.");
    } else {
      onOpenChange(false);
      router.push("/");
    }
  };

  interface TabGroup {
    label: string;
    tabs: { id: SettingsTab; label: string; icon: typeof User; isTeamTab?: boolean }[];
  }

  const tabGroups: TabGroup[] = isTeamsUIEnabled
    ? [
        {
          label: "Team",
          tabs: [
            { id: "team", label: teamName, icon: User, isTeamTab: true },
            { id: "credits", label: "Credits and subscriptions", icon: CreditCard },
            { id: "people", label: "People", icon: Users },
          ],
        },
        {
          label: "Account",
          tabs: [
            { id: "profile", label: userRow?.name || "Profile", icon: User },
            ...(isClaudeConnectionEnabled
              ? [{ id: "claude" as const, label: "Claude connection", icon: Key }]
              : []),
          ],
        },
      ]
    : [
        {
          label: "Account",
          tabs: [
            { id: "profile", label: userRow?.name || "Profile", icon: User },
            { id: "credits", label: "Credits and subscriptions", icon: CreditCard },
            ...(isClaudeConnectionEnabled
              ? [{ id: "claude" as const, label: "Claude connection", icon: Key }]
              : []),
          ],
        },
      ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60" />
        <DialogContent
          hideCloseButton
          className="fixed max-w-none w-[90vw] h-[90vh] p-0 border border-black/10 dark:border-white/10 rounded-lg flex bg-background"
        >
          {/* Dialog Sidebar */}
          <div className="w-64 border-r border-border bg-muted/30 flex flex-col">
            {/* Tabs */}
            <div className="flex-1 p-2 space-y-4">
              {tabGroups.map((group) => (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                          <SidebarMenuItem key={tab.id}>
                            <SidebarMenuButton
                              isActive={activeTab === tab.id}
                              onClick={() => setActiveTab(tab.id)}
                            >
                              {tab.isTeamTab ? (
                                <>
                                  <Avatar className="w-4 h-4 rounded">
                                    <AvatarFallback className="rounded bg-primary/10 text-[10px] font-bold text-primary">
                                      {teamInitials}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span>{tab.label}</span>
                                </>
                              ) : (
                                <>
                                  <Icon />
                                  <span>{tab.label}</span>
                                </>
                              )}
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </div>

            {/* Logout Button */}
            <div className="p-2 border-t border-border">
              <Button
                variant="ghost"
                className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Log out
              </Button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-auto relative">
            {/* Close button */}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-6 top-6 z-10"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>

            {/* Content */}
            <div className="h-full">
              {activeTab === "profile" && <ProfileTab />}
              {activeTab === "credits" && <CreditsAndSubscriptionsTab />}
              {activeTab === "claude" && <ClaudeConnectionTab />}
              {activeTab === "team" && <TeamTab />}
              {activeTab === "people" && <PeopleTab />}
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
