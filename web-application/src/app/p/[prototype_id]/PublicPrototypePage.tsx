"use client";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { supabase } from "@/ClientConstants";
import Loader from "@/components/dashboard/Loader";
import DashboardSidebar from "@/components/dashboard/Sidebar";
import MaterializeRenderSection, {
  type MaterializeRenderSectionRef,
} from "@/components/prototype-editor/MaterializeRenderSection";
import type {
  CanvasStateData,
  PrototypeContextData,
} from "@/components/prototype-editor/canvas/types";
import PublicPrototypeHeader from "@/components/prototype-editor/PublicPrototypeHeader";
import { Button } from "@/components/ui/button";
import type {
  PublicDisplayConfig,
  PublicDisplayConfigScreen,
} from "@/lib/types/prototypes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useUserTeams } from "@/hooks/useUserTeams";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlSuccessResponse,
  StandardErrorResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import {
  Eye,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

// Validate a screen config array
const isValidScreenArray = (
  arr: unknown,
): arr is PublicDisplayConfigScreen[] => {
  if (!Array.isArray(arr)) return false;
  return arr.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "number" &&
      typeof item.path === "string",
  );
};

// Validate the public display config structure
const isValidPublicDisplayConfig = (
  config: unknown,
): config is PublicDisplayConfig => {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;

  // screens is optional, but if present must be valid
  if (c.screens !== undefined && !isValidScreenArray(c.screens)) return false;

  // webScreens is optional, but if present must be valid
  if (c.webScreens !== undefined && !isValidScreenArray(c.webScreens))
    return false;

  // previewMode is optional, but if present must be "mobile" or "web"
  if (
    c.previewMode !== undefined &&
    c.previewMode !== "mobile" &&
    c.previewMode !== "web"
  )
    return false;

  return true;
};

// Interface matching MobileScreenConfig from MaterializeRenderSection
interface MobileScreenConfig {
  id: number;
  path: string;
  isEditing?: boolean;
}

export default function PrototypePage() {
  const params = useParams<{ prototype_id: string }>();
  const prototypeId = params?.prototype_id;
  const logger = useProductLogger();
  const posthog = usePostHog();

  // Check if canvas preview mode is enabled (infinite canvas like Figma)
  const isCanvasPreviewEnabled =
    posthog?.isFeatureEnabled("canvas-preview-mode") ?? false;

  const [prototype, setPrototype] = useState<Prototype | null>(null);
  // Canvas state for infinite canvas mode (from prototype_context)
  const [canvasState, setCanvasState] = useState<CanvasStateData | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] =
    useState<RenderStatus>("Static build");
  const [isPreviewView, setIsPreviewView] = useState(true);

  // Auth and edit permissions
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { teams: userTeams } = useUserTeams();

  // Public display config state - mobile screens
  const [currentScreens, setCurrentScreens] = useState<MobileScreenConfig[]>(
    [],
  );
  // Public display config state - web screens
  const [currentWebScreens, setCurrentWebScreens] = useState<
    MobileScreenConfig[]
  >([]);
  const [savedConfig, setSavedConfig] = useState<PublicDisplayConfig | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  const renderSectionRef = useRef<MaterializeRenderSectionRef>(null);

  // Check if current user can edit the public display config (owner or team member)
  const canEditPublicConfig = useMemo(() => {
    if (!currentUserId || !prototype) return false;
    const isOwner = currentUserId === prototype.owner_id;
    const isMemberOfTeam = userTeams.some(
      (team) => team.id === prototype.team_id,
    );
    return isOwner || isMemberOfTeam;
  }, [currentUserId, prototype, userTeams]);

  // Helper to check if screens have changed
  const screensChanged = useCallback(
    (
      current: MobileScreenConfig[],
      saved: MobileScreenConfig[] | undefined,
    ) => {
      const savedScreens = saved ?? [];
      if (savedScreens.length === 0) {
        if (current.length > 1) return true;
        if (current.length === 1 && current[0].path !== "/") return true;
        return false;
      }
      if (current.length !== savedScreens.length) return true;
      for (let i = 0; i < current.length; i++) {
        if (
          current[i].id !== savedScreens[i].id ||
          current[i].path !== savedScreens[i].path
        ) {
          return true;
        }
      }
      return false;
    },
    [],
  );

  // Check if there are unsaved changes (mobile or web)
  // In canvas mode, changes are auto-saved so we don't show the save button
  const hasUnsavedChanges = useMemo(() => {
    if (!canEditPublicConfig) return false;
    // Canvas mode auto-saves, no manual save needed
    if (isCanvasPreviewEnabled) return false;

    // Check mobile screens
    if (currentScreens.length > 0) {
      if (screensChanged(currentScreens, savedConfig?.screens)) return true;
    }

    // Check web screens
    if (currentWebScreens.length > 0) {
      if (screensChanged(currentWebScreens, savedConfig?.webScreens))
        return true;
    }

    return false;
  }, [
    canEditPublicConfig,
    isCanvasPreviewEnabled,
    currentScreens,
    currentWebScreens,
    savedConfig,
    screensChanged,
  ]);

  // Update document title when prototype name is available
  useEffect(() => {
    if (prototype?.name) {
      document.title = `${prototype.name} | Nucleate`;
    }
    return () => {
      document.title = "Nucleate";
    };
  }, [prototype?.name]);

  // Fetch current user and check authentication
  useEffect(() => {
    async function fetchUserInfo() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? null;
      setCurrentUserId(userId);
      setIsAuthenticated(!!sessionData.session);
    }
    fetchUserInfo();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize saved config from prototype
  useEffect(() => {
    if (!prototype) return;

    // When canvas preview mode is enabled, load from prototype_context.canvas
    if (isCanvasPreviewEnabled && prototype.prototype_context) {
      const context = prototype.prototype_context as PrototypeContextData;
      if (context.canvas) {
        logger.debug(
          "log",
          "[PublicPrototypePage] Loading canvas state from prototype_context:",
          { canvas: context.canvas },
        );
        setCanvasState(context.canvas);
        return;
      }
    }

    // Fall back to public_display_config for legacy mode
    if (prototype.public_display_config) {
      const rawConfig = prototype.public_display_config;

      if (isValidPublicDisplayConfig(rawConfig)) {
        logger.debug(
          "log",
          "[PublicPrototypePage] Loading saved public_display_config:",
          { config: rawConfig },
        );
        setSavedConfig(rawConfig);
      } else {
        logger.debug(
          "warn",
          "[PublicPrototypePage] Invalid public_display_config, resetting to default:",
          { config: rawConfig },
        );
        // Reset to default by not setting savedConfig (will use component defaults)
        setSavedConfig(null);
      }
    } else {
      logger.debug(
        "log",
        "[PublicPrototypePage] No public_display_config found on prototype",
      );
    }
  }, [isCanvasPreviewEnabled, logger, prototype]);

  // Handle screens change from MaterializeRenderSection
  const handleScreensChange = useCallback(
    (screens: MobileScreenConfig[]) => {
      if (canEditPublicConfig) {
        setCurrentScreens(screens);
      }
    },
    [canEditPublicConfig],
  );

  // Handle web screens change from MaterializeRenderSection
  const handleWebScreensChange = useCallback(
    (screens: MobileScreenConfig[]) => {
      if (canEditPublicConfig) {
        setCurrentWebScreens(screens);
      }
    },
    [canEditPublicConfig],
  );

  // Ref for debounced canvas state saves
  const canvasSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle canvas state changes with debounced auto-save (for canvas mode)
  const handleCanvasStateChange = useCallback(
    (state: CanvasStateData) => {
      if (!canEditPublicConfig || !isCanvasPreviewEnabled) return;

      // Update local state immediately
      setCanvasState(state);

      // Clear any existing timeout
      if (canvasSaveTimeoutRef.current) {
        clearTimeout(canvasSaveTimeoutRef.current);
      }

      // Debounce the save to prevent excessive database writes
      canvasSaveTimeoutRef.current = setTimeout(async () => {
        if (!prototypeId) return;

        // Save to prototype_context (same field as internal editor)
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
          logger.debug("log", "Canvas state saved successfully (public view)");
        }
      }, 1000);
    },
    [canEditPublicConfig, isCanvasPreviewEnabled, prototypeId, logger],
  );

  // Cleanup canvas save timeout on unmount
  useEffect(() => {
    return () => {
      if (canvasSaveTimeoutRef.current) {
        clearTimeout(canvasSaveTimeoutRef.current);
      }
    };
  }, []);

  // Save public display config
  const handleSaveConfig = useCallback(async () => {
    if (!prototypeId || !canEditPublicConfig) return;

    setIsSaving(true);
    try {
      const configToSave: PublicDisplayConfig = {
        screens: currentScreens.map((s) => ({ id: s.id, path: s.path })),
        webScreens: currentWebScreens.map((s) => ({ id: s.id, path: s.path })),
        previewMode: savedConfig?.previewMode ?? "mobile",
      };
      logger.debug(
        "log",
        "[PublicPrototypePage] Saving public_display_config:",
        { configToSave },
      );

      const { error: updateError } = await supabase
        .from("prototypes")
        .update({
          public_display_config:
            configToSave as unknown as Database["public"]["Tables"]["prototypes"]["Update"]["public_display_config"],
        })
        .eq("id", prototypeId);

      if (updateError) {
        throw updateError;
      }

      setSavedConfig(configToSave);
      toast.success("Public view configuration saved");
    } catch (err) {
      logger.debug("error", "Failed to save public display config:", {
        error: err instanceof Error ? err.message : String(err),
      });
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  }, [
    prototypeId,
    canEditPublicConfig,
    currentScreens,
    currentWebScreens,
    savedConfig?.previewMode,
    logger,
  ]);

  // Discard unsaved changes
  const handleDiscardChanges = useCallback(() => {
    // Reset mobile screens
    if (!savedConfig?.screens?.length) {
      setCurrentScreens([{ id: 0, path: "/" }]);
    } else {
      setCurrentScreens(
        savedConfig.screens.map((s) => ({ id: s.id, path: s.path })),
      );
    }
    // Reset web screens
    if (!savedConfig?.webScreens?.length) {
      setCurrentWebScreens([{ id: 0, path: "/" }]);
    } else {
      setCurrentWebScreens(
        savedConfig.webScreens.map((s) => ({ id: s.id, path: s.path })),
      );
    }
    toast.info("Changes discarded");
  }, [savedConfig]);

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Get initial screens from saved config
  const initialScreens = useMemo(():
    | PublicDisplayConfigScreen[]
    | undefined => {
    if (savedConfig?.screens?.length) {
      return savedConfig.screens;
    }
    return undefined;
  }, [savedConfig]);

  // Get initial web screens from saved config
  const initialWebScreens = useMemo(():
    | PublicDisplayConfigScreen[]
    | undefined => {
    if (savedConfig?.webScreens?.length) {
      return savedConfig.webScreens;
    }
    return undefined;
  }, [savedConfig]);

  useEffect(() => {
    async function fetchPrototypeData() {
      if (!prototypeId) return;

      try {
        setIsLoading(true);
        setError(null);

        // Fetch prototype data
        const { data: prototypeData, error: prototypeError } = await supabase
          .from("prototypes")
          .select("*")
          .eq("id", prototypeId)
          .single();

        if (prototypeError) {
          throw prototypeError;
        }

        setPrototype(prototypeData);
        setIsLoading(false);

        // Call fetch-viewing-url API to get viewing URL
        try {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;

          const headers: HeadersInit = {
            "Content-Type": "application/json",
          };

          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }

          const fetchViewResponse = await fetch(
            `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/fetch-viewing-url`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                prototype_id: prototypeId,
                current_page: "view",
              } as FetchViewingUrlRequestBody),
            },
          );

          if (fetchViewResponse.ok) {
            const fetchViewData: APIResponse<
              FetchViewingUrlSuccessResponse,
              StandardErrorResponse
            > = await fetchViewResponse.json();
            if (fetchViewData.data) {
              setViewingUrl(fetchViewData.data.viewing_url);
            } else if (fetchViewData.error) {
              logger.debug("error", "Error in fetch-viewing-url response:", {
                ...fetchViewData.error,
              });
            }
          } else {
            logger.debug("error", "Failed to fetch viewing URL:", {
              ...fetchViewResponse,
            });
          }
        } catch (fetchViewError) {
          logger.debug("error", "Error calling fetch-viewing-url API:", {
            message:
              fetchViewError instanceof Error
                ? fetchViewError.message
                : String(fetchViewError),
            stack:
              fetchViewError instanceof Error
                ? fetchViewError.stack
                : undefined,
          });
        }
      } catch (err) {
        logger.debug("error", "Error fetching project data:", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        setError(err instanceof Error ? err.message : "Failed to load project");
      } finally {
        setIsLoading(false);
      }
    }

    fetchPrototypeData();
  }, [prototypeId, logger]);

  const handleUpdatePrototype = (updatedPrototype: Prototype) => {
    setPrototype(updatedPrototype);
  };

  if (isLoading) {
    return (
      <div className="h-screen bg-white dark:bg-background">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-background flex items-center justify-center p-4">
        <Card className="max-w-md mx-auto bg-white dark:bg-card border-gray-200 dark:border-border shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-100 dark:border-red-500/20">
              <Sparkles className="w-8 h-8 text-red-500" />
            </div>
            <CardTitle className="text-2xl font-medium text-gray-900 dark:text-white">
              Couldn&apos;t Load Project
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-muted-foreground mt-2">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-6">
            <Button
              asChild
              className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-white/90 rounded-full px-6"
            >
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!prototype) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-background flex items-center justify-center p-4">
        <Card className="max-w-md mx-auto bg-white dark:bg-card border-gray-200 dark:border-border shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-gray-200 dark:border-border">
              <Eye className="w-8 h-8 text-gray-400 dark:text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl font-medium text-gray-900 dark:text-white">
              Prototype Not Found
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-muted-foreground mt-2">
              The prototype you&apos;re looking for doesn&apos;t exist or you
              don&apos;t have permission to view it.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-6">
            <Button
              asChild
              className="bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-white/90 rounded-full px-6"
            >
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex w-full h-screen bg-white dark:bg-background">
        {isAuthenticated && <DashboardSidebar />}
        <main className="flex flex-1 flex-col h-screen overflow-hidden bg-white dark:bg-background">
          {/* Header with Sidebar Trigger */}
          <div className="flex items-center gap-4 p-4 border-b border-gray-200 dark:border-border bg-gray-50/50 dark:bg-white/[0.02]">
            {isAuthenticated && (
              <SidebarTrigger className="text-gray-500 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-muted" />
            )}
            <div className="flex-1">
              <PublicPrototypeHeader
                prototype={prototype}
                onUpdatePrototype={handleUpdatePrototype}
              />
            </div>
          </div>

          {/* Main Content - ExpoSnackViewer */}
          <div className="flex-1 relative">
            <MaterializeRenderSection
              ref={renderSectionRef}
              viewing_url={viewingUrl ?? ""}
              prototypeId={prototypeId}
              currentRenderStatus={renderStatus}
              onRenderStatusChange={setRenderStatus}
              isPreviewView={isPreviewView}
              onPreviewViewChange={setIsPreviewView}
              publicView={true}
              framework={prototype?.framework ?? undefined}
              initialScreens={initialScreens}
              onScreensChange={
                canEditPublicConfig ? handleScreensChange : undefined
              }
              initialWebScreens={initialWebScreens}
              onWebScreensChange={
                canEditPublicConfig ? handleWebScreensChange : undefined
              }
              initialCanvasState={canvasState ?? undefined}
              onCanvasStateChange={
                canEditPublicConfig ? handleCanvasStateChange : undefined
              }
              showToolbar={false}
              codeView={
                <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-muted-foreground bg-gray-50 dark:bg-background">
                  Code view is unavailable in the public prototype viewer.
                </div>
              }
            />

            {/* Floating Save/Discard Buttons */}
            {hasUnsavedChanges && canEditPublicConfig && (
              <div className="fixed bottom-20 sm:bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleDiscardChanges}
                    variant="outline"
                    className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 shadow-lg px-3 py-2 rounded-lg flex items-center gap-2"
                    aria-label="Discard unsaved changes to public view configuration"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span className="hidden sm:inline">Discard</span>
                  </Button>
                  <Button
                    onClick={handleSaveConfig}
                    disabled={isSaving}
                    className="bg-primary hover:bg-primary/90 text-white shadow-lg px-4 py-2 rounded-lg flex items-center gap-2"
                    aria-label="Save public view configuration so visitors see this layout"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">Save public layout</span>
                    <span className="sm:hidden">Save</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
