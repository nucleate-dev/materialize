"use client";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { supabase } from "@/ClientConstants";
import Loader from "@/components/dashboard/Loader";
import DashboardSidebar from "@/components/dashboard/Sidebar";
import type {
  CanvasStateData,
  PrototypeContextData,
} from "@/components/prototype-editor/canvas/types";
import MaterializeRenderSection, {
  type MaterializeRenderSectionRef,
} from "@/components/prototype-editor/NucleateRenderSection";
import PublicPrototypeHeader from "@/components/prototype-editor/PublicPrototypeHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  PublicDisplayConfig,
  PublicDisplayConfigScreen,
} from "@/lib/types/prototypes";
import type {
  APIResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlSuccessResponse,
  StandardErrorResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import {
  Eye,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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

export default function PrototypePage() {
  const params = useParams<{ prototype_id: string; }>();
  const prototypeId = params?.prototype_id;
  const logger = useProductLogger();

  const [prototype, setPrototype] = useState<Prototype | null>(null);
  // Canvas state for infinite canvas mode (from prototype_context)
  const [canvasState, setCanvasState] = useState<CanvasStateData | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderStatus, setRenderStatus] =
    useState<RenderStatus>("Static build");
  const [isPreviewView, setIsPreviewView] = useState(true);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Legacy public display config fallback (for prototypes not yet opened in editor)
  const [savedConfig, setSavedConfig] = useState<PublicDisplayConfig | null>(
    null,
  );

  const renderSectionRef = useRef<MaterializeRenderSectionRef>(null);

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
      setIsAuthenticated(!!sessionData.session);
    }
    fetchUserInfo();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize screen config from prototype_context.canvas (single source of truth)
  // Falls back to public_display_config for legacy prototypes not yet opened in editor
  useEffect(() => {
    if (!prototype) return;

    // Always try prototype_context.canvas first (single source of truth)
    if (prototype.prototype_context) {
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

    // Fall back to public_display_config for legacy prototypes
    if (prototype.public_display_config) {
      const rawConfig = prototype.public_display_config;

      if (isValidPublicDisplayConfig(rawConfig)) {
        logger.debug(
          "log",
          "[PublicPrototypePage] Loading from legacy public_display_config:",
          { config: rawConfig },
        );
        setSavedConfig(rawConfig);
      } else {
        logger.debug(
          "warn",
          "[PublicPrototypePage] Invalid public_display_config, resetting to default:",
          { config: rawConfig },
        );
        setSavedConfig(null);
      }
    } else {
      logger.debug(
        "log",
        "[PublicPrototypePage] No screen config found on prototype",
      );
    }
  }, [logger, prototype]);

  // Get initial screens - prefer prototype_context.canvas, fall back to legacy public_display_config
  const initialScreens = useMemo(():
    | PublicDisplayConfigScreen[]
    | undefined => {
    if (canvasState?.mobileScreens?.length) {
      return canvasState.mobileScreens;
    }
    if (savedConfig?.screens?.length) {
      return savedConfig.screens;
    }
    return undefined;
  }, [canvasState, savedConfig]);

  // Get initial web screens - prefer prototype_context.canvas, fall back to legacy public_display_config
  const initialWebScreens = useMemo(():
    | PublicDisplayConfigScreen[]
    | undefined => {
    if (canvasState?.webScreens?.length) {
      return canvasState.webScreens;
    }
    if (savedConfig?.webScreens?.length) {
      return savedConfig.webScreens;
    }
    return undefined;
  }, [canvasState, savedConfig]);

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
      {isAuthenticated && <DashboardSidebar />}
      <SidebarInset className="flex flex-col h-screen min-w-0 overflow-hidden bg-white dark:bg-background">
          {/* Header */}
          <div className="flex items-center gap-4 p-4 border-b border-gray-200 dark:border-border bg-gray-50/50 dark:bg-white/[0.02]">
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
              initialWebScreens={initialWebScreens}
              initialCanvasState={canvasState ?? undefined}
              showToolbar={false}
              codeView={
                <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-muted-foreground bg-gray-50 dark:bg-background">
                  Code view is unavailable in the public prototype viewer.
                </div>
              }
            />

          </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
