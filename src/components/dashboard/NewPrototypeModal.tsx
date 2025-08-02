"use client";

import { supabase } from "@/ClientConstants";
import { User } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
import {
  SparklesIcon,
  RocketLaunchIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDefaultPrototypeFiles } from "@/templates/defaultApp";

interface NewPrototypeModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onCreated: (prototypeId: string) => void;
  projectId?: string;
}

export default function NewPrototypeModal({
  open,
  onClose,
  user,
  onCreated,
  projectId,
}: NewPrototypeModalProps) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Fetch user's projects
  useEffect(() => {
    async function fetchProjects() {
      if (!user) return;

      setIsLoadingProjects(true);
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false });

        if (error) {
          console.error("Error fetching projects:", error);
          return;
        }
        console.log("Fetched projects:", data);
        setProjects(data || []);
      } catch (error) {
        console.error("Error fetching projects:", error);
      } finally {
        setIsLoadingProjects(false);
      }
    }
    if (open && user?.id) {
      fetchProjects();
    }
  }, [open, user, setIsLoadingProjects, setProjects]);

  // Set initial project selection
  useEffect(() => {
    if (projectId && projects.length > 0) {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        setSelectedProject(project.id);
      }
    }
  }, [projectId, projects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !user) return;
    setIsCreating(true);

    try {
      const { data, error } = await supabase
        .from("prototypes")
        .insert({
          name: name.trim(),
          owner_id: user.id,
          project_id: selectedProject || null,
          description: null,
          prototype_context: null,
          thumbnail_url: null,
          visibility: "SELF" as const,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating prototype:", error);
        throw error;
      }

      const { error: prototypeFilesInsertError } = await supabase
        .from("prototype_files")
        .insert(getDefaultPrototypeFiles(data.id));
      if (prototypeFilesInsertError) {
        console.error(
          "Error creating default prototype files:",
          prototypeFilesInsertError,
        );
        throw error;
      }

      // Reset form
      setName("");
      setSelectedProject(null);
      setTouched(false);
      onCreated(data.id);
      onClose();
    } catch (error) {
      console.error("Error creating prototype:", error);
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
              <SparklesIcon className="w-6 h-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-2xl font-bold text-foreground">
            Create New Prototype
          </DialogTitle>
          <p className="text-muted-foreground">
            Build interactive prototypes to test your ideas
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="prototype-name" className="text-sm font-semibold">
              Prototype Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="prototype-name"
              type="text"
              placeholder="e.g. E-commerce Mobile App ✨"
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
                <span>Prototype name is required</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-select" className="text-sm font-semibold">
              Project
            </Label>
            <Select
              value={selectedProject || "none"}
              onValueChange={(value) =>
                setSelectedProject(value === "none" ? null : value)
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
                <RocketLaunchIcon className="w-5 h-5 mr-2" />
                Create Prototype
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
