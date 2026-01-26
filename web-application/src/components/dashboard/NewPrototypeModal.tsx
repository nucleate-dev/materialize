"use client";

import { supabase } from "@/ClientConstants";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePrototypeVisibilityOptions } from "@/hooks/usePrototypeVisibilityOptions";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { IsUserPlanSubscribed } from "@/lib/utils/payments/SubscriptionManagementUtils";
import { useActiveTeam } from "@/contexts/TeamContext";
import { User } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Code,
  Folder,
  Globe,
  Loader2,
  Lock,
  Palette,
  Rocket,
  Sparkles,
  Smartphone,
  Monitor,
  ArrowRight,
  Settings,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VIEWER_ROLE_RESTRICTION_MESSAGE, ENABLE_DESIGN_SYSTEM } from "@/GlobalConstants";

interface NewPrototypeModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onCreated: (prototypeId: string) => void;
  projectId?: string;
}

type DesignStyle = Database["public"]["Enums"]["design_style"];
type PrototypeFramework = Database["public"]["Enums"]["prototype_framework"];
type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];
type FolderOption = {
  id: string;
  name: string;
  folder_context: Database["public"]["Tables"]["folders"]["Row"]["folder_context"];
};

const DESIGN_STYLE_OPTIONS: DesignStyle[] = ["stylesheets", "nativewind"];
const WEB_DESIGN_STYLE_OPTIONS: DesignStyle[] = ["stylesheets"];

const DESIGN_STYLE_LABELS: Partial<Record<DesignStyle, string>> = {
  stylesheets: "React Native StyleSheet",
  nativewind: "NativeWind",
  custom: "Custom",
};

const WEB_DESIGN_STYLE_LABELS: Partial<Record<DesignStyle, string>> = {
  stylesheets: "Tailwind + Shadcn",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isDesignStyle = (value: unknown): value is DesignStyle =>
  typeof value === "string" &&
  DESIGN_STYLE_OPTIONS.includes(value as DesignStyle);

const DEFAULT_FRAMEWORK: PrototypeFramework = "web_nextjs_react";
const PLATFORM_OPTIONS: Array<{
  value: PrototypeFramework;
  label: string;
  icon: typeof Monitor | typeof Smartphone;
  description: string;
}> = [
  { value: "web_nextjs_react", label: "Web", icon: Monitor, description: "Next.js & React" },
  { value: "mobile_expo_react_native", label: "Mobile", icon: Smartphone, description: "React Native" },
];

export default function NewPrototypeModal({
  open,
  onClose,
  user,
  onCreated,
  projectId,
}: NewPrototypeModalProps) {
  const router = useRouter();
  const logger = useProductLogger();
  const { activeTeam, currentUserMembership } = useActiveTeam();

  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const { userPlan } = useSubscriptionAccess();
  const {
    visibilityOptions,
    visibility,
    handleVisibilityChange,
    showUpsellModal,
    setShowUpsellModal,
  } = usePrototypeVisibilityOptions();
  const [prototypeCount, setPrototypeCount] = useState(0);
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const [designStyle, setDesignStyle] = useState<DesignStyle>("stylesheets");
  const [customDesignSystemId, setCustomDesignSystemId] = useState<
    string | null
  >(null);
  const [designSystems, setDesignSystems] = useState<DesignSystemRow[]>([]);
  const [hasManualDesignSelection, setHasManualDesignSelection] =
    useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [framework, setFramework] =
    useState<PrototypeFramework>(DEFAULT_FRAMEWORK);
  const [sourceRepoId, setSourceRepoId] = useState<number | null>(null);
  const [sourceRepos, setSourceRepos] = useState<
    Array<{
      id: number;
      name: string;
      full_name: string;
    }>
  >([]);
  const [isLoadingSourceRepos, setIsLoadingSourceRepos] = useState(false);
  const [githubIntegrationStatus, setGithubIntegrationStatus] = useState<{
    connected: boolean;
    loading: boolean;
  }>({ connected: false, loading: true });
  const [sourceRepoComboboxOpen, setSourceRepoComboboxOpen] = useState(false);
  const sourceRepoComboboxId = useId();

  const isWebFrameworkSelected = framework === "web_nextjs_react";

  const availableDesignStyles = isWebFrameworkSelected
    ? WEB_DESIGN_STYLE_OPTIONS
    : DESIGN_STYLE_OPTIONS;
  const getDesignStyleLabel = (style: DesignStyle): string => {
    if (isWebFrameworkSelected) {
      return (
        WEB_DESIGN_STYLE_LABELS[style] ?? DESIGN_STYLE_LABELS[style] ?? style
      );
    }
    return DESIGN_STYLE_LABELS[style] ?? style;
  };

  // Check if user is a viewer (no edit privileges)
  const isViewer = currentUserMembership?.role === "viewer";

  // Fetch user's projects and prototype count
  useEffect(() => {
    async function fetchFolders() {
      if (!user) return;

      setIsLoadingFolders(true);
      try {
        const { data, error } = await supabase
          .from("folders")
          .select("id, name, folder_context")
          .eq("owner_id", user.id)
          .order("updated_at", { ascending: false });

        if (error) {
          logger.debug("error", "Error fetching folders:", {
            ...error,
          });
          return;
        }
        setFolders(
          (data || []).map((folder) => ({
            id: folder.id,
            name: folder.name,
            folder_context: folder.folder_context,
          })),
        );
      } catch (error) {
        logger.debug("error", "Error fetching folders:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } finally {
        setIsLoadingFolders(false);
      }
    }

    async function fetchPrototypeCount() {
      if (!activeTeam?.id) {
        setPrototypeCount(0);
        return;
      }

      setIsLoadingCount(true);
      try {
        const { count, error } = await supabase
          .from("prototypes")
          .select("*", { count: "exact", head: true })
          .eq("team_id", activeTeam.id);

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
      if (!activeTeam?.id) return;

      try {
        const { data, error } = await supabase
          .from("design_systems")
          .select("id, name, description, design_rules, updated_at")
          .eq("team_id", activeTeam.id)
          .order("updated_at", { ascending: false });

        if (error) {
          logger.debug("error", "Error fetching design systems:", {
            ...error,
          });
          return;
        }
        setDesignSystems((data as DesignSystemRow[]) || []);
      } catch (error) {
        logger.debug("error", "Error fetching design systems:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    if (open && user?.id) {
      fetchFolders();
      fetchPrototypeCount();
      if (ENABLE_DESIGN_SYSTEM) {
        fetchDesignSystems();
      }
    }
  }, [open, user, activeTeam?.id, logger]);

  // Set initial project selection
  useEffect(() => {
    if (projectId && folders.length > 0) {
      const project = folders.find((p) => p.id === projectId);
      if (project) {
        setSelectedFolder(project.id);
      }
    }
  }, [projectId, folders]);

  useEffect(() => {
    if (open) {
      setHasManualDesignSelection(false);
      setShowAdvanced(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFramework(DEFAULT_FRAMEWORK);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (framework === "web_nextjs_react") {
      return;
    }

    if (hasManualDesignSelection) {
      return;
    }

    if (selectedFolder) {
      const folder = folders.find((p) => p.id === selectedFolder);
      if (folder && isRecord(folder.folder_context)) {
        const context = folder.folder_context as Record<string, unknown>;
        const defaultDesignSystem = (context["defaultDesignSystem"] ??
          context["default_design_system"]) as unknown;

        if (isRecord(defaultDesignSystem)) {
          const styleCandidate = defaultDesignSystem?.["design_style"];
          const customCandidate = defaultDesignSystem?.["custom_design_system"];

          if (isDesignStyle(styleCandidate)) {
            setDesignStyle(styleCandidate);
          }

          if (
            typeof customCandidate === "string" ||
            typeof customCandidate === "number"
          ) {
            setCustomDesignSystemId(String(customCandidate));
          } else {
            setCustomDesignSystemId(null);
          }
          return;
        }
      }
    }

    setDesignStyle("stylesheets");
    setCustomDesignSystemId(null);
  }, [open, selectedFolder, folders, hasManualDesignSelection, framework]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (customDesignSystemId && designSystems.length > 0) {
      const selectedExists = designSystems.some(
        (system) => String(system.id) === customDesignSystemId,
      );
      if (!selectedExists) {
        setCustomDesignSystemId(null);
      }
    }
  }, [open, designSystems, customDesignSystemId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    logger.log({
      event: "client_new_prototype_modal_opened",
      properties: {
        projectId,
        userPlan,
      },
    });
  }, [open, logger, projectId, userPlan]);

  // Fetch GitHub integration status and repositories when modal opens
  useEffect(() => {
    async function fetchGitHubStatusAndRepos() {
      if (!activeTeam?.id) {
        setGithubIntegrationStatus({ connected: false, loading: false });
        return;
      }

      setGithubIntegrationStatus({ connected: false, loading: true });
      try {
        const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!serverEndpoint || !token) {
          setGithubIntegrationStatus({ connected: false, loading: false });
          return;
        }

        // First, check GitHub integration status
        const statusResponse = await fetch(
          `${serverEndpoint}/github/status?teamId=${activeTeam.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const statusResult = await statusResponse.json();
        const isConnected = statusResult.data?.connected ?? false;
        setGithubIntegrationStatus({ connected: isConnected, loading: false });

        // If GitHub is connected, fetch repositories
        if (isConnected) {
          setIsLoadingSourceRepos(true);
          try {
            const reposResponse = await fetch(
              `${serverEndpoint}/github/repositories?teamId=${activeTeam.id}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
            );

            const reposResult = await reposResponse.json();
            if (reposResult.data?.repositories) {
              setSourceRepos(
                reposResult.data.repositories.map(
                  (repo: { id: number; name: string; full_name: string }) => ({
                    id: repo.id,
                    name: repo.name,
                    full_name: repo.full_name,
                  }),
                ),
              );
            }
          } catch (error) {
            logger.debug("error", "Failed to fetch source repositories", {
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            setIsLoadingSourceRepos(false);
          }
        }
      } catch (error) {
        logger.debug("error", "Failed to fetch GitHub integration status", {
          error: error instanceof Error ? error.message : String(error),
        });
        setGithubIntegrationStatus({ connected: false, loading: false });
      }
    }

    if (open && user?.id) {
      fetchGitHubStatusAndRepos();
    }
  }, [open, activeTeam?.id, user, logger]);

  useEffect(() => {
    if (framework !== "web_nextjs_react") {
      return;
    }

    if (designStyle !== "stylesheets") {
      setDesignStyle("stylesheets");
    }

    if (!hasManualDesignSelection) {
      setHasManualDesignSelection(true);
    }
  }, [framework, designStyle, hasManualDesignSelection]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || !user) return;

    if (userPlan === "free" && prototypeCount >= 5) {
      logger.log({
        event: "client_new_prototype_modal_limit_hit",
        properties: {
          projectId,
          name: name.trim(),
          userPlan,
          framework,
          design_style: designStyle,
          custom_design_system: customDesignSystemId,
        },
      });
      return;
    }

    setIsCreating(true);
    logger.log({
      event: "client_new_prototype_modal_submitted",
      properties: {
        projectId,
        name: name.trim(),
        folder_id: selectedFolder,
        visibility,
        design_style: designStyle,
        custom_design_system: customDesignSystemId,
        framework,
      },
    });

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) return;

      const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
      if (!serverEndpoint) return;

      const teamId = activeTeam?.id;
      if (!teamId) {
        logger.debug(
          "error",
          "No active team available for prototype creation",
        );
        return;
      }

      const normalizedVisibility: CreatePrototypeRequestBody["visibility"] =
        visibility === "TEAM"
          ? "TEAM"
          : visibility === "SELF"
            ? "SELF"
            : "PUBLIC";

      const folderId = selectedFolder ?? undefined;

      const payload: CreatePrototypeRequestBody = {
        name: name.trim(),
        creation_source: "dashboard_modal",
        folder_id: folderId,
        visibility: normalizedVisibility,
        design_style: designStyle,
        custom_design_system: customDesignSystemId ?? undefined,
        framework,
        team_id: teamId,
        source_repo_id: sourceRepoId ?? undefined,
      };

      const response = await fetch(`${serverEndpoint}/prototype/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result: APIResponse<
        CreatePrototypeSuccessResponse,
        CreatePrototypeErrorResponse
      > = await response.json();

      if (result.data) {
        logger.log({
          event: "client_new_prototype_modal_creation_success",
          properties: {
            projectId,
            prototype_id: result.data.prototype_id,
            framework,
            design_style: designStyle,
            custom_design_system: customDesignSystemId,
          },
        });
        setName("");
        setSelectedFolder(null);
        setDesignStyle("stylesheets");
        setCustomDesignSystemId(null);
        setFramework(DEFAULT_FRAMEWORK);
        setHasManualDesignSelection(false);
        setTouched(false);
        onCreated(result.data.prototype_id);
        onClose();
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
        logger.log({
          event: "client_new_prototype_modal_limit_hit",
          properties: {
            projectId,
            name: name.trim(),
            userPlan,
            framework,
            design_style: designStyle,
            custom_design_system: customDesignSystemId,
          },
        });
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
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto relative">
          <DialogHeader className="text-center space-y-4 pb-6">
            <div className="flex items-center justify-center">
              <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 rounded-2xl shadow-lg shadow-primary/10">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                Create New Project
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Choose your platform and get started in seconds
              </DialogDescription>
            </div>
            {userPlan === "free" && (
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {isLoadingCount ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Check Limits
                  </span>
                ) : (
                  <span>{prototypeCount}/5 Free Projects Used</span>
                )}
              </div>
            )}
          </DialogHeader>

          {userPlan === "free" && prototypeCount >= 5 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-amber-800 dark:text-yellow-200 mb-1">
                    Limit Reached
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-yellow-200/70 mb-3 leading-relaxed">
                    Free plans include 5 projects. Upgrade to Plus for unlimited
                    projects.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs bg-amber-500 text-white dark:text-black hover:bg-amber-600 dark:hover:bg-yellow-400 border-0"
                    onClick={() => {
                      logger.log({
                        event: "client_upgrade_checkout_clicked",
                        properties: {
                          source: "new_prototype_modal_limit_banner",
                          plan: "plus",
                        },
                      });
                      if (activeTeam?.id) {
                        void handleCheckout("plus", router, activeTeam.id);
                      }
                    }}
                  >
                    Upgrade Now
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-0 relative">
            {/* Main Content */}
            <div
              className={cn(
                "transition-all duration-300 ease-in-out",
                showAdvanced ? "w-1/2 pr-3" : "w-full"
              )}
            >
              <form
                onSubmit={handleSubmit}
                className={cn(
                  "space-y-6",
                  userPlan === "free" &&
                    prototypeCount >= 5 &&
                    "opacity-50 pointer-events-none",
                )}
              >
                {/* Project Name */}
                <div className="space-y-2">
                  <Label htmlFor="prototype-name" className="text-sm font-medium">
                    Project Name
                  </Label>
                  <Input
                    id="prototype-name"
                    type="text"
                    placeholder="My Awesome Project"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn(
                      "h-12 text-base transition-all",
                      touched &&
                        !name.trim() &&
                        "border-destructive focus-visible:ring-destructive"
                    )}
                    autoFocus
                    maxLength={64}
                  />
                  {touched && !name.trim() && (
                    <p className="text-xs text-destructive flex items-center gap-1.5 mt-1.5">
                      <span className="w-1 h-1 rounded-full bg-destructive" />
                      Please enter a project name
                    </p>
                  )}
                </div>

                {/* Platform Selection - Card Based */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Choose Platform</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {PLATFORM_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isSelected = framework === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setFramework(option.value)}
                          className={cn(
                            "relative p-4 rounded-xl border-2 transition-all hover:shadow-md group",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border bg-card hover:border-primary/50"
                          )}
                        >
                          <div className="flex flex-col items-center gap-3">
                            <div
                              className={cn(
                                "p-3 rounded-lg transition-colors",
                                isSelected
                                  ? "bg-primary/10"
                                  : "bg-muted group-hover:bg-primary/5"
                              )}
                            >
                              <Icon
                                className={cn(
                                  "w-6 h-6 transition-colors",
                                  isSelected
                                    ? "text-primary"
                                    : "text-muted-foreground group-hover:text-primary"
                                )}
                              />
                            </div>
                            <div className="text-center">
                              <div
                                className={cn(
                                  "font-medium text-sm",
                                  isSelected
                                    ? "text-primary"
                                    : "text-foreground"
                                )}
                              >
                                {option.label}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {option.description}
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="absolute top-2 right-2">
                              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                <ArrowRight className="w-3 h-3 text-primary-foreground" />
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Visibility Selection - Card Based */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Project Visibility</Label>
                    {!IsUserPlanSubscribed(userPlan) && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Upgrade for Private
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {visibilityOptions.map((option) => {
                      const Icon = option.icon;
                      const isSelected = visibility === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleVisibilityChange(option.value)}
                          disabled={option.isLocked}
                          className={cn(
                            "relative p-4 rounded-xl border-2 transition-all hover:shadow-md group",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border bg-card hover:border-primary/50",
                            option.isLocked && "opacity-60 cursor-not-allowed"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "p-2.5 rounded-lg transition-colors",
                                isSelected
                                  ? "bg-primary/10"
                                  : "bg-muted group-hover:bg-primary/5"
                              )}
                            >
                              <Icon
                                className={cn(
                                  "w-5 h-5 transition-colors",
                                  isSelected
                                    ? "text-primary"
                                    : "text-muted-foreground group-hover:text-primary"
                                )}
                              />
                            </div>
                            <div className="flex-1 text-left">
                              <div
                                className={cn(
                                  "font-medium text-sm flex items-center gap-1.5",
                                  isSelected
                                    ? "text-primary"
                                    : "text-foreground"
                                )}
                              >
                                {option.label}
                                {option.isLocked && (
                                  <Lock className="w-3 h-3 text-muted-foreground" />
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {option.value === "PUBLIC" && "Anyone can view"}
                                {option.value === "SELF" && "Only you can view"}
                                {option.value === "TEAM" && "Team members can view"}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Footer with Advanced Options Button */}
                <div className="pt-2 flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Settings className="w-3.5 h-3.5 mr-1.5" />
                    {showAdvanced ? "Hide" : "Configure"} Advanced Options
                  </Button>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Button
                            type="submit"
                            disabled={
                              isCreating ||
                              !name.trim() ||
                              (userPlan === "free" && prototypeCount >= 5) ||
                              isViewer
                            }
                            className="h-11 px-6 text-base font-medium shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
                          >
                            {isCreating ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Creating...
                              </>
                            ) : (
                              <>
                                <Rocket className="w-4 h-4 mr-2" />
                                Create
                              </>
                            )}
                          </Button>
                        </div>
                      </TooltipTrigger>
                      {isViewer && (
                        <TooltipContent>
                          <p>{VIEWER_ROLE_RESTRICTION_MESSAGE}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </form>
            </div>

            {/* Advanced Options Slide-Over Panel */}
            <div
              className={cn(
                "absolute right-0 top-0 h-full w-1/2 pl-3 transition-all duration-300 ease-in-out",
                showAdvanced
                  ? "translate-x-0 opacity-100"
                  : "translate-x-full opacity-0 pointer-events-none"
              )}
            >
              <div className="h-full bg-muted/30 border-l border-border rounded-lg p-4 space-y-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Advanced Settings
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdvanced(false)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Folder Select */}
                <div className="space-y-2">
                  <Label htmlFor="folder-select" className="text-xs font-medium">
                    Folder
                  </Label>
                  <Select
                    value={selectedFolder || "none"}
                    onValueChange={(value) => {
                      const projectValue = value === "none" ? null : value;
                      setSelectedFolder(projectValue);
                      setHasManualDesignSelection(false);
                    }}
                  >
                    <SelectTrigger id="folder-select" className="h-9 text-sm">
                      <div className="flex items-center gap-2">
                        <Folder className="w-3.5 h-3.5 text-muted-foreground" />
                        <SelectValue placeholder="Select folder..." />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No folder</SelectItem>
                      {isLoadingFolders ? (
                        <div className="px-2 py-2 text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                        </div>
                      ) : (
                        folders.map((folder) => (
                          <SelectItem key={folder.id} value={folder.id}>
                            {folder.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Design Style */}
                {ENABLE_DESIGN_SYSTEM && (
                  <div className="space-y-2">
                    <Label htmlFor="design-style" className="text-xs font-medium">
                      Style
                    </Label>
                    <Select
                      value={designStyle}
                      onValueChange={(value) => {
                        setDesignStyle(value as DesignStyle);
                        setHasManualDesignSelection(true);
                      }}
                    >
                      <SelectTrigger id="design-style" className="h-9 text-sm">
                        <div className="flex items-center gap-2">
                          <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {availableDesignStyles.map((style) => (
                          <SelectItem key={style} value={style}>
                            {getDesignStyleLabel(style)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Custom Design System */}
                {ENABLE_DESIGN_SYSTEM && designSystems.length > 0 && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="custom-design-system"
                      className="text-xs font-medium"
                    >
                      Design System
                    </Label>
                    <Select
                      value={customDesignSystemId ?? "none"}
                      onValueChange={(value) => {
                        setCustomDesignSystemId(value === "none" ? null : value);
                        setHasManualDesignSelection(true);
                      }}
                    >
                      <SelectTrigger id="custom-design-system" className="h-9 text-sm">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {designSystems.map((system) => (
                          <SelectItem key={system.id} value={String(system.id)}>
                            {system.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Source Repository Select */}
                <div className="space-y-2">
                  <Label
                    htmlFor="source-repo-select"
                    className="text-xs font-medium"
                  >
                    Source Repository
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Popover
                            open={sourceRepoComboboxOpen}
                            onOpenChange={setSourceRepoComboboxOpen}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                role="combobox"
                                aria-expanded={sourceRepoComboboxOpen}
                                aria-controls={sourceRepoComboboxId}
                                disabled={
                                  isCreating ||
                                  githubIntegrationStatus.loading ||
                                  !githubIntegrationStatus.connected ||
                                  isLoadingSourceRepos
                                }
                                className={cn(
                                  "h-9 w-full bg-background border border-border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                                  "flex items-center justify-between",
                                )}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Code className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="truncate text-xs">
                                    {isLoadingSourceRepos ? (
                                      <span className="flex items-center gap-2">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Loading...
                                      </span>
                                    ) : sourceRepoId ? (
                                      sourceRepos.find(
                                        (repo) => repo.id === sourceRepoId,
                                      )?.full_name || "None"
                                    ) : (
                                      "None"
                                    )}
                                  </span>
                                </div>
                                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-[--radix-popover-trigger-width] p-0"
                              align="start"
                            >
                              <Command>
                                <CommandInput
                                  placeholder="Search repositories..."
                                  className="h-9 border-0 focus:ring-0 text-sm"
                                />
                                <CommandList id={sourceRepoComboboxId}>
                                  <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                                    No repository found.
                                  </CommandEmpty>
                                  <CommandGroup>
                                    <CommandItem
                                      value="none"
                                      onSelect={() => {
                                        setSourceRepoId(null);
                                        setSourceRepoComboboxOpen(false);
                                      }}
                                      className="cursor-pointer text-sm"
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-3.5 w-3.5",
                                          sourceRepoId === null
                                            ? "opacity-100"
                                            : "opacity-0",
                                        )}
                                      />
                                      None
                                    </CommandItem>
                                    {sourceRepos.map((repo) => (
                                      <CommandItem
                                        key={repo.id}
                                        value={repo.full_name}
                                        onSelect={() => {
                                          setSourceRepoId(repo.id);
                                          setSourceRepoComboboxOpen(false);
                                        }}
                                        className="cursor-pointer text-sm"
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-3.5 w-3.5",
                                            sourceRepoId === repo.id
                                              ? "opacity-100"
                                              : "opacity-0",
                                          )}
                                        />
                                        {repo.full_name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TooltipTrigger>
                      {!githubIntegrationStatus.connected &&
                        !githubIntegrationStatus.loading && (
                          <TooltipContent>
                            <p>Connect GitHub to prototype on a source repository</p>
                          </TooltipContent>
                        )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </div>
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
