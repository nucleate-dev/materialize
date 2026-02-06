"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTeamSkills } from "@/hooks/useTeamSkills";
import {
  Loader2,
  Plus,
  Sparkles,
  Trash,
  Pencil,
  Search,
} from "lucide-react";
import { Database } from "@/lib/types/supabase";

type TeamSkill = Database["public"]["Tables"]["team_skills"]["Row"];

interface SkillsSectionProps {
  teamId: string | null;
}

export function SkillsSection({ teamId }: SkillsSectionProps) {
  const {
    skills,
    isLoading,
    createSkill,
    updateSkill,
    deleteSkill,
    toggleSkill,
  } = useTeamSkills();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamSkill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamSkill | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [formValues, setFormValues] = useState({
    name: "",
    description: "",
    skill_content: "",
  });

  const canMutate = Boolean(teamId);
  const isSaving = createSkill.isPending || updateSkill.isPending;
  const isDeleting = deleteSkill.isPending;

  const resetForm = () => {
    setFormValues({ name: "", description: "", skill_content: "" });
    setFormError(null);
  };

  const handleOpenCreateDialog = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const handleOpenEditDialog = (skill: TeamSkill) => {
    setEditTarget(skill);
    setFormValues({
      name: skill.name,
      description: skill.description ?? "",
      skill_content: skill.skill_content,
    });
    setFormError(null);
    setIsEditDialogOpen(true);
  };

  const handleOpenDeleteDialog = (skill: TeamSkill) => {
    setDeleteTarget(skill);
    setIsDeleteDialogOpen(true);
  };

  const handleCloseDialogs = () => {
    setIsCreateDialogOpen(false);
    setIsEditDialogOpen(false);
    setEditTarget(null);
    resetForm();
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = formValues.name.trim();
    if (!trimmedName) {
      setFormError("Name is required.");
      return;
    }
    if (!formValues.skill_content.trim()) {
      setFormError("Skill content is required.");
      return;
    }

    try {
      await createSkill.mutateAsync({
        name: trimmedName,
        description: formValues.description.trim() || null,
        skill_content: formValues.skill_content,
      });
      handleCloseDialogs();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to create skill."
      );
    }
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTarget) return;

    const trimmedName = formValues.name.trim();
    if (!trimmedName) {
      setFormError("Name is required.");
      return;
    }

    try {
      await updateSkill.mutateAsync({
        id: editTarget.id,
        updates: {
          name: trimmedName,
          description: formValues.description.trim() || null,
          skill_content: formValues.skill_content,
        },
      });
      handleCloseDialogs();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to update skill."
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSkill.mutateAsync(deleteTarget.id);
      setIsDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete skill:", error);
    }
  };

  const handleToggle = async (skill: TeamSkill) => {
    try {
      await toggleSkill.mutateAsync({
        id: skill.id,
        isEnabled: !skill.is_enabled,
      });
    } catch (error) {
      console.error("Failed to toggle skill:", error);
    }
  };

  const filteredSkills = skills.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const shouldShowEmptyState = !isLoading && skills.length === 0;

  return (
    <div>
      {/* Header with search and create button */}
      <div className="flex items-center justify-between gap-4 mb-6">
        {!shouldShowEmptyState && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Filter skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full bg-accent/50 border border-border rounded-lg pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border focus:bg-accent transition-all"
            />
          </div>
        )}
        <Button
          onClick={handleOpenCreateDialog}
          className="h-9 px-5 rounded-lg font-semibold text-sm gap-2"
          disabled={!canMutate || isSaving || isLoading}
        >
          <Plus className="w-4 h-4" />
          Add Skill
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4 text-muted-foreground/50" />
          <p className="text-sm font-medium animate-pulse">Loading skills...</p>
        </div>
      ) : shouldShowEmptyState ? (
        <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border rounded-2xl bg-accent/20">
          <div className="p-4 bg-accent rounded-full mb-4">
            <Sparkles className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-medium mb-2">No skills yet</h2>
          <p className="text-muted-foreground max-w-md text-center mb-6">
            Create custom skills to teach your AI specialized capabilities.
          </p>
          <Button onClick={handleOpenCreateDialog} variant="outline">
            Create your first skill
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSkills.map((skill) => (
            <div
              key={skill.id}
              className="group flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:border-border/80 transition-all"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Switch
                  checked={skill.is_enabled}
                  onCheckedChange={() => handleToggle(skill)}
                  disabled={toggleSkill.isPending}
                />
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{skill.name}</h3>
                  {skill.description && (
                    <p className="text-sm text-muted-foreground truncate">
                      {skill.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleOpenEditDialog(skill)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                  onClick={() => handleOpenDeleteDialog(skill)}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Create Skill</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="skill-name">Name</Label>
                <Input
                  id="skill-name"
                  value={formValues.name}
                  onChange={(e) =>
                    setFormValues({ ...formValues, name: e.target.value })
                  }
                  placeholder="e.g. React Native Expert"
                  autoFocus
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-description">Description (optional)</Label>
                <Input
                  id="skill-description"
                  value={formValues.description}
                  onChange={(e) =>
                    setFormValues({ ...formValues, description: e.target.value })
                  }
                  placeholder="When should this skill be used?"
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-content">
                  Skill Content (SKILL.md format)
                </Label>
                <Textarea
                  id="skill-content"
                  value={formValues.skill_content}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      skill_content: e.target.value,
                    })
                  }
                  placeholder={`---
name: my-skill
description: When to use this skill
---

# My Skill

Instructions for the AI...`}
                  rows={12}
                  disabled={isSaving}
                  className="resize-none font-mono text-sm"
                />
              </div>
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCloseDialogs}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Create"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={handleEditSubmit} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Edit Skill</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-skill-name">Name</Label>
                <Input
                  id="edit-skill-name"
                  value={formValues.name}
                  onChange={(e) =>
                    setFormValues({ ...formValues, name: e.target.value })
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-skill-description">
                  Description (optional)
                </Label>
                <Input
                  id="edit-skill-description"
                  value={formValues.description}
                  onChange={(e) =>
                    setFormValues({ ...formValues, description: e.target.value })
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-skill-content">Skill Content</Label>
                <Textarea
                  id="edit-skill-content"
                  value={formValues.skill_content}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      skill_content: e.target.value,
                    })
                  }
                  rows={12}
                  disabled={isSaving}
                  className="resize-none font-mono text-sm"
                />
              </div>
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCloseDialogs}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete skill?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. It will permanently delete{" "}
              <span className="font-medium">{deleteTarget?.name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
