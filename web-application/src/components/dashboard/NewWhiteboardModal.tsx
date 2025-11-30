"use client";

import { supabase } from "@/ClientConstants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { FolderIcon, PaintBrushIcon } from "@heroicons/react/24/outline";
import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

interface NewWhiteboardModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onCreated: () => void;
  projectId?: string;
}

export default function NewWhiteboardModal({
  open,
  onClose,
  user,
  onCreated,
  projectId,
}: NewWhiteboardModalProps) {
  const logger = useProductLogger();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Set initial project selection
  useEffect(() => {
    if (projectId && projects.length > 0) {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        setSelectedFolder(project.id);
      }
    }
  }, [projectId, projects]);

  // Fetch user's projects
  useEffect(() => {
    async function fetchProjects() {
      if (!user) return;

      setIsLoadingProjects(true);
      try {
        const { data, error } = await supabase
          .from("folders")
          .select("id, name")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false });

        if (error) {
          logger.debug("error", "Error fetching projects:", {
            ...error,
          });
          return;
        }
        setProjects(data || []);
      } catch (error) {
        logger.debug("error", "Error fetching projects:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } finally {
        setIsLoadingProjects(false);
      }
    }

    if (open && user) {
      fetchProjects();
    }
  }, [open, user, logger]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !user) return;
    setIsCreating(true);

    try {
      const { error } = await supabase.from("canvases").insert({
        owner_id: user.id,
        folder_id: selectedFolder || null,
        name: name.trim(),
        description,
        thumbnail_url:
          "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&h=600&fit=crop&crop=center",
      });

      if (error) {
        logger.debug("error", "Error creating canvas:", {
          ...error,
        });
        throw error;
      }

      // Reset form
      setName("");
      setDescription("");
      setSelectedFolder(null);
      setTouched(false);
      onCreated();
      onClose();
    } catch (error) {
      logger.debug("error", "Error creating canvas:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center space-y-4">
          <div className="flex items-center justify-center">
            <div className="p-3 bg-muted rounded-lg">
              <PaintBrushIcon className="w-6 h-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-2xl font-bold text-foreground">
            Create New Whiteboard
          </DialogTitle>
          <p className="text-muted-foreground">
            Design and brainstorm on an infinite canvas
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="whiteboard-name" className="text-sm font-semibold">
              Whiteboard Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="whiteboard-name"
              type="text"
              placeholder="e.g. Marketing Brainstorm ✨"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`h-12 text-lg ${
                touched && !name.trim()
                  ? "border-destructive focus-visible:ring-destructive"
                  : "focus-visible:ring-primary"
              }`}
              autoFocus
              maxLength={64}
            />
            {touched && !name.trim() && (
              <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
                <span>Whiteboard name is required</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-semibold">
              Description
            </Label>
            <Textarea
              id="description"
              placeholder="Describe your infinite canvas (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] resize-none"
              maxLength={256}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-select" className="text-sm font-semibold">
              Project
            </Label>
            <Select
              value={selectedFolder || "none"}
              onValueChange={(value) =>
                setSelectedFolder(value === "none" ? null : value)
              }
            >
              <SelectTrigger className="h-12">
                <div className="flex items-center gap-2">
                  <FolderIcon className="w-4 h-4 text-primary" />
                  <SelectValue placeholder="Select a project (optional)" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {isLoadingProjects ? (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                    Loading projects...
                  </div>
                ) : (
                  projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <div className="flex items-center gap-2">
                        <FolderIcon className="w-4 h-4 text-primary" />
                        {project.name}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            disabled={isCreating || !name.trim()}
            className="w-full h-12"
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin mr-2"></div>
                Creating...
              </>
            ) : (
              <>
                <PaintBrushIcon className="w-5 h-5 mr-2" />
                Create Whiteboard
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
