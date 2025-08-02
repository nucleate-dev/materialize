"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/database.types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PrototypeSettingsModalProps {
  open: boolean;
  onClose: () => void;
  prototype: Database["public"]["Tables"]["prototypes"]["Row"] | null;
  onUpdated: () => void;
}

export default function PrototypeSettingsModal({
  open,
  onClose,
  prototype,
  onUpdated,
}: PrototypeSettingsModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<
    Database["public"]["Enums"]["visibility_level"]
  >("SELF");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (prototype) {
      setName(prototype.name || "");
      setDescription(prototype.description || "");
      setVisibility(
        (prototype.visibility ?? "SELF") as Database["public"]["Enums"]["visibility_level"]
      );
    }
  }, [prototype]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prototype) return;
    setIsSubmitting(true);
    try {
      await supabase
        .from("prototypes")
        .update({
          name,
          description: description || null,
          visibility,
        })
        .eq("id", prototype.id);
      onUpdated();
      onClose();
    } catch (error) {
      console.error("Error updating prototype:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!prototype) return;
    const confirmed = window.confirm(
      "Are you sure you want to delete this prototype?"
    );
    if (!confirmed) return;
    try {
      await supabase.from("prototypes").delete().eq("id", prototype.id);
      onUpdated();
      onClose();
    } catch (error) {
      console.error("Error deleting prototype:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Prototype settings</DialogTitle>
        </DialogHeader>
        {prototype && (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prototype-name">Name</Label>
              <Input
                id="prototype-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prototype-description">Description</Label>
              <Textarea
                id="prototype-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prototype-visibility">Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(v) =>
                  setVisibility(v as Database["public"]["Enums"]["visibility_level"])
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="prototype-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SELF">Self</SelectItem>
                  <SelectItem value="PUBLIC">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="flex justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                Delete Prototype
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
