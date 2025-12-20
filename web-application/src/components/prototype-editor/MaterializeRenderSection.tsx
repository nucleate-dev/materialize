"use client";

import { supabase } from "@/ClientConstants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import type {
  APIResponse,
  RestartDevServerSuccessResponse,
  StandardErrorResponse,
  StartDevServerRequestBody,
  StartDevServerSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { getBulkAssetSignedUrls } from "@/lib/utils/assetUtils";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import JSZip from "jszip";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { IsUserPlanSubscribed } from "@/lib/utils/payments/SubscriptionManagementUtils";
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Hammer,
  KeyRound,
  Loader2,
  Monitor,
  MoreVertical,
  Palette,
  QrCode,
  RefreshCw,
  Rocket,
  RotateCcw,
  Share2,
  Smartphone,
  Terminal as TerminalIcon,
  X,
  Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import React, {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// Dynamically import Terminal to avoid SSR issues with xterm
const Terminal = dynamic(() => import("./Terminal"), { ssr: false });

// Import the Environment Variables Modal
import { EnvironmentVariablesModal } from "./EnvironmentVariablesModal";

interface MobileScreenConfig {
  id: number;
  path: string;
  isEditing?: boolean; // Track if the badge is in edit mode
}

const normalizePath = (value: string) => {
  if (!value) {
    return "/";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "/";
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      return normalized || "/";
    } catch {
      return "/";
    }
  }

  if (trimmed.startsWith("?") || trimmed.startsWith("#")) {
    return trimmed;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const extractInitialPath = (url: string) => {
  try {
    const parsed = new URL(url);
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return normalized || "/";
  } catch {
    return "/";
  }
};

const resolveIframeSrc = (baseUrl: string, path: string) => {
  if (!baseUrl) {
    return "";
  }

  try {
    return new URL(path, baseUrl).toString();
  } catch {
    try {
      return new URL(baseUrl).toString();
    } catch {
      return baseUrl;
    }
  }
};

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];
type PrototypeAsset = Database["public"]["Tables"]["prototype_assets"]["Row"];

interface MaterializeRenderSectionProps {
  viewing_url: string; // ASSUMPTION: viewing_url is always normalized with protocol (e.g., https://)
  base_tunnel_url?: string | null; // WebSocket URL for terminal connection
  sandbox_url?: string | null; // Normalized HTTPS URL for sandbox API calls
  onResetToDefault?: () => void;
  // Props for dev server functionality
  prototypeId?: string;
  files?: Record<string, PrototypeFile>;
  assets?: Record<string, PrototypeAsset>;
  onViewingUrlUpdate?: (url: string) => void;
  // New render status props
  currentRenderStatus?: RenderStatus;
  onRenderStatusChange: (status: RenderStatus) => void;
  // Design system props
  designSystemLabel?: string;
  onDesignSystemClick?: () => void;
  // Current viewing path callback
  onCurrentPathChange?: (path: string) => void;
  // View switching props
  isPreviewView: boolean;
  onPreviewViewChange: (isPreview: boolean) => void;
  codeView: ReactNode;
  mobileHint?: string;
  isMobileLayout?: boolean;
  // Share and clone actions
  onShare?: () => void;
  onClone?: () => void;
  isCloningPrototype?: boolean;
  // Public view mode - hides preview/code switch, status badge, and terminal
  publicView?: boolean;
  // Deployment
  onDeploy?: () => void;
  deploymentUrl?: string | null;
  isDeploying?: boolean;
  deployedView?: boolean;
  // Framework type to determine default preview mode
  framework?: string;
}

export interface MaterializeRenderSectionRef {
  forceRefresh: () => void;
}

type PreviewMode = "web" | "mobile";

const MaterializeRenderSection = forwardRef<
  MaterializeRenderSectionRef,
  MaterializeRenderSectionProps
>(
  (
    {
      viewing_url,
      base_tunnel_url,
      sandbox_url,
      onResetToDefault,
      prototypeId,
      files,
      assets,
      onViewingUrlUpdate,
      currentRenderStatus = "Static build",
      onRenderStatusChange,
      designSystemLabel,
      onDesignSystemClick,
      onCurrentPathChange,
      isPreviewView,
      onPreviewViewChange,
      codeView,
      mobileHint,
      isMobileLayout,
      onShare,
      onClone,
      isCloningPrototype = false,
      onDeploy,
      deploymentUrl,
      isDeploying = false,
      deployedView = false,
      publicView = false,
      framework,
    },
    ref,
  ) => {
    const logger = useProductLogger();
    const { userPlan, loadingSubscriptionData } = useSubscriptionAccess();

    // Determine if this is a web-only framework
    const isWebFramework = framework === "web_nextjs_react";

    const [previewMode, setPreviewMode] = useState<PreviewMode>(
      isWebFramework ? "web" : "mobile",
    );
    const [refreshKey, setRefreshKey] = useState(0);

    // Update preview mode when framework changes to web
    useEffect(() => {
      if (isWebFramework && previewMode === "mobile") {
        setPreviewMode("web");
      }
    }, [isWebFramework, previewMode]);
    const [mobileSize, setMobileSize] = useState({ width: 320, height: 640 });
    const [isIframeLoading, setIsIframeLoading] = useState(false);
    const [iframeError, setIframeError] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isRestartingDevServer, setIsRestartingDevServer] = useState(false);
    const [isBuilding, setIsBuilding] = useState(false);
    const [buildError, setBuildError] = useState<string | null>(null);
    const [mobileScreens, setMobileScreens] = useState<MobileScreenConfig[]>(
      () =>
        viewing_url ? [{ id: 0, path: extractInitialPath(viewing_url) }] : [],
    );
    const [editingScreenId, setEditingScreenId] = useState<number | null>(null);
    const [tempPath, setTempPath] = useState<string>("");
    const [routeSuggestions, setRouteSuggestions] = useState<
      Array<{ route: string; group?: string }>
    >([]);
    const isReadOnlyView = publicView || deployedView;

    // Terminal state
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [terminalHeight, setTerminalHeight] = useState(250); // Default height in pixels
    const [isResizingTerminal, setIsResizingTerminal] = useState(false);

    // QR code modal state
    const [isQRModalOpen, setIsQRModalOpen] = useState(false);
    const [isEnvVarDialogOpen, setIsEnvVarDialogOpen] = useState(false);

    const nextMobileScreenId = useRef(1);

    // Ref for the iframe's contentWindow
    const webPreviewRef = useRef<Window | null>(null);

    // Generate Expo Go deep link from viewing URL
    const getExpoGoDeepLink = useCallback(() => {
      if (!viewing_url) return "";

      try {
        // Extract the URL without protocol
        const url = new URL(viewing_url);
        const hostWithPath = `${url.host}${url.pathname}${url.search}`;

        // Format as Expo Go deep link
        // exp://NGROK_URL format for Expo Go
        return `exp://${hostWithPath}`;
      } catch {
        return "";
      }
    }, [viewing_url]);

    // Track iframe refs for each mobile screen to monitor navigation
    const iframeRefs = useRef<Map<number, HTMLIFrameElement>>(new Map());

    useEffect(() => {
      if (!viewing_url) {
        setMobileScreens([]);
        nextMobileScreenId.current = 1;
        return;
      }

      const initialPath = extractInitialPath(viewing_url);
      setMobileScreens([{ id: 0, path: initialPath }]);
      nextMobileScreenId.current = 1;

      // Notify parent of initial path
      if (onCurrentPathChange) {
        onCurrentPathChange(initialPath);
      }
    }, [viewing_url, onCurrentPathChange]);

    // Monitor iframe navigation to sync the path display
    useEffect(() => {
      const checkIframeNavigation = () => {
        iframeRefs.current.forEach((iframe, screenId) => {
          try {
            // Try to access the iframe's current location
            const iframeWindow = iframe.contentWindow;
            if (!iframeWindow) return;

            const iframeUrl = iframeWindow.location.href;
            // Ignore about:blank URLs (used during refresh operations)
            if (iframeUrl && viewing_url && !iframeUrl.startsWith("about:")) {
              const currentPath = extractInitialPath(iframeUrl);

              // Update the screen's path if it has changed (but not if currently editing)
              setMobileScreens((prev) =>
                prev.map((screen) => {
                  if (
                    screen.id === screenId &&
                    screen.path !== currentPath &&
                    editingScreenId !== screenId
                  ) {
                    // Notify parent if this is the primary screen (id: 0)
                    if (screenId === 0 && onCurrentPathChange) {
                      onCurrentPathChange(currentPath);
                    }
                    return { ...screen, path: currentPath };
                  }
                  return screen;
                }),
              );
            }
          } catch {
            // Cross-origin restrictions will throw errors, which is expected
            // We can't track navigation for cross-origin iframes
            // For same-origin but client-side routed apps, this will still work
          }
        });
      };

      // Check periodically for navigation changes
      const interval = setInterval(checkIframeNavigation, 200);
      return () => clearInterval(interval);
    }, [viewing_url, editingScreenId, onCurrentPathChange]);

    // Listen for messages from iframe for client-side navigation tracking
    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        // Validate message origin matches viewing_url origin
        try {
          const viewingOrigin = new URL(viewing_url).origin;
          if (event.origin !== viewingOrigin) return;
        } catch {
          return;
        }

        // Check if this is a navigation message
        if (event.data?.type === "navigation" && event.data?.path) {
          const newPath = event.data.path;

          // Find which screen this iframe belongs to by matching the source
          iframeRefs.current.forEach((iframe, screenId) => {
            if (iframe.contentWindow === event.source) {
              setMobileScreens((prev) =>
                prev.map((screen) => {
                  if (
                    screen.id === screenId &&
                    screen.path !== newPath &&
                    editingScreenId !== screenId
                  ) {
                    // Notify parent if this is the primary screen (id: 0)
                    if (screenId === 0 && onCurrentPathChange) {
                      onCurrentPathChange(newPath);
                    }
                    return { ...screen, path: newPath };
                  }
                  return screen;
                }),
              );
            }
          });
        }
      };

      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, [viewing_url, editingScreenId, onCurrentPathChange]);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _handleAddMobileScreen = () => {
      if (!viewing_url) return;

      setMobileScreens((prev) => [
        ...prev,
        { id: nextMobileScreenId.current++, path: "/" },
      ]);
      setIsIframeLoading(true);
      setIframeError(false);
    };

    const handleRemoveMobileScreen = (id: number) => {
      setMobileScreens((prev) => {
        if (prev.length <= 1) {
          return prev;
        }

        return prev.filter((screen) => screen.id !== id);
      });
    };

    // Extract available routes from files
    const availableRoutes = React.useMemo(() => {
      if (!files) return [];

      const routes: Array<{ route: string; group?: string }> = [];
      Object.keys(files).forEach((filePath) => {
        // Look for files in app/ directory that could be routes
        if (filePath.startsWith("app/")) {
          // Extract route from file path
          // app/about/page.tsx -> /about
          // app/(tabs)/index.tsx -> / with group "tabs"
          // app/(tabs)/profile.tsx -> /profile with group "tabs"
          // app/(tabs)/settings/index.tsx -> /settings with group "tabs"
          const pathWithoutApp = filePath.replace(/^app\//, "");

          // Extract route group if present (e.g., "(tabs)" -> "tabs")
          const routeGroupMatch = pathWithoutApp.match(/^\(([^)]+)\)\//);
          const routeGroup = routeGroupMatch ? routeGroupMatch[1] : undefined;

          // Handle page.tsx files
          if (pathWithoutApp.includes("/page.")) {
            const pathBeforePage = pathWithoutApp.split("/page.")[0];
            // Remove route groups like (tabs), (auth), etc.
            const cleanPath = pathBeforePage.replace(/\(.*?\)\//g, "");
            const route = cleanPath ? "/" + cleanPath : "/";
            routes.push({ route, group: routeGroup });
          }
          // Handle index files
          else if (pathWithoutApp.includes("/index.")) {
            const pathBeforeIndex = pathWithoutApp.split("/index.")[0];
            // Remove route groups like (tabs), (auth), etc.
            const cleanPath = pathBeforeIndex.replace(/\(.*?\)\//g, "");
            const route = cleanPath ? "/" + cleanPath : "/";
            routes.push({ route, group: routeGroup });
          }
          // Handle direct route files (e.g., app/profile.tsx, app/(tabs)/settings.tsx)
          else if (pathWithoutApp.match(/\.(tsx?|jsx?)$/)) {
            const pathBeforeExt = pathWithoutApp.split(".")[0];
            // Remove route groups
            const cleanPath = pathBeforeExt.replace(/\(.*?\)\//g, "");
            // Get the filename
            const parts = cleanPath.split("/");
            const routeName = parts[parts.length - 1];

            if (
              routeName &&
              routeName !== "page" &&
              routeName !== "layout" &&
              routeName !== "_layout"
            ) {
              // If there are parent directories, use the full path
              const route = cleanPath.includes("/")
                ? "/" + cleanPath
                : "/" + routeName;
              routes.push({ route, group: routeGroup });
            }
          }
        }
      });

      // Remove duplicates (based on route path), filter out +html routes, and sort
      const uniqueRoutes = Array.from(
        new Map(routes.map((item) => [item.route, item])).values(),
      )
        .filter((item) => !item.route.includes("+html"))
        .sort((a, b) => a.route.localeCompare(b.route));

      return uniqueRoutes;
    }, [files]);

    const handleBadgeClick = (id: number, currentPath: string) => {
      setEditingScreenId(id);
      setTempPath(currentPath);
      // Filter suggestions based on current path
      updateRouteSuggestions(currentPath);
    };

    const updateRouteSuggestions = (input: string) => {
      if (!input || input === "/") {
        setRouteSuggestions(availableRoutes.slice(0, 5));
      } else {
        const filtered = availableRoutes.filter((item) =>
          item.route.toLowerCase().includes(input.toLowerCase()),
        );
        setRouteSuggestions(filtered.slice(0, 5));
      }
    };

    const handlePathInputChange = (value: string) => {
      setTempPath(value);
      updateRouteSuggestions(value);
    };

    const handleConfirmPathChange = (id: number) => {
      const normalized = normalizePath(tempPath);
      setMobileScreens((prev) =>
        prev.map((screen) => {
          if (screen.id === id && normalized !== screen.path) {
            setIsIframeLoading(true);
            setIframeError(false);
            return { ...screen, path: normalized };
          }
          return screen;
        }),
      );
      setEditingScreenId(null);
      setTempPath("");
      setRouteSuggestions([]);
    };

    const handleCancelEdit = () => {
      setEditingScreenId(null);
      setTempPath("");
      setRouteSuggestions([]);
    };

    const handlePathKeyDown = (id: number, e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleConfirmPathChange(id);
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    };

    const handleSuggestionClick = (id: number, route: string) => {
      setTempPath(route);
      handleConfirmPathChange(id);
    };

    // Force refresh method
    const forceRefresh = useCallback(() => {
      if (viewing_url) {
        // Start loading state for refresh
        setIsIframeLoading(true);
        setIframeError(false);

        // Method 1: Try iframe refresh
        const iframe = document.querySelector(
          'iframe[title="React Native Preview"], iframe[title="React Native Web Preview"]',
        ) as HTMLIFrameElement;
        if (iframe) {
          const currentSrc = iframe.src;
          iframe.src = "about:blank";
          setTimeout(() => {
            iframe.src = currentSrc;
          }, 100);
        }

        // Method 2: Update refresh key to force React re-render
        setRefreshKey((prev) => prev + 1);
      }
    }, [viewing_url]);

    // Expose forceRefresh method to parent
    useImperativeHandle(
      ref,
      () => ({
        forceRefresh,
      }),
      [forceRefresh],
    );


    // Function to start dev server with all files
    const handleStartDevServer = async () => {
      if (!prototypeId) {
        logger.debug("error", "Cannot start dev server: missing prototype ID");
        return;
      }

      onRenderStatusChange("Starting Dev Server..");

      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          logger.debug("error", "No authentication token available");
          return;
        }

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

        const result: APIResponse<
          StartDevServerSuccessResponse,
          StandardErrorResponse
        > = await response.json();

        if (response.ok && result.data) {
          // Update viewing URL if provided
          if (result.data.viewing_url && onViewingUrlUpdate) {
            onViewingUrlUpdate(result.data.viewing_url);
          }

          // Force refresh the preview to load the new dev server
          forceRefresh();
        } else {
          logger.debug("error", "Failed to start dev server:", {
            error: result.error?.message,
          });
        }
      } catch (error) {
        logger.debug("error", "Error starting dev server:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    };

    const handleRestartDevServer = async () => {
      if (!prototypeId) {
        logger.debug(
          "error",
          "Cannot restart dev server: missing prototype ID",
        );
        return;
      }

      if (!sandbox_url) {
        logger.debug("error", "Cannot restart dev server: missing sandbox URL");
        return;
      }

      setIsRestartingDevServer(true);
      onRenderStatusChange("Starting Dev Server..");

      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          logger.debug("error", "No authentication token available");
          return;
        }

        const response = await fetch(`${sandbox_url}/dev-server/restart-v2`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });

        const result: APIResponse<
          RestartDevServerSuccessResponse,
          StandardErrorResponse
        > = await response.json();
        if (response.ok && result.data) {
          // Force refresh the preview to reload
          forceRefresh();
        } else {
          logger.debug("error", "Failed to restart dev server:", {
            error: result.error?.message,
          });
          onRenderStatusChange("Connected");
        }
      } catch (error) {
        logger.debug("error", "Error restarting dev server:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        onRenderStatusChange("Disconnected");
      } finally {
        setIsRestartingDevServer(false);
      }
    };

    const handleBuildAndDeploy = async () => {
      if (!sandbox_url || !prototypeId) {
        logger.debug(
          "error",
          "Cannot build: missing sandbox URL or prototype ID",
        );
        return;
      }

      try {
        // Get authentication token
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          logger.debug("error", "No authentication token available");
          toast.error("Authentication required to build");
          return;
        }

        // Clear any previous error
        setBuildError(null);
        setIsBuilding(true);

        toast.info("Build started! This may take 3-5 minutes...");

        // Await the build request
        const response = await fetch(
          `${sandbox_url}/dev-server/build-and-deploy`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const result: APIResponse<{ message: string }, StandardErrorResponse> =
          await response.json().catch(() => ({ data: null, error: null }));

        setIsBuilding(false);

        if (!response.ok || result.error) {
          const errorMessage =
            result.error?.message ?? "Build and deploy failed";
          setBuildError(errorMessage);
          toast.error(`Build failed: ${errorMessage}`);
          logger.debug("error", "Build and deploy failed", {
            error: errorMessage,
          });
        } else {
          setBuildError(null);
          toast.success("Build and deploy completed successfully!");
          logger.debug(undefined, "Build and deploy completed", {
            message: result.data?.message,
          });
        }
      } catch (error) {
        setIsBuilding(false);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setBuildError(errorMessage);
        logger.debug("error", "Error in handleBuildAndDeploy:", {
          error: errorMessage,
        });
        toast.error(`Failed to build: ${errorMessage}`);
      }
    };

    const handleRefresh = () => {
      if (webPreviewRef.current && viewing_url) {
        setIsIframeLoading(true);
        setIframeError(false);
        webPreviewRef.current.location = viewing_url;
      }
    };

    const handleExport = useCallback(async () => {
      if (loadingSubscriptionData) {
        alert(
          "We're still loading your subscription status. Please try again in a moment.",
        );
        return;
      }

      if (!IsUserPlanSubscribed(userPlan)) {
        alert("Upgrade plan to export your project.");
        return;
      }

      if (!files || Object.keys(files).length === 0) {
        alert("No files available to export.");
        return;
      }

      setIsExporting(true);

      try {
        const zip = new JSZip();

        Object.values(files).forEach((file) => {
          zip.file(file.name, file.contents ?? "");
        });

        if (assets && Object.keys(assets).length > 0 && prototypeId) {
          const assetsFolder = zip.folder("assets");
          if (assetsFolder) {
            // Generate signed URLs on-demand for all assets
            const assetNames = Object.keys(assets);
            const signedUrls = await getBulkAssetSignedUrls(
              prototypeId,
              assetNames,
            );

            await Promise.all(
              Object.values(assets).map(async (asset) => {
                const sanitizedName = asset.name.replace(/^assets\//i, "");

                try {
                  const storageUrl = signedUrls[asset.name];
                  if (!storageUrl) {
                    throw new Error(`No storage URL for asset: ${asset.name}`);
                  }

                  const response = await fetch(storageUrl);
                  if (!response.ok) {
                    throw new Error(`Failed to fetch asset: ${asset.name}`);
                  }

                  const blob = await response.blob();
                  assetsFolder.file(sanitizedName, blob);
                } catch (error) {
                  logger.debug("error", "Failed to include asset in export", {
                    asset: asset.name,
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                }
              }),
            );
          }
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const downloadUrl = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");
        const exportName = prototypeId
          ? `nucleate-project-${prototypeId}.zip`
          : "nucleate-project-export.zip";

        link.href = downloadUrl;
        link.download = exportName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      } catch (error) {
        logger.debug("error", "Failed to export files", {
          error: error instanceof Error ? error.message : String(error),
        });
        alert("Failed to export files. Please try again.");
      } finally {
        setIsExporting(false);
      }
    }, [assets, files, loadingSubscriptionData, logger, prototypeId, userPlan]);

    const handleModeChange = (mode: PreviewMode) => {
      setPreviewMode(mode);
      // Trigger loading state when switching preview modes
      if (viewing_url) {
        setIsIframeLoading(false);
        setIframeError(false);
      }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = mobileSize.width;
      const startHeight = mobileSize.height;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        const newWidth = Math.max(250, Math.min(500, startWidth + deltaX));
        const newHeight = Math.max(400, Math.min(800, startHeight + deltaY));

        setMobileSize({ width: newWidth, height: newHeight });
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "se-resize";
      document.body.style.userSelect = "none";
    };

    // Terminal resize handler
    const handleTerminalResizeStart = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizingTerminal(true);

      const startY = e.clientY;
      const startHeight = terminalHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = startY - moveEvent.clientY; // Inverted because terminal grows upward
        // Allow terminal to grow up to 90% of viewport height
        const maxHeight = window.innerHeight * 0.9;
        const newHeight = Math.max(
          150,
          Math.min(maxHeight, startHeight + deltaY),
        );
        setTerminalHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizingTerminal(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    };

    // Handle iframe loading events
    const handleIframeLoad = useCallback(() => {
      setIsIframeLoading(false);
      setIframeError(false);
      // Update status based on whether it's a dev server or static build
      const isDevServer =
        viewing_url.includes("localhost") ||
        viewing_url.includes("127.0.0.1") ||
        viewing_url.includes(".ngrok.") ||
        viewing_url.includes("tunnel");
      if (isDevServer) onRenderStatusChange("Connected");
    }, [viewing_url, onRenderStatusChange]);

    const handleIframeError = useCallback(() => {
      setIsIframeLoading(false);
      setIframeError(true);
      onRenderStatusChange("Disconnected");
    }, [onRenderStatusChange]);

    // Start loading when viewing_url changes
    useEffect(() => {
      setIsIframeLoading(true);
      setIframeError(false);
      const isDevServer =
        viewing_url.includes("localhost") ||
        viewing_url.includes("127.0.0.1") ||
        viewing_url.includes(".ngrok.") ||
        viewing_url.includes("tunnel");
      if (isDevServer) {
        onRenderStatusChange("Connecting..");
      }
    }, [viewing_url, onRenderStatusChange]);

    // Connection status indicator component using shadcn Badge
    const ConnectionStatusIndicator = () => {
      const getBadgeConfig = (status: RenderStatus) => {
        switch (status) {
          case "Static build":
            return {
              className:
                "bg-accent border border-border text-muted-foreground hover:bg-accent/80 hover:text-foreground transition-colors",
              dotClassName:
                "w-2 h-2 bg-blue-500/50 border border-blue-500 rounded-full",
              text: "Static Build",
              animate: false,
            };
          case "Updating..":
          case "Connecting..":
          case "Starting Dev Server..":
            return {
              className: "bg-accent border border-border text-muted-foreground",
              dotClassName:
                "w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]",
              text: status,
              animate: true,
            };
          case "Disconnected":
            return {
              className: "bg-red-500/10 border border-red-500/20 text-red-400",
              dotClassName:
                "w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)]",
              text: "Disconnected",
              animate: false,
            };
          case "Connected":
            return {
              className:
                "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400",
              dotClassName:
                "w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]",
              text: "Connected",
              animate: false,
            };
        }
      };

      const config = getBadgeConfig(currentRenderStatus);
      const isStaticBuild = currentRenderStatus === "Static build";
      const isConnected = currentRenderStatus === "Connected";

      return (
        <div
          className={cn(
            "inline-flex items-center h-7 px-3 rounded-md text-xs font-medium select-none",
            config?.className,
          )}
        >
          <div className={cn("mr-2", config?.dotClassName)}></div>
          {config?.text}
          {isStaticBuild && prototypeId && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartDevServer();
                    }}
                    className="ml-2 p-1 hover:bg-accent rounded-md transition-colors group"
                    aria-label="Start Dev Server"
                  >
                    <Zap className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Start Dev Server</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isConnected && prototypeId && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRefresh();
                    }}
                    className="ml-2 p-1 hover:bg-accent rounded-md transition-colors group"
                    aria-label="Refresh Preview"
                  >
                    <RefreshCw className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refresh Preview</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    };

    // Connection loading overlay for iframe
    const ConnectionLoadingOverlay = ({ mode }: { mode: PreviewMode }) => (
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
        <div className="text-center bg-accent p-6 rounded-xl border border-border shadow-2xl">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground" />
          <p className="text-foreground font-medium mb-1">
            Connecting to Preview
          </p>
          <p className="text-muted-foreground text-sm">
            {mode === "mobile"
              ? "Loading mobile preview..."
              : "Loading web preview..."}
          </p>
        </div>
      </div>
    );

    // Error overlay for iframe
    const ConnectionErrorOverlay = ({ mode }: { mode: PreviewMode }) => (
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
        <div className="text-center bg-accent p-6 rounded-xl border border-red-500/20 shadow-2xl">
          <div className="w-8 h-8 mx-auto mb-3 text-red-400 bg-red-400/10 rounded-full flex items-center justify-center">
            <X className="w-4 h-4" />
          </div>
          <p className="text-foreground font-medium mb-1">Connection Failed</p>
          <p className="text-muted-foreground text-sm mb-4">
            Unable to load {mode === "mobile" ? "mobile" : "web"} preview
          </p>
          <Button
            size="sm"
            onClick={() => {
              setIframeError(false);
              setIsIframeLoading(true);
              setRefreshKey((prev) => prev + 1);
            }}
            className="bg-white text-black hover:bg-white/90 h-8 px-4 text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-2" />
            Retry Connection
          </Button>
        </div>
      </div>
    );

    const renderPreviewContent = (): ReactNode => {
      if (!viewing_url) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-accent p-8 rounded-xl border border-border">
              <div className="w-12 h-12 bg-accent/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Monitor className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-foreground text-sm font-medium">
                No preview URL provided
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                The server has not returned a viewing URL yet.
              </p>
            </div>
          </div>
        );
      }

      if (previewMode === "mobile") {
        return (
          <div className="w-full h-full overflow-auto bg-background">
            <div className="min-h-full flex items-center justify-center">
              <div className="flex flex-wrap justify-center gap-x-8 gap-y-12 py-8 relative">
                {mobileScreens.map((screen, index) => {
                  const iframeSrc = resolveIframeSrc(viewing_url, screen.path);
                  const isPrimaryScreen = index === 0;

                  return (
                    <div
                      key={`mobile-screen-${screen.id}`}
                      className="flex flex-col items-center gap-2 pt-2"
                    >
                      <div
                        className="relative mx-auto select-none"
                        style={{
                          width: mobileSize.width + 16,
                          height: mobileSize.height + 16,
                        }}
                      >
                        {/* URL Bar / Controls */}
                        {mobileScreens.length > 1 && (
                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20">
                            {editingScreenId === screen.id ? (
                              <div className="flex flex-col items-center gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                <div className="flex items-center gap-1 bg-accent border border-border px-1.5 py-1 rounded-lg shadow-xl">
                                  <Input
                                    value={tempPath}
                                    onChange={(e) =>
                                      handlePathInputChange(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                      handlePathKeyDown(screen.id, e)
                                    }
                                    className="h-7 w-40 text-xs text-center border-0 bg-transparent focus-visible:ring-0 text-foreground px-1"
                                    placeholder="/"
                                    autoFocus
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 hover:bg-emerald-500/20 hover:text-emerald-400 text-emerald-500/70"
                                    onClick={() =>
                                      handleConfirmPathChange(screen.id)
                                    }
                                    aria-label="Confirm path change"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 hover:bg-red-500/20 hover:text-red-400 text-red-500/70"
                                    onClick={handleCancelEdit}
                                    aria-label="Cancel edit"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                                {routeSuggestions.length > 0 && (
                                  <div className="bg-accent border border-border rounded-lg shadow-xl overflow-hidden w-full max-h-32 overflow-y-auto">
                                    {routeSuggestions.map((item) => (
                                      <button
                                        key={item.route}
                                        onClick={() =>
                                          handleSuggestionClick(
                                            screen.id,
                                            item.route,
                                          )
                                        }
                                        className="flex items-center justify-between w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                                      >
                                        <span>{item.route}</span>
                                        {item.group && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/50 text-muted-foreground border border-border">
                                            {item.group}
                                          </span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="px-3 py-1.5 bg-accent border border-border rounded-full text-xs font-mono text-muted-foreground hover:text-foreground hover:border-border/80 cursor-pointer transition-all shadow-sm"
                                  onClick={() =>
                                    handleBadgeClick(screen.id, screen.path)
                                  }
                                >
                                  {screen.path || "/"}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 bg-accent border border-border rounded-full hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 text-muted-foreground"
                                  onClick={() =>
                                    handleRemoveMobileScreen(screen.id)
                                  }
                                  aria-label="Remove screen"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Phone Frame */}
                        <div
                          className="relative bg-[#0B0C0E] shadow-2xl"
                          style={{
                            width: mobileSize.width + 16,
                            height: mobileSize.height + 16,
                            borderRadius: "2.5rem",
                            border: "1px solid rgba(255,255,255,0.1)",
                            boxShadow:
                              "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0,0,0,0.5)",
                          }}
                        >
                          {/* Dynamic Island / Notch area */}
                          <div
                            className="absolute bg-black z-20"
                            style={{
                              width: "35%",
                              height: "24px",
                              top: "8px",
                              left: "50%",
                              transform: "translateX(-50%)",
                              borderRadius: "12px",
                            }}
                          ></div>

                          {/* Buttons */}
                          <div className="absolute -left-[2px] top-[80px] w-[2px] h-[24px] bg-[#333] rounded-l-md"></div>
                          <div className="absolute -left-[2px] top-[120px] w-[2px] h-[40px] bg-[#333] rounded-l-md"></div>
                          <div className="absolute -left-[2px] top-[170px] w-[2px] h-[40px] bg-[#333] rounded-l-md"></div>
                          <div className="absolute -right-[2px] top-[140px] w-[2px] h-[60px] bg-[#333] rounded-r-md"></div>

                          {/* Screen Content */}
                          <div
                            className="absolute bg-white overflow-hidden"
                            style={{
                              width: mobileSize.width,
                              height: mobileSize.height,
                              top: "8px",
                              left: "8px",
                              borderRadius: "2rem",
                            }}
                          >
                            <div className="relative w-full h-full bg-white">
                              <iframe
                                key={`mobile-${screen.id}-${refreshKey}`}
                                ref={(c) => {
                                  if (c) {
                                    iframeRefs.current.set(screen.id, c);
                                    if (isPrimaryScreen) {
                                      webPreviewRef.current =
                                        c.contentWindow ?? null;
                                    }
                                  } else {
                                    iframeRefs.current.delete(screen.id);
                                  }
                                }}
                                className="w-full h-full"
                                title="React Native Preview"
                                aria-label={`React Native Preview ${screen.path}`}
                                src={iframeSrc}
                                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-presentation"
                                allow="microphone; camera;"
                                onLoad={handleIframeLoad}
                                onError={handleIframeError}
                              />
                              {isIframeLoading && (
                                <ConnectionLoadingOverlay mode="mobile" />
                              )}
                              {iframeError && (
                                <ConnectionErrorOverlay mode="mobile" />
                              )}
                            </div>
                          </div>

                          {/* Resize Handle */}
                          <div
                            className="absolute bottom-4 right-4 w-6 h-6 cursor-se-resize opacity-0 hover:opacity-100 transition-opacity z-30"
                            onMouseDown={handleMouseDown}
                          >
                            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white/40 rounded-br"></div>
                            <div className="absolute bottom-1 right-1 w-2 h-2 border-b-2 border-r-2 border-white/20 rounded-br"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="w-full h-full px-4 pb-4 bg-background">
          <div className="bg-accent rounded-xl border border-border overflow-hidden h-full shadow-sm flex flex-col">
            {/* Browser Header */}
            <div className="bg-accent border-b border-border px-4 py-2.5 flex items-center gap-4">
              <div className="flex space-x-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
              </div>
              <div className="flex-1 flex justify-center">
                <div className="h-6 px-4 rounded-md bg-background border border-border flex items-center justify-center min-w-[200px] max-w-[400px]">
                  <span className="text-[10px] text-muted-foreground font-mono truncate opacity-60">
                    {viewing_url}
                  </span>
                </div>
              </div>
              <div className="w-10"></div> {/* Spacer for balance */}
            </div>

            <div className="relative w-full h-full flex-1 bg-white">
              <iframe
                key={`web-${refreshKey}`}
                ref={(c) => {
                  webPreviewRef.current = c?.contentWindow ?? null;
                }}
                className="w-full h-full"
                title="React Native Web Preview"
                src={viewing_url}
                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-presentation"
                allow="microphone; camera;"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
              {isIframeLoading && <ConnectionLoadingOverlay mode="web" />}
              {iframeError && <ConnectionErrorOverlay mode="web" />}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-full bg-background">
        {/* Compact Responsive Toolbar */}
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl px-4 py-3 border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: View Toggles */}
            <div className="flex items-center gap-3 flex-wrap">
              {!isReadOnlyView && (
                <>
                  <div className="bg-accent p-1 rounded-lg border border-border flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onPreviewViewChange(true)}
                      className={cn(
                        "h-7 px-3 text-xs font-medium rounded-md transition-all",
                        isPreviewView
                          ? "bg-white text-black shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent",
                      )}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      Preview
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onPreviewViewChange(false)}
                      className={cn(
                        "h-7 px-3 text-xs font-medium rounded-md transition-all",
                        !isPreviewView
                          ? "bg-white text-black shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent",
                      )}
                    >
                      <Code2 className="w-3.5 h-3.5 mr-1.5" />
                      Code
                    </Button>
                  </div>

                  <div className="h-4 w-px bg-border mx-1" />

                  <ConnectionStatusIndicator />

                  {currentRenderStatus === "Starting Dev Server.." && (
                    <div className="flex items-center gap-2 bg-amber-500/10 px-3 py-1.5 rounded-md border border-amber-500/20">
                      <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                      <span className="text-xs font-medium text-amber-500 whitespace-nowrap">
                        Booting up (~1m)
                      </span>
                    </div>
                  )}
                  {mobileHint && isMobileLayout && (
                    <span className="text-xs text-muted-foreground animate-pulse">
                      {mobileHint}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {!isReadOnlyView && !isPreviewView && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExport}
                  disabled={isExporting}
                  className="hidden sm:flex h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                  title="Export project files"
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span className="ml-2 hidden md:inline text-xs font-medium">
                    Export
                  </span>
                </Button>
              )}
              {!isReadOnlyView &&
                (isWebFramework ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (viewing_url) {
                        window.open(viewing_url, "_blank", "noopener,noreferrer");
                      }
                    }}
                    className="hidden sm:flex h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                    title="Open in new tab"
                    disabled={!viewing_url}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="ml-2 hidden md:inline text-xs font-medium">
                      Browser
                    </span>
                  </Button>
                ) : null)}
              {!isReadOnlyView && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                  className={cn(
                    "hidden sm:flex h-8 border transition-all",
                    isTerminalOpen
                      ? "bg-white text-black border-transparent hover:bg-white/90"
                      : "bg-accent border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80",
                  )}
                  title="Toggle Terminal"
                >
                  <TerminalIcon className="w-3.5 h-3.5" />
                </Button>
              )}
              {!isReadOnlyView && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEnvVarDialogOpen(true)}
                  className="hidden sm:flex h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                  title="Manage environment variables"
                  disabled={!prototypeId}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                </Button>
              )}
              {onShare && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onShare}
                  className="hidden sm:flex h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                  title="Share"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </Button>
              )}
              {onDeploy && !isReadOnlyView && (
                <Button
                  size="sm"
                  onClick={onDeploy}
                  disabled={isDeploying}
                  className={cn(
                    "h-8 px-3 text-xs font-semibold text-white shadow-sm",
                    deploymentUrl
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-indigo-600 hover:bg-indigo-700",
                  )}
                >
                  {isDeploying ? (
                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  ) : (
                    <Rocket className="w-3.5 h-3.5 mr-2" />
                  )}
                  {deploymentUrl ? "Manage deploy" : "Deploy app"}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                    title="Actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 bg-accent border-border text-foreground"
                >
                  <DropdownMenuItem
                    onClick={() => handleModeChange("mobile")}
                    className={cn(
                      "focus:bg-accent/80 focus:text-foreground text-sm cursor-pointer",
                      previewMode === "mobile"
                        ? "bg-accent/50 text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Smartphone className="w-4 h-4 mr-2 opacity-70" />
                    Mobile View
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleModeChange("web")}
                    className={cn(
                      "focus:bg-accent/80 focus:text-foreground text-sm cursor-pointer",
                      previewMode === "web"
                        ? "bg-accent/50 text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <Monitor className="w-4 h-4 mr-2 opacity-70" />
                    Web View
                  </DropdownMenuItem>
                  {!isReadOnlyView && !isPreviewView && (
                    <>
                      <DropdownMenuSeparator className="bg-border sm:hidden" />
                      <DropdownMenuItem
                        onClick={handleExport}
                        disabled={isExporting}
                        className="sm:hidden focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        {isExporting ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2 opacity-70" />
                        )}
                        {isExporting ? "Exporting..." : "Export"}
                      </DropdownMenuItem>
                    </>
                  )}
                  {!isReadOnlyView && isWebFramework && (
                    <DropdownMenuItem
                      onClick={() => {
                        if (viewing_url) {
                          window.open(
                            viewing_url,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }
                      }}
                      disabled={!viewing_url}
                      className="sm:hidden focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4 mr-2 opacity-70" />
                      Browser
                    </DropdownMenuItem>
                  )}
                  {designSystemLabel && onDesignSystemClick && (
                    <>
                      <DropdownMenuSeparator className="bg-border" />
                      <DropdownMenuItem
                        onClick={onDesignSystemClick}
                        className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        <Palette className="w-4 h-4 mr-2 opacity-70" />
                        Change design system
                      </DropdownMenuItem>
                    </>
                  )}
                  {!isReadOnlyView && (
                    <>
                      <DropdownMenuSeparator className="bg-border" />
                      <DropdownMenuItem
                        onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                        className="sm:hidden focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        <TerminalIcon className="w-4 h-4 mr-2 opacity-70" />
                        {isTerminalOpen ? "Hide Terminal" : "Show Terminal"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setIsEnvVarDialogOpen(true)}
                        disabled={!prototypeId}
                        className="sm:hidden focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        <KeyRound className="w-4 h-4 mr-2 opacity-70" />
                        Environment variables
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleRestartDevServer}
                        disabled={!prototypeId || isRestartingDevServer}
                        className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        {isRestartingDevServer ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-2 opacity-70" />
                        )}
                        {isRestartingDevServer
                          ? "Restarting..."
                          : "Restart Dev Server"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleBuildAndDeploy}
                        disabled={!sandbox_url || !prototypeId || isBuilding}
                        className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        {isBuilding ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Hammer className="w-4 h-4 mr-2 opacity-70" />
                        )}
                        {isBuilding ? "Building..." : "Build & Deploy"}
                      </DropdownMenuItem>
                    </>
                  )}
                  {onShare && (
                    <DropdownMenuItem
                      onClick={onShare}
                      className="sm:hidden focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                    >
                      <Share2 className="w-4 h-4 mr-2 opacity-70" />
                      Share
                    </DropdownMenuItem>
                  )}
                  {onClone && (
                    <>
                      <DropdownMenuSeparator className="bg-border" />
                      <DropdownMenuItem
                        onClick={onClone}
                        disabled={isCloningPrototype}
                        className="focus:bg-accent/80 focus:text-foreground text-muted-foreground text-sm cursor-pointer"
                      >
                        {isCloningPrototype ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Copy className="w-4 h-4 mr-2 opacity-70" />
                        )}
                        {isCloningPrototype ? "Cloning..." : "Clone"}
                      </DropdownMenuItem>
                    </>
                  )}
                  {onResetToDefault && (
                    <>
                      <DropdownMenuSeparator className="bg-border" />
                      <DropdownMenuItem
                        onClick={onResetToDefault}
                        className="text-red-400 focus:text-red-300 focus:bg-red-500/10 text-sm cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4 mr-2 opacity-70" />
                        Reset to Default
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Preview Area */}
        <div
          className={cn(
            "relative flex items-center justify-center bg-background transition-all duration-300",
          )}
          style={{
            height: isTerminalOpen
              ? `calc(100% - ${terminalHeight}px)`
              : "100%",
            transition: isResizingTerminal ? "none" : "height 0.2s ease-in-out",
          }}
        >
          {!isReadOnlyView && !isWebFramework && isPreviewView && (
            <div className="absolute top-3 left-3 z-20">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsQRModalOpen(true)}
                className="h-8 bg-accent border border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-accent/80 transition-all"
                title="View on Device"
                disabled={!viewing_url}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span className="ml-2 hidden md:inline text-xs font-medium">
                  Device
                </span>
              </Button>
            </div>
          )}
          {isPreviewView ? (
            renderPreviewContent()
          ) : (
            <div className="h-full w-full overflow-hidden bg-accent">
              {codeView}
            </div>
          )}
        </div>

        {/* Terminal Panel */}
        {!isReadOnlyView && isTerminalOpen && (
          <div
            className="relative border-t border-border bg-background"
            style={{ height: `${terminalHeight}px` }}
          >
            {/* Terminal Header with Resize Handle */}
            <div
              className="absolute top-0 left-0 right-0 h-9 bg-accent border-b border-border flex items-center justify-between px-4 cursor-ns-resize hover:bg-accent/80 transition-colors group z-10"
              onMouseDown={handleTerminalResizeStart}
            >
              <div className="flex items-center gap-2">
                <TerminalIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  Terminal Output
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Drag to resize
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
                  onClick={() => setIsTerminalOpen(false)}
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Terminal Content */}
            <div className="absolute top-9 left-0 right-0 bottom-0 bg-background">
              <Terminal
                className="w-full h-full"
                baseTunnelUrl={base_tunnel_url}
              />
            </div>
          </div>
        )}

        {/* Environment Variables Modal */}
        <EnvironmentVariablesModal
          isOpen={isEnvVarDialogOpen}
          onOpenChange={setIsEnvVarDialogOpen}
          prototypeId={prototypeId}
          sandbox_url={sandbox_url}
          framework={framework}
        />

        {/* QR Code Modal */}
        <Dialog open={isQRModalOpen} onOpenChange={setIsQRModalOpen}>
          <DialogContent className="sm:max-w-md bg-accent border-border text-foreground">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                View on Device
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {currentRenderStatus === "Connected"
                  ? "Scan this QR code with your phone's camera to open in Expo Go"
                  : "Public viewing URL"}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center gap-6 py-6">
              {viewing_url && currentRenderStatus === "Connected" ? (
                <>
                  <div className="bg-white p-4 rounded-xl shadow-lg">
                    <QRCodeSVG
                      value={getExpoGoDeepLink()}
                      size={200}
                      level="H"
                    />
                  </div>
                  <div className="text-center space-y-2 w-full px-4">
                    <p className="text-xs text-muted-foreground">
                      Requires Expo Go installed on your device
                    </p>
                    <div className="flex items-center gap-2 bg-background p-2 rounded-lg border border-border">
                      <p className="text-xs font-mono text-foreground/70 break-all flex-1 text-left line-clamp-1">
                        {getExpoGoDeepLink()}
                      </p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 hover:bg-accent"
                        onClick={() => {
                          navigator.clipboard.writeText(getExpoGoDeepLink());
                          toast.success("Deep link copied");
                        }}
                      >
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center space-y-4 w-full">
                  <div className="w-12 h-12 bg-accent/50 rounded-full flex items-center justify-center mx-auto">
                    <Monitor className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="w-full">
                    <p className="text-sm text-muted-foreground mb-2">
                      Viewing URL
                    </p>
                    <div className="flex items-center gap-2 bg-background p-1 rounded-lg border border-border">
                      <div className="px-3 py-1.5 text-xs font-mono text-foreground/80 truncate flex-1">
                        {viewing_url}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(viewing_url);
                          toast.success("URL copied to clipboard!");
                        }}
                        className="h-7 px-3 hover:bg-accent text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
);

MaterializeRenderSection.displayName = "MaterializeRenderSection";

export default MaterializeRenderSection;
