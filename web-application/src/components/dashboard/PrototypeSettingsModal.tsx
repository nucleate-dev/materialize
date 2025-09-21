"use client";

import { supabase } from "@/ClientConstants";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import type {
  APIResponse,
  DeletePrototypeSuccessResponse,
  DeletePrototypeErrorResponse,
} from "@/lib/types/serverAPITypes";
import { useEffect, useState } from "react";

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
  const logger = useProductLogger();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] =
    useState<Database["public"]["Enums"]["visibility_level"]>("SELF");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { userPlan } = useSubscriptionAccess();

  useEffect(() => {
    if (prototype) {
      setName(prototype.name || "");
      setDescription(prototype.description || "");
      setVisibility(
        (prototype.visibility ??
          "SELF") as Database["public"]["Enums"]["visibility_level"],
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
      logger.debug("error", "Error updating prototype:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!prototype) return;
    const confirmed = window.confirm(
      "Are you sure you want to delete this prototype?",
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      // Get the current session to get the JWT token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        logger.debug("error", "No authentication token available");
        return;
      }

      // Make DELETE request to the new API endpoint
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/${prototype.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      const responseData: APIResponse<DeletePrototypeSuccessResponse, DeletePrototypeErrorResponse> =
        await response.json();

      if (!response.ok || responseData.error) {
        const errorMessage = responseData.error?.message || "Failed to delete prototype";
        throw new Error(errorMessage);
      }

      // Success - refresh the parent component and close modal
      onUpdated();
      onClose();
    } catch (error) {
      logger.debug("error", "Error deleting prototype:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // You could add a toast notification here to show the error to the user
    } finally {
      setIsSubmitting(false);
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
                  setVisibility(
                    v as Database["public"]["Enums"]["visibility_level"],
                  )
                }
                disabled={isSubmitting || userPlan !== "pro"}
              >
                <SelectTrigger id="prototype-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SELF">Private</SelectItem>
                  <SelectItem value="PUBLIC">Public</SelectItem>
                </SelectContent>
              </Select>
              {userPlan !== "pro" && (
                <p className="text-xs text-muted-foreground">
                  Upgrade to Pro to change prototype visibility settings.
                </p>
              )}
            </div>
            <DialogFooter className="flex justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="cursor-pointer"
              >
                {isSubmitting ? "Deleting..." : "Delete Prototype"}
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className={isSubmitting ? "" : "cursor-pointer"}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
