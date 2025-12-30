"use client";

import { useState, useMemo, useEffect } from "react";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useUser } from "@/hooks/useUser";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { supabase } from "@/ClientConstants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  HelpCircle,
  ChevronDown,
  ArrowUpDown,
  Crown,
  Users,
} from "lucide-react";
import { Database } from "@/lib/types/supabase";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { useRouter } from "next/navigation";
import { CreditLimits } from "@/lib/types/serverAPITypes";
import { useQueryClient } from "@tanstack/react-query";
import {
  teamInvitesQueryKey,
  teamMembersQueryKey,
} from "@/lib/react-query/queryKeys";

type TeamRole = Database["public"]["Enums"]["team_role"];

interface UserUsage {
  user_id: string;
  current_period_usage: number;
  total_usage: number;
}

export function PeopleTab() {
  const router = useRouter();
  const { activeTeam, teamMembers, teamInvites, currentUserMembership } =
    useActiveTeam();
  const { user } = useUser();
  const { currentPeriodStart, currentPeriodEnd, userPlan } =
    useSubscriptionAccess();
  const logger = useProductLogger();
  const queryClient = useQueryClient();
  const isFreeTier = userPlan === "free";
  const isPlusWithMultipleMembers =
    userPlan === "plus" && (teamMembers?.length ?? 0) >= 2;
  const shouldShowUpsell = isFreeTier || isPlusWithMultipleMembers;
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("editor");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "pending"
  >("all");
  const [roleFilters, setRoleFilters] = useState({
    owner: true,
    admin: true,
    editor: true,
    viewer: true,
  });
  const [usageData, setUsageData] = useState<UserUsage[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  // Calculate default seat count based on non-viewer members
  const getNonViewerCount = () => {
    if (!teamMembers || teamMembers.length === 0) {
      return 1; // Default minimum
    }
    const nonViewers = teamMembers.filter((member) => member.role !== "viewer");
    return Math.max(1, nonViewers.length);
  };

  const [teamSeatQuantity, setTeamSeatQuantity] = useState(getNonViewerCount());

  // Update seat quantity when team members change
  useEffect(() => {
    setTeamSeatQuantity(getNonViewerCount());
  }, [teamMembers]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Check if current user is owner or admin
  const isOwnerOrAdmin =
    currentUserMembership?.role === "owner" ||
    currentUserMembership?.role === "admin";

  const handleInvite = async () => {
    if (!activeTeam?.id || !inviteEmails.trim()) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        alert("You must be logged in to send invites");
        return;
      }

      // Parse emails (comma or space separated)
      const emails = inviteEmails
        .split(/[,\s]+/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      if (emails.length === 0) {
        alert("Please enter at least one email address");
        return;
      }

      // Send all invites in a single API call
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/teams/send-invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({
            emails,
            team_id: activeTeam.id,
            role: inviteRole,
          }),
        },
      );

      const result = await response.json();
      if (!response.ok || result.error) {
        alert(
          "Failed to send invites: " +
            (result.error?.message || "Unknown error"),
        );
        return;
      }

      // Clear input on success
      setInviteEmails("");

      const successCount = result.data?.invite_ids?.length || 0;
      const failedEmails = result.data?.failed_emails || [];

      logger.debug("log", "Invites sent", {
        successful: successCount,
        failed: failedEmails.length,
        emails,
      });

      // Invalidate team invites query to refetch the updated list
      queryClient.invalidateQueries({
        queryKey: teamInvitesQueryKey(activeTeam.id),
      });

      if (failedEmails.length > 0) {
        alert(
          `Successfully sent ${successCount} invite(s). Failed to send to: ${failedEmails.join(", ")}`,
        );
      } else {
        alert(`Successfully sent ${successCount} invite(s)`);
      }
    } catch (err) {
      logger.debug("error", "Error sending invites", { error: err });
      alert("Failed to send invites. Please try again.");
    }
  };

  const handleRoleChange = async (
    userId: string,
    currentRole: TeamRole,
    newRole: TeamRole,
  ) => {
    if (!activeTeam?.id) return;

    // Only owners can change the role of other owners
    if (currentRole === "owner" && currentUserMembership?.role !== "owner") {
      alert("Only owners can change the role of other owners.");
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        alert("You must be logged in to update roles");
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/teams/update-member-role`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({
            team_id: activeTeam.id,
            user_id: userId,
            role: newRole,
          }),
        },
      );

      const result = await response.json();
      if (!response.ok || result.error) {
        alert(
          "Failed to update role: " +
            (result.error?.message || "Unknown error"),
        );
        return;
      }

      logger.debug("log", "Role updated successfully", {
        user_id: userId,
        old_role: currentRole,
        new_role: newRole,
      });

      // Invalidate team members query to refetch the updated list
      queryClient.invalidateQueries({
        queryKey: teamMembersQueryKey(activeTeam.id),
      });
    } catch (err) {
      logger.debug("error", "Failed to update role", { error: err });
      alert("Failed to update role. Please try again.");
    }
  };

  // Fetch usage data on mount
  useEffect(() => {
    async function fetchUsageData() {
      if (!activeTeam?.id) return;

      setUsageLoading(true);
      try {
        const { data: allUsage, error } = await supabase
          .from("api_usage")
          .select("user_id, credits_used, created_at")
          .eq("team_id", activeTeam.id);

        if (error) {
          logger.debug("error", "Error fetching team member usage", { error });
          setUsageData([]);
          return;
        }

        if (!allUsage || allUsage.length === 0) {
          setUsageData([]);
          return;
        }

        // Aggregate by user_id
        const usageByUser = new Map<string, UserUsage>();

        allUsage.forEach((usage) => {
          const existing = usageByUser.get(usage.user_id) || {
            user_id: usage.user_id,
            current_period_usage: 0,
            total_usage: 0,
          };

          // Add to total usage
          existing.total_usage += usage.credits_used;

          // Add to current period usage if within the period
          if (currentPeriodStart && currentPeriodEnd && usage.created_at) {
            const usageDate = new Date(usage.created_at);
            if (
              usageDate >= currentPeriodStart &&
              usageDate <= currentPeriodEnd
            ) {
              existing.current_period_usage += usage.credits_used;
            }
          }

          usageByUser.set(usage.user_id, existing);
        });

        setUsageData(Array.from(usageByUser.values()));
      } catch (err) {
        logger.debug("error", "Error fetching usage data", { error: err });
        setUsageData([]);
      } finally {
        setUsageLoading(false);
      }
    }

    fetchUsageData();
  }, [activeTeam?.id, currentPeriodStart, currentPeriodEnd, logger]);

  const toggleRoleFilter = (role: keyof typeof roleFilters) => {
    setRoleFilters((prev) => ({ ...prev, [role]: !prev[role] }));
  };

  // Create a map of user usage for quick lookup
  const usageByUserId = useMemo(() => {
    const map = new Map();
    usageData.forEach((usage) => {
      map.set(usage.user_id, usage);
    });
    return map;
  }, [usageData]);

  // Combine and filter members and invites based on active filter, role filters, and search query
  const filteredItems = useMemo(() => {
    const items: Array<
      | { type: "member"; data: (typeof teamMembers)[0] }
      | { type: "invite"; data: (typeof teamInvites)[0] }
    > = [];

    const searchLower = searchQuery.toLowerCase().trim();

    if (activeFilter === "all" || activeFilter === "active") {
      teamMembers.forEach((member) => {
        // Apply role filter
        if (!roleFilters[member.role as keyof typeof roleFilters]) {
          return;
        }

        // Apply search filter
        if (searchLower) {
          const memberName = (member.user.name || "").toLowerCase();
          const memberEmail = (member.user.email || "").toLowerCase();
          if (
            !memberName.includes(searchLower) &&
            !memberEmail.includes(searchLower)
          ) {
            return;
          }
        }

        items.push({ type: "member", data: member });
      });
    }

    if (activeFilter === "all" || activeFilter === "pending") {
      teamInvites.forEach((invite) => {
        // Apply role filter
        if (!roleFilters[invite.role as keyof typeof roleFilters]) {
          return;
        }

        // Apply search filter
        if (searchLower) {
          const inviteEmail = (invite.email || "").toLowerCase();
          if (!inviteEmail.includes(searchLower)) {
            return;
          }
        }

        items.push({ type: "invite", data: invite });
      });
    }

    return items;
  }, [activeFilter, teamMembers, teamInvites, roleFilters, searchQuery]);

  const formatCredits = (credits: number) => {
    return credits > 0 ? `${credits.toFixed(2)} credits` : "-";
  };

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-medium tracking-tight text-gray-900 dark:text-white mb-2">
              People
            </h1>
            <p className="text-gray-600 dark:text-[#8A8F98] text-base">
              Inviting people to{" "}
              <span className="font-medium text-gray-900 dark:text-white">
                {activeTeam?.name}
              </span>{" "}
              gives access to shared projects and credits. You have{" "}
              <span className="font-medium text-gray-900 dark:text-white">
                {teamMembers.length} member
                {teamMembers.length !== 1 ? "s" : ""}
              </span>{" "}
              in this team.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="gap-2">
            <HelpCircle className="w-4 h-4" />
            Docs
          </Button>
        </div>

        {/* Upsell Banner */}
        {shouldShowUpsell && (
          <div className="mb-6 p-4 rounded-lg border border-border bg-muted/30">
            <div className="flex items-start gap-3 mb-3">
              <Users className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-foreground mb-1">
                  {isPlusWithMultipleMembers
                    ? "Upgrade to Team for more collaborators"
                    : "Upgrade to add team members"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isPlusWithMultipleMembers
                    ? "Get unlimited viewers and multiple collaborators with the Team plan"
                    : "Choose a plan to invite collaborators to your team"}
                </p>
              </div>
            </div>

            <div
              className={`grid grid-cols-1 ${isFreeTier ? "sm:grid-cols-2" : ""} gap-3 mt-3`}
            >
              {/* Plus Plan - only show for free tier */}
              {isFreeTier && (
                <div className="p-3 rounded-lg bg-background border border-border">
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-medium text-sm text-foreground">
                      Plus
                    </div>
                    <div className="text-xs text-muted-foreground">$25/mo</div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    1 free collaborator
                  </p>

                  {/* Spacer to align with Team card seat selector */}
                  <div className="mb-3 h-7" />

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      activeTeam?.id &&
                      handleCheckout("plus", router, activeTeam.id)
                    }
                    className="w-full h-8 text-xs"
                    disabled={!isOwnerOrAdmin}
                  >
                    Upgrade to Plus
                  </Button>
                </div>
              )}

              {/* Team Plan */}
              <div className="p-3 rounded-lg bg-background border border-border">
                <div className="flex items-start justify-between mb-2">
                  <div className="font-medium text-sm text-foreground flex items-center gap-1.5">
                    Team
                    <Crown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-xs text-muted-foreground">$35/seat</div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Unlimited viewers + multiple collaborators
                </p>

                {/* Seat Selector */}
                <div className="mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setTeamSeatQuantity(Math.max(1, teamSeatQuantity - 1))
                        }
                        disabled={teamSeatQuantity <= 1 || !isOwnerOrAdmin}
                        className="h-7 w-7"
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        value={teamSeatQuantity}
                        onChange={(e) => {
                          const num = parseInt(e.target.value) || 1;
                          setTeamSeatQuantity(Math.max(1, num));
                        }}
                        className="text-center h-7 w-14 text-sm"
                        disabled={!isOwnerOrAdmin}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setTeamSeatQuantity(teamSeatQuantity + 1)
                        }
                        disabled={!isOwnerOrAdmin}
                        className="h-7 w-7"
                      >
                        +
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(teamSeatQuantity * CreditLimits.TEAM).toLocaleString()}{" "}
                      credits/mo
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() =>
                    activeTeam?.id &&
                    handleCheckout(
                      "team",
                      router,
                      activeTeam.id,
                      teamSeatQuantity,
                    )
                  }
                  className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700"
                  disabled={!isOwnerOrAdmin}
                >
                  Upgrade to Team
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Invite Section */}
        <div className="mb-8">
          <h2 className="text-base font-medium text-gray-900 dark:text-white mb-3">
            Invite new members
          </h2>
          <div className="flex gap-2">
            <Input
              placeholder="Add emails"
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              className="flex-1 bg-background border-border"
              disabled={!isOwnerOrAdmin || isFreeTier}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="min-w-[120px] justify-between"
                  disabled={!isOwnerOrAdmin || isFreeTier}
                >
                  <span className="capitalize">{inviteRole}</span>
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setInviteRole("owner")}>
                  Owner
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setInviteRole("admin")}>
                  Admin
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setInviteRole("editor")}>
                  Editor
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setInviteRole("viewer")}>
                  Viewer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={handleInvite}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!isOwnerOrAdmin || isFreeTier}
            >
              Invite
            </Button>
          </div>
        </div>

        {/* Members Section */}
        <div>
          <div className="mb-4">
            <h2 className="text-base font-medium text-gray-900 dark:text-white">
              Members
            </h2>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search members by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background border-border"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center justify-between mb-6">
            <Tabs
              value={activeFilter}
              onValueChange={(v) =>
                setActiveFilter(v as "all" | "active" | "pending")
              }
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Filter by role</span>
              {(
                Object.keys(roleFilters) as Array<keyof typeof roleFilters>
              ).map((role) => (
                <label
                  key={role}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={roleFilters[role]}
                    onCheckedChange={() => toggleRoleFilter(role)}
                  />
                  <span className="capitalize text-gray-900 dark:text-white">
                    {role}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="bg-muted/50 border-b border-border">
              <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-muted-foreground">
                <div className="col-span-2 flex items-center gap-1">
                  Member
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  Email
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="col-span-1 flex items-center gap-1">
                  Role
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="col-span-1">Status</div>
                <div className="col-span-2 flex items-center gap-1">
                  Current period usage
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  All-time usage
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="col-span-1 flex items-center gap-1">
                  Date joined
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="col-span-1">Limits</div>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-border">
              {filteredItems.map((item) => {
                if (item.type === "member") {
                  const member = item.data;
                  const isCurrentUser = member.user_id === user?.id;
                  const memberName = member.user.name || "Unknown User";
                  const memberEmail = member.user.email || "No email";
                  const memberInitials = getInitials(memberName);
                  const usage = usageByUserId.get(member.user_id);

                  return (
                    <div
                      key={`member-${member.user_id}`}
                      className="grid grid-cols-12 gap-4 px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
                    >
                      {/* Member */}
                      <div className="col-span-2 flex items-center gap-2">
                        <Avatar className="w-6 h-6 rounded-full">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {memberInitials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {memberName}
                          {isCurrentUser && (
                            <span className="text-muted-foreground ml-1">
                              (you)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Email */}
                      <div className="col-span-2 flex items-center text-muted-foreground">
                        {memberEmail}
                      </div>

                      {/* Role */}
                      <div className="col-span-1 flex items-center">
                        {isOwnerOrAdmin ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="flex items-center gap-1 capitalize hover:text-foreground transition-colors">
                                {member.role}
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(
                                    member.user_id,
                                    member.role,
                                    "owner",
                                  )
                                }
                              >
                                Owner
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(
                                    member.user_id,
                                    member.role,
                                    "admin",
                                  )
                                }
                              >
                                Admin
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(
                                    member.user_id,
                                    member.role,
                                    "editor",
                                  )
                                }
                              >
                                Editor
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleRoleChange(
                                    member.user_id,
                                    member.role,
                                    "viewer",
                                  )
                                }
                              >
                                Viewer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="capitalize">{member.role}</span>
                        )}
                      </div>

                      {/* Status */}
                      <div className="col-span-1 flex items-center">
                        <Badge
                          variant="secondary"
                          className="bg-background border border-border text-foreground"
                        >
                          Active
                        </Badge>
                      </div>

                      {/* Current period usage */}
                      <div className="col-span-2 flex items-center text-muted-foreground">
                        {usageLoading ? (
                          <span className="text-xs">Loading...</span>
                        ) : (
                          formatCredits(usage?.current_period_usage || 0)
                        )}
                      </div>

                      {/* All-time usage */}
                      <div className="col-span-2 flex items-center text-muted-foreground">
                        {usageLoading ? (
                          <span className="text-xs">Loading...</span>
                        ) : (
                          formatCredits(usage?.total_usage || 0)
                        )}
                      </div>

                      {/* Date joined */}
                      <div className="col-span-1 flex items-center text-muted-foreground">
                        {new Date(member.created_at).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </div>

                      {/* Limits */}
                      <div className="col-span-1 flex items-center text-muted-foreground">
                        -
                      </div>
                    </div>
                  );
                } else {
                  // Invite
                  const invite = item.data;
                  const inviteEmail = invite.email || "No email";
                  const inviteInitials = getInitials(inviteEmail);

                  return (
                    <div
                      key={`invite-${invite.id}`}
                      className="grid grid-cols-12 gap-4 px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
                    >
                      {/* Member (using email) */}
                      <div className="col-span-2 flex items-center gap-2">
                        <Avatar className="w-6 h-6 rounded-full">
                          <AvatarFallback className="text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400">
                            {inviteInitials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-muted-foreground">
                          {inviteEmail}
                        </span>
                      </div>

                      {/* Email */}
                      <div className="col-span-2 flex items-center text-muted-foreground">
                        {inviteEmail}
                      </div>

                      {/* Role */}
                      <div className="col-span-1 flex items-center">
                        {isOwnerOrAdmin ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="flex items-center gap-1 capitalize text-muted-foreground hover:text-foreground transition-colors">
                                {invite.role}
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onClick={async () => {
                                  if (!activeTeam?.id) return;
                                  const { error } = await supabase
                                    .from("team_invites")
                                    .update({ role: "owner" })
                                    .eq("id", invite.id);
                                  if (error) {
                                    logger.debug(
                                      "error",
                                      "Error updating invite role",
                                      { error },
                                    );
                                    alert(
                                      "Failed to update role. Please try again.",
                                    );
                                  }
                                }}
                              >
                                Owner
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  if (!activeTeam?.id) return;
                                  const { error } = await supabase
                                    .from("team_invites")
                                    .update({ role: "admin" })
                                    .eq("id", invite.id);
                                  if (error) {
                                    logger.debug(
                                      "error",
                                      "Error updating invite role",
                                      { error },
                                    );
                                    alert(
                                      "Failed to update role. Please try again.",
                                    );
                                  }
                                }}
                              >
                                Admin
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  if (!activeTeam?.id) return;
                                  const { error } = await supabase
                                    .from("team_invites")
                                    .update({ role: "editor" })
                                    .eq("id", invite.id);
                                  if (error) {
                                    logger.debug(
                                      "error",
                                      "Error updating invite role",
                                      { error },
                                    );
                                    alert(
                                      "Failed to update role. Please try again.",
                                    );
                                  }
                                }}
                              >
                                Editor
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  if (!activeTeam?.id) return;
                                  const { error } = await supabase
                                    .from("team_invites")
                                    .update({ role: "viewer" })
                                    .eq("id", invite.id);
                                  if (error) {
                                    logger.debug(
                                      "error",
                                      "Error updating invite role",
                                      { error },
                                    );
                                    alert(
                                      "Failed to update role. Please try again.",
                                    );
                                  }
                                }}
                              >
                                Viewer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="capitalize text-muted-foreground">
                            {invite.role}
                          </span>
                        )}
                      </div>

                      {/* Status */}
                      <div className="col-span-1 flex items-center">
                        <Badge
                          variant="secondary"
                          className="bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400"
                        >
                          Pending
                        </Badge>
                      </div>

                      {/* Current period usage */}
                      <div className="col-span-2 flex items-center text-muted-foreground">
                        -
                      </div>

                      {/* All-time usage */}
                      <div className="col-span-2 flex items-center text-muted-foreground">
                        -
                      </div>

                      {/* Date invited */}
                      <div className="col-span-1 flex items-center text-muted-foreground">
                        {new Date(invite.created_at).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          },
                        )}
                      </div>

                      {/* Limits */}
                      <div className="col-span-1 flex items-center text-muted-foreground">
                        -
                      </div>
                    </div>
                  );
                }
              })}

              {filteredItems.length === 0 && (
                <div className="px-4 py-12 text-center text-muted-foreground">
                  {activeFilter === "active" && "No active members found"}
                  {activeFilter === "pending" && "No pending invites found"}
                  {activeFilter === "all" && "No members or invites found"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
