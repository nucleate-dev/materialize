"use client";

import { useState } from "react";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useUser } from "@/hooks/useUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Download,
  HelpCircle,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/classNames";

export function PeopleTab() {
  const { activeTeam, teamMembers, teamInvites } = useActiveTeam();
  const { user } = useUser();
  const [inviteEmails, setInviteEmails] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "pending">("all");
  const [roleFilters, setRoleFilters] = useState({
    owner: true,
    admin: true,
    editor: true,
    viewer: true,
    collaborator: true,
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleInvite = () => {
    // TODO: Implement invite functionality
    console.log("Inviting:", inviteEmails);
  };

  const toggleRoleFilter = (role: keyof typeof roleFilters) => {
    setRoleFilters((prev) => ({ ...prev, [role]: !prev[role] }));
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
              gives access to workspace shared projects and credits. You have{" "}
              <span className="font-medium text-gray-900 dark:text-white">
                {teamMembers.length} builder{teamMembers.length !== 1 ? "s" : ""}
              </span>{" "}
              in this workspace.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="gap-2">
            <HelpCircle className="w-4 h-4" />
            Docs
          </Button>
        </div>

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
            />
            <Button onClick={handleInvite} className="bg-blue-600 hover:bg-blue-700">
              Invite
            </Button>
          </div>
        </div>

        {/* Members Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-medium text-gray-900 dark:text-white">
              Members
            </h2>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
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
            <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Filter by role</span>
              {(Object.keys(roleFilters) as Array<keyof typeof roleFilters>).map(
                (role) => (
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
                ),
              )}
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
                  Doc usage
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  Total usage
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
              {teamMembers.map((member) => {
                const isCurrentUser = member.user_id === user?.id;
                const memberName = member.user.name || "Unknown User";
                const memberEmail = member.user.email || "No email";
                const memberInitials = getInitials(memberName);

                return (
                  <div
                    key={member.user_id}
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
                          <span className="text-muted-foreground ml-1">(you)</span>
                        )}
                      </span>
                    </div>

                    {/* Email */}
                    <div className="col-span-2 flex items-center text-muted-foreground">
                      {memberEmail}
                    </div>

                    {/* Role */}
                    <div className="col-span-1 flex items-center">
                      <button className="flex items-center gap-1 capitalize hover:text-foreground transition-colors">
                        {member.role}
                        <ChevronDown className="w-3 h-3" />
                      </button>
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

                    {/* Doc usage */}
                    <div className="col-span-2 flex items-center text-muted-foreground">
                      -
                    </div>

                    {/* Total usage */}
                    <div className="col-span-2 flex items-center text-muted-foreground">
                      -
                    </div>

                    {/* Date joined */}
                    <div className="col-span-1 flex items-center text-muted-foreground">
                      {new Date(member.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>

                    {/* Limits */}
                    <div className="col-span-1 flex items-center text-muted-foreground">
                      -
                    </div>
                  </div>
                );
              })}

              {teamMembers.length === 0 && (
                <div className="px-4 py-12 text-center text-muted-foreground">
                  No members found
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
