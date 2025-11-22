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
import { Check, Copy, Loader2, Paintbrush, Plus, Search, Trash } from "lucide-react";

type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];

// --- Visual Background (Consistent) ---
const GridBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none select-none -z-10">
    <div className="absolute inset-0 bg-[#0B0C0E]" />
    <div className="absolute top-[10%] right-[-5%] w-[40%] h-[40%] bg-purple-500/5 blur-[120px] rounded-full mix-blend-screen" />
    <div
      className="absolute inset-0 opacity-[0.02]"
      style={{
        backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }}
    />
  </div>
);

export default function DesignSystemsPage() {
  const { user } = useUser();
  const router = useRouter();
  const logger = useProductLogger();

  const [designSystems, setDesignSystems] = useState<DesignSystemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DesignSystemRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(""); // Added for UI polish
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

  const filteredSystems = designSystems.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const shouldShowEmptyState = !isLoading && designSystems.length === 0;

  return (
    <div className="relative min-h-screen text-foreground font-sans">
      <GridBackground />

      <div className="container mx-auto px-6 py-12 max-w-7xl">

        {/* --- Header --- */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight">
              Design Systems
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Centralize your tokens, components, and design rules.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search (Visual) */}
            {!shouldShowEmptyState && (
              <div className="hidden md:flex relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type="text"
                  placeholder="Filter systems..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-56 bg-accent/50 border border-border rounded-full pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border focus:bg-accent transition-all"
                />
              </div>
            )}

            <Button
              onClick={handleOpenCreateDialog}
              className="h-9 px-5 rounded-full font-semibold text-sm transition-all gap-2"
              disabled={!canMutate || isSaving || isLoading}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New System</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>

        {/* --- Content Grid --- */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4 text-muted-foreground/50" />
            <p className="text-sm font-medium animate-pulse">Loading design systems...</p>
          </div>
        ) : shouldShowEmptyState ? (
          <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border rounded-2xl bg-accent/20">
            <div className="p-4 bg-accent rounded-full mb-4">
              <Paintbrush className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-medium mb-2">No design systems yet</h2>
            <p className="text-muted-foreground max-w-md text-center mb-6">
              Create a design system to capture your preferred components, tokens, and prompts.
            </p>
            <Button onClick={handleOpenCreateDialog} variant="outline">
              Create your first system
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {filteredSystems.map((system) => {
              const hasRules = Boolean(system.design_rules?.trim());

              return (
                <div
                  key={system.id}
                  className="group relative flex flex-col bg-card border border-border rounded-xl overflow-hidden transition-all duration-300 hover:border-border/80 hover:shadow-2xl cursor-pointer"
                  onClick={() => router.push(`/dashboard/design-systems/${system.id}`)}
                >
                  {/* Card Header */}
                  <div className="p-6 border-b border-border bg-accent/20">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <h3 className="text-lg font-medium group-hover:text-primary transition-colors">
                          {system.name}
                        </h3>
                        {system.description && (
                          <p className="text-sm text-muted-foreground">{system.description}</p>
                        )}
                      </div>
                      <div className="flex items-center">
                        {canMutate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDeleteDialog(system);
                            }}
                            disabled={isDeleting || isSaving}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Content (Rules Preview) */}
                  <div className="flex-1 p-6 bg-accent/10">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rules Snippet</span>
                      {hasRules && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyRules(system);
                          }}
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
                        >
                          {copiedId === system.id ? (
                            <>
                              <Check className="h-3 w-3 mr-1.5" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 mr-1.5" /> Copy
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    <ScrollArea className="h-32 w-full rounded-lg border border-border bg-background">
                      <div className="p-3 font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                        {hasRules ? system.design_rules : <span className="italic opacity-50">No custom rules defined.</span>}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- Modals (Styled) --- */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseDialogs();
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
                  placeholder="Short summary..."
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="design-system-rules">Design rules</Label>
                <Textarea
                  id="design-system-rules"
                  value={formValues.design_rules}
                  onChange={handleFieldChange("design_rules")}
                  placeholder="Instructions, tokens, or prompts..."
                  rows={8}
                  disabled={isSaving}
                  className="resize-none font-mono text-sm"
                />
              </div>
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleCloseDialogs} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseDeleteDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete design system?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. It will permanently delete <span className="font-medium">{deleteTarget?.name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">{deleteError}</p>
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
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}