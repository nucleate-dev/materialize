"use client";

import { supabase } from "@/ClientConstants";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
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
import { ProductKeys } from "@/GlobalConstants";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import {
  FolderIcon,
  RocketLaunchIcon,
  SparklesIcon,
  SwatchIcon,
} from "@heroicons/react/24/outline";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface NewPrototypeModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onCreated: (prototypeId: string) => void;
  projectId?: string;
}

type DesignStyle = Database["public"]["Enums"]["design_style"];
type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];
type ProjectOption = {
  id: string;
  name: string;
  project_context: Database["public"]["Tables"]["projects"]["Row"]["project_context"];
};

const DESIGN_STYLE_OPTIONS: DesignStyle[] = [
  "tamagui",
  "nativewind",
  "stylesheets",
];

const DESIGN_STYLE_LABELS: Record<DesignStyle, string> = {
  tamagui: "Tamagui",
  nativewind: "NativeWind + Gluestack",
  stylesheets: "React Native StyleSheet",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isDesignStyle = (value: unknown): value is DesignStyle =>
  typeof value === "string" &&
  DESIGN_STYLE_OPTIONS.includes(value as DesignStyle);

export default function NewPrototypeModal({
  open,
  onClose,
  user,
  onCreated,
  projectId,
}: NewPrototypeModalProps) {
  const router = useRouter();
  const logger = useProductLogger();

  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const { userPlan } = useSubscriptionAccess();
  const [visibility, setVisibility] = useState<
    Database["public"]["Enums"]["visibility_level"]
  >(userPlan === "pro" ? "SELF" : "PUBLIC");
  const [prototypeCount, setPrototypeCount] = useState(0);
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [designStyle, setDesignStyle] = useState<DesignStyle>("tamagui");
  const [customDesignSystemId, setCustomDesignSystemId] = useState<string | null>(null);
  const [designSystems, setDesignSystems] = useState<DesignSystemRow[]>([]);
  const [isLoadingDesignSystems, setIsLoadingDesignSystems] = useState(false);
  const [hasManualDesignSelection, setHasManualDesignSelection] = useState(false);

  // Fetch user's projects and prototype count
  useEffect(() => {
    async function fetchProjects() {
      if (!user) return;

      setIsLoadingProjects(true);
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, project_context")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false });

        if (error) {
          logger.debug("error", "Error fetching projects:", {
            ...error,
          });
          return;
        }
        setProjects(
          (data || []).map((project) => ({
            id: project.id,
            name: project.name,
            project_context: project.project_context,
          })),
        );
      } catch (error) {
        logger.debug("error", "Error fetching projects:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
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
          logger.debug("error", "Error fetching prototype count:", {
            ...error,
          });
          return;
        }
        setPrototypeCount(count || 0);
      } catch (error) {
        logger.debug("error", "Error fetching prototype count:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } finally {
        setIsLoadingCount(false);
      }
    }

    async function fetchDesignSystems() {
      if (!user) return;

      setIsLoadingDesignSystems(true);
      try {
        const { data, error } = await supabase
          .from("design_systems")
          .select("id, name, description, design_rules, updated_at")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false });

        if (error) {
          logger.debug("error", "Error fetching design systems:", {
            ...error,
          });
          return;
        }
        setDesignSystems(data as DesignSystemRow[] || []);
      } catch (error) {
        logger.debug("error", "Error fetching design systems:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } finally {
        setIsLoadingDesignSystems(false);
      }
    }

    if (open && user?.id) {
      fetchProjects();
      fetchPrototypeCount();
      fetchDesignSystems();
    }
  }, [open, user, logger]);

  // Set initial project selection
  useEffect(() => {
    if (projectId && projects.length > 0) {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        setSelectedProject(project.id);
      }
    }
  }, [projectId, projects]);

  useEffect(() => {
    if (open) {
      setHasManualDesignSelection(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (hasManualDesignSelection) {
      return;
    }

    if (selectedProject) {
      const project = projects.find((p) => p.id === selectedProject);
      if (project && isRecord(project.project_context)) {
        const context = project.project_context as Record<string, unknown>;
        const defaultDesignSystem =
          (context["defaultDesignSystem"] ?? context["default_design_system"]) as unknown;

        if (isRecord(defaultDesignSystem)) {
          const styleCandidate = defaultDesignSystem?.["design_style"];
          const customCandidate = defaultDesignSystem?.["custom_design_system"];

          if (isDesignStyle(styleCandidate)) {
            setDesignStyle(styleCandidate);
          }

          if (typeof customCandidate === "string" || typeof customCandidate === "number") {
            setCustomDesignSystemId(String(customCandidate));
          } else {
            setCustomDesignSystemId(null);
          }
          return;
        }
      }
    }

    setDesignStyle("tamagui");
    setCustomDesignSystemId(null);
  }, [open, selectedProject, projects, hasManualDesignSelection]);

  useEffect(() => {
    if (!open) {
      return;
    }

    // Validate that the selected custom design system still exists
    if (customDesignSystemId && designSystems.length > 0) {
      const selectedExists = designSystems.some(
        (system) => String(system.id) === customDesignSystemId,
      );
      if (!selectedExists) {
        setCustomDesignSystemId(null);
      }
    }
  }, [
    open,
    designSystems,
    customDesignSystemId,
  ]);

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
        logger.debug("error", "No authentication token available");
        return;
      }

      const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
      if (!serverEndpoint) {
        logger.debug("error", "Server endpoint not configured");
        return;
      }

      const response = await fetch(`${serverEndpoint}/prototype/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          project_id: selectedProject || undefined,
          visibility,
          design_style: designStyle,
          custom_design_system: customDesignSystemId ?? undefined,
        } as CreatePrototypeRequestBody),
      });

      const result: APIResponse<
        CreatePrototypeSuccessResponse,
        CreatePrototypeErrorResponse
      > = await response.json();

      if (result.data) {
        // Reset form
        setName("");
        setSelectedProject(null);
        setVisibility(userPlan === "pro" ? "SELF" : "PUBLIC");
        setDesignStyle("tamagui");
        setCustomDesignSystemId(null);
        setHasManualDesignSelection(false);
        setTouched(false);
        onCreated(result.data.prototype_id);
        onClose();
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
        // Show upsell modal
        onClose();
        setShowUpsellModal(true);
      } else {
        logger.debug("error", "Error creating prototype:", {
          ...result.error,
        });
      }
    } catch (error) {
      logger.debug("error", "Error creating prototype:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
            className={`space-y-6 ${userPlan !== "pro" && prototypeCount >= 5 ? "opacity-50" : ""}`}
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
                className={`h-12 text-lg ${touched && !name.trim()
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
                onValueChange={(value) => {
                  const projectValue = value === "none" ? null : value;
                  setSelectedProject(projectValue);
                  setHasManualDesignSelection(false);
                }}
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
              <Label htmlFor="design-style" className="text-sm font-semibold">
                Design Style
              </Label>
              <Select
                value={designStyle}
                onValueChange={(value) => {
                  const nextStyle = value as DesignStyle;
                  setDesignStyle(nextStyle);
                  setHasManualDesignSelection(true);
                }}
              >
                <SelectTrigger id="design-style" className="h-12">
                  <div className="flex items-center gap-2">
                    <SwatchIcon className="w-4 h-4 text-primary" />
                    <SelectValue placeholder="Choose a design style" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {DESIGN_STYLE_OPTIONS.map((style) => (
                    <SelectItem key={style} value={style}>
                      {DESIGN_STYLE_LABELS[style]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {designSystems.length > 0 && (
              <div className="space-y-2">
                <Label
                  htmlFor="custom-design-system"
                  className="text-sm font-semibold"
                >
                  Custom Design System <span className="text-muted-foreground font-normal">(Optional)</span>
                </Label>
                <Select
                  value={customDesignSystemId ?? "none"}
                  onValueChange={(value) => {
                    const systemValue = value === "none" ? null : value;
                    setCustomDesignSystemId(systemValue);
                    setHasManualDesignSelection(true);
                  }}
                >
                  <SelectTrigger id="custom-design-system" className="h-12">
                    <SelectValue placeholder="No custom design system" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No custom design system</SelectItem>
                    {designSystems.map((system) => (
                      <SelectItem key={system.id} value={String(system.id)}>
                        {system.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isLoadingDesignSystems && (
                  <p className="text-xs text-muted-foreground">
                    Loading design systems...
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Apply custom design rules on top of the selected design style
                </p>
              </div>
            )}
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
