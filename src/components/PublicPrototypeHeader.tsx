"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Database } from "@/lib/types/database.types";
import {
  DocumentDuplicateIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ShareIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];
type User = Database["public"]["Tables"]["users"]["Row"];

interface PublicPrototypeHeaderProps {
  prototype: Prototype;
  prototypeFiles: Record<string, PrototypeFile>;
  user: User | null;
  isCloning: boolean;
  onClonePrototype: () => void;
  onUpdatePrototype: (updatedPrototype: Prototype) => void;
}

export default function PublicPrototypeHeader({
  prototype,
  prototypeFiles,
  user,
  isCloning,
  onClonePrototype,
  onUpdatePrototype,
}: PublicPrototypeHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStartEdit = () => {
    if (!prototype || !user || prototype.owner_id !== user.id) return;
    setEditedName(prototype.name);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedName("");
  };

  const handleSaveEdit = async () => {
    if (!prototype || !user || !editedName.trim()) return;

    try {
      setIsUpdating(true);

      const { error } = await import("@/ClientConstants").then(
        ({ supabase }) =>
          supabase
            .from("prototypes")
            .update({ name: editedName.trim() })
            .eq("id", prototype.id)
      );

      if (error) {
        throw error;
      }

      // Update local state via callback
      onUpdatePrototype({ ...prototype, name: editedName.trim() });
      setIsEditing(false);
      setEditedName("");
    } catch (err) {
      console.error("Error updating prototype name:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex-shrink-0 bg-background border-b border-border">
      <div className="px-8 py-6">
        <div className="flex items-center justify-between">
          {/* Left side - Prototype info */}
          <div className="flex items-center gap-6 group">
            <div className="p-4 bg-primary text-primary-foreground rounded-lg">
              <SparklesIcon className="w-8 h-8" />
            </div>

            <div>
              <div className="flex items-center gap-3 mb-2">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="text-3xl font-bold text-foreground bg-background border-2 border-primary/50 focus:border-primary"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveEdit();
                        } else if (e.key === "Escape") {
                          handleCancelEdit();
                        }
                      }}
                      autoFocus
                      disabled={isUpdating}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveEdit}
                      disabled={isUpdating || !editedName.trim()}
                      className="h-8 w-8 p-0"
                    >
                      {isUpdating ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <CheckIcon className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelEdit}
                      disabled={isUpdating}
                      className="h-8 w-8 p-0"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-foreground">
                      {prototype.name}
                    </h1>
                    {user && prototype.owner_id === user.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleStartEdit}
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {prototype.description && (
                <p className="text-muted-foreground text-lg leading-relaxed">
                  {prototype.description}
                </p>
              )}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
                    {Object.keys(prototypeFiles).length} files
                  </Badge>
                  <Badge variant="outline">
                    {prototype.visibility?.toLowerCase() || "private"}
                  </Badge>
                </div>
                {prototype.created_at && (
                  <div className="text-sm text-muted-foreground">
                    Created{" "}
                    {new Date(prototype.created_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right side - Action buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={onClonePrototype}
              disabled={isCloning || !user}
              size="lg"
            >
              {isCloning ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                  Cloning...
                </>
              ) : (
                <>
                  <DocumentDuplicateIcon className="w-4 h-4 mr-2" />
                  Clone Prototype
                </>
              )}
            </Button>

            <Button variant="outline" size="icon">
              <ShareIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}