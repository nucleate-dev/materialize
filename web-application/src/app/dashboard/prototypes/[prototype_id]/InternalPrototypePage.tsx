"use client";

import { supabase } from "@/ClientConstants";
import Loader from "@/components/dashboard/Loader";
import CodeEditor from "@/components/prototype-editor/CodeEditor";
import FileTree from "@/components/prototype-editor/FileTree";
import MaterializeRenderSection from "@/components/prototype-editor/MaterializeRenderSection";
import PrototypeChatWindow from "@/components/prototype-editor/PrototypeChatWindow";
import PublicPrototypeHeader from "@/components/prototype-editor/PublicPrototypeHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFileSystem } from "@/hooks/useFileSystem";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useUser } from "@/hooks/useUser";
import { sidebarOpenAtom } from "@/lib/atoms/sidebar";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import {
  type APIResponse,
  type FetchViewingUrlRequestBody,
  type FetchViewingUrlSuccessResponse,
  type StandardErrorResponse,
  type StartDevServerRequestBody,
  type StartDevServerSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { hasChatIntent } from "@/lib/utils/chatIntentUtils";
import {
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  DevicePhoneMobileIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { useSetAtom } from "jotai";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];
type PrototypeAsset = Database["public"]["Tables"]["prototype_assets"]["Row"];
type DesignStyle = Database["public"]["Enums"]["design_style"];
type DesignSystemRow = Database["public"]["Tables"]["design_systems"]["Row"];

const DESIGN_STYLE_OPTIONS: DesignStyle[] = [
  "tamagui",
  "nativewind",
  "stylesheets",
  "custom",
];

const DESIGN_STYLE_LABELS: Record<DesignStyle, string> = {
  tamagui: "Tamagui",
  nativewind: "NativeWind + Gluestack",
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
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isPreviewView, setIsPreviewView] = useState(true);
  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
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
  const [isUpdatingDesignSystem, setIsUpdatingDesignSystem] =
    useState(false);

  // Mobile-specific state
  const [activePanel, setActivePanel] = useState<"chat" | "preview">("preview");
  const [isMobile, setIsMobile] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Initialize FileSystem hook
  const defaultFile = "App.js"; // TODO update this for the new default app
  const fileSystem = useFileSystem(prototypeId, defaultFile);

  const canEditDesignSystem = Boolean(
    prototype && user && prototype.owner_id === user.id,
  );
  const currentDesignStyle: DesignStyle =
    (prototype?.design_style as DesignStyle | undefined) ?? "tamagui";
  const currentCustomDesignSystemId = prototype?.custom_design_system ?? null;
  const designSystemBadgeLabel = DESIGN_STYLE_LABELS[currentDesignStyle];
  const currentCustomDesignSystemName =
    currentDesignStyle === "custom"
      ? designSystems.find(
          (system) => String(system.id) === currentCustomDesignSystemId,
        )?.name ||
        (currentCustomDesignSystemId ? "Custom design system" : undefined)
      : undefined;

  const hasCustomDesignSystems = designSystems.length > 0;
  const dialogConfirmDisabled =
    !dialogDesignStyle ||
    (dialogDesignStyle === "custom" &&
      (!dialogCustomDesignSystem || !hasCustomDesignSystems)) ||
    isUpdatingDesignSystem;

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
  }, [isDesignSystemDialogOpen, user, logger, designSystems.length, isLoadingDesignSystems]);

  useEffect(() => {
    if (!isDesignSystemDialogOpen) {
      return;
    }

    if (dialogDesignStyle !== "custom") {
      return;
    }

    if (designSystems.length > 0) {
      const exists = designSystems.some(
        (system) => String(system.id) === dialogCustomDesignSystem,
      );
      if (!exists) {
        setDialogCustomDesignSystem(String(designSystems[0].id));
      }
      return;
    }

    if (!isLoadingDesignSystems) {
      setDialogCustomDesignSystem(null);
    }
  }, [
    isDesignSystemDialogOpen,
    dialogDesignStyle,
    dialogCustomDesignSystem,
    designSystems,
    isLoadingDesignSystems,
  ]);

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

      // 3. AUTO-START DEV SERVER WHEN FILES ARE LOADED
      if (
        !fileSystem.state.files ||
        !fileSystem.state.assets ||
        Object.keys(fileSystem.state.files).length === 0
      ) {
        // too soon to send files to server, we'll re-trigger this entirefunction when all files are loaded
        return;
      }
      if (hasChatIntent(prototypeId)) {
        setShouldTriggerInitialFetch(false);
        return;
      }

      try {
        setCurrentRenderStatus("Starting Dev Server..");
        const filesArray: PrototypeFile[] = Object.entries(
          fileSystem.state.files,
        ).map(([path, file]) => ({
          contents: file.contents,
          name: path,
          prototype_id: file.prototype_id || prototypeId,
          id: file.id,
          created_at: file.created_at || null,
          updated_at: file.updated_at || null,
        }));
        const assetsArray: PrototypeAsset[] = Object.entries(
          fileSystem.state.assets,
        ).map(([path, asset]) => ({
          storage_url: asset.storage_url,
          name: path,
          prototype_id: asset.prototype_id || prototypeId,
          created_at: asset.created_at || null,
          updated_at: asset.updated_at || null,
          id: asset.id,
        }));

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
              files: filesArray,
              assets: assetsArray,
              prototype_id: prototypeId,
              file_scope: "complete", // Send all files to properly initialize dev server
            } as StartDevServerRequestBody),
          },
        );

        if (!response.ok) return;
        const result: APIResponse<
          StartDevServerSuccessResponse,
          StandardErrorResponse
        > = await response.json();
        if (!result.data || !result.data.viewing_url) return;
        // Update viewing URL if provided
        setViewingUrl(result.data.viewing_url);
        setCurrentRenderStatus("Connected");
      } catch {
      } finally {
        setShouldTriggerInitialFetch(false);
        return;
      }
    }

    if (prototypeId && shouldTriggerInitialFetch) {
      // Clear existing timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Set new debounced timer -- THIS IS NECESSARY TO PREVENT MULTIPLE REQUESTS FROM BEING SENT TO THE SERVER ON PAGE LOAD
      debounceTimer = setTimeout(() => {
        fetchPrototypeAndStartDevServer();
      }, 500);
    }

    // Cleanup function
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [
    fileSystem.state.assets,
    fileSystem.state.files,
    prototypeId,
    router,
    shouldTriggerInitialFetch,
    viewingUrl,
    logger,
  ]);

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
            data.data.viewing_url !== viewingUrl // this is important because otherwise we want to maintain the badge status from elsewhere
          ) {
            setViewingUrl(data.data.viewing_url);

            // Determine new status based on response
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
            // Reset timer with new interval for the new status
            const newInterval = getIntervalForStatus(newStatus);
            if (pollTimer && newInterval !== pollInterval) {
              clearInterval(pollTimer);
              pollTimer = setInterval(doPoll, newInterval);
              pollInterval = newInterval; // Update the local variable
            }
          }
        } catch (error) {
          logger.debug("error", "Polling error:", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      };

      // Start polling with the determined interval
      pollTimer = setInterval(doPoll, pollInterval);
    }

    pollFetchViewingUrl();

    // Cleanup function
    return () => {
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [currentRenderStatus, prototypeId, logger, viewingUrl]);

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
    setDialogCustomDesignSystem(
      prototype.design_style === "custom"
        ? prototype.custom_design_system
        : null,
    );
    setIsDesignSystemDialogOpen(true);
  };

  const handleConfirmDesignSystemChange = async () => {
    if (!prototype || !dialogDesignStyle) {
      handleDesignSystemDialogOpenChange(false);
      return;
    }

    const nextCustomDesignSystem =
      dialogDesignStyle === "custom" ? dialogCustomDesignSystem : null;

    if (dialogDesignStyle === "custom" && !nextCustomDesignSystem) {
      return;
    }

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

  const handleCopyLink = async () => {
    if (!prototype) return;

    setIsCopying(true);
    try {
      // If not public, make it public first
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

      // Close modal after successful copy
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

    // Prevent free users from making prototypes private
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
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      {prototype && (
        <PublicPrototypeHeader
          prototype={prototype}
          onUpdatePrototype={setPrototype}
          onShare={handleShare}
        />
      )}

      {/* Mobile Panel Toggle */}
      {isMobile && (
        <div className="bg-background border-b border-border p-2">
          <div className="flex items-center justify-center space-x-2">
            <Button
              variant={activePanel === "chat" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActivePanel("chat")}
              className="flex items-center gap-2"
            >
              <ChatBubbleLeftRightIcon className="w-4 h-4" />
              Chat
            </Button>
            <Button
              variant={activePanel === "preview" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActivePanel("preview")}
              className="flex items-center gap-2"
            >
              <DevicePhoneMobileIcon className="w-4 h-4" />
              Preview
            </Button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div
        className={`flex-1 flex overflow-hidden min-h-0 ${isMobile ? "flex-col" : ""}`}
        style={isMobile ? { height: "calc(100dvh - 120px)" } : {}}
        onTouchStart={isMobile ? onTouchStart : undefined}
        onTouchMove={isMobile ? onTouchMove : undefined}
        onTouchEnd={isMobile ? onTouchEnd : undefined}
      >
        {/* Left Panel - AI Assistant Chat */}
        <div
          className={`${isMobile
              ? `${activePanel === "chat" ? "flex" : "hidden"} w-full h-full`
              : "w-2/5 min-w-[420px] flex"
            } flex-col relative z-10`}
          style={isMobile ? { height: "100%" } : {}}
        >
          {/* Card Container */}
          <Card
            className={`h-full ${isMobile ? "m-2" : "m-2"} bg-background/80 backdrop-blur-sm border border-border`}
            style={isMobile ? { height: "calc(100% - 16px)" } : {}}
          >
            <CardContent className="h-full flex flex-col p-0 overflow-hidden">
              {/* Mobile Chat Header */}
              {isMobile && (
                <div className="p-6 border-b border-border flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <ChatBubbleLeftRightIcon className="w-4 h-4 text-foreground" />
                      <h2 className="text-base font-bold text-foreground">
                        AI Assistant
                      </h2>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Swipe left to see preview
                    </div>
                  </div>
                </div>
              )}

              {/* Content Area */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <PrototypeChatWindow
                  prototypeId={prototypeId}
                  // File system integration
                  files={fileSystem.state.files}
                  assets={fileSystem.state.assets}
                  onFilesUpdate={fileSystem.applyAndPersistFileUpdates}
                  currentViewingUrl={viewingUrl ?? ""}
                  // Loading state
                  isChatLoading={isChatLoading}
                  setIsChatLoading={setIsChatLoading}
                  // Viewing URL integration
                  onViewingUrlUpdate={setViewingUrl}
                  // Render status for disabling input
                  currentRenderStatus={currentRenderStatus}
                  onCurrentRenderStatusChange={setCurrentRenderStatus}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Preview/Code Toggle */}
        <div
          className={`${isMobile
              ? `${activePanel === "preview" ? "flex" : "hidden"} w-full h-full`
              : "w-3/5 min-w-[500px] flex"
            } flex-col relative z-10`}
        >
          {/* Card Container */}
          <Card
            className={`h-full ${isMobile ? "m-2" : "m-2 ml-0"} bg-background/80 backdrop-blur-sm border border-border`}
          >
            <CardContent className="h-full flex flex-col p-0">
              {/* Header with Toggle */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="rounded-lg">
                      {isPreviewView ? (
                        <EyeIcon className="w-4 h-4 text-foreground" />
                      ) : (
                        <CodeBracketIcon className="w-4 h-4 text-foreground" />
                      )}
                    </div>
                    <div>
                      <h2
                        className={`${isMobile ? "text-base" : "text-lg"} font-bold text-foreground`}
                      >
                        {isPreviewView ? "Live Preview" : "Code Editor"}
                      </h2>
                    </div>
                    {isMobile && (
                      <div className="text-xs text-muted-foreground ml-2">
                        Swipe right for chat
                      </div>
                    )}
                  </div>

                  {/* Enhanced Toggle Buttons */}
                  <div className="flex items-center bg-muted rounded-lg p-1">
                    <Button
                      variant={isPreviewView ? "default" : "ghost"}
                      size={isMobile ? "sm" : "sm"}
                      onClick={() => setIsPreviewView(true)}
                      className="flex items-center gap-2"
                    >
                      <EyeIcon className="w-4 h-4" />
                      {!isMobile && "Preview"}
                    </Button>
                    <Button
                      variant={!isPreviewView ? "default" : "ghost"}
                      size={isMobile ? "sm" : "sm"}
                      onClick={() => setIsPreviewView(false)}
                      className="flex items-center gap-2"
                    >
                      <CodeBracketIcon className="w-4 h-4" />
                      {!isMobile && "Code"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-hidden h-full">
                <div className="relative h-full">
                  {isPreviewView ? (
                    <div className="h-full flex flex-col">
                      <MaterializeRenderSection
                        viewing_url={viewingUrl ?? ""}
                        prototypeId={prototypeId}
                        files={fileSystem.state.files}
                        assets={fileSystem.state.assets}
                        onViewingUrlUpdate={setViewingUrl}
                        currentRenderStatus={currentRenderStatus}
                        onRenderStatusChange={setCurrentRenderStatus}
                        designSystemLabel={
                          canEditDesignSystem
                            ? currentDesignStyle === "custom"
                              ? currentCustomDesignSystemName || designSystemBadgeLabel
                              : designSystemBadgeLabel
                            : undefined
                        }
                        onDesignSystemClick={
                          canEditDesignSystem ? handleOpenDesignSystemDialog : undefined
                        }
                      />
                    </div>
                  ) : (
                    <div
                      className={`flex h-full ${isMobile ? "flex-col" : ""}`}
                    >
                      {/* File Explorer */}
                      <div
                        className={`${isMobile
                            ? "w-full max-h-[200px] border-b"
                            : "w-1/4 min-w-[200px] max-w-[280px] border-r"
                          } border-border`}
                      >
                        <div className="h-full overflow-auto">
                          <FileTree
                            files={fileSystem.state.files}
                            assets={fileSystem.state.assets}
                            selectedFile={fileSystem.state.selectedFile}
                            onFileSelect={fileSystem.selectFile}
                          />
                        </div>
                      </div>

                      {/* Code Editor */}
                      <div className="flex-1 h-full">
                        <CodeEditor
                          fileSystem={fileSystem}
                          prototypeId={prototypeId}
                          onViewingUrlUpdate={setViewingUrl}
                          currentRenderStatus={currentRenderStatus}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog
        open={isDesignSystemDialogOpen}
        onOpenChange={handleDesignSystemDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change design system</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the design system can modify component structures and styling.
              This may require additional clean up in your prototype.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                Design System
              </p>
              <Select
                value={(dialogDesignStyle ?? currentDesignStyle) as DesignStyle}
                onValueChange={(value) => {
                  const nextStyle = value as DesignStyle;
                  setDialogDesignStyle(nextStyle);
                  if (nextStyle === "custom") {
                    if (!dialogCustomDesignSystem && hasCustomDesignSystems) {
                      setDialogCustomDesignSystem(String(designSystems[0].id));
                    }
                  } else {
                    setDialogCustomDesignSystem(null);
                  }
                }}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Choose a design system" />
                </SelectTrigger>
                <SelectContent>
                  {DESIGN_STYLE_OPTIONS.map((style) => (
                    <SelectItem
                      key={style}
                      value={style}
                      disabled={style === "custom" && !hasCustomDesignSystems}
                    >
                      {DESIGN_STYLE_LABELS[style]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dialogDesignStyle === "custom" && !hasCustomDesignSystems && (
                <p className="text-xs text-muted-foreground">
                  Add a custom design system in the dashboard to enable this option.
                </p>
              )}
            </div>
            {dialogDesignStyle === "custom" && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                  Custom Design System
                </p>
                {isLoadingDesignSystems ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                    Loading design systems...
                  </div>
                ) : hasCustomDesignSystems ? (
                  <Select
                    value={dialogCustomDesignSystem ?? undefined}
                    onValueChange={(value) => setDialogCustomDesignSystem(value)}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select a design system" />
                    </SelectTrigger>
                    <SelectContent>
                      {designSystems.map((system) => (
                        <SelectItem key={system.id} value={String(system.id)}>
                          {system.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No custom design systems available.
                  </p>
                )}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingDesignSystem}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDesignSystemChange}
              disabled={dialogConfirmDisabled}
            >
              {isUpdatingDesignSystem ? "Updating..." : "Confirm change"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Prototype</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Visibility Toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <p className="font-medium text-sm">Make Public</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {isPublic
                    ? "Anyone with the link can view"
                    : "Only you can view"}
                </p>
                {userPlan !== "pro" && !isPublic && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Upgrade to Pro to make prototypes private
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
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 peer-disabled:cursor-not-allowed"></div>
              </label>
            </div>

            {/* Share Link */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Share Link</p>
              <div className="flex items-center gap-2">
                <Input
                  value={window.location.href.replace(
                    "dashboard/prototypes",
                    "prototype",
                  )}
                  readOnly
                  className="flex-1 bg-gray-50 dark:bg-gray-800"
                />
                <Button
                  onClick={handleCopyLink}
                  disabled={isCopying}
                  className="flex items-center gap-2"
                >
                  {isCopying ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ClipboardDocumentIcon className="w-4 h-4" />
                  )}
                  {isCopying ? "Copying..." : "Copy"}
                </Button>
              </div>
              {!isPublic && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ Copying the link will automatically make this prototype
                  public
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
    case "Disconnected": // disconnected then we probably want to refresh, poll every 30 seconds
      return 30000;
    default:
      return 60000;
  }
};
