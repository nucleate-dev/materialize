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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  X,
  User,
  CreditCard,
  Key,
  Users,
  LogOut,
  ChevronDown,
  Check,
  Plus,
  Github,
} from "lucide-react";
import { useCustomUserRow } from "@/hooks/useCustomUserRow";
import { usePostHog } from "posthog-js/react";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useUserTeams } from "@/hooks/useUserTeams";
import { logout } from "@/lib/utils/auth/SupabaseAuthUtils";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/ClientConstants";
import { SubscriptionStatuses } from "@/GlobalConstants";
import { ProfileTab } from "./ProfileTab";
import { ClaudeConnectionTab } from "./ClaudeConnectionTab";
import { CreditsAndSubscriptionsTab } from "./CreditsAndSubscriptionsTab";
import { TeamTab } from "./TeamTab";
import { PeopleTab } from "./PeopleTab";
import { GitHubIntegrationTab } from "./GitHubIntegrationTab";

type SettingsTab =
  | "profile"
  | "credits"
  | "claude"
  | "team"
  | "people"
  | "github";

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
  const { activeTeam, setActiveTeam } = useActiveTeam();
  const { teams } = useUserTeams();
  const posthog = usePostHog();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);
  const [teamSubscriptions, setTeamSubscriptions] = useState<
    Record<string, string>
  >({});

  const isClaudeConnectionEnabled =
    posthog?.isFeatureEnabled("claude-code-cli-with-personal-token") ?? false;

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

  // Fetch subscriptions for all teams
  useEffect(() => {
    async function fetchTeamSubscriptions() {
      if (teams.length === 0) return;

      const teamIds = teams.map((team) => team.id);
      const nowInSeconds = Math.floor(Date.now() / 1000);

      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select("team_id, plan_id, current_period_start, current_period_end")
        .in("team_id", teamIds)
        .eq("status", SubscriptionStatuses.ACTIVE)
        .lte("current_period_start", nowInSeconds)
        .gte("current_period_end", nowInSeconds);

      const subscriptionMap: Record<string, string> = {};

      // Process subscriptions and validate they're currently active
      subscriptions?.forEach((sub) => {
        if (sub.plan_id && sub.team_id) {
          subscriptionMap[sub.team_id] = sub.plan_id;
        }
      });

      // Set free plan for teams without active subscriptions
      teams.forEach((team) => {
        if (!subscriptionMap[team.id]) {
          subscriptionMap[team.id] = "free";
        }
      });

      setTeamSubscriptions(subscriptionMap);
    }

    fetchTeamSubscriptions();
  }, [teams]);

  const handleLogout = async () => {
    const error = await logout();
    if (error) {
      alert("Failed to log out. Please try again.");
    } else {
      onOpenChange(false);
      router.push("/");
    }
  };

  interface TabGroup {
    label: string;
    tabs: {
      id: SettingsTab;
      label: string;
      icon: typeof User;
      isTeamTab?: boolean;
    }[];
  }

  const tabGroups: TabGroup[] = [
    {
      label: "Team",
      tabs: [
        { id: "team", label: teamName, icon: User, isTeamTab: true },
        {
          id: "credits",
          label: "Credits and subscriptions",
          icon: CreditCard,
        },
        { id: "people", label: "People", icon: Users },
        {
          id: "github" as const,
          label: "GitHub",
          icon: Github,
        },
      ],
    },
    {
      label: "Account",
      tabs: [
        { id: "profile", label: userRow?.name || "Profile", icon: User },
        ...(isClaudeConnectionEnabled
          ? [
              {
                id: "claude" as const,
                label: "Claude connection",
                icon: Key,
              },
            ]
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
          className="fixed max-w-none w-[90vw] h-[90vh] p-0 border border-black/10 dark:border-border rounded-lg flex bg-background"
        >
          {/* Dialog Sidebar */}
          <div className="w-64 border-r border-border bg-muted/30 flex flex-col">
            {/* Tabs */}
            <div className="flex-1 p-2 space-y-4">
              {/* Team Selector Dropdown */}
              <div className="mb-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-sidebar-border bg-sidebar-accent/50 hover:bg-sidebar-accent transition-colors">
                      <Avatar className="w-6 h-6 rounded-lg shrink-0">
                        <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-bold text-primary">
                          {teamInitials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-sm font-medium text-left truncate">
                        {teamName}
                      </span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[240px] p-2">
                    <div className="space-y-1">
                      {teams.map((team) => {
                        const isActive = activeTeam?.id === team.id;
                        const teamInitialsLocal = getInitials(team.name);
                        const teamPlan = teamSubscriptions[team.id] || "free";
                        const teamIsFree = teamPlan === "free";

                        return (
                          <button
                            key={team.id}
                            className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent/50 transition-colors"
                            onClick={() => {
                              setActiveTeam(team);
                            }}
                          >
                            <Avatar className="w-6 h-6 rounded-lg shrink-0">
                              <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-bold text-primary">
                                {teamInitialsLocal}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 text-left min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium truncate">
                                  {team.name}
                                </span>
                                {teamIsFree ? (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1 py-0 shrink-0"
                                  >
                                    FREE
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1 py-0 uppercase shrink-0"
                                  >
                                    {teamPlan}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {isActive && (
                              <Check className="w-4 h-4 text-primary shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Create new team button */}
                    <div className="border-t border-border pt-2">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-sm"
                        onClick={() => {
                          router.push("/teams/create");
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create new team
                      </Button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

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
                              className={
                                tab.isTeamTab ? "h-auto min-h-[2rem] py-2" : ""
                              }
                            >
                              {tab.isTeamTab ? (
                                <>
                                  <Avatar className="w-4 h-4 rounded shrink-0">
                                    <AvatarFallback className="rounded bg-primary/10 text-[10px] font-bold text-primary">
                                      {teamInitials}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="flex-1">{tab.label}</span>
                                  {activeTeam?.personal_owner_user_id && (
                                    <Badge
                                      variant="secondary"
                                      className="ml-auto text-[10px] px-1.5 py-0 shrink-0"
                                    >
                                      Personal
                                    </Badge>
                                  )}
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
              {activeTab === "github" && <GitHubIntegrationTab />}
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
