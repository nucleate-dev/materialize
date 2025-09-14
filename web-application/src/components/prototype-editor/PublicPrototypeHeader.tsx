"use client";

import { supabase } from "@/ClientConstants";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import WaitlistModal from "@/components/WaitlistModal";
import { WAITLIST_MODE } from "@/GlobalConstants";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import {
  type CreatePrototypeRequestBody,
  type CreatePrototypeResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import {
  CheckIcon,
  DocumentDuplicateIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  ShareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

interface PublicPrototypeHeaderProps {
  prototype: Prototype;
  onUpdatePrototype: (updatedPrototype: Prototype) => void;
  onShare?: () => void;
}

export default function PublicPrototypeHeader({
  prototype,
  onUpdatePrototype,
  onShare,
}: PublicPrototypeHeaderProps) {
  const userObj = useUser();
  const user = userObj.user;
  const router = useRouter();
  const logger = useProductLogger();

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [fileCount, setFileCount] = useState(0);

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
    } catch (err) {
      logger.debug("error", "Error updating prototype name:", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClonePrototype = async () => {
    if (!prototype) return;

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
            project_id: prototype.project_id,
            prototype_id: prototype.id,
            visibility: "PUBLIC", // TODO evaluate whether this should ever be private
          } as CreatePrototypeRequestBody),
        },
      );

      const result: CreatePrototypeResponse = await response.json();
      if (result.success) {
        // Navigate to the new prototype in dashboard
        router.push(`/dashboard/prototypes/${result.data.prototype_id}`);
      } else if (result.error === "PROTOTYPE_LIMIT_REACHED") {
        // Show upsell modal
        setShowUpsellModal(true);
      } else {
        logger.debug("error", "Error cloning prototype:", {
          ...result,
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
      <div className="flex-shrink-0 bg-background border-b border-border">
        <div className="px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            {/* Left side - Prototype info */}
            <div className="flex items-center gap-3 group flex-1 min-w-0 pl-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 sm:gap-3 mb-1">
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="text-base sm:text-xl font-bold text-foreground bg-background border-2 border-primary/50 focus:border-primary flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSaveEdit();
                          } else if (e.key === "Escape") {
                            handleCancelEdit();
                          }
                        }}
                        autoFocus
                        disabled={isUpdating}
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={isUpdating || !editedName.trim()}
                        className="h-7 w-7 sm:h-8 sm:w-8 p-0 flex-shrink-0"
                      >
                        {isUpdating ? (
                          <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <CheckIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                        disabled={isUpdating}
                        className="h-7 w-7 sm:h-8 sm:w-8 p-0 flex-shrink-0"
                      >
                        <XMarkIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <h1 className="text-base sm:text-xl font-bold text-foreground truncate">
                        {prototype.name}
                      </h1>
                      {user && prototype.owner_id === user.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleStartEdit}
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0 opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity flex-shrink-0"
                        >
                          <PencilIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Mobile: Compact metadata */}
                <div className="flex items-center gap-2 sm:hidden">
                  <Badge variant="secondary" className="text-xs">
                    {fileCount} files
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {prototype.visibility?.toLowerCase() || "private"}
                  </Badge>
                </div>

                {/* Desktop: Full metadata */}
                <div className="hidden sm:block">
                  {prototype.description && (
                    <p className="text-muted-foreground text-sm leading-relaxed line-clamp-1">
                      {prototype.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
                        {fileCount} files
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {prototype.visibility?.toLowerCase() || "private"}
                      </Badge>
                    </div>
                    {prototype.created_at && (
                      <div className="text-xs text-muted-foreground">
                        Created{" "}
                        {new Date(prototype.created_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
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
                  className="text-sm"
                >
                  {isCloning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                      Cloning...
                    </>
                  ) : (
                    <>
                      <DocumentDuplicateIcon className="w-4 h-4 mr-2" />
                      Clone Prototype
                    </>
                  )}
                </Button>

                <Button variant="outline" size="sm" onClick={onShare}>
                  <ShareIcon className="w-4 h-4" />
                </Button>
              </div>

              {/* Mobile dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="sm:hidden">
                    <EllipsisVerticalIcon className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={handleClonePrototype}
                    disabled={isCloning}
                    className="flex items-center gap-2"
                  >
                    {isCloning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Cloning...
                      </>
                    ) : (
                      <>
                        <DocumentDuplicateIcon className="w-4 h-4" />
                        Clone Prototype
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onShare}
                    className="flex items-center gap-2"
                  >
                    <ShareIcon className="w-4 h-4" />
                    Share
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

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
