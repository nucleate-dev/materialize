"use client";

import { supabase } from "@/ClientConstants";
import { usePrototypeVisibilityOptions } from "@/hooks/usePrototypeVisibilityOptions";
import {
  DEFAULT_FRAMEWORK,
  type PrototypeFramework,
} from "@/hooks/usePrototypePlatformOptions";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  CreatePrototypeErrorResponse,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import { IsUserPlanSubscribed } from "@/lib/utils/payments/SubscriptionManagementUtils";
import { useActiveTeam } from "@/contexts/TeamContext";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ENABLE_DESIGN_SYSTEM } from "@/GlobalConstants";
import NewPrototypeModalUI, {
  DesignStyle,
  DesignSystemRow,
  FolderOption,
} from "./NewPrototypeModalUI";

interface NewPrototypeModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onCreated: (prototypeId: string) => void;
  projectId?: string;
}

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

  const isWebFrameworkSelected =
    framework === "web_nextjs_react" || framework === "web_vite_react";

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
      } finally {
        // no-op
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

    if (framework === "web_nextjs_react" || framework === "web_vite_react") {
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
    if (framework !== "web_nextjs_react" && framework !== "web_vite_react") {
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

  const onUpgradeClick = () => {
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
  };

  return (
    <NewPrototypeModalUI
      open={open}
      onClose={onClose}
      name={name}
      setName={setName}
      touched={touched}
      isCreating={isCreating}
      framework={framework}
      setFramework={setFramework}
      visibility={visibility}
      handleVisibilityChange={handleVisibilityChange}
      visibilityOptions={visibilityOptions}
      showUpsellModal={showUpsellModal}
      setShowUpsellModal={setShowUpsellModal}
      userPlan={userPlan}
      prototypeCount={prototypeCount}
      isLoadingCount={isLoadingCount}
      onUpgradeClick={onUpgradeClick}
      isUserPlanSubscribed={IsUserPlanSubscribed(userPlan)}
      showAdvanced={showAdvanced}
      setShowAdvanced={setShowAdvanced}
      folders={folders}
      selectedFolder={selectedFolder}
      setSelectedFolder={setSelectedFolder}
      isLoadingFolders={isLoadingFolders}
      designStyle={designStyle}
      setDesignStyle={setDesignStyle}
      availableDesignStyles={availableDesignStyles}
      getDesignStyleLabel={getDesignStyleLabel}
      customDesignSystemId={customDesignSystemId}
      setCustomDesignSystemId={setCustomDesignSystemId}
      designSystems={designSystems}
      handleSubmit={handleSubmit}
      setHasManualDesignSelection={setHasManualDesignSelection}
      isViewer={isViewer}
    />
  );
}
