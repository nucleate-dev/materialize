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
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { useActiveTeam } from "@/contexts/TeamContext";
import { Rocket, Sparkles } from "lucide-react";
import { User } from "@supabase/supabase-js";
import { useState } from "react";

interface NewFolderModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onCreated: (folderId: string) => void;
}

export default function NewFolderModal({
  open,
  onClose,
  user,
  onCreated,
}: NewFolderModalProps) {
  const logger = useProductLogger();
  const { activeTeam } = useActiveTeam();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !user || !activeTeam?.id) return;
    setIsCreating(true);

    try {
      const { data, error } = await supabase
        .from("folders")
        .insert({
          name: name.trim(),
          team_id: activeTeam.id,
          description: null,
          folder_context: null,
          thumbnail_url: null,
          visibility: "SELF" as const,
        })
        .select()
        .single();

      if (error) {
        logger.debug("error", "Error creating folder:", {
          ...error,
        });
        throw error;
      }

      // Reset form
      setName("");
      setTouched(false);
      onCreated(data.id);
      onClose();
    } catch (error) {
      logger.debug("error", "Error creating folder:", {
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
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-2xl font-bold text-foreground">
            Create New Folder
          </DialogTitle>
          <p className="text-muted-foreground">
            Start a new folder to organize your work
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="folder-name" className="text-sm font-semibold">
              Folder Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="folder-name"
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
                <span>Folder name is required</span>
              </div>
            )}
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
                <Rocket className="w-5 h-5 mr-2" />
                Create Folder
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
