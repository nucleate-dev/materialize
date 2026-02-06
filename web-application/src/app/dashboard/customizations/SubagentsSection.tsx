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
import { Badge } from "@/components/ui/badge";
import { useTeamSubagents } from "@/hooks/useTeamSubagents";
import { Loader2, Plus, Bot, Trash, Pencil, Search } from "lucide-react";
import { Database } from "@/lib/types/supabase";

type TeamSubagent = Database["public"]["Tables"]["team_subagents"]["Row"];

interface SubagentsSectionProps {
  teamId: string | null;
}

// Common SDK tools that can be assigned to subagents
const AVAILABLE_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "mcp__devtools__SafeBash",
  "mcp__devtools__SafeWrite",
  "mcp__devtools__RestartDevServer",
  "mcp__design__GeminiDesignExpert",
];

export function SubagentsSection({ teamId }: SubagentsSectionProps) {
  const {
    subagents,
    isLoading,
    createSubagent,
    updateSubagent,
    deleteSubagent,
    toggleSubagent,
  } = useTeamSubagents();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamSubagent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamSubagent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [formValues, setFormValues] = useState({
    agent_name: "",
    description: "",
    system_prompt: "",
    allowed_tools: [] as string[],
  });

  const canMutate = Boolean(teamId);
  const isSaving = createSubagent.isPending || updateSubagent.isPending;
  const isDeleting = deleteSubagent.isPending;

  const resetForm = () => {
    setFormValues({
      agent_name: "",
      description: "",
      system_prompt: "",
      allowed_tools: [],
    });
    setFormError(null);
  };

  const handleOpenCreateDialog = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const handleOpenEditDialog = (agent: TeamSubagent) => {
    setEditTarget(agent);
    setFormValues({
      agent_name: agent.agent_name,
      description: agent.description,
      system_prompt: agent.system_prompt,
      allowed_tools: agent.allowed_tools ?? [],
    });
    setFormError(null);
    setIsEditDialogOpen(true);
  };

  const handleOpenDeleteDialog = (agent: TeamSubagent) => {
    setDeleteTarget(agent);
    setIsDeleteDialogOpen(true);
  };

  const handleCloseDialogs = () => {
    setIsCreateDialogOpen(false);
    setIsEditDialogOpen(false);
    setEditTarget(null);
    resetForm();
  };

  const toggleTool = (tool: string) => {
    setFormValues((prev) => ({
      ...prev,
      allowed_tools: prev.allowed_tools.includes(tool)
        ? prev.allowed_tools.filter((t) => t !== tool)
        : [...prev.allowed_tools, tool],
    }));
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = formValues.agent_name.trim();
    if (!trimmedName) {
      setFormError("Agent name is required.");
      return;
    }
    if (!formValues.description.trim()) {
      setFormError("Description is required.");
      return;
    }
    if (!formValues.system_prompt.trim()) {
      setFormError("System prompt is required.");
      return;
    }

    try {
      await createSubagent.mutateAsync({
        agent_name: trimmedName,
        description: formValues.description.trim(),
        system_prompt: formValues.system_prompt,
        allowed_tools: formValues.allowed_tools,
      });
      handleCloseDialogs();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to create subagent."
      );
    }
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTarget) return;

    const trimmedName = formValues.agent_name.trim();
    if (!trimmedName) {
      setFormError("Agent name is required.");
      return;
    }

    try {
      await updateSubagent.mutateAsync({
        id: editTarget.id,
        updates: {
          agent_name: trimmedName,
          description: formValues.description.trim(),
          system_prompt: formValues.system_prompt,
          allowed_tools: formValues.allowed_tools,
        },
      });
      handleCloseDialogs();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to update subagent."
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSubagent.mutateAsync(deleteTarget.id);
      setIsDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete subagent:", error);
    }
  };

  const handleToggle = async (agent: TeamSubagent) => {
    try {
      await toggleSubagent.mutateAsync({
        id: agent.id,
        isEnabled: !agent.is_enabled,
      });
    } catch (error) {
      console.error("Failed to toggle subagent:", error);
    }
  };

  const filteredSubagents = subagents.filter((s) =>
    s.agent_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const shouldShowEmptyState = !isLoading && subagents.length === 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        {!shouldShowEmptyState && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Filter subagents..."
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
          Add Subagent
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4 text-muted-foreground/50" />
          <p className="text-sm font-medium animate-pulse">
            Loading subagents...
          </p>
        </div>
      ) : shouldShowEmptyState ? (
        <div className="flex flex-col items-center justify-center py-24 border border-dashed border-border rounded-2xl bg-accent/20">
          <div className="p-4 bg-accent rounded-full mb-4">
            <Bot className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-medium mb-2">No subagents yet</h2>
          <p className="text-muted-foreground max-w-md text-center mb-6">
            Create custom AI subagents with specialized prompts and tool access.
          </p>
          <Button onClick={handleOpenCreateDialog} variant="outline">
            Create your first subagent
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSubagents.map((agent) => (
            <div
              key={agent.id}
              className="group flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:border-border/80 transition-all"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Switch
                  checked={agent.is_enabled}
                  onCheckedChange={() => handleToggle(agent)}
                  disabled={toggleSubagent.isPending}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium truncate">{agent.agent_name}</h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {agent.description}
                  </p>
                  {agent.allowed_tools.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {agent.allowed_tools.slice(0, 3).map((tool) => (
                        <Badge
                          key={tool}
                          variant="secondary"
                          className="text-xs"
                        >
                          {tool}
                        </Badge>
                      ))}
                      {agent.allowed_tools.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{agent.allowed_tools.length - 3} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleOpenEditDialog(agent)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                  onClick={() => handleOpenDeleteDialog(agent)}
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Create Subagent</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Agent Name</Label>
                <Input
                  id="agent-name"
                  value={formValues.agent_name}
                  onChange={(e) =>
                    setFormValues({ ...formValues, agent_name: e.target.value })
                  }
                  placeholder="e.g. Code Reviewer"
                  autoFocus
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-description">Description</Label>
                <Input
                  id="agent-description"
                  value={formValues.description}
                  onChange={(e) =>
                    setFormValues({ ...formValues, description: e.target.value })
                  }
                  placeholder="When should this agent be used?"
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-prompt">System Prompt</Label>
                <Textarea
                  id="agent-prompt"
                  value={formValues.system_prompt}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      system_prompt: e.target.value,
                    })
                  }
                  placeholder="Instructions for the subagent..."
                  rows={8}
                  disabled={isSaving}
                  className="resize-none font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Allowed Tools</Label>
                <div className="flex flex-wrap gap-2 p-3 border border-border rounded-lg bg-accent/20">
                  {AVAILABLE_TOOLS.map((tool) => (
                    <Badge
                      key={tool}
                      variant={
                        formValues.allowed_tools.includes(tool)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer"
                      onClick={() => toggleTool(tool)}
                    >
                      {tool}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Click to toggle which tools this subagent can use
                </p>
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleEditSubmit} className="space-y-6">
            <DialogHeader>
              <DialogTitle>Edit Subagent</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-agent-name">Agent Name</Label>
                <Input
                  id="edit-agent-name"
                  value={formValues.agent_name}
                  onChange={(e) =>
                    setFormValues({ ...formValues, agent_name: e.target.value })
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-agent-description">Description</Label>
                <Input
                  id="edit-agent-description"
                  value={formValues.description}
                  onChange={(e) =>
                    setFormValues({ ...formValues, description: e.target.value })
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-agent-prompt">System Prompt</Label>
                <Textarea
                  id="edit-agent-prompt"
                  value={formValues.system_prompt}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      system_prompt: e.target.value,
                    })
                  }
                  rows={8}
                  disabled={isSaving}
                  className="resize-none font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Allowed Tools</Label>
                <div className="flex flex-wrap gap-2 p-3 border border-border rounded-lg bg-accent/20">
                  {AVAILABLE_TOOLS.map((tool) => (
                    <Badge
                      key={tool}
                      variant={
                        formValues.allowed_tools.includes(tool)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer"
                      onClick={() => toggleTool(tool)}
                    >
                      {tool}
                    </Badge>
                  ))}
                </div>
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
            <AlertDialogTitle>Delete subagent?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. It will permanently delete{" "}
              <span className="font-medium">{deleteTarget?.agent_name}</span>.
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
