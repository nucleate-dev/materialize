"use client";

import { useState, useRef } from "react";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useUser } from "@/hooks/useUser";
import { usePersonalTeam } from "@/hooks/usePersonalTeam";
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
  const {
    activeTeam,
    teamMembers,
    currentUserMembership,
    setActiveTeam,
    signedAvatarUrl,
    isCurrentUserSsoUser,
  } = useActiveTeam();
  const { user } = useUser();
  const { team: personalTeam } = usePersonalTeam();
  const logger = useProductLogger();
  const queryClient = useQueryClient();

  const [teamName, setTeamName] = useState(activeTeam?.name || "");
  const [teamDescription, setTeamDescription] = useState(
    activeTeam?.description || "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Disable leave team if user is last owner, personal owner, or SSO user
  const canLeaveTeam = !isLastOwner && !isPersonalOwner && !isCurrentUserSsoUser;

  // Track if there are unsaved changes
  const hasUnsavedChanges =
    teamName.trim() !== (activeTeam?.name || "") ||
    teamDescription.trim() !== (activeTeam?.description || "");

  // Compress image to reduce file size
  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }

          // Set max dimensions (e.g., 400x400 for avatars)
          const MAX_WIDTH = 400;
          const MAX_HEIGHT = 400;
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions while maintaining aspect ratio
          if (width > height) {
            if (width > MAX_WIDTH) {
              height = (height * MAX_WIDTH) / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = (width * MAX_HEIGHT) / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;

          // Draw and compress
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Failed to compress image"));
              }
            },
            "image/jpeg",
            0.8, // 80% quality
          );
        };
        img.onerror = () => reject(new Error("Failed to load image"));
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
    });
  };

  const handleAvatarUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !activeTeam?.id) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    // Validate file size (max 5MB before compression)
    if (file.size > 5 * 1024 * 1024) {
      alert("Image size must be less than 5MB");
      return;
    }

    try {
      setIsUploadingAvatar(true);

      // Compress the image
      const compressedBlob = await compressImage(file);

      // Upload to Supabase storage
      const fileName = activeTeam.id;
      const { error: uploadError } = await supabase.storage
        .from("team-avatars")
        .upload(fileName, compressedBlob, {
          contentType: "image/jpeg",
          upsert: true, // Replace existing file if it exists
        });

      if (uploadError) {
        logger.debug("error", "Error uploading avatar", { error: uploadError });
        alert("Failed to upload avatar. Please try again.");
        return;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("team-avatars").getPublicUrl(fileName);

      // Update team table with new avatar URL
      const { error: updateError } = await supabase
        .from("teams")
        .update({ avatar_url: publicUrl })
        .eq("id", activeTeam.id);

      if (updateError) {
        logger.debug("error", "Error updating team avatar URL", {
          error: updateError,
        });
        alert("Failed to update team avatar. Please try again.");
        return;
      }

      logger.debug("log", "Team avatar updated successfully");

      // Invalidate queries to refresh team data
      if (user?.id) {
        queryClient.invalidateQueries({
          queryKey: personalTeamQueryKey(user.id),
        });
      }
    } catch (err) {
      logger.debug("error", "Failed to upload avatar", { error: err });
      alert("Failed to upload avatar. Please try again.");
    } finally {
      setIsUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSaveChanges = async () => {
    if (!activeTeam?.id || !teamName.trim()) return;

    try {
      setIsSaving(true);

      const { error } = await supabase
        .from("teams")
        .update({
          name: teamName.trim(),
          description: teamDescription.trim() || null,
        })
        .eq("id", activeTeam.id);

      if (error) {
        logger.debug("error", "Error updating team settings", { error });
        alert("Failed to update team settings. Please try again.");
        return;
      }

      logger.debug("log", "Team settings updated successfully");

      // Invalidate personal team query to refresh team data
      // Note: TeamContext only uses personalTeamQueryKey to fetch team data
      if (user?.id) {
        queryClient.invalidateQueries({
          queryKey: personalTeamQueryKey(user.id),
        });
      }
    } catch (err) {
      logger.debug("error", "Failed to update team settings", { error: err });
      alert("Failed to update team settings. Please try again.");
    } finally {
      setIsSaving(false);
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

      // Switch to personal team
      if (personalTeam) {
        setActiveTeam(personalTeam);
      }

      // Invalidate queries to refresh team data
      if (user?.id) {
        queryClient.invalidateQueries({
          queryKey: personalTeamQueryKey(user.id),
        });
      }
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
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
              Team Settings
            </h1>
            <p className="text-sm text-muted-foreground">
              Teams allow you to collaborate on projects in real time
            </p>
          </div>
          {isOwnerOrAdmin && (
            <Button
              onClick={handleSaveChanges}
              disabled={!hasUnsavedChanges || isSaving}
              size="sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          )}
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
                <AvatarImage src={signedAvatarUrl || undefined} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">
                  {activeTeam?.name ? getInitials(activeTeam.name) : "T"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!isOwnerOrAdmin || isUploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploadingAvatar ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload
                    </>
                  )}
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
              <Input
                id="team-name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Enter team name"
                disabled={!isOwnerOrAdmin}
                className="max-w-md"
              />
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
                disabled={!isOwnerOrAdmin}
              />
              {!isOwnerOrAdmin && (
                <p className="text-xs text-muted-foreground mt-2">
                  Only owners and admins can change the team description
                </p>
              )}
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
                      {isCurrentUserSsoUser
                        ? "SSO users cannot leave their team. Please contact your administrator."
                        : isPersonalOwner
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
