"use client";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/classNames";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useUserTeams } from "@/hooks/useUserTeams";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useCreditUsage } from "@/hooks/useCreditUsage";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import {
  ChevronDown,
  Settings,
  UserPlus,
  Zap,
  Check,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/ClientConstants";
import { SubscriptionStatuses } from "@/GlobalConstants";

interface TeamSelectorProps {
  isCollapsed?: boolean;
  onOpenSettings?: (
    tab: "profile" | "credits" | "claude" | "team" | "people",
  ) => void;
}

export function TeamSelector({
  isCollapsed = false,
  onOpenSettings,
}: TeamSelectorProps) {
  const router = useRouter();
  const logger = useProductLogger();
  const { activeTeam, setActiveTeam, teamMembers, signedAvatarUrl } = useActiveTeam();
  const { teams, isLoading: teamsLoading } = useUserTeams();
  const { userPlan, loadingSubscriptionData } = useSubscriptionAccess();
  const {
    creditsRemaining,
    totalAvailableCredits,
    loading: creditsLoading,
  } = useCreditUsage();

  const isFree = userPlan === "free";
  const [teamSubscriptions, setTeamSubscriptions] = useState<
    Record<string, string>
  >({});

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
  const usagePercentage =
    totalAvailableCredits > 0
      ? ((totalAvailableCredits - creditsRemaining) / totalAvailableCredits) *
        100
      : 0;

  // Get initials for avatar
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

  // Check if active team is a personal team
  const isPersonalTeam = activeTeam?.personal_owner_user_id !== null;

  const handleUpgrade = () => {
    logger.log({
      event: "client_dashboard_sidebar_item_clicked",
      properties: {
        component: "TeamSelector",
        item: "upgrade",
        current_plan: userPlan,
        target_plan: "plus",
      },
    });
    if (!activeTeam?.id) return;
    void handleCheckout("plus", router, activeTeam?.id);
  };

  const handleSettings = () => {
    logger.log({
      event: "client_dashboard_settings_clicked",
      properties: {
        component: "TeamSelector",
      },
    });
    onOpenSettings?.("team");
  };

  const handleInviteMembers = () => {
    logger.log({
      event: "client_dashboard_sidebar_item_clicked",
      properties: {
        component: "TeamSelector",
        item: "invite_members",
      },
    });
    onOpenSettings?.("people");
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip={isCollapsed ? teamName : undefined}
              className={cn(
                "h-auto border border-sidebar-border bg-sidebar-accent/50 hover:bg-sidebar-accent",
                isCollapsed
                  ? "justify-center py-1 px-0"
                  : "justify-between py-1.5",
              )}
            >
              {isCollapsed ? (
                <Avatar className="w-8 h-8 rounded-lg">
                  <AvatarImage src={signedAvatarUrl || undefined} />
                  <AvatarFallback className="rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {teamInitials}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="w-8 h-8 rounded-lg shrink-0">
                      <AvatarImage src={signedAvatarUrl || undefined} />
                      <AvatarFallback className="rounded-lg bg-primary/10 text-sm font-bold text-primary">
                        {teamInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">
                      {teamName}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                </>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="right"
            align="start"
            className="w-[480px] p-0 bg-sidebar border-sidebar-border"
          >
            {/* Team Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <Avatar className="w-14 h-14 rounded-xl">
                  <AvatarImage src={signedAvatarUrl || undefined} />
                  <AvatarFallback className="rounded-xl bg-primary/10 text-xl font-bold text-primary">
                    {teamInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-lg font-semibold">{teamName}</div>
                  <p className="text-sm text-muted-foreground">
                    {isFree ? "Free Plan" : `${userPlan} Plan`} •{" "}
                    {teamMembers.length}{" "}
                    {teamMembers.length === 1 ? "member" : "members"}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 space-y-4">
              {/* Settings and Invite buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleSettings}
                  className="flex-1"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
                <Button
                  variant="outline"
                  onClick={handleInviteMembers}
                  className="flex-1"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite members
                </Button>
              </div>

              {/* Upgrade section (only for free users) */}
              {isFree && !loadingSubscriptionData && (
                <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-500" />
                      <span className="font-semibold text-sm">Turn Pro</span>
                    </div>
                    <Button
                      onClick={handleUpgrade}
                      size="sm"
                      className="bg-primary hover:bg-primary/90"
                    >
                      Upgrade
                    </Button>
                  </div>
                </div>
              )}

              {/* Credits section */}
              {!creditsLoading && (
                <button
                  onClick={() => {
                    logger.log({
                      event: "client_dashboard_sidebar_item_clicked",
                      properties: {
                        component: "TeamSelector",
                        item: "credits",
                      },
                    });
                    onOpenSettings?.("credits");
                  }}
                  className="w-full bg-accent/50 rounded-lg p-4 space-y-3 hover:bg-accent/70 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Credits</span>
                    <div className="flex items-center gap-1 text-sm">
                      <span className="font-semibold">{creditsRemaining}</span>
                      <span className="text-muted-foreground">left</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                  <Progress value={usagePercentage} className="h-2" />
                  {isFree && (
                    <p className="text-xs text-muted-foreground">
                      Daily credits reset at midnight UTC
                    </p>
                  )}
                </button>
              )}

              {/* All workspaces section */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  All workspaces
                </h3>
                <div className="space-y-1">
                  {teams.map((team) => {
                    const isActive = activeTeam?.id === team.id;
                    const teamInitialsLocal = getInitials(team.name);
                    const isPersonal = team.personal_owner_user_id !== null;
                    const teamPlan = teamSubscriptions[team.id] || "free";
                    const teamIsFree = teamPlan === "free";

                    return (
                      <button
                        key={team.id}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors"
                        onClick={() => {
                          logger.log({
                            event: "client_dashboard_sidebar_item_clicked",
                            properties: {
                              component: "TeamSelector",
                              item: "switch_team",
                              team_id: team.id,
                              is_personal: isPersonal,
                            },
                          });
                          setActiveTeam(team);
                        }}
                      >
                        <Avatar className="w-8 h-8 rounded-lg shrink-0">
                          <AvatarFallback className="rounded-lg bg-primary/10 text-sm font-bold text-primary">
                            {teamInitialsLocal}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {team.name}
                            </span>
                            {teamIsFree && (
                              <Badge variant="secondary" className="text-xs">
                                FREE
                              </Badge>
                            )}
                            {!teamIsFree && (
                              <Badge
                                variant="secondary"
                                className="text-xs uppercase"
                              >
                                {teamPlan}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {isActive && <Check className="w-4 h-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Create new workspace button */}
              <Button
                variant="outline"
                className="w-full justify-start"
                disabled={isFree}
                onClick={() => {
                  if (!isFree) {
                    logger.log({
                      event: "client_dashboard_sidebar_item_clicked",
                      properties: {
                        component: "TeamSelector",
                        item: "create_team",
                      },
                    });
                    // TODO: Implement create workspace functionality
                  }
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create new team
                {isFree && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    PLUS
                  </Badge>
                )}
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
