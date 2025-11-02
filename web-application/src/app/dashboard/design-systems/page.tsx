"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";

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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { Check, Copy, Plus, Trash } from "lucide-react";

type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];

export default function DesignSystemsPage() {
  const { user } = useUser();
  const router = useRouter();
  const logger = useProductLogger();

  const [designSystems, setDesignSystems] = useState<DesignSystemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DesignSystemRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({
    name: "",
    description: "",
    design_rules: "",
  });

  const userId = user?.id ?? null;
  const canMutate = Boolean(userId);

  const resetForm = () => {
    setFormValues({ name: "", description: "", design_rules: "" });
    setFormError(null);
  };

  const fetchDesignSystems = useCallback(async () => {
    if (!userId) {
      setDesignSystems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("design_systems")
        .select("id, name, description, design_rules, updated_at, created_at, owner_id")
        .eq("owner_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        logger.debug("error", "Error fetching design systems:", {
          ...error,
        });
        setDesignSystems([]);
        return;
      }

      setDesignSystems(data as DesignSystemRow[] ?? []);
    } catch (error) {
      logger.debug("error", "Unexpected error fetching design systems:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      setDesignSystems([]);
    } finally {
      setIsLoading(false);
    }
  }, [logger, userId]);

  useEffect(() => {
    fetchDesignSystems();
  }, [fetchDesignSystems]);

  const handleCopyRules = useCallback(async (system: DesignSystemRow) => {
    if (!system.design_rules) return;

    try {
      await navigator.clipboard.writeText(system.design_rules);
      setCopiedId(system.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (error) {
      logger.debug("error", "Failed to copy design rules:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [logger]);

  const handleFieldChange = useCallback(
    (field: "name" | "description" | "design_rules") =>
      (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { value } = event.target;
        setFormError(null);
        setFormValues((prev) => ({ ...prev, [field]: value }));
      },
    [],
  );

  const handleOpenCreateDialog = () => {
    resetForm();
    setIsSaving(false);
    setIsCreateDialogOpen(true);
  };

  const handleOpenDeleteDialog = (system: DesignSystemRow) => {
    setDeleteTarget(system);
    setDeleteError(null);
    setIsDeleting(false);
    setIsDeleteDialogOpen(true);
  };

  const handleCloseDialogs = () => {
    setIsCreateDialogOpen(false);
    setIsSaving(false);
    resetForm();
  };

  const handleCloseDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setDeleteTarget(null);
    setDeleteError(null);
    setIsDeleting(false);
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) {
      setFormError("You must be signed in to create a design system.");
      return;
    }

    const trimmedName = formValues.name.trim();
    if (!trimmedName) {
      setFormError("Name is required.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const { error } = await supabase.from("design_systems").insert({
        name: trimmedName,
        description: formValues.description.trim() || null,
        design_rules: formValues.design_rules.trim(),
        owner_id: userId,
      });

      if (error) {
        throw error;
      }

      await fetchDesignSystems();
      handleCloseDialogs();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to create design system.",
      );
    } finally {
      setIsSaving(false);
    }
  };


  const handleDeleteDesignSystem = async () => {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const targetId = String(deleteTarget.id);
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
        .eq("id", deleteTarget.id);

      if (deleteErrorResult) {
        throw deleteErrorResult;
      }

      await fetchDesignSystems();
      handleCloseDeleteDialog();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete design system.",
      );
      setIsDeleting(false);
    }
  };

  const shouldShowEmptyState = !isLoading && designSystems.length === 0;

  const emptyStateContent = (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/40 px-10 py-12">
        <h2 className="text-2xl font-semibold mb-3">No design systems yet</h2>
        <p className="text-muted-foreground max-w-md">
          Create a design system to capture your preferred components, tokens, and prompts. Once saved, it will appear here and can be reused across prototypes.
        </p>
      </div>
    </div>
  );

  return (
    <>
      <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
        {/* Page Header */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-xl sm:text-2xl md:text-title-xl2 font-bold text-black dark:text-white mb-2">
                  Design Systems
                </CardTitle>
                <CardDescription className="text-sm sm:text-base text-body dark:text-bodydark">
                  {shouldShowEmptyState
                    ? "Centralize the design rules you want Materialize to follow when generating UI."
                    : "Review the custom design systems available to your projects."}
                </CardDescription>
              </div>

              {/* Create Design System Button */}
              <div className="flex-shrink-0">
                <Button
                  onClick={handleOpenCreateDialog}
                  size="lg"
                  className="w-full sm:w-auto gap-2"
                  disabled={!canMutate || isSaving || isLoading}
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">New Design System</span>
                  <span className="sm:hidden">New</span>
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary"></div>
          </div>
        ) : shouldShowEmptyState ? (
          emptyStateContent
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {designSystems.map((system) => {
              const hasRules = Boolean(system.design_rules?.trim());

              return (
                <Card
                  key={system.id}
                  className="flex flex-col border-border/60 bg-background/80 backdrop-blur cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => router.push(`/dashboard/design-systems/${system.id}`)}
                >
                  <CardHeader className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <CardTitle className="text-xl font-semibold text-foreground">
                          {system.name}
                        </CardTitle>
                        {system.description && (
                          <p className="text-sm text-muted-foreground">{system.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {canMutate && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDeleteDialog(system);
                            }}
                            disabled={isDeleting || isSaving}
                            className="flex items-center gap-1"
                          >
                            <Trash className="h-4 w-4" /> Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">

                    <div className="flex-1">
                      <h3 className="mb-2 text-sm font-semibold text-foreground">Design Rules</h3>
                      {hasRules ? (
                        <ScrollArea className="max-h-56 rounded-md border border-border/60 bg-muted/40 p-3">
                          <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {system.design_rules}
                          </pre>
                        </ScrollArea>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No custom rules provided.
                        </p>
                      )}
                    </div>

                    {hasRules && (
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyRules(system)}
                          className="gap-2"
                        >
                          {copiedId === system.id ? (
                            <>
                              <Check className="h-4 w-4" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" /> Copy rules
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDialogs();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Create design system</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="design-system-name">Name</Label>
                <Input
                  id="design-system-name"
                  value={formValues.name}
                  onChange={handleFieldChange("name")}
                  placeholder="e.g. Studio Aurora"
                  autoFocus
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="design-system-description">Description (optional)</Label>
                <Input
                  id="design-system-description"
                  value={formValues.description}
                  onChange={handleFieldChange("description")}
                  placeholder="Short summary of the design system"
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="design-system-rules">Design rules</Label>
                <Textarea
                  id="design-system-rules"
                  value={formValues.design_rules}
                  onChange={handleFieldChange("design_rules")}
                  placeholder="Instructions, tokens, component choices, or prompts Materialize should follow"
                  rows={8}
                  disabled={isSaving}
                />
              </div>
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialogs} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDeleteDialog();
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
          {deleteTarget && (
            <p className="text-sm text-muted-foreground">
              Request to delete <span className="font-medium text-foreground">{deleteTarget.name}</span>.
            </p>
          )}
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCloseDeleteDialog} disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDesignSystem}
              disabled={isDeleting || !deleteTarget}
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
