"use client";

import { supabase } from "@/ClientConstants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { cn } from "@/lib/classNames"; // Assuming this utility exists based on context
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import {
  normalizePrototypeVisibility,
  type PrototypeVisibility,
} from "@/lib/types/prototypes";
import type {
  APIResponse,
  DeletePrototypeErrorResponse,
  DeletePrototypeSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { IsUserPlanSubscribed } from "@/lib/utils/payments/SubscriptionManagementUtils";
import {
  AlertTriangle,
  FileText,
  Globe,
  Lock,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useState } from "react";

interface PrototypeSettingsModalProps {
  open: boolean;
  onClose: () => void;
  prototype: Database["public"]["Tables"]["prototypes"]["Row"] | null;
  onUpdated: (
    updatedPrototype: Database["public"]["Tables"]["prototypes"]["Row"],
  ) => void;
  onDeleted?: () => void;
}

export default function PrototypeSettingsModal({
  open,
  onClose,
  prototype,
  onUpdated,
  onDeleted,
}: PrototypeSettingsModalProps) {
  const logger = useProductLogger();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<PrototypeVisibility>("SELF");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { userPlan } = useSubscriptionAccess();

  useEffect(() => {
    if (prototype) {
      setName(prototype.name || "");
      setDescription(prototype.description || "");
      setVisibility(normalizePrototypeVisibility(prototype.visibility));
    }
  }, [prototype]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prototype) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("prototypes")
        .update({
          name,
          description: description || null,
          visibility,
        })
        .eq("id", prototype.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        onUpdated(data);
        onClose();
      }
    } catch (error) {
      logger.debug("error", "Error updating prototype:", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!prototype) return;

    setIsSubmitting(true);
    setShowDeleteDialog(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        logger.debug("error", "No authentication token available");
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/${prototype.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      const responseData: APIResponse<
        DeletePrototypeSuccessResponse,
        DeletePrototypeErrorResponse
      > = await response.json();

      if (!response.ok || responseData.error) {
        const errorMessage =
          responseData.error?.message || "Failed to delete prototype";
        throw new Error(errorMessage);
      }

      if (onDeleted) {
        onDeleted();
      }
      onClose();
    } catch (error) {
      logger.debug("error", "Error deleting prototype:", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden bg-white dark:bg-[#141517] border-gray-200 dark:border-white/10 shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]">
          <DialogTitle className="flex items-center gap-2 text-xl font-medium tracking-tight text-gray-900 dark:text-white">
            <Settings className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            Project Settings
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-[#8A8F98]">
            Manage configuration for{" "}
            <span className="font-mono text-gray-800 dark:text-white/80">
              {prototype?.name}
            </span>
          </p>
        </DialogHeader>

        {prototype && (
          <form onSubmit={handleSave}>
            <div className="p-6 space-y-6">
              {/* Name Input */}
              <div className="space-y-2">
                <Label
                  htmlFor="prototype-name"
                  className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-white/40 flex items-center gap-2"
                >
                  <Type className="w-3.5 h-3.5" /> Project Name
                </Label>
                <Input
                  id="prototype-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSubmitting}
                  className="bg-gray-50 dark:bg-[#0B0C0E] border-gray-200 dark:border-white/10 text-gray-900 dark:text-white focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
                  placeholder="e.g. My Awesome App"
                />
              </div>

              {/* Description Input */}
              <div className="space-y-2">
                <Label
                  htmlFor="prototype-description"
                  className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-white/40 flex items-center gap-2"
                >
                  <FileText className="w-3.5 h-3.5" /> Description
                </Label>
                <Textarea
                  id="prototype-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSubmitting}
                  className="min-h-[100px] resize-none bg-gray-50 dark:bg-[#0B0C0E] border-gray-200 dark:border-white/10 text-gray-900 dark:text-white focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
                  placeholder="Describe what this project does..."
                />
              </div>

              {/* Visibility Select */}
              <div className="space-y-3">
                <Label
                  htmlFor="prototype-visibility"
                  className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-white/40 flex items-center gap-2"
                >
                  <Globe className="w-3.5 h-3.5" /> Visibility
                </Label>

                <div
                  className={cn(
                    "relative rounded-lg transition-opacity",
                    IsUserPlanSubscribed(userPlan) ? "opacity-100" : "",
                  )}
                >
                  <Select
                    value={visibility}
                    onValueChange={(v) => setVisibility(v as PrototypeVisibility)}
                    disabled={isSubmitting || !IsUserPlanSubscribed(userPlan)}
                  >
                    <SelectTrigger
                      id="prototype-visibility"
                      className="bg-gray-50 dark:bg-[#0B0C0E] border-gray-200 dark:border-white/10 text-gray-900 dark:text-white focus:ring-indigo-500/20"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#141517] border-gray-200 dark:border-white/10 text-gray-900 dark:text-white">
                      <SelectItem
                        value="SELF"
                        className="cursor-pointer focus:bg-gray-100 dark:focus:bg-white/10"
                      >
                        <div className="flex items-center gap-2">
                          <Lock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          <span>Private (Only You)</span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="TEAM_SUBSET"
                        className="cursor-pointer focus:bg-gray-100 dark:focus:bg-white/10"
                      >
                        <div className="flex items-center gap-2">
                          <Share2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                          <span>Unlisted (Link only)</span>
                        </div>
                      </SelectItem>
                      <SelectItem
                        value="PUBLIC"
                        className="cursor-pointer focus:bg-gray-100 dark:focus:bg-white/10"
                      >
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                          <span>Public (Shareable Link)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Pro Plan Lock Overlay / Message */}
                  {!IsUserPlanSubscribed(userPlan) && (
                    <div className="mt-2 flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-400">
                      <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <p className="text-xs leading-relaxed">
                        Upgrade to <span className="font-semibold">Pro</span> to
                        make projects public and share them with the world.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <DialogFooter className="p-6 border-t border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02] flex items-center justify-between gap-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowDeleteDialog(true)}
                disabled={isSubmitting}
                className="text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Project
              </Button>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="border-gray-200 dark:border-white/10 text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 shadow-lg font-medium"
                >
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>

      {/* Delete Alert Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-white dark:bg-[#141517] border-gray-200 dark:border-white/10 text-gray-900 dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-500">
              <AlertTriangle className="w-5 h-5" />
              Delete Project
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-[#8A8F98]">
              Are you sure you want to delete{" "}
              <span className="font-medium text-gray-900 dark:text-white">
                {prototype?.name}
              </span>
              ?
              <br className="mb-2" />
              This action cannot be undone and will permanently remove all
              associated files and data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isSubmitting}
              className="border-gray-200 dark:border-white/10 text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-500/10 dark:text-red-500 dark:hover:bg-red-500/20 dark:border dark:border-red-500/20"
            >
              {isSubmitting ? "Deleting..." : "Yes, Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
