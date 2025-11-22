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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import { ArrowLeft, Code2, Loader2, Save, Trash, Type } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";

type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];

interface DesignSystemDetailPageProps {
  params: Promise<{
    "design-system-id": string;
  }>;
}

// --- Visual Background ---
const GridBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none select-none -z-10">
    <div className="absolute inset-0 bg-[#0B0C0E]" />
    <div className="absolute top-[10%] left-[20%] w-[40%] h-[40%] bg-purple-500/5 blur-[120px] rounded-full mix-blend-screen" />
    <div
      className="absolute inset-0 opacity-[0.02]"
      style={{
        backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }}
    />
  </div>
);

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
      <div className="relative min-h-screen flex items-center justify-center">
        <GridBackground />
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
          <p className="text-sm font-medium">Loading system...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-foreground font-sans">
      <GridBackground />

      <div className="container mx-auto px-6 py-12 max-w-5xl">

        {/* --- Header --- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/dashboard/design-systems")}
              className="h-10 w-10 rounded-full"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-medium tracking-tight">
                  {designSystem.name}
                </h1>
                {hasChanges && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border border-yellow-500/20 uppercase tracking-wider">
                    Unsaved
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Design System Editor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={isDeleting || isSaving}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Delete</span>
            </Button>

            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="h-9 px-6 rounded-full font-medium transition-all shadow-lg"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>

        {/* --- Editor Layout --- */}
        <div className="grid gap-8 max-w-4xl mx-auto">

          {/* Configuration Panel */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-accent/20 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Type className="w-4 h-4" />
              Metadata
            </div>
            <div className="p-6 grid gap-6">
              <div className="grid gap-2">
                <label className="text-sm font-medium">System Name</label>
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  placeholder="e.g. Studio Aurora"
                  disabled={isSaving}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder="Short summary of the design system"
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>

          {/* Code Editor Panel */}
          <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col h-[600px]">
            <div className="px-6 py-4 border-b border-border bg-accent/20 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Code2 className="w-4 h-4" />
                Design Rules
              </div>
              <div className="text-xs text-muted-foreground/60">
                Markdown & Tokens supported
              </div>
            </div>
            <div className="flex-1 relative">
              <Textarea
                value={editedDesignRules}
                onChange={(e) => setEditedDesignRules(e.target.value)}
                placeholder="// Enter instructions, tokens, or specific rules for the AI to follow..."
                disabled={isSaving}
                className="absolute inset-0 w-full h-full p-6 border-none focus:ring-0 resize-none font-mono text-sm leading-relaxed rounded-none"
              />
            </div>
          </div>

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
            <AlertDialogTitle>Delete design system?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. It will permanently delete <span className="font-medium">{designSystem.name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">{deleteError}</p>
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
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}