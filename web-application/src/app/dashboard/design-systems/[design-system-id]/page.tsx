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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { ArrowLeft, Loader2, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";

type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];

interface DesignSystemDetailPageProps {
  params: Promise<{
    "design-system-id": string;
  }>;
}

export default function DesignSystemDetailPage({ params }: DesignSystemDetailPageProps) {
  const { user } = useUser();
  const router = useRouter();
  const logger = useProductLogger();
  const unwrappedParams = use(params);
  const designSystemId = unwrappedParams["design-system-id"];

  const [designSystem, setDesignSystem] = useState<DesignSystemRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedDesignRules, setEditedDesignRules] = useState("");

  const userId = user?.id ?? null;

  const fetchDesignSystem = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("design_systems")
        .select("*")
        .eq("id", designSystemId)
        .eq("owner_id", userId)
        .single();

      if (error) {
        logger.debug("error", "Error fetching design system:", { ...error });
        router.push("/dashboard/design-systems");
        return;
      }

      if (!data) {
        router.push("/dashboard/design-systems");
        return;
      }

      setDesignSystem(data);
      setEditedName(data.name ?? "");
      setEditedDescription(data.description ?? "");
      setEditedDesignRules(data.design_rules ?? "");
    } catch (error) {
      logger.debug("error", "Unexpected error fetching design system:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      router.push("/dashboard/design-systems");
    } finally {
      setIsLoading(false);
    }
  }, [logger, userId, designSystemId, router]);

  useEffect(() => {
    fetchDesignSystem();
  }, [fetchDesignSystem]);

  const handleSave = useCallback(async () => {
    if (!designSystem || !userId) return;

    const trimmedName = editedName.trim();
    if (!trimmedName) {
      logger.debug("error", "Name is required");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("design_systems")
        .update({
          name: trimmedName,
          description: editedDescription.trim() || null,
          design_rules: editedDesignRules.trim(),
        })
        .eq("id", designSystem.id);

      if (error) {
        throw error;
      }

      await fetchDesignSystem();
    } catch (error) {
      logger.debug("error", "Failed to update design system:", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  }, [designSystem, userId, editedName, editedDescription, editedDesignRules, fetchDesignSystem, logger]);

  const handleDelete = async () => {
    if (!designSystem) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const targetId = String(designSystem.id);
      const { count, error } = await supabase
        .from("prototypes")
        .select("id", { count: "exact", head: true })
        .eq("custom_design_system", targetId);

      if (error) {
        throw error;
      }

      if ((count ?? 0) > 0) {
        setDeleteError(
          `This design system is currently linked to ${count} prototype${(count ?? 0) === 1 ? '' : 's'}. Disconnect those prototypes before deleting.`,
        );
        setIsDeleting(false);
        return;
      }

      const { error: deleteErrorResult } = await supabase
        .from("design_systems")
        .delete()
        .eq("id", designSystem.id);

      if (deleteErrorResult) {
        throw deleteErrorResult;
      }

      router.push("/dashboard/design-systems");
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete design system.",
      );
      setIsDeleting(false);
    }
  };

  const hasChanges = designSystem && (
    editedName !== (designSystem.name ?? "") ||
    editedDescription !== (designSystem.description ?? "") ||
    editedDesignRules !== (designSystem.design_rules ?? "")
  );

  if (isLoading || !designSystem) {
    return (
      <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
        <div className="flex justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
        {/* Page Header */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => router.push("/dashboard/design-systems")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-xl sm:text-2xl md:text-title-xl2 font-bold text-black dark:text-white mb-2">
                    {designSystem.name}
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base text-body dark:text-bodydark">
                    Edit your design system details
                  </CardDescription>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  disabled={isDeleting || isSaving}
                  className="gap-2"
                >
                  <Trash className="h-4 w-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
                <Button
                  size="lg"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Main Content */}
        <div className="grid gap-6">
          {/* Name Section */}
          <Card>
            <CardHeader>
              <CardTitle>Name</CardTitle>
              <CardDescription>
                The name of your design system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                placeholder="e.g. Studio Aurora"
                disabled={isSaving}
              />
            </CardContent>
          </Card>

          {/* Description Section */}
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
              <CardDescription>
                A short summary of the design system (optional)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="Short summary of the design system"
                disabled={isSaving}
              />
            </CardContent>
          </Card>

          {/* Design Rules Section */}
          <Card>
            <CardHeader>
              <CardTitle>Design Rules</CardTitle>
              <CardDescription>
                Instructions, tokens, component choices, or prompts Materialize should follow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editedDesignRules}
                onChange={(e) => setEditedDesignRules(e.target.value)}
                placeholder="Instructions, tokens, component choices, or prompts Materialize should follow"
                rows={12}
                disabled={isSaving}
                className="font-mono"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsDeleteDialogOpen(false);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete design system</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Deleting a design system will remove it from your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            Request to delete <span className="font-medium text-foreground">{designSystem.name}</span>.
          </p>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
