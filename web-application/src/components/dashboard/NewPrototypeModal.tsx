"use client";

import { supabase } from "@/ClientConstants";
import { User } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
import { Database } from "@/lib/types/database.types";
import type {
  CreatePrototypeRequestBody,
  CreatePrototypeResponse,
} from "@/lib/types/serverAPITypes";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
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
import ProPlanUpsellModal from "@/components/ProPlanUpsellModal";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { ProductKeys } from "@/GlobalConstants";
import { useRouter } from "next/navigation";

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
  const { userPlan } = useSubscriptionAccess();
  const [visibility, setVisibility] = useState<
    Database["public"]["Enums"]["visibility_level"]
  >(userPlan === "pro" ? "SELF" : "PUBLIC");
  const [prototypeCount, setPrototypeCount] = useState(0);
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const router = useRouter();

  // Fetch user's projects and prototype count
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

    async function fetchPrototypeCount() {
      if (!user) return;

      setIsLoadingCount(true);
      try {
        const { count, error } = await supabase
          .from("prototypes")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", user.id);

        if (error) {
          console.error("Error fetching prototype count:", error);
          return;
        }
        setPrototypeCount(count || 0);
      } catch (error) {
        console.error("Error fetching prototype count:", error);
      } finally {
        setIsLoadingCount(false);
      }
    }

    if (open && user?.id) {
      fetchProjects();
      fetchPrototypeCount();
    }
  }, [open, user]);

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

    // Check prototype limit for FREE users
    if (userPlan !== "pro" && prototypeCount >= 5) {
      return;
    }

    setIsCreating(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      if (!token) {
        console.error("No authentication token available");
        return;
      }

      const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
      if (!serverEndpoint) {
        console.error("Server endpoint not configured");
        return;
      }

      const response = await fetch(`${serverEndpoint}/prototype/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          project_id: selectedProject || undefined,
          visibility,
        } as CreatePrototypeRequestBody)
      });

      const result: CreatePrototypeResponse = await response.json();

      if (result.success) {
        // Reset form
        setName("");
        setSelectedProject(null);
        setVisibility(userPlan === "pro" ? "SELF" : "PUBLIC");
        setTouched(false);
        onCreated(result.data.prototype_id);
        onClose();
      } else if (result.error === "PROTOTYPE_LIMIT_REACHED") {
        // Show upsell modal
        onClose();
        setShowUpsellModal(true);
      } else {
        console.error("Error creating prototype:", result.message);
      }
    } catch (error) {
      console.error("Error creating prototype:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
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
            {userPlan !== "pro" && (
              <div className="text-sm text-muted-foreground">
                {isLoadingCount ? (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                    Loading...
                  </div>
                ) : (
                  <span>
                    Prototypes: {prototypeCount}/5{" "}
                    {prototypeCount >= 5 && "(Limit reached)"}
                  </span>
                )}
              </div>
            )}
          </DialogHeader>

          {userPlan === "free" && prototypeCount >= 5 && (
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5">
                  ⚠️
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                    Prototype Limit Reached
                  </h4>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                    FREE users can create up to 5 prototypes. You&apos;ve
                    reached your limit.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                    onClick={() =>
                      handleCheckout(ProductKeys.PRO_SUBSCRIPTION, router)
                    }
                  >
                    Upgrade to Pro
                  </Button>
                </div>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className={`space-y-6 ${userPlan !== "pro" && prototypeCount >= 5 ? "opacity-50 pointer-events-none" : ""}`}
          >
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
            <div className="space-y-2">
              <Label
                htmlFor="prototype-visibility"
                className="text-sm font-semibold"
              >
                Visibility
              </Label>
              <Select
                value={visibility}
                onValueChange={(value) =>
                  setVisibility(
                    value as Database["public"]["Enums"]["visibility_level"],
                  )
                }
                disabled={userPlan !== "pro" || isCreating}
              >
                <SelectTrigger id="prototype-visibility" className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">Public</SelectItem>
                  <SelectItem value="SELF">Self</SelectItem>
                </SelectContent>
              </Select>
              {userPlan !== "pro" && (
                <p className="text-xs text-muted-foreground">
                  Upgrade to Pro to set prototype visibility to Self.
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={
                isCreating ||
                !name.trim() ||
                (userPlan !== "pro" && prototypeCount >= 5)
              }
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

      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="prototype_creation_limit_reached"
      />
    </>
  );
}
