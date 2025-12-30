"use client";

import { useState } from "react";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/ClientConstants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Upload, AlertTriangle } from "lucide-react";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { useQueryClient } from "@tanstack/react-query";
import { personalTeamQueryKey } from "@/lib/react-query/queryKeys";

export function TeamTab() {
  const { activeTeam, teamMembers, currentUserMembership } = useActiveTeam();
  const { user } = useUser();
  const logger = useProductLogger();
  const queryClient = useQueryClient();

  const [teamName, setTeamName] = useState(activeTeam?.name || "");
  const [teamDescription, setTeamDescription] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);

  // Check if current user is owner or admin
  const isOwnerOrAdmin =
    currentUserMembership?.role === "owner" ||
    currentUserMembership?.role === "admin";

  // Check if user is the last owner
  const ownerCount = teamMembers?.filter((m) => m.role === "owner").length || 0;
  const isLastOwner =
    currentUserMembership?.role === "owner" && ownerCount === 1;

  // Check if user is the personal owner (creator) of the team
  const isPersonalOwner = activeTeam?.personal_owner_user_id === user?.id;

  // Disable leave team if user is last owner or personal owner
  const canLeaveTeam = !isLastOwner && !isPersonalOwner;

  const handleSaveTeamName = async () => {
    if (!activeTeam?.id || !teamName.trim()) return;

    try {
      setIsSavingName(true);

      const { error } = await supabase
        .from("teams")
        .update({ name: teamName.trim() })
        .eq("id", activeTeam.id);

      if (error) {
        logger.debug("error", "Error updating team name", { error });
        alert("Failed to update team name. Please try again.");
        return;
      }

      logger.debug("log", "Team name updated successfully");

      // Invalidate personal team query to refresh team data
      // Note: TeamContext only uses personalTeamQueryKey to fetch team data
      if (user?.id) {
        queryClient.invalidateQueries({
          queryKey: personalTeamQueryKey(user.id),
        });
      }

      setIsEditingName(false);
    } catch (err) {
      logger.debug("error", "Failed to update team name", { error: err });
      alert("Failed to update team name. Please try again.");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleLeaveTeam = async () => {
    if (!activeTeam?.id || !user?.id || !canLeaveTeam) return;

    const confirmLeave = window.confirm(
      "Are you sure you want to leave this team? You will lose access to all team projects and resources.",
    );

    if (!confirmLeave) return;

    try {
      setIsLeavingTeam(true);

      const { error } = await supabase
        .from("team_memberships")
        .delete()
        .eq("user_id", user.id)
        .eq("team_id", activeTeam.id);

      if (error) {
        logger.debug("error", "Error leaving team", { error });
        alert("Failed to leave team. Please try again.");
        return;
      }

      logger.debug("log", "Left team successfully");

      // Redirect or refresh - the team context will update automatically
      window.location.reload();
    } catch (err) {
      logger.debug("error", "Failed to leave team", { error: err });
      alert("Failed to leave team. Please try again.");
    } finally {
      setIsLeavingTeam(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="relative min-h-screen text-gray-900 dark:text-white font-sans">
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            Team Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Teams allow you to collaborate on projects in real time
          </p>
        </div>

        <div className="space-y-0">
          {/* Team Avatar */}
          <div className="py-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
            <div className="sm:w-48 flex-shrink-0">
              <h3 className="text-sm font-medium text-foreground">
                Team Avatar
              </h3>
            </div>
            <div className="flex-1 flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={activeTeam?.avatar_url || undefined} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">
                  {activeTeam?.name ? getInitials(activeTeam.name) : "T"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1">
                <Button variant="outline" size="sm" disabled={!isOwnerOrAdmin}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </Button>
                {!isOwnerOrAdmin && (
                  <p className="text-xs text-muted-foreground">
                    Owners and admins only
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Team Name */}
          <div className="py-6 flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-8">
            <div className="sm:w-48 flex-shrink-0">
              <h3 className="text-sm font-medium text-foreground">Team Name</h3>
            </div>
            <div className="flex-1">
              <div className="flex gap-2 items-start">
                <Input
                  id="team-name"
                  value={teamName}
                  onChange={(e) => {
                    setTeamName(e.target.value);
                    setIsEditingName(true);
                  }}
                  placeholder="Enter team name"
                  disabled={!isOwnerOrAdmin}
                  className="flex-1 max-w-md"
                />
                {isEditingName && isOwnerOrAdmin && (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSaveTeamName}
                      disabled={isSavingName || !teamName.trim()}
                      size="sm"
                    >
                      {isSavingName ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTeamName(activeTeam?.name || "");
                        setIsEditingName(false);
                      }}
                      disabled={isSavingName}
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
              {!isOwnerOrAdmin && (
                <p className="text-xs text-muted-foreground mt-2">
                  Only owners and admins can change the team name
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Team Description */}
          <div className="py-6 flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-8">
            <div className="sm:w-48 flex-shrink-0">
              <h3 className="text-sm font-medium text-foreground">
                Description
              </h3>
            </div>
            <div className="flex-1">
              <Textarea
                id="team-description"
                value={teamDescription}
                onChange={(e) => setTeamDescription(e.target.value)}
                placeholder="Add a description for your team"
                className="max-w-md"
                rows={4}
                disabled
              />
              <p className="text-xs text-muted-foreground mt-2">
                Coming soon: Team descriptions
              </p>
            </div>
          </div>

          <Separator />

          {/* Danger Zone */}
          <div className="py-6">
            <h3 className="text-sm font-medium text-destructive mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Danger Zone
            </h3>
            <Alert className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
              <AlertDescription>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900 dark:text-red-200">
                      Leave Team
                    </p>
                    <p className="text-sm text-red-800 dark:text-red-300 mt-1">
                      {isPersonalOwner
                        ? "You cannot leave your personal team."
                        : isLastOwner
                          ? "You cannot leave the team as the last owner. Transfer ownership first."
                          : "Once you leave, you will lose access to all team projects and resources."}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={handleLeaveTeam}
                    disabled={!canLeaveTeam || isLeavingTeam}
                    className="shrink-0 w-full sm:w-auto"
                    size="sm"
                  >
                    {isLeavingTeam ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Leaving...
                      </>
                    ) : (
                      "Leave Team"
                    )}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </div>
    </div>
  );
}
