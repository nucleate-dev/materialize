"use client";

import { supabase } from "@/ClientConstants";
import Loader from "@/components/dashboard/Loader";
import {
  TeamAndAccountsSettingsDialog,
  type SettingsTab,
} from "@/components/dashboard/TeamAndAccountSettingsDialog";
import ClaudeCodePanel, {
  type ClaudeCodePanelRef,
} from "@/components/prototype-editor/ClaudeCodePanel";
import CodeEditor from "@/components/prototype-editor/CodeEditor";
import FileTree from "@/components/prototype-editor/FileTree";
import MaterializeRenderSection, {
  MaterializeRenderSectionRef,
  type MobileScreenConfig,
} from "@/components/prototype-editor/MaterializeRenderSection";
import type {
  CanvasStateData,
  PrototypeContextData,
  AIActionType,
  GlobalAIAction,
} from "@/components/prototype-editor/canvas/types";
import {
  DocumentGenerationModal,
  type AIDocumentScreen,
} from "@/components/prototype-editor/DocumentGenerationModal";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { SurveyOverlay } from "@/components/survey/SurveyOverlay";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClaudeCodeWebSocket } from "@/hooks/useClaudeCodeWebSocket";
import { useFileSystem } from "@/hooks/useFileSystem";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useUser } from "@/hooks/useUser";
import { sidebarOpenAtom } from "@/lib/atoms/sidebar";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import {
  type ChatServerMessage,
  type ScreenUpdateData,
} from "@/lib/types/ChatTypes";
import {
  normalizePrototypeVisibility,
  type PrototypeVisibility,
} from "@/lib/types/prototypes";
import {
  type APIResponse,
  type CreatePrototypeErrorResponse,
  type CreatePrototypeRequestBody,
  type CreatePrototypeSuccessResponse,
  type FetchViewingUrlRequestBody,
  type FetchViewingUrlSuccessResponse,
  type StandardErrorResponse,
  type StartDevServerRequestBody,
  type StartDevServerSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { useActiveTeam } from "@/contexts/TeamContext";
import { useSetAtom } from "jotai";
import {
  AlertTriangle,
  Code2,
  Folder,
  Loader2,
  MessageSquare,
  Smartphone,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type DesignStyle = Database["public"]["Enums"]["design_style"];
type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];

const DESIGN_STYLE_OPTIONS: DesignStyle[] = ["stylesheets", "nativewind"];

const DESIGN_STYLE_LABELS: Record<DesignStyle, string> = {
  tamagui: "Tamagui",
  nativewind: "NativeWind",
  stylesheets: "React Native StyleSheet",
  custom: "Custom",
};

export type RenderStatus =
  | "Static build"
  | "Connecting.."
  | "Updating.."
  | "Starting Dev Server.."
  | "Disconnected"
  | "Connected"
  | "Error";

export default function InternalPrototypePage() {
  const router = useRouter();
  const { user, userIsLoading } = useUser();
  const { userPlan } = useSubscriptionAccess();
  const isFreePlan = userPlan === "free";
  const { activeTeam, currentUserMembership } = useActiveTeam();
  const activeTeamId = activeTeam?.id;
  const params = useParams<{ prototype_id: string }>();
  const prototypeId = params?.prototype_id;
  const logger = useProductLogger();
  const setSidebarOpen = useSetAtom(sidebarOpenAtom);

  const [shouldTriggerInitialFetch, setShouldTriggerInitialFetch] =
    useState(true);
  const [isPreviewView, setIsPreviewView] = useState(true);
  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [isCloningPrototype, setIsCloningPrototype] = useState(false);
  const [showCloneUpsellModal, setShowCloneUpsellModal] = useState(false);
  const [teamSettingsDialogOpen, setTeamSettingsDialogOpen] = useState(false);
  const [teamSettingsDefaultTab, setTeamSettingsDefaultTab] =
    useState<SettingsTab>("profile");
  const openTeamSettingsDialog = useCallback((tab: SettingsTab = "profile") => {
    setTeamSettingsDefaultTab(tab);
    setTeamSettingsDialogOpen(true);
  }, []);
  const showClaudeConnectionSettings = useCallback(() => {
    openTeamSettingsDialog("claude");
  }, [openTeamSettingsDialog]);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [baseTunnelUrl, setBaseTunnelUrl] = useState<string | null>(null);
  const [currentRenderStatus, setCurrentRenderStatus] =
    useState<RenderStatus>("Static build");
  const [designSystems, setDesignSystems] = useState<DesignSystemRow[]>([]);
  const [isLoadingDesignSystems, setIsLoadingDesignSystems] = useState(false);
  const [isDesignSystemDialogOpen, setIsDesignSystemDialogOpen] =
    useState(false);
  const [dialogDesignStyle, setDialogDesignStyle] =
    useState<DesignStyle | null>(null);
  const [dialogCustomDesignSystem, setDialogCustomDesignSystem] = useState<
    string | null
  >(null);
  const [isUpdatingDesignSystem, setIsUpdatingDesignSystem] = useState(false);
  const [isDeploying] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    path: string;
    type: "file" | "folder" | "asset";
    filesToDelete: string[];
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Mobile-specific state
  const [activePanel, setActivePanel] = useState<"chat" | "preview">("preview");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileCodeView, setMobileCodeView] = useState<"filetree" | "editor">(
    "editor",
  );
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Current viewing path tracking
  const [currentViewingPath, setCurrentViewingPath] = useState<string>("/");

  // Multi-screen state for LLM control
  const [mobileScreensState, setMobileScreensState] = useState<
    MobileScreenConfig[]
  >([]);
  const [webScreensState, setWebScreensState] = useState<MobileScreenConfig[]>(
    [],
  );
  const [previewMode, setPreviewMode] = useState<"mobile" | "web" | "tablet">(
    "mobile",
  );

  // Canvas state for infinite canvas mode
  const [canvasState, setCanvasState] = useState<CanvasStateData | null>(null);
  const canvasSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Document generation modal state (for PRD and design critique)
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [documentModalType, setDocumentModalType] =
    useState<GlobalAIAction | null>(null);
  const [documentModalScreens, setDocumentModalScreens] = useState<
    AIDocumentScreen[]
  >([]);

  // Resizable divider state
  const [leftPanelWidth, setLeftPanelWidth] = useState(25); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  // Ref to MaterializeRenderSection for triggering refreshes
  const materializeRenderRef = useRef<MaterializeRenderSectionRef>(null);

  // Ref to ClaudeCodePanel for populating input
  const claudeCodePanelRef = useRef<ClaudeCodePanelRef>(null);

  // Track initial team to detect team changes
  const initialTeamId = useRef<string | undefined>(undefined);

  // Initialize FileSystem hook
  const defaultFile = "App.js"; // TODO update this for the new default app
  const fileSystem = useFileSystem(prototypeId, defaultFile);
  const { setSandboxUrl } = fileSystem;

  // Claude Code WebSocket management
  const claudeCodeWSMessageHandlers = useRef<
    Map<string, (msg: ChatServerMessage) => void>
  >(new Map());

  const handleClaudeCodeMessage = useCallback(
    (message: { type: string; data: unknown }) => {
      const parsedMessage = message as ChatServerMessage;
      claudeCodeWSMessageHandlers.current.forEach((handler) =>
        handler(parsedMessage),
      );
    },
    [],
  );

  const {
    ws: claudeCodeWS,
    isConnected: claudeCodeWSConnected,
    isConnecting: claudeCodeWSConnecting,
    connect: connectClaudeCodeWS,
    disconnect: disconnectClaudeCodeWS,
  } = useClaudeCodeWebSocket({
    prototypeId,
    baseTunnelUrl,
    onMessage: handleClaudeCodeMessage,
  });

  // Handler for when files are saved in CodeEditor
  const handleFilesSaved = useCallback(
    (fileNames: string[], assetNames: string[] = []) => {
      if (!claudeCodeWSConnected) {
        return;
      }
      logger.debug("log", "Files saved in editor", {
        fileNames,
        assetNames,
      });
    },
    [claudeCodeWSConnected, logger],
  );

  const handleChatRestartDevServerComplete = useCallback(() => {
    logger.debug(
      "log",
      "restart dev server completed, triggering preview refresh",
    );
    materializeRenderRef.current?.forceRefresh();
  }, [logger]);

  // Handle screen updates from LLM
  const handleScreenUpdate = useCallback(
    (data: ScreenUpdateData) => {
      logger.debug("log", "LLM requested screen update", { data });
      materializeRenderRef.current?.updateScreens(data);
    },
    [logger],
  );

  // Handle canvas state changes with debounced save
  const handleCanvasStateChange = useCallback(
    (state: CanvasStateData) => {
      // Clear any existing timeout
      if (canvasSaveTimeoutRef.current) {
        clearTimeout(canvasSaveTimeoutRef.current);
      }

      // Debounce the save to prevent excessive database writes
      canvasSaveTimeoutRef.current = setTimeout(async () => {
        if (!prototypeId) return;

        // Cast to Json type for Supabase compatibility
        const contextToSave = {
          canvas: {
            screens: state.screens,
            zoom: state.zoom,
            camera: state.camera,
            previewMode: state.previewMode,
            lastModified: state.lastModified,
          },
        };

        const { error } = await supabase
          .from("prototypes")
          .update({
            prototype_context:
              contextToSave as unknown as Database["public"]["Tables"]["prototypes"]["Update"]["prototype_context"],
          })
          .eq("id", prototypeId);

        if (error) {
          logger.debug("error", "Failed to save canvas state:", { error });
        } else {
          logger.debug("log", "Canvas state saved successfully");
        }
      }, 1000);
    },
    [prototypeId, logger],
  );

  // Cleanup canvas save timeout on unmount
  useEffect(() => {
    return () => {
      if (canvasSaveTimeoutRef.current) {
        clearTimeout(canvasSaveTimeoutRef.current);
      }
    };
  }, []);

  const canEditDesignSystem = Boolean(
    prototype && user && prototype.owner_id === user.id,
  );
  const currentDesignStyle: DesignStyle =
    (prototype?.design_style as DesignStyle | undefined) ?? "tamagui";
  const currentCustomDesignSystemId = prototype?.custom_design_system ?? null;
  const designSystemBadgeLabel = DESIGN_STYLE_LABELS[currentDesignStyle];
  const currentCustomDesignSystemName = currentCustomDesignSystemId
    ? designSystems.find(
        (system) => String(system.id) === currentCustomDesignSystemId,
      )?.name || "Custom design system"
    : undefined;
  const canEditPrototype = Boolean(
    prototype && user && prototype.owner_id === user?.id,
  );

  const hasCustomDesignSystems = designSystems.length > 0;
  const dialogConfirmDisabled = !dialogDesignStyle || isUpdatingDesignSystem;

  // Automatically collapse sidebar when prototype editor loads
  useEffect(() => {
    setSidebarOpen(false);
  }, [setSidebarOpen]);

  // Update document title when prototype name is available
  useEffect(() => {
    if (prototype?.name) {
      document.title = `${prototype.name} | Nucleate`;
    }
    return () => {
      document.title = "Nucleate";
    };
  }, [prototype?.name]);

  // Route to dashboard if active team changes
  useEffect(() => {
    // Store initial team ID on first render when it's available
    if (initialTeamId.current === undefined && activeTeam?.id !== undefined) {
      initialTeamId.current = activeTeam.id;
      return;
    }

    // Route to dashboard if team changes (and we have an initial team set)
    if (
      initialTeamId.current !== undefined &&
      activeTeam?.id !== undefined &&
      activeTeam.id !== initialTeamId.current
    ) {
      router.push("/dashboard/projects");
    }
  }, [activeTeam?.id, router]);

  // Load design systems when dialog opens
  useEffect(() => {
    if (!isDesignSystemDialogOpen) {
      return;
    }

    async function loadDesignSystems() {
      if (!activeTeam?.id) return;

      setIsLoadingDesignSystems(true);
      try {
        const { data, error } = await supabase
          .from("design_systems")
          .select("*")
          .eq("team_id", activeTeam.id);

        if (error) {
          logger.debug("error", "Failed to load design systems:", { error });
          return;
        }

        setDesignSystems(data || []);
      } catch (error) {
        logger.debug("error", "Error loading design systems:", {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsLoadingDesignSystems(false);
      }
    }

    if (designSystems.length === 0 && !isLoadingDesignSystems) {
      loadDesignSystems();
    }
  }, [
    isDesignSystemDialogOpen,
    activeTeam?.id,
    logger,
    designSystems.length,
    isLoadingDesignSystems,
  ]);

  useEffect(() => {
    if (!isDesignSystemDialogOpen) {
      return;
    }

    // Validate that the selected custom design system still exists
    if (dialogCustomDesignSystem && designSystems.length > 0) {
      const exists = designSystems.some(
        (system) => String(system.id) === dialogCustomDesignSystem,
      );
      if (!exists) {
        setDialogCustomDesignSystem(null);
      }
    }
  }, [isDesignSystemDialogOpen, dialogCustomDesignSystem, designSystems]);

  // Mobile detection and resize handling
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Touch handling for swipe gestures
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && activePanel === "chat") {
      setActivePanel("preview");
    }
    if (isRightSwipe && activePanel === "preview") {
      setActivePanel("chat");
    }
  };

  // Divider drag handlers
  const handleDividerMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const newLeftWidth = (e.clientX / window.innerWidth) * 100;
      // Constrain between 20% and 80%
      if (newLeftWidth >= 20 && newLeftWidth <= 80) {
        setLeftPanelWidth(newLeftWidth);
      }
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // USE EFFECT PURPOSE: to fetch prototype and start dev server
  // DO NOT SPLIT THIS USEEFFECT HOOK. Race conditions will fuck up the badge status.
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout | null = null;

    async function fetchPrototypeAndStartDevServer() {
      if (!prototypeId || !shouldTriggerInitialFetch) {
        return;
      }

      // 1. FETCH PROTOTYPE FROM DB
      const { data, error } = await supabase
        .from("prototypes")
        .select("*")
        .eq("id", prototypeId)
        .single();
      if (error) {
        logger.debug("error", "Error fetching prototype:", {
          ...error,
        });
        router.push("/dashboard");
        return;
      }
      const normalizedVisibility = normalizePrototypeVisibility(
        data.visibility,
      );
      setPrototype(data);
      setIsPublic(normalizedVisibility === "PUBLIC");
      setDeployedUrl(
        data.latest_deploy_key && data.slug
          ? `${data.slug}.nucleate.site`
          : null,
      );

      // Load canvas state from prototype_context if available
      if (data.prototype_context) {
        const context = data.prototype_context as PrototypeContextData;
        if (context.canvas) {
          setCanvasState(context.canvas);
        }
      }

      // 2. FETCH CURRENT VIEWING URL FROM SERVER
      // Refresh the Supabase session to ensure the server receives a long-lived token
      const { data: refreshedSession, error: refreshError } =
        await supabase.auth.refreshSession();
      if (refreshError) {
        logger.debug("error", "Error refreshing Supabase session", {
          error: refreshError.message,
        });
      }
      let token = refreshedSession.session?.access_token;
      if (!token) {
        const fallbackSession = await supabase.auth.getSession();
        token = fallbackSession.data.session?.access_token;
      }
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      try {
        const fetchViewResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/fetch-viewing-url`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              prototype_id: prototypeId,
              current_page: "edit",
            } as FetchViewingUrlRequestBody),
          },
        );
        const fetchViewData: APIResponse<
          FetchViewingUrlSuccessResponse,
          StandardErrorResponse
        > = await fetchViewResponse.json();
        if (!fetchViewResponse.ok || fetchViewData.error) {
          logger.debug("error", "Failed to fetch viewing URL:", fetchViewData);
          setShouldTriggerInitialFetch(false);
          return;
        }
        setViewingUrl(fetchViewData.data.viewing_url);
        // TODO(priyam): Think through the different possible states here.
        if (
          fetchViewData.data.terminal_url &&
          fetchViewData.data.terminal_url !== baseTunnelUrl
        ) {
          setBaseTunnelUrl(fetchViewData.data.terminal_url);
        }
        if (
          fetchViewData.data.source === "editable_instance" &&
          (fetchViewData.data.viewing_url?.includes("ngrok") ||
            fetchViewData.data.viewing_url?.includes("sandbox") ||
            fetchViewData.data.viewing_url?.includes("19006"))
        ) {
          setCurrentRenderStatus("Connecting..");
          setShouldTriggerInitialFetch(false);
          return;
        } else if (
          fetchViewData.data.status === "updating" ||
          fetchViewData.data.status === "creating"
        ) {
          setCurrentRenderStatus("Starting Dev Server..");
          setShouldTriggerInitialFetch(false);
          return;
        } else {
          setCurrentRenderStatus("Static build");
        }
      } catch (fetchViewError) {
        logger.debug("error", "Error calling fetch-viewing-url API:", {
          error:
            fetchViewError instanceof Error
              ? fetchViewError.message
              : String(fetchViewError),
          stack:
            fetchViewError instanceof Error ? fetchViewError.stack : undefined,
        });
        setShouldTriggerInitialFetch(false);
        return;
      }

      try {
        setCurrentRenderStatus("Starting Dev Server..");
        setShouldTriggerInitialFetch(false);
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/files/start-dev-server`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              prototype_id: prototypeId,
            } as StartDevServerRequestBody),
          },
        );

        if (response.status === 409) {
          // dev server is already starting from another request
          return;
        } else if (!response.ok) {
          setCurrentRenderStatus("Error");
          return;
        }
        const result: APIResponse<
          StartDevServerSuccessResponse,
          StandardErrorResponse
        > = await response.json();
        if (!result.data || !result.data.viewing_url) {
          setCurrentRenderStatus("Error");
          return;
        }

        setViewingUrl(result.data.viewing_url);
        if (result.data.terminal_url) {
          setBaseTunnelUrl(result.data.terminal_url);
        }
        setCurrentRenderStatus("Connected");
      } catch {
      } finally {
        setShouldTriggerInitialFetch(false);
        return;
      }
    }

    if (prototypeId && shouldTriggerInitialFetch) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      // Set new debounced timer -- THIS IS NECESSARY TO PREVENT MULTIPLE REQUESTS FROM BEING SENT TO THE SERVER ON PAGE LOAD
      debounceTimer = setTimeout(() => {
        fetchPrototypeAndStartDevServer();
      }, 200);
    }

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [
    prototypeId,
    router,
    shouldTriggerInitialFetch,
    viewingUrl,
    logger,
    baseTunnelUrl,
  ]);

  // USE EFFECT PURPOSE: Sync baseTunnelUrl to fileSystem sandboxUrl
  // Also compute normalized sandbox URL for passing to MaterializeRenderSection
  const [normalizedSandboxUrl, setNormalizedSandboxUrl] = useState<
    string | null
  >(null);

  useEffect(() => {
    // Normalize the URL: convert wss:// to https:// or add https:// if no http prefix
    let normalizedUrl = baseTunnelUrl;
    if (normalizedUrl) {
      if (normalizedUrl.startsWith("wss://")) {
        normalizedUrl = "https://" + normalizedUrl.substring(6);
      } else if (
        !normalizedUrl.startsWith("http://") &&
        !normalizedUrl.startsWith("https://")
      ) {
        normalizedUrl = "https://" + normalizedUrl;
      }
    }
    const finalNormalizedUrl = normalizedUrl;
    setSandboxUrl(finalNormalizedUrl);
    setNormalizedSandboxUrl(finalNormalizedUrl);
  }, [baseTunnelUrl, setSandboxUrl]);

  // USE EFFECT PURPOSE: to poll the fetch viewing url endpoint in case build status changes
  useEffect(() => {
    let pollTimer: NodeJS.Timeout | null = null;

    async function pollFetchViewingUrl() {
      if (!prototypeId) return;

      let pollInterval: number = getIntervalForStatus(currentRenderStatus);

      const doPoll = async () => {
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;
          const headers: HeadersInit = {
            "Content-Type": "application/json",
          };
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }

          // logger.debug("log", "Polling fetch viewing url endpoint:", {
          //   viewingUrl,
          // });
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/fetch-viewing-url`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                prototype_id: prototypeId,
                current_page: "edit",
              } as FetchViewingUrlRequestBody),
            },
          );
          const data: APIResponse<
            FetchViewingUrlSuccessResponse,
            StandardErrorResponse
          > = await response.json();
          if (!response.ok || data.error) {
            logger.debug("error", "Failed to fetch viewing URL:", data);
            return;
          }
          if (data.data.viewing_url !== viewingUrl) {
            setViewingUrl(data.data.viewing_url);

            let newStatus: RenderStatus;
            if (data.data.source === "editable_instance") {
              newStatus = "Connecting..";
            } else if (
              data.data.status === "creating" ||
              data.data.status === "updating"
            ) {
              newStatus = "Starting Dev Server..";
            } else {
              newStatus = "Static build";
            }
            if (newStatus === currentRenderStatus) {
              return;
            }
            setCurrentRenderStatus(newStatus);
            const newInterval = getIntervalForStatus(newStatus);
            if (pollTimer && newInterval !== pollInterval) {
              clearInterval(pollTimer);
              pollTimer = setInterval(doPoll, newInterval);
              pollInterval = newInterval;
            }
          }
          if (
            data.data.terminal_url &&
            data.data.terminal_url !== baseTunnelUrl
          ) {
            setBaseTunnelUrl(data.data.terminal_url);
          }
        } catch (error) {
          logger.debug("error", "Polling error:", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      };

      pollTimer = setInterval(doPoll, pollInterval);
    }

    pollFetchViewingUrl();

    return () => {
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [currentRenderStatus, prototypeId, logger, viewingUrl, baseTunnelUrl]);

  const handleDesignSystemDialogOpenChange = (open: boolean) => {
    setIsDesignSystemDialogOpen(open);
    if (!open) {
      setDialogDesignStyle(null);
      setDialogCustomDesignSystem(null);
    }
  };

  const handleOpenDesignSystemDialog = () => {
    if (!prototype) {
      return;
    }
    setDialogDesignStyle(prototype.design_style);
    setDialogCustomDesignSystem(prototype.custom_design_system);
    setIsDesignSystemDialogOpen(true);
  };

  const handleConfirmDesignSystemChange = async () => {
    if (!prototype || !dialogDesignStyle) {
      handleDesignSystemDialogOpenChange(false);
      return;
    }

    const nextCustomDesignSystem = dialogCustomDesignSystem;

    if (
      dialogDesignStyle === prototype.design_style &&
      nextCustomDesignSystem === (prototype.custom_design_system ?? null)
    ) {
      handleDesignSystemDialogOpenChange(false);
      return;
    }

    try {
      setIsUpdatingDesignSystem(true);
      const { error } = await supabase
        .from("prototypes")
        .update({
          design_style: dialogDesignStyle,
          custom_design_system: nextCustomDesignSystem,
        })
        .eq("id", prototype.id);

      if (error) {
        throw error;
      }

      setPrototype((prev) =>
        prev
          ? {
              ...prev,
              design_style: dialogDesignStyle,
              custom_design_system: nextCustomDesignSystem,
            }
          : prev,
      );
      handleDesignSystemDialogOpenChange(false);
    } catch (error) {
      logger.debug("error", "Failed to update design system:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsUpdatingDesignSystem(false);
    }
  };

  const handleClone = useCallback(async () => {
    if (!prototype) return;

    try {
      logger.log({
        event: "client_prototype_editor_clone_button_clicked",
        properties: {
          prototype_id: prototype?.id,
        },
      });
      setIsCloningPrototype(true);
      const clonedPrototypeName = `${prototype.name} (Copy)`;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        logger.debug("error", "No authentication token available");
        return;
      }

      const folderId =
        typeof prototype.folder_id === "string"
          ? prototype.folder_id
          : undefined;
      const description =
        typeof prototype.description === "string"
          ? prototype.description
          : undefined;

      if (!activeTeamId) {
        logger.debug("error", "Unable to locate active team for clone");
        setIsCloningPrototype(false);
        return;
      }

      const payload: CreatePrototypeRequestBody = {
        name: clonedPrototypeName,
        creation_source: "prototype_editor_clone",
        description,
        folder_id: folderId,
        prototype_id: prototype.id,
        visibility: "PUBLIC",
        team_id: activeTeamId,
      };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const result: APIResponse<
        CreatePrototypeSuccessResponse,
        CreatePrototypeErrorResponse
      > = await response.json();

      if (result.data) {
        window.location.href = `/dashboard/projects/${result.data.prototype_id}`;
      } else if (result.error?.error === "PROTOTYPE_LIMIT_REACHED") {
        setShowCloneUpsellModal(true);
      } else if (result.error) {
        logger.debug("error", "Error cloning prototype:", {
          ...result.error,
        });
      }
    } catch (error) {
      logger.debug("error", "Error cloning prototype:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsCloningPrototype(false);
    }
  }, [activeTeamId, logger, prototype]);

  const handleDeploySuccess = useCallback(
    (result: {
      slug: string;
      url: string;
      visibility: PrototypeVisibility;
    }) => {
      setPrototype((prev) =>
        prev
          ? {
              ...prev,
              slug: result.slug,
              is_deployed: true,
              visibility: result.visibility,
            }
          : prev,
      );
      setIsPublic(result.visibility === "PUBLIC");
      setDeployedUrl(result.url);
    },
    [],
  );

  // Callback for visibility changes from the modal
  const handleVisibilityChange = useCallback(
    (newVisibility: PrototypeVisibility) => {
      setIsPublic(newVisibility === "PUBLIC");
      setPrototype((prev) =>
        prev ? { ...prev, visibility: newVisibility } : null,
      );
    },
    [],
  );

  // Callback for name changes from the modal
  const handleNameChange = useCallback((newName: string) => {
    setPrototype((prev) => (prev ? { ...prev, name: newName } : null));
  }, []);

  // Callback for per-screen AI actions from the render section
  const handleScreenAIAction = useCallback(
    (
      screenId: number,
      path: string,
      action: AIActionType,
      screenshotDataUrl?: string,
    ) => {
      // Generate the appropriate prompt based on the action type
      const prompts: Record<AIActionType, string> = {
        redesign: `Please redesign the screen at path "${path}". Analyze the current design and suggest improvements to make it more modern, user-friendly, and visually appealing. Consider layout, typography, colors, and overall UX.`,
        "suggest-improvements": `Please analyze the screen at path "${path}" and suggest specific improvements. Focus on:
- UX/usability issues
- Visual design improvements
- Accessibility concerns
- Mobile responsiveness
- Performance optimizations
Provide actionable recommendations.`,
        "copy-alternatives": `Please review the text/copy on the screen at path "${path}" and generate alternative versions. For each piece of text you identify:
- Provide 2-3 alternative phrasings
- Consider tone (professional, friendly, urgent)
- Optimize for clarity and engagement
- Keep accessibility in mind`,
      };

      const prompt = prompts[action];

      // Send the message with the screenshot to the chat panel
      if (claudeCodePanelRef.current) {
        claudeCodePanelRef.current.sendMessageWithImage(
          prompt,
          screenshotDataUrl,
        );
      }
    },
    [],
  );

  // Callback for global AI actions (PRD generation, design critique)
  const handleGlobalAIAction = useCallback(
    (action: GlobalAIAction, screenshotDataUrls?: string[]) => {
      // Get current screens to build the screen data for the modal
      const currentScreens =
        previewMode === "web" ? webScreensState : mobileScreensState;

      // Build screen data with paths and screenshots
      const screenData: AIDocumentScreen[] = currentScreens.map(
        (screen, index) => ({
          path: screen.path,
          screenshotDataUrl: screenshotDataUrls?.[index] || "",
        }),
      );

      // Filter out screens without screenshots
      const screensWithData = screenData.filter((s) => s.screenshotDataUrl);

      if (screensWithData.length === 0) {
        // No screenshots available, still open modal but it will show error
        setDocumentModalScreens(
          currentScreens.map((s) => ({ path: s.path, screenshotDataUrl: "" })),
        );
      } else {
        setDocumentModalScreens(screensWithData);
      }

      setDocumentModalType(action);
      setIsDocumentModalOpen(true);
    },
    [previewMode, webScreensState, mobileScreensState],
  );

  const handleDeleteRequest = useCallback(
    (path: string, type: "file" | "folder" | "asset") => {
      // Collect all files/assets to delete
      const filesToDelete: string[] = [];

      if (type === "folder") {
        // Find all files that start with this folder path
        Object.keys(fileSystem.state.files).forEach((filePath) => {
          if (filePath.startsWith(path + "/") || filePath === path) {
            filesToDelete.push(filePath);
          }
        });
        // Find all assets that start with this folder path
        Object.keys(fileSystem.state.assets).forEach((assetPath) => {
          if (assetPath.startsWith(path + "/") || assetPath === path) {
            filesToDelete.push(assetPath);
          }
        });
      } else {
        filesToDelete.push(path);
      }

      // Store delete target and show confirmation
      setDeleteTarget({ path, type, filesToDelete });
      setShowDeleteConfirm(true);
    },
    [fileSystem.state.files, fileSystem.state.assets],
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !prototypeId) return;

    setIsDeleting(true);

    try {
      const filesToDelete: string[] = [];
      const assetsToDelete: string[] = [];
      const deletedAssetIds: string[] = [];
      const deletedAssetNames: string[] = [];

      // Categorize files to delete
      for (const filePath of deleteTarget.filesToDelete) {
        const isAssetPath = fileSystem.state.assets[filePath];
        if (isAssetPath) {
          assetsToDelete.push(filePath);
          if (fileSystem.state.assets[filePath]?.id) {
            deletedAssetIds.push(fileSystem.state.assets[filePath].id);
          }
          deletedAssetNames.push(filePath);
        } else {
          filesToDelete.push(filePath);
        }
      }

      // Make ONE unified call to delete everything
      await fileSystem.syncFilesAndAssets({
        filesToDelete,
        assetsToDelete,
      });
      logger.log({
        event: "client_prototype_editor_code_editor_file_deleted",
        properties: {
          prototype_id: prototypeId,
          file_count: filesToDelete.length,
          asset_count: assetsToDelete.length,
          delete_type: deleteTarget?.type,
        },
      });

      // Close dialog
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    } catch (error) {
      logger.debug("error", "Error deleting files:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFileUpload = useCallback(
    async (files: File[], targetPath?: string) => {
      if (!prototypeId) return;

      try {
        const assetExtensions = new Set([
          "png",
          "jpg",
          "jpeg",
          "gif",
          "svg",
          "webp",
          "ico",
          "ttf",
          "otf",
          "woff",
          "woff2",
          "md",
          "txt",
          "env",
          "gitignore",
          "npmrc",
          "prettierrc",
          "eslintrc",
          "editorconfig",
          "watchmanconfig",
          "xml",
        ]);

        const resolvedTargetPath = targetPath || "";
        const uploads = files.map((file) => {
          const fileName = file.name;
          const fullPath = resolvedTargetPath
            ? `${resolvedTargetPath}/${fileName}`
            : fileName;
          const ext = fileName.split(".").pop()?.toLowerCase() || "";
          const kind = assetExtensions.has(ext) ? "asset" : "code";
          return { file, path: fullPath, kind };
        });

        // Collect code files to upsert
        const filesToUpsert: Array<{ name: string; content: string }> = [];
        for (const upload of uploads.filter((u) => u.kind === "code")) {
          const fileContents = await upload.file.text();
          filesToUpsert.push({ name: upload.path, content: fileContents });
        }

        // Collect assets to upload
        const assetsToUpload = uploads
          .filter((u) => u.kind === "asset")
          .map((u) => ({ file: u.file, path: u.path }));

        // Make ONE unified call to sync everything
        const result = await fileSystem.syncFilesAndAssets({
          filesToUpsert,
          assetsToUpload,
        });

        if (result.success) {
          logger.log({
            event: "client_prototype_editor_code_editor_files_uploaded",
            properties: {
              prototype_id: prototypeId,
              file_count: files.length,
              target_path: resolvedTargetPath || "/",
              source: "drag_drop",
            },
          });
        }
        logger.debug("log", "Files uploaded via drag and drop", {
          fileCount: files.length,
          targetPath: resolvedTargetPath,
        });
      } catch (error) {
        logger.debug("error", "Error uploading files via drag and drop:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    },
    [prototypeId, fileSystem, logger],
  );

  // Trigger the original fetch/start flow to avoid race conditions.
  const handleTriggerFetchAndStartDevServer = useCallback(() => {
    logger.log({
      event: "client_prototype_editor_start_dev_server_clicked",
      properties: {
        prototype_id: prototypeId,
      },
    });

    if (!prototypeId) {
      logger.debug("error", "Cannot start dev server: missing prototype ID");
      return;
    }

    if (!shouldTriggerInitialFetch) {
      setShouldTriggerInitialFetch(true);
    }
  }, [prototypeId, logger, shouldTriggerInitialFetch]);

  if (
    !prototypeId ||
    userIsLoading ||
    !fileSystem.state.files ||
    !fileSystem.state.assets
  ) {
    return <Loader />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0B0C0E] text-white">
      {/* Main content area */}
      <div
        className={`flex-1 flex overflow-hidden min-h-0 ${isMobile ? "flex-col" : ""} ${isDragging ? "select-none" : ""}`}
        style={
          isMobile
            ? { height: "calc(100dvh - 60px)", paddingBottom: "60px" }
            : {}
        }
        onTouchStart={isMobile ? onTouchStart : undefined}
        onTouchMove={isMobile ? onTouchMove : undefined}
        onTouchEnd={isMobile ? onTouchEnd : undefined}
      >
        {/* Left Panel - Claude Code */}
        {!isChatCollapsed && (
          <div
            className={`${
              isMobile
                ? `${activePanel === "chat" ? "flex" : "hidden"} w-full h-full`
                : "flex"
            } flex-col relative z-10 bg-[#0B0C0E] overflow-hidden`}
            style={
              isMobile
                ? { height: "100%" }
                : { width: `${leftPanelWidth}%`, minWidth: "320px" }
            }
          >
            {/* Content Area */}
            <div className="flex-1 min-h-0">
              <ClaudeCodePanel
                ref={claudeCodePanelRef}
                prototypeId={prototypeId}
                baseTunnelUrl={baseTunnelUrl}
                prototype={prototype}
                canEditPrototype={canEditPrototype}
                onPrototypeUpdate={setPrototype}
                currentRenderStatus={currentRenderStatus}
                currentViewingPath={currentViewingPath}
                visibleScreens={
                  previewMode === "mobile"
                    ? mobileScreensState
                    : webScreensState
                }
                previewMode={previewMode}
                onScreenUpdate={handleScreenUpdate}
                fileSystem={fileSystem}
                externalWS={claudeCodeWS}
                externalWSConnected={claudeCodeWSConnected}
                externalWSConnecting={claudeCodeWSConnecting}
                onConnect={connectClaudeCodeWS}
                onDisconnect={disconnectClaudeCodeWS}
                onRegisterMessageHandler={(
                  id: string,
                  handler: (msg: ChatServerMessage) => void,
                ) => {
                  claudeCodeWSMessageHandlers.current.set(id, handler);
                }}
                onUnregisterMessageHandler={(id: string) => {
                  claudeCodeWSMessageHandlers.current.delete(id);
                }}
                onRestartDevServerComplete={handleChatRestartDevServerComplete}
                onStartDevServer={handleTriggerFetchAndStartDevServer}
                onCollapse={() => setIsChatCollapsed(true)}
                isFreePlan={isFreePlan}
                onShowClaudeConnectionSettings={showClaudeConnectionSettings}
                onPrototypeNameClick={() =>
                  materializeRenderRef.current?.openProjectSettings("details")
                }
              />
            </div>
          </div>
        )}

        {/* Draggable Divider - Only show on desktop when chat is not collapsed */}
        {!isMobile && !isChatCollapsed && (
          <div
            className="relative w-[1px] cursor-col-resize hover:bg-primary/50 transition-colors group flex-shrink-0 bg-border"
            onMouseDown={handleDividerMouseDown}
            style={{ zIndex: 20 }}
          >
            <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-primary/0" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-transparent group-hover:bg-primary rounded-full transition-colors opacity-0 group-hover:opacity-100" />
          </div>
        )}

        {/* Right Panel - Preview/Code Toggle */}
        <div
          className={`${
            isMobile
              ? `${activePanel === "preview" ? "flex" : "hidden"} w-full h-full`
              : "flex"
          } flex-col relative z-10 bg-[#0B0C0E] overflow-hidden`}
          style={
            isMobile
              ? {}
              : {
                  width: isChatCollapsed ? "100%" : `${100 - leftPanelWidth}%`,
                  minWidth: "320px",
                }
          }
        >
          <div className="flex-1 min-h-0 h-full">
            <MaterializeRenderSection
              ref={materializeRenderRef}
              viewing_url={viewingUrl ?? ""}
              base_tunnel_url={baseTunnelUrl}
              sandbox_url={normalizedSandboxUrl}
              prototypeId={prototypeId}
              files={fileSystem.state.files}
              assets={fileSystem.state.assets}
              currentRenderStatus={currentRenderStatus}
              onRenderStatusChange={setCurrentRenderStatus}
              designSystemLabel={
                canEditDesignSystem
                  ? currentCustomDesignSystemName
                    ? `${designSystemBadgeLabel} + ${currentCustomDesignSystemName}`
                    : designSystemBadgeLabel
                  : undefined
              }
              onDesignSystemClick={
                canEditDesignSystem ? handleOpenDesignSystemDialog : undefined
              }
              onCurrentPathChange={setCurrentViewingPath}
              onScreensChange={setMobileScreensState}
              onWebScreensChange={setWebScreensState}
              onPreviewModeChange={setPreviewMode}
              initialCanvasState={canvasState ?? undefined}
              onCanvasStateChange={handleCanvasStateChange}
              isPreviewView={isPreviewView}
              onPreviewViewChange={setIsPreviewView}
              deploymentUrl={deployedUrl}
              isDeploying={isDeploying}
              onClone={handleClone}
              isCloningPrototype={isCloningPrototype}
              prototype={prototype}
              isPublic={isPublic}
              onVisibilityChange={handleVisibilityChange}
              userPlan={userPlan}
              onNameChange={handleNameChange}
              canEditName={prototype?.owner_id === user?.id}
              onDeploySuccess={handleDeploySuccess}
              canManageGithub={
                activeTeam?.id === prototype?.team_id &&
                (currentUserMembership?.role === "admin" ||
                  currentUserMembership?.role === "owner" ||
                  currentUserMembership?.role === "editor")
              }
              framework={prototype?.framework ?? undefined}
              onStartDevServer={handleTriggerFetchAndStartDevServer}
              isChatCollapsed={isChatCollapsed}
              onExpandChat={() => setIsChatCollapsed(false)}
              onScreenAIAction={handleScreenAIAction}
              onGlobalAIAction={handleGlobalAIAction}
              codeView={
                <div className={`flex h-full ${isMobile ? "flex-col" : ""}`}>
                  {isMobile ? (
                    <>
                      <div className="bg-[#141517] border-b border-white/5 p-2">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant={
                              mobileCodeView === "filetree"
                                ? "default"
                                : "ghost"
                            }
                            size="sm"
                            className={cn(
                              "flex items-center gap-2",
                              mobileCodeView === "filetree"
                                ? "bg-white text-black"
                                : "text-[#8A8F98] hover:text-white",
                            )}
                            onClick={() => setMobileCodeView("filetree")}
                          >
                            <Folder className="h-4 w-4" />
                            File Tree
                          </Button>
                          <Button
                            variant={
                              mobileCodeView === "editor" ? "default" : "ghost"
                            }
                            size="sm"
                            className={cn(
                              "flex items-center gap-2",
                              mobileCodeView === "editor"
                                ? "bg-white text-black"
                                : "text-[#8A8F98] hover:text-white",
                            )}
                            onClick={() => setMobileCodeView("editor")}
                          >
                            <Code2 className="h-4 w-4" />
                            Code Editor
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 min-h-0">
                        {mobileCodeView === "filetree" ? (
                          <div className="h-full overflow-auto border-b border-white/5 bg-[#0B0C0E]">
                            <FileTree
                              files={fileSystem.state.files}
                              assets={fileSystem.state.assets}
                              selectedFile={fileSystem.state.selectedFile}
                              onFileSelect={fileSystem.selectFile}
                              onDelete={handleDeleteRequest}
                              onFileUpload={handleFileUpload}
                            />
                          </div>
                        ) : (
                          <div className="h-full bg-[#0B0C0E]">
                            <CodeEditor
                              fileSystem={fileSystem}
                              prototypeId={prototypeId}
                              currentRenderStatus={currentRenderStatus}
                              onFilesSaved={handleFilesSaved}
                            />
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-1/4 min-w-[200px] max-w-[280px] border-r border-white/5 bg-[#0B0C0E]">
                        <div className="h-full overflow-auto">
                          <FileTree
                            files={fileSystem.state.files}
                            assets={fileSystem.state.assets}
                            selectedFile={fileSystem.state.selectedFile}
                            onFileSelect={fileSystem.selectFile}
                            onDelete={handleDeleteRequest}
                            onFileUpload={handleFileUpload}
                          />
                        </div>
                      </div>
                      <div className="flex-1 h-full bg-[#0B0C0E]">
                        <CodeEditor
                          fileSystem={fileSystem}
                          prototypeId={prototypeId}
                          currentRenderStatus={currentRenderStatus}
                          onFilesSaved={handleFilesSaved}
                        />
                      </div>
                    </>
                  )}
                </div>
              }
              mobileHint={undefined}
              isMobileLayout={isMobile}
            />
          </div>
        </div>
      </div>

      <AlertDialog
        open={isDesignSystemDialogOpen}
        onOpenChange={handleDesignSystemDialogOpenChange}
      >
        <AlertDialogContent className="bg-background border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Change design system
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Changing the design system can modify component structures and
              styling. This may require additional clean up in your prototype.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                Design Style
              </p>
              <Select
                value={(dialogDesignStyle ?? currentDesignStyle) as DesignStyle}
                onValueChange={(value) => {
                  const nextStyle = value as DesignStyle;
                  setDialogDesignStyle(nextStyle);
                }}
              >
                <SelectTrigger className="h-10 bg-accent border-border text-foreground">
                  <SelectValue placeholder="Choose a design style" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border text-foreground">
                  {DESIGN_STYLE_OPTIONS.map((style) => (
                    <SelectItem
                      key={style}
                      value={style}
                      className="focus:bg-accent focus:text-foreground cursor-pointer"
                    >
                      {DESIGN_STYLE_LABELS[style]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasCustomDesignSystems && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                  Custom Design System{" "}
                  <span className="text-muted-foreground/70 font-normal lowercase">
                    (Optional)
                  </span>
                </p>
                {isLoadingDesignSystems ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Loading design systems...
                  </div>
                ) : (
                  <>
                    <Select
                      value={dialogCustomDesignSystem ?? "none"}
                      onValueChange={(value) =>
                        setDialogCustomDesignSystem(
                          value === "none" ? null : value,
                        )
                      }
                    >
                      <SelectTrigger className="h-10 bg-accent border-border text-foreground">
                        <SelectValue placeholder="No custom design system" />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-border text-foreground">
                        <SelectItem
                          value="none"
                          className="focus:bg-accent focus:text-foreground cursor-pointer"
                        >
                          No custom design system
                        </SelectItem>
                        {designSystems.map((system) => (
                          <SelectItem
                            key={system.id}
                            value={String(system.id)}
                            className="focus:bg-accent focus:text-foreground cursor-pointer"
                          >
                            {system.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Apply custom design rules on top of the selected design
                      style
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isUpdatingDesignSystem}
              className="border-border text-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDesignSystemChange}
              disabled={dialogConfirmDisabled}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isUpdatingDesignSystem ? "Updating..." : "Confirm change"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clone Upsell Modal */}
      <ProPlanUpsellModal
        open={showCloneUpsellModal}
        onOpenChange={setShowCloneUpsellModal}
        reason="prototype_creation_limit_reached"
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-background border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete{" "}
              {deleteTarget?.type === "folder"
                ? "Folder"
                : deleteTarget?.type === "asset"
                  ? "Asset"
                  : "File"}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {deleteTarget?.type === "folder" ? (
                <>
                  Are you sure you want to delete the folder{" "}
                  <span className="text-foreground font-mono bg-accent px-1 py-0.5 rounded">
                    {deleteTarget.path}
                  </span>
                  ?
                  <br />
                  This will delete{" "}
                  <span className="font-semibold text-foreground">
                    {deleteTarget.filesToDelete.length} file
                    {deleteTarget.filesToDelete.length !== 1 ? "s" : ""}
                  </span>{" "}
                  inside this folder.
                  <br />
                  This action cannot be undone.
                </>
              ) : (
                <>
                  Are you sure you want to delete{" "}
                  <span className="text-foreground font-mono bg-accent px-1 py-0.5 rounded">
                    {deleteTarget?.path}
                  </span>
                  ?
                  <br />
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              className="border-border text-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Survey Overlay (Scenario 1: during build) */}
      {user?.id && (
        <SurveyOverlay
          userId={user.id}
          isBuildRunning={
            currentRenderStatus === "Starting Dev Server.." ||
            currentRenderStatus === "Updating.." ||
            currentRenderStatus === "Connecting.."
          }
        />
      )}

      <TeamAndAccountsSettingsDialog
        open={teamSettingsDialogOpen}
        onOpenChange={setTeamSettingsDialogOpen}
        defaultTab={teamSettingsDefaultTab}
      />

      {/* Document Generation Modal (PRD, Design Critique) */}
      <DocumentGenerationModal
        isOpen={isDocumentModalOpen}
        onOpenChange={setIsDocumentModalOpen}
        documentType={documentModalType}
        prototypeId={prototypeId}
        prototypeName={prototype?.name}
        screens={documentModalScreens}
        sandboxUrl={normalizedSandboxUrl || ""}
        framework={prototype?.framework ?? undefined}
      />

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#141517] border-t border-white/5 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-center space-x-2">
            <Button
              variant={activePanel === "chat" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActivePanel("chat")}
              className={cn(
                "flex items-center gap-2 transition-all",
                activePanel === "chat"
                  ? "bg-white text-black"
                  : "text-[#8A8F98] hover:text-white hover:bg-white/10",
              )}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </Button>
            <Button
              variant={activePanel === "preview" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActivePanel("preview")}
              className={cn(
                "flex items-center gap-2 transition-all",
                activePanel === "preview"
                  ? "bg-white text-black"
                  : "text-[#8A8F98] hover:text-white hover:bg-white/10",
              )}
            >
              <Smartphone className="w-4 h-4" />
              Preview
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const getIntervalForStatus = (status: RenderStatus): number => {
  switch (status) {
    case "Connected": // viewing url is ngrok, must poll at a slower rate (every 45 sec) in case build server is cleaned up
      return 45000;
    case "Starting Dev Server..": // possible user refreshes page, then viewing url will only be returned via polling bc initial request is lost and response will never be received, so poll every 15 seconds
      return 25000;
    case "Static build":
      return 150000;
    case "Connecting..":
    case "Updating..": // Connecting and Updating the dev server is obviously active. poll every minute though just in case
      return 60000;
    case "Disconnected":
      return 30000;
    default:
      return 60000;
  }
};
