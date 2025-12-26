"use client";

import { supabase } from "@/ClientConstants";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { type PrototypeVisibility } from "@/lib/types/prototypes";
import type {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import {
  fetchPersonalTeamId,
  handleCheckout,
} from "@/lib/utils/payments/CheckoutUtils";
import { IsUserPlanSubscribed } from "@/lib/utils/payments/SubscriptionManagementUtils";
import { User } from "@supabase/supabase-js";
import {
  AlertTriangle,
  ChevronDown,
  Folder,
  Loader2,
  Palette,
  Rocket,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePostHog } from "posthog-js/react";

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

const DEFAULT_FRAMEWORK: PrototypeFramework = "mobile_expo_react_native";
const PLATFORM_OPTIONS: Array<{
  value: PrototypeFramework;
  label: string;
}> = [
  { value: "web_nextjs_react", label: "Web" },
  { value: "mobile_expo_react_native", label: "Mobile" },
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
  const posthog = usePostHog();

  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const { userPlan } = useSubscriptionAccess();
  const [visibility, setVisibility] = useState<PrototypeVisibility>(
    userPlan === "free" ? "PUBLIC" : "SELF",
  );
  const [prototypeCount, setPrototypeCount] = useState(0);
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [designStyle, setDesignStyle] = useState<DesignStyle>("stylesheets");
  const [customDesignSystemId, setCustomDesignSystemId] = useState<
    string | null
  >(null);
  const [designSystems, setDesignSystems] = useState<DesignSystemRow[]>([]);
  const [isLoadingDesignSystems, setIsLoadingDesignSystems] = useState(false);
  const [hasManualDesignSelection, setHasManualDesignSelection] =
    useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [framework, setFramework] =
    useState<PrototypeFramework>(DEFAULT_FRAMEWORK);

  const isWebPrototypeEnabled =
    posthog?.isFeatureEnabled("web-prototype-support") ?? false;
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
        setDesignSystems((data as DesignSystemRow[]) || []);
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
      fetchFolders();
      fetchPrototypeCount();
      fetchDesignSystems();
    }
  }, [open, user, logger]);

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

      const userId = session.data.session?.user.id;
      if (!userId) return;

      const teamId = await fetchPersonalTeamId(userId);
      if (!teamId) {
        logger.log({
          event: "client_new_prototype_modal_missing_team",
          properties: { userId },
        });
        return;
      }

      const normalizedVisibility: CreatePrototypeRequestBody["visibility"] =
        visibility === "SELF" ? "SELF" : "PUBLIC";

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
        setVisibility(userPlan === "free" ? "PUBLIC" : "SELF");
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
        <DialogContent className="sm:max-w-md bg-white dark:bg-[#141517] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white shadow-2xl">
          <DialogHeader className="text-center space-y-3 pb-2">
            <div className="flex items-center justify-center">
              <div className="p-2.5 bg-zinc-50 dark:bg-[#0B0C0E] border border-zinc-200 dark:border-white/10 rounded-xl shadow-inner">
                <Sparkles className="w-5 h-5 text-zinc-900 dark:text-white" />
              </div>
            </div>
            <DialogTitle className="text-xl font-medium tracking-tight text-zinc-900 dark:text-white">
              Create New Project
            </DialogTitle>
            {userPlan === "free" && (
              <div className="text-xs font-medium text-zinc-500 dark:text-[#8A8F98] uppercase tracking-wider">
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
                      void handleCheckout("plus", router);
                    }}
                  >
                    Upgrade Now
                  </Button>
                </div>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className={cn(
              "space-y-5",
              userPlan === "free" &&
                prototypeCount >= 5 &&
                "opacity-50 pointer-events-none",
            )}
          >
            {/* Project Name Input */}
            <div className="space-y-2">
              <Label
                htmlFor="prototype-name"
                className="text-xs font-medium text-zinc-500 dark:text-[#8A8F98]"
              >
                Project Name
              </Label>
              <Input
                id="prototype-name"
                type="text"
                placeholder="e.g. Fitness Tracker App"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={cn(
                  "h-11 bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white focus:border-indigo-500 dark:focus:border-white/20 placeholder:text-zinc-400 dark:placeholder:text-white/20 transition-all",
                  touched &&
                    !name.trim() &&
                    "border-red-500/50 focus-visible:ring-red-500/20",
                )}
                autoFocus
                maxLength={64}
              />
              {touched && !name.trim() && (
                <p className="text-xs text-red-500 dark:text-red-400">
                  Name is required
                </p>
              )}
            </div>

            {/* Platform Select */}
            {isWebPrototypeEnabled && (
              <div className="space-y-2">
                <Label
                  htmlFor="platform-select"
                  className="text-xs font-medium text-zinc-500 dark:text-[#8A8F98]"
                >
                  Platform
                </Label>
                <Select
                  value={framework}
                  onValueChange={(value) =>
                    setFramework(value as PrototypeFramework)
                  }
                  disabled={isCreating}
                >
                  <SelectTrigger
                    id="platform-select"
                    className="h-11 bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white focus:ring-0"
                  >
                    <div className="flex items-center gap-2">
                      <Rocket className="w-4 h-4 text-zinc-400 dark:text-white/50" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#141517] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white">
                    {PLATFORM_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="focus:bg-zinc-100 dark:focus:bg-white/10 focus:text-zinc-900 dark:focus:text-white cursor-pointer"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Visibility Select */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="prototype-visibility"
                  className="text-xs font-medium text-zinc-500 dark:text-[#8A8F98]"
                >
                  Visibility
                </Label>
                {!IsUserPlanSubscribed(userPlan) && (
                  <span className="text-[10px] text-zinc-500 dark:text-[#8A8F98] bg-zinc-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                    Upgrade for Private
                  </span>
                )}
              </div>
              <Select
                value={visibility}
                onValueChange={(value) =>
                  setVisibility(() => {
                    const nextVisibility = value as PrototypeVisibility;
                    if (
                      !IsUserPlanSubscribed(userPlan) &&
                      nextVisibility === "SELF"
                    ) {
                      setShowUpsellModal(true);
                      return "PUBLIC";
                    }
                    return nextVisibility;
                  })
                }
                disabled={isCreating}
              >
                <SelectTrigger
                  id="prototype-visibility"
                  className="h-11 bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white focus:ring-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#141517] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white">
                  <SelectItem
                    value="PUBLIC"
                    className="focus:bg-zinc-100 dark:focus:bg-white/10 focus:text-zinc-900 dark:focus:text-white cursor-pointer"
                  >
                    Public
                  </SelectItem>
                  <SelectItem
                    value="SELF"
                    className="focus:bg-zinc-100 dark:focus:bg-white/10 focus:text-zinc-900 dark:focus:text-white cursor-pointer"
                  >
                    Private
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Advanced Options Collapsible */}
            <Collapsible
              open={showAdvanced}
              onOpenChange={setShowAdvanced}
              className="border-t border-zinc-200 dark:border-white/5 pt-4"
            >
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex items-center justify-between w-full p-0 h-auto text-xs font-medium text-zinc-500 dark:text-[#8A8F98] hover:text-zinc-900 dark:hover:text-white hover:bg-transparent transition-colors"
                >
                  <span>Advanced Options</span>
                  <ChevronDown
                    className={cn(
                      "w-3 h-3 transition-transform duration-200",
                      showAdvanced && "rotate-180",
                    )}
                  />
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-4 pt-4 animate-in slide-in-from-top-2">
                {/* Folder Select */}
                <div className="space-y-2">
                  <Label
                    htmlFor="project-select"
                    className="text-xs font-medium text-zinc-500 dark:text-[#8A8F98]"
                  >
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
                    <SelectTrigger className="h-10 bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-sm focus:ring-0">
                      <div className="flex items-center gap-2 truncate">
                        <Folder className="w-3.5 h-3.5 text-zinc-400 dark:text-white/50" />
                        <SelectValue placeholder="Select folder..." />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#141517] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white">
                      <SelectItem
                        value="none"
                        className="focus:bg-zinc-100 dark:focus:bg-white/10 focus:text-zinc-900 dark:focus:text-white cursor-pointer text-sm"
                      >
                        No folder
                      </SelectItem>
                      {isLoadingFolders ? (
                        <div className="px-2 py-2 text-xs text-zinc-500 dark:text-white/50 flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />{" "}
                          Loading...
                        </div>
                      ) : (
                        folders.map((project) => (
                          <SelectItem
                            key={project.id}
                            value={project.id}
                            className="focus:bg-zinc-100 dark:focus:bg-white/10 focus:text-zinc-900 dark:focus:text-white cursor-pointer text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <Folder className="w-3.5 h-3.5 text-zinc-400 dark:text-white/50" />
                              {project.name}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Design Style */}
                <div className="space-y-2">
                  <Label
                    htmlFor="design-style"
                    className="text-xs font-medium text-zinc-500 dark:text-[#8A8F98]"
                  >
                    Style
                  </Label>
                  <Select
                    value={designStyle}
                    onValueChange={(value) => {
                      setDesignStyle(value as DesignStyle);
                      setHasManualDesignSelection(true);
                    }}
                  >
                    <SelectTrigger
                      id="design-style"
                      className="h-10 bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-sm focus:ring-0"
                    >
                      <div className="flex items-center gap-2">
                        <Palette className="w-3.5 h-3.5 text-zinc-400 dark:text-white/50" />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#141517] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white">
                      {availableDesignStyles.map((style) => (
                        <SelectItem
                          key={style}
                          value={style}
                          className="focus:bg-zinc-100 dark:focus:bg-white/10 focus:text-zinc-900 dark:focus:text-white cursor-pointer text-sm"
                        >
                          {getDesignStyleLabel(style)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom Design System */}
                {designSystems.length > 0 && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="custom-design-system"
                      className="text-xs font-medium text-zinc-500 dark:text-[#8A8F98]"
                    >
                      Design System
                    </Label>
                    <Select
                      value={customDesignSystemId ?? "none"}
                      onValueChange={(value) => {
                        setCustomDesignSystemId(
                          value === "none" ? null : value,
                        );
                        setHasManualDesignSelection(true);
                      }}
                    >
                      <SelectTrigger
                        id="custom-design-system"
                        className="h-10 bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-sm focus:ring-0"
                      >
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#141517] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white">
                        <SelectItem
                          value="none"
                          className="focus:bg-zinc-100 dark:focus:bg-white/10 focus:text-zinc-900 dark:focus:text-white cursor-pointer text-sm"
                        >
                          None
                        </SelectItem>
                        {designSystems.map((system) => (
                          <SelectItem
                            key={system.id}
                            value={String(system.id)}
                            className="focus:bg-zinc-100 dark:focus:bg-white/10 focus:text-zinc-900 dark:focus:text-white cursor-pointer text-sm"
                          >
                            {system.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            <Button
              type="submit"
              disabled={
                isCreating ||
                !name.trim() ||
                (userPlan === "free" && prototypeCount >= 5)
              }
              className="w-full h-11 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium rounded-lg"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Create Project
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
