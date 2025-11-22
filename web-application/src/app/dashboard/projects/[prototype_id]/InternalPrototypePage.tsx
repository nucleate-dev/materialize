"use client";

import { supabase } from "@/ClientConstants";
import Loader from "@/components/dashboard/Loader";
import ClaudeCodePanel from "@/components/prototype-editor/ClaudeCodePanel";
import CodeEditor from "@/components/prototype-editor/CodeEditor";
import FileTree from "@/components/prototype-editor/FileTree";
import MaterializeRenderSection from "@/components/prototype-editor/MaterializeRenderSection";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import type { ChatServerMessage } from "@/lib/types/ChatTypes";
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
import { useSetAtom } from "jotai";
import {
  Code2,
  Copy,
  Folder,
  Globe,
  Loader2,
  Lock,
  MessageSquare,
  Share2,
  Smartphone
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type DesignStyle = Database["public"]["Enums"]["design_style"];
type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];

const DESIGN_STYLE_OPTIONS: DesignStyle[] = [
  "tamagui",
  "nativewind",
  "stylesheets",
];

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
  | "Connected";

export default function InternalPrototypePage() {
  const router = useRouter();
  const { user, userIsLoading } = useUser();
  const { userPlan } = useSubscriptionAccess();
  const params = useParams<{ prototype_id: string; }>();
  const prototypeId = params?.prototype_id;
  const logger = useProductLogger();
  const setSidebarOpen = useSetAtom(sidebarOpenAtom);

  const [shouldTriggerInitialFetch, setShouldTriggerInitialFetch] =
    useState(true);
  const [isPreviewView, setIsPreviewView] = useState(true);
  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isCloningPrototype, setIsCloningPrototype] = useState(false);
  const [showCloneUpsellModal, setShowCloneUpsellModal] = useState(false);
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

  // Resizable divider state
  const [leftPanelWidth, setLeftPanelWidth] = useState(40); // percentage
  const [isDragging, setIsDragging] = useState(false);

  // Initialize FileSystem hook
  const defaultFile = "App.js"; // TODO update this for the new default app
  const fileSystem = useFileSystem(prototypeId, defaultFile);

  // Claude Code WebSocket management
  const claudeCodeWSMessageHandlers = useRef<
    Map<string, (msg: ChatServerMessage) => void>
  >(new Map());

  const handleClaudeCodeMessage = useCallback(
    (message: { type: string; data: unknown; }) => {
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
    sendSyncFiles,
  } = useClaudeCodeWebSocket({
    prototypeId,
    baseTunnelUrl,
    onMessage: handleClaudeCodeMessage,
  });

  // Handler for when files are saved in CodeEditor
  const handleFilesSaved = useCallback(
    (fileNames: string[], assetNames: string[] = []) => {
      // Immediately sync files to Claude Code working directory
      if (claudeCodeWSConnected) {
        logger.debug("log", "Triggering Claude Code file sync", {
          fileNames,
          assetNames,
        });
        sendSyncFiles(prototypeId, fileNames, assetNames);
      }
    },
    [claudeCodeWSConnected, sendSyncFiles, prototypeId, logger],
  );

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

  // Load design systems when dialog opens
  useEffect(() => {
    if (!isDesignSystemDialogOpen) {
      return;
    }

    async function loadDesignSystems() {
      if (!user) return;

      setIsLoadingDesignSystems(true);
      try {
        const { data, error } = await supabase
          .from("design_systems")
          .select("*")
          .eq("owner_id", user.id);

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
    user,
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
      setPrototype(data);
      setIsPublic(data.visibility === "PUBLIC");

      // 2. FETCH CURRENT VIEWING URL FROM SERVER
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
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
          fetchViewData.data.viewing_url?.includes("ngrok")
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
              framework: "expo_react_native",
              prototype_id: prototypeId,
            } as StartDevServerRequestBody),
          },
        );

        if (!response.ok) return;
        const result: APIResponse<
          StartDevServerSuccessResponse,
          StandardErrorResponse
        > = await response.json();
        if (!result.data || !result.data.viewing_url) return;

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
      debounceTimer = setTimeout(() => {
        fetchPrototypeAndStartDevServer();
      }, 500);
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

          logger.debug("log", "Polling fetch viewing url endpoint:", {
            viewingUrl,
          });
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
          if (
            data.data.viewing_url !== viewingUrl
          ) {
            setViewingUrl(data.data.viewing_url);

            let newStatus: RenderStatus;
            if (data.data.source === "editable_instance") {
              newStatus = "Connecting..";
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

  const handleShare = () => {
    setShowShareModal(true);
  };

  const handleClone = useCallback(async () => {
    if (!prototype) return;

    try {
      setIsCloningPrototype(true);
      const clonedPrototypeName = `${prototype.name} (Copy)`;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        logger.debug("error", "No authentication token available");
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: clonedPrototypeName,
            description: prototype.description,
            folder_id: prototype.folder_id || undefined,
            prototype_id: prototype.id,
            visibility: "PUBLIC",
          } as CreatePrototypeRequestBody),
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
  }, [logger, prototype]);

  const handleCopyLink = async () => {
    if (!prototype) return;

    setIsCopying(true);
    try {
      if (!isPublic) {
        await supabase
          .from("prototypes")
          .update({ visibility: "PUBLIC" })
          .eq("id", prototype.id);

        setIsPublic(true);
        setPrototype((prev) =>
          prev ? { ...prev, visibility: "PUBLIC" } : null,
        );
      }

      await navigator.clipboard.writeText(window.location.href);

      setTimeout(() => {
        setShowShareModal(false);
      }, 1000);
    } catch (err) {
      logger.debug("error", "Failed to copy URL:", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    } finally {
      setIsCopying(false);
    }
  };

  const handleVisibilityToggle = async (checked: boolean) => {
    if (!prototype) return;
    if (!checked && userPlan !== "pro") {
      return;
    }

    try {
      const newVisibility = checked ? "PUBLIC" : "SELF";
      await supabase
        .from("prototypes")
        .update({ visibility: newVisibility })
        .eq("id", prototype.id);

      setIsPublic(checked);
      setPrototype((prev) =>
        prev ? { ...prev, visibility: newVisibility } : null,
      );
    } catch (err) {
      logger.debug("error", "Failed to update visibility:", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  };

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
      {/* Mobile Panel Toggle */}
      {isMobile && (
        <div className="bg-[#141517] border-b border-white/5 p-2">
          <div className="flex items-center justify-center space-x-2">
            <Button
              variant={activePanel === "chat" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActivePanel("chat")}
              className={cn(
                "flex items-center gap-2 transition-all",
                activePanel === "chat" ? "bg-white text-black" : "text-[#8A8F98] hover:text-white hover:bg-white/10"
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
                activePanel === "preview" ? "bg-white text-black" : "text-[#8A8F98] hover:text-white hover:bg-white/10"
              )}
            >
              <Smartphone className="w-4 h-4" />
              Preview
            </Button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div
        className={`flex-1 flex overflow-hidden min-h-0 ${isMobile ? "flex-col" : ""} ${isDragging ? "select-none" : ""}`}
        style={isMobile ? { height: "calc(100dvh - 120px)" } : {}}
        onTouchStart={isMobile ? onTouchStart : undefined}
        onTouchMove={isMobile ? onTouchMove : undefined}
        onTouchEnd={isMobile ? onTouchEnd : undefined}
      >
        {/* Left Panel - Claude Code */}
        <div
          className={`${isMobile
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
              prototypeId={prototypeId}
              baseTunnelUrl={baseTunnelUrl}
              prototype={prototype}
              canEditPrototype={canEditPrototype}
              onPrototypeUpdate={setPrototype}
              currentRenderStatus={currentRenderStatus}
              currentViewingPath={currentViewingPath}
              onFileSyncComplete={() => {
                fileSystem.loadFilesFromDatabase(prototypeId);
                fileSystem.loadAssetsFromDatabase(prototypeId);
              }}
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
            />
          </div>
        </div>

        {/* Draggable Divider - Only show on desktop */}
        {!isMobile && (
          <div
            className="relative w-[1px] cursor-col-resize hover:bg-indigo-500/50 transition-colors group flex-shrink-0 bg-white/5"
            onMouseDown={handleDividerMouseDown}
            style={{ zIndex: 20 }}
          >
            <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-indigo-500/0" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-transparent group-hover:bg-indigo-500 rounded-full transition-colors opacity-0 group-hover:opacity-100" />
          </div>
        )}

        {/* Right Panel - Preview/Code Toggle */}
        <div
          className={`${isMobile
            ? `${activePanel === "preview" ? "flex" : "hidden"} w-full h-full`
            : "flex"
            } flex-col relative z-10 bg-[#0B0C0E] overflow-hidden`}
          style={
            isMobile
              ? {}
              : { width: `${100 - leftPanelWidth}%`, minWidth: "320px" }
          }
        >
          <div className="flex-1 min-h-0 h-full">
            <MaterializeRenderSection
              viewing_url={viewingUrl ?? ""}
              base_tunnel_url={baseTunnelUrl}
              prototypeId={prototypeId}
              files={fileSystem.state.files}
              assets={Object.fromEntries(
                Object.entries(fileSystem.state.assets).map(([key, asset]) => [
                  key,
                  { ...asset, storage_url: asset.storage_url || "" },
                ]),
              )}
              onViewingUrlUpdate={setViewingUrl}
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
              isPreviewView={isPreviewView}
              onPreviewViewChange={setIsPreviewView}
              onShare={handleShare}
              onClone={handleClone}
              isCloningPrototype={isCloningPrototype}
              codeView={
                <div className={`flex h-full ${isMobile ? "flex-col" : ""}`}>
                  {isMobile ? (
                    <>
                      <div className="bg-[#141517] border-b border-white/5 p-2">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant={
                              mobileCodeView === "filetree" ? "default" : "ghost"
                            }
                            size="sm"
                            className={cn(
                              "flex items-center gap-2",
                              mobileCodeView === "filetree" ? "bg-white text-black" : "text-[#8A8F98] hover:text-white"
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
                              mobileCodeView === "editor" ? "bg-white text-black" : "text-[#8A8F98] hover:text-white"
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
                              assets={Object.fromEntries(
                                Object.entries(fileSystem.state.assets).map(
                                  ([key, asset]) => [
                                    key,
                                    {
                                      ...asset,
                                      storage_url: asset.storage_url || "",
                                    },
                                  ],
                                ),
                              )}
                              selectedFile={fileSystem.state.selectedFile}
                              onFileSelect={fileSystem.selectFile}
                            />
                          </div>
                        ) : (
                          <div className="h-full bg-[#0B0C0E]">
                            <CodeEditor
                              fileSystem={fileSystem}
                              prototypeId={prototypeId}
                              onViewingUrlUpdate={setViewingUrl}
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
                            assets={Object.fromEntries(
                              Object.entries(fileSystem.state.assets).map(
                                ([key, asset]) => [
                                  key,
                                  {
                                    ...asset,
                                    storage_url: asset.storage_url || "",
                                  },
                                ],
                              ),
                            )}
                            selectedFile={fileSystem.state.selectedFile}
                            onFileSelect={fileSystem.selectFile}
                          />
                        </div>
                      </div>
                      <div className="flex-1 h-full bg-[#0B0C0E]">
                        <CodeEditor
                          fileSystem={fileSystem}
                          prototypeId={prototypeId}
                          onViewingUrlUpdate={setViewingUrl}
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
        <AlertDialogContent className="bg-[#141517] border border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Change design system</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8A8F98]">
              Changing the design system can modify component structures and
              styling. This may require additional clean up in your prototype.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-[#8A8F98] tracking-wide">
                Design Style
              </p>
              <Select
                value={(dialogDesignStyle ?? currentDesignStyle) as DesignStyle}
                onValueChange={(value) => {
                  const nextStyle = value as DesignStyle;
                  setDialogDesignStyle(nextStyle);
                }}
              >
                <SelectTrigger className="h-10 bg-[#0B0C0E] border-white/10 text-white">
                  <SelectValue placeholder="Choose a design style" />
                </SelectTrigger>
                <SelectContent className="bg-[#141517] border-white/10 text-white">
                  {DESIGN_STYLE_OPTIONS.map((style) => (
                    <SelectItem key={style} value={style} className="focus:bg-white/10 focus:text-white cursor-pointer">
                      {DESIGN_STYLE_LABELS[style]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasCustomDesignSystems && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-[#8A8F98] tracking-wide">
                  Custom Design System{" "}
                  <span className="text-[#8A8F98]/70 font-normal lowercase">
                    (Optional)
                  </span>
                </p>
                {isLoadingDesignSystems ? (
                  <div className="flex items-center gap-2 text-xs text-[#8A8F98]">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
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
                      <SelectTrigger className="h-10 bg-[#0B0C0E] border-white/10 text-white">
                        <SelectValue placeholder="No custom design system" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#141517] border-white/10 text-white">
                        <SelectItem value="none" className="focus:bg-white/10 focus:text-white cursor-pointer">
                          No custom design system
                        </SelectItem>
                        {designSystems.map((system) => (
                          <SelectItem key={system.id} value={String(system.id)} className="focus:bg-white/10 focus:text-white cursor-pointer">
                            {system.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-[#8A8F98]">
                      Apply custom design rules on top of the selected design
                      style
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingDesignSystem} className="border-white/10 text-white hover:bg-white/5 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDesignSystemChange}
              disabled={dialogConfirmDisabled}
              className="bg-white text-black hover:bg-white/90"
            >
              {isUpdatingDesignSystem ? "Updating..." : "Confirm change"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="sm:max-w-md bg-[#141517] border border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-indigo-500" /> Share Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Visibility Toggle */}
            <div className="flex items-center justify-between p-3 bg-[#0B0C0E] border border-white/5 rounded-lg">
              <div>
                <div className="flex items-center gap-2">
                  {isPublic ? <Globe className="w-3.5 h-3.5 text-indigo-400" /> : <Lock className="w-3.5 h-3.5 text-gray-500" />}
                  <p className="font-medium text-sm">Make Public</p>
                </div>
                <p className="text-xs text-[#8A8F98] mt-1 ml-5">
                  {isPublic
                    ? "Anyone with the link can view"
                    : "Only you can view"}
                </p>
                {userPlan !== "pro" && !isPublic && (
                  <p className="text-xs text-amber-500/80 mt-1 ml-5">
                    Upgrade to Pro to restrict access
                  </p>
                )}
              </div>
              <label
                className={`relative inline-flex items-center ${userPlan !== "pro" && !isPublic
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer"
                  }`}
              >
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => handleVisibilityToggle(e.target.checked)}
                  disabled={userPlan !== "pro" && !isPublic}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500 peer-disabled:cursor-not-allowed"></div>
              </label>
            </div>

            {/* Share Link */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#8A8F98]">Share Link</p>
              <div className="flex items-center gap-2">
                <Input
                  value={window.location.href.replace(
                    "dashboard/projects",
                    "project",
                  )}
                  readOnly
                  className="flex-1 bg-[#0B0C0E] border-white/10 text-white/80 h-9 text-xs"
                />
                <Button
                  onClick={handleCopyLink}
                  disabled={isCopying}
                  size="sm"
                  className="flex items-center gap-2 bg-white text-black hover:bg-white/90 h-9"
                >
                  {isCopying ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {isCopying ? "Copying..." : "Copy"}
                </Button>
              </div>
              {!isPublic && (
                <p className="text-xs text-amber-500/80">
                  ⚠️ Copying the link will automatically make this project public
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clone Upsell Modal */}
      <ProPlanUpsellModal
        open={showCloneUpsellModal}
        onOpenChange={setShowCloneUpsellModal}
        reason="prototype_creation_limit_reached"
      />
    </div>
  );
}

const getIntervalForStatus = (status: RenderStatus): number => {
  switch (status) {
    case "Connected":
      return 45000;
    case "Starting Dev Server..":
      return 25000;
    case "Static build":
      return 150000;
    case "Connecting..":
    case "Updating..":
      return 60000;
    case "Disconnected":
      return 30000;
    default:
      return 60000;
  }
};