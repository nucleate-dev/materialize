"use client";

import { supabase } from "@/ClientConstants";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import WaitlistModal from "@/components/WaitlistModal";
import { WAITLIST_MODE } from "@/GlobalConstants";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import {
  type APIResponse,
  type CreatePrototypeErrorResponse,
  type CreatePrototypeRequestBody,
  type CreatePrototypeSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import {
  Check,
  Copy,
  FileCode,
  Globe,
  Info,
  Loader2,
  Lock,
  MoreVertical,
  Pencil,
  Share2,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

interface PublicPrototypeHeaderProps {
  prototype: Prototype;
  onUpdatePrototype: (updatedPrototype: Prototype) => void;
}

export default function PublicPrototypeHeader({
  prototype,
  onUpdatePrototype,
}: PublicPrototypeHeaderProps) {
  const userObj = useUser();
  const user = userObj.user;
  const router = useRouter();
  const logger = useProductLogger();
  const { userPlan } = useSubscriptionAccess();

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);

  // Fetch file count for display
  useEffect(() => {
    async function fetchFileCount() {
      if (!prototype.id) return;

      try {
        const { count, error } = await supabase
          .from("prototype_files")
          .select("*", { count: "exact", head: true })
          .eq("prototype_id", prototype.id);

        if (error) {
          logger.debug("error", "Error fetching file count:", {
            ...error,
          });
          return;
        }

        setFileCount(count || 0);
      } catch (err) {
        logger.debug("error", "Error fetching file count:", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    }

    fetchFileCount();
  }, [prototype.id, logger]);

  const handleStartEdit = () => {
    if (!prototype || !user || prototype.owner_id !== user.id) return;
    setEditedName(prototype.name);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedName("");
  };

  const handleSaveEdit = async () => {
    if (!prototype || !user || !editedName.trim()) return;

    try {
      setIsUpdating(true);

      const { error } = await supabase
        .from("prototypes")
        .update({ name: editedName.trim() })
        .eq("id", prototype.id);

      if (error) {
        throw error;
      }

      // Update local state via callback
      onUpdatePrototype({ ...prototype, name: editedName.trim() });
      setIsEditing(false);
      setEditedName("");
      setShowInfoModal(false); // Close modal after saving
    } catch (err) {
      logger.debug("error", "Error updating prototype name:", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleShare = () => {
    setShowShareModal(true);
    setLinkCopied(false); // Reset copied state when opening modal
  };

  const handleCopyLink = async () => {
    if (!prototype) return;

    const publicUrl = `${window.location.origin}/project/${prototype.id}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setLinkCopied(true);
      // Reset after 2 seconds
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      logger.debug("error", "Failed to copy link:", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleVisibilityClick = () => {
    if (!user || prototype.owner_id !== user.id) return;
    setShowVisibilityModal(true);
  };

  const handleVisibilityChange = async (
    newVisibility: Database["public"]["Enums"]["visibility_level"]
  ) => {
    if (!prototype || !user || prototype.owner_id !== user.id) return;

    // If trying to set to SELF (Private) and not a Pro user, show upsell
    if (newVisibility === "SELF" && userPlan !== "pro") {
      setShowVisibilityModal(false);
      setShowUpsellModal(true);
      return;
    }

    try {
      setIsUpdatingVisibility(true);

      const { error } = await supabase
        .from("prototypes")
        .update({ visibility: newVisibility })
        .eq("id", prototype.id);

      if (error) {
        throw error;
      }

      // Update local state via callback
      onUpdatePrototype({ ...prototype, visibility: newVisibility });
      setShowVisibilityModal(false);
    } catch (err) {
      logger.debug("error", "Error updating prototype visibility:", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  const handleClonePrototype = async () => {
    if (!prototype) return;

    // Check if user is logged in
    if (!user) {
      // Redirect to login page with return URL
      const returnUrl = encodeURIComponent(window.location.pathname);
      router.push(`/login?redirect=${returnUrl}`);
      return;
    }

    // Show waitlist modal if waitlist mode is enabled
    if (WAITLIST_MODE) {
      setShowWaitlistModal(true);
      return;
    }

    try {
      setIsCloning(true);

      // Create new prototype
      const clonedPrototypeName = `${prototype.name} (Copy)`;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        logger.debug("error", "No authentication token available");
        // Redirect to login as fallback
        const returnUrl = encodeURIComponent(window.location.pathname);
        router.push(`/login?redirect=${returnUrl}`);
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: clonedPrototypeName,
            description: prototype.description,
            folder_id: prototype.folder_id || undefined,
            prototype_id: prototype.id,
            visibility: "PUBLIC", // TODO evaluate whether this should ever be private
          } as CreatePrototypeRequestBody),
        },
      );

      const result: APIResponse<
        CreatePrototypeSuccessResponse,
        CreatePrototypeErrorResponse
      > = await response.json();
      if (result.data) {
        // Navigate to the new prototype in dashboard
        router.push(`/dashboard/projects/${result.data.prototype_id}`);
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
        // Show upsell modal
        setShowUpsellModal(true);
      } else {
        logger.debug("error", "Error cloning prototype:", {
          ...result.error,
        });
      }
    } catch (err) {
      logger.debug("error", "Error cloning prototype:", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <>
      <div className="flex-shrink-0 bg-transparent">
        <div className="px-2">
          <div className="flex items-center justify-between gap-3">
            {/* Left side - Prototype info */}
            <div className="flex items-center gap-3 flex-1 min-w-0 pl-1">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white truncate tracking-tight">
                    {prototype.name}
                  </h1>

                  {/* Info Button / Modal */}
                  <Dialog open={showInfoModal} onOpenChange={(open) => {
                    setShowInfoModal(open);
                    if (!open) {
                      setIsEditing(false);
                      setEditedName("");
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-gray-400 hover:text-indigo-500 dark:text-[#8A8F98] dark:hover:text-white transition-colors"
                      >
                        <Info className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md bg-white dark:bg-[#141517] border-gray-200 dark:border-white/10 text-gray-900 dark:text-white shadow-2xl">
                      <DialogHeader>
                        <DialogTitle>Project Information</DialogTitle>
                        <DialogDescription className="text-gray-500 dark:text-[#8A8F98]">
                          Details about this project
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-5 py-4">
                        {/* Project Name - Editable for owner */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              Name
                            </span>
                            {user && prototype.owner_id === user.id && !isEditing && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleStartEdit}
                                className="h-6 px-2 text-xs text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                              >
                                <Pencil className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                            )}
                          </div>
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                className="text-sm flex-1 bg-gray-50 dark:bg-[#0B0C0E] border-gray-200 dark:border-white/10"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveEdit();
                                  else if (e.key === "Escape") handleCancelEdit();
                                }}
                                autoFocus
                                disabled={isUpdating}
                              />
                              <Button
                                size="icon"
                                onClick={handleSaveEdit}
                                disabled={isUpdating || !editedName.trim()}
                                className="h-9 w-9 bg-emerald-500 hover:bg-emerald-600 text-white"
                              >
                                {isUpdating ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={handleCancelEdit}
                                disabled={isUpdating}
                                className="h-9 w-9 border-gray-200 dark:border-white/10"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <p className="text-sm font-medium p-2 bg-gray-50 dark:bg-[#0B0C0E] border border-gray-200 dark:border-white/5 rounded-md">
                              {prototype.name}
                            </p>
                          )}
                        </div>

                        {/* Files Count */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Files
                          </span>
                          <Badge variant="secondary" className="bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-white/20">
                            <FileCode className="w-3 h-3 mr-1" /> {fileCount} files
                          </Badge>
                        </div>

                        {/* Visibility */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Visibility
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs border-gray-200 dark:border-white/10 ${user && prototype.owner_id === user.id ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5' : ''}`}
                            onClick={user && prototype.owner_id === user.id ? handleVisibilityClick : undefined}
                          >
                            {prototype.visibility === "SELF" ? <Lock className="w-3 h-3 mr-1 text-gray-400" /> : <Globe className="w-3 h-3 mr-1 text-indigo-400" />}
                            {prototype.visibility === "SELF" ? "Private" : "Public"}
                          </Badge>
                        </div>

                        {/* Description */}
                        {prototype.description && (
                          <div className="pt-4 border-t border-gray-100 dark:border-white/5 space-y-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              Description
                            </span>
                            <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-[#0B0C0E] p-3 rounded-md border border-gray-200 dark:border-white/5">
                              {prototype.description}
                            </p>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>

            {/* Right side - Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Desktop buttons */}
              <div className="hidden sm:flex items-center gap-2">
                <Button
                  onClick={handleClonePrototype}
                  disabled={isCloning}
                  size="sm"
                  className="bg-white dark:bg-white text-gray-900 dark:text-black border border-gray-200 dark:border-transparent hover:bg-gray-50 dark:hover:bg-white/90 shadow-sm"
                >
                  {isCloning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                      Cloning...
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-2" />
                      Clone
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
                  className="border-gray-200 dark:border-white/10 bg-transparent hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-white"
                >
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>

              {/* Mobile dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="sm:hidden text-gray-500 dark:text-[#8A8F98]">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-[#141517] border-gray-200 dark:border-white/10 text-gray-900 dark:text-white">
                  <DropdownMenuItem
                    onClick={handleClonePrototype}
                    disabled={isCloning}
                    className="cursor-pointer focus:bg-gray-100 dark:focus:bg-white/10"
                  >
                    {isCloning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Copy className="w-4 h-4 mr-2" />}
                    Clone Project
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleShare}
                    className="cursor-pointer focus:bg-gray-100 dark:focus:bg-white/10"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Share Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-[#141517] border-gray-200 dark:border-white/10 text-gray-900 dark:text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-indigo-500" /> Share Project
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-[#8A8F98]">
              Anyone with this link can view this project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/project/${prototype.id}`}
                className="flex-1 text-sm bg-gray-50 dark:bg-[#0B0C0E] border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button
                size="sm"
                onClick={handleCopyLink}
                className="flex-shrink-0 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-white/90"
              >
                {linkCopied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Visibility Change Modal */}
      <Dialog
        open={showVisibilityModal}
        onOpenChange={setShowVisibilityModal}
      >
        <DialogContent className="sm:max-w-md bg-white dark:bg-[#141517] border-gray-200 dark:border-white/10 text-gray-900 dark:text-white">
          <DialogHeader>
            <DialogTitle>Change Visibility</DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-[#8A8F98]">
              Choose who can view this project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button
              variant="outline"
              className="w-full justify-start text-left h-auto py-4 px-4 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 bg-transparent"
              onClick={() => handleVisibilityChange("PUBLIC")}
              disabled={isUpdatingVisibility}
            >
              <div className="flex flex-col items-start gap-1">
                <div className="font-medium flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-500" /> Public
                </div>
                <div className="text-sm text-gray-500 dark:text-[#8A8F98]">
                  Anyone with the link can view
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-left h-auto py-4 px-4 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 bg-transparent"
              onClick={() => handleVisibilityChange("SELF")}
              disabled={isUpdatingVisibility}
            >
              <div className="flex flex-col items-start gap-1">
                <div className="font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4 text-gray-500" />
                  Private
                  {userPlan !== "pro" && (
                    <Badge variant="secondary" className="ml-2 text-[10px] h-5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                      Pro
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-gray-500 dark:text-[#8A8F98]">
                  Only you can view
                </div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="prototype_creation_limit_reached"
      />

      <WaitlistModal
        open={showWaitlistModal}
        onOpenChange={setShowWaitlistModal}
      />
    </>
  );
}