"use client";

import { supabase } from "@/ClientConstants";
import { Badge } from "@/components/ui/badge";
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
  RestartDevServerRequestBody,
  RestartDevServerSuccessResponse, StandardErrorResponse,
  StartDevServerRequestBody,
  StartDevServerSuccessResponse
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import JSZip from "jszip";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Download,
  Eye,
  Loader2,
  Monitor,
  MoreVertical,
  Palette,
  QrCode,
  RefreshCw,
  RotateCcw, Share2,
  Smartphone,
  Terminal as TerminalIcon,
  X
} from "lucide-react";
import React, {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Terminal from "./Terminal";

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
      publicView = false,
    },
    ref,
  ) => {
    const logger = useProductLogger();
    const { userPlan, loadingSubscriptionData } = useSubscriptionAccess();
    const [previewMode, setPreviewMode] = useState<PreviewMode>("mobile");
    const [refreshKey, setRefreshKey] = useState(0);
    const [mobileSize, setMobileSize] = useState({ width: 320, height: 640 });
    const [isIframeLoading, setIsIframeLoading] = useState(false);
    const [iframeError, setIframeError] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isRestartingDevServer, setIsRestartingDevServer] = useState(false);
    const [mobileScreens, setMobileScreens] = useState<MobileScreenConfig[]>(
      () =>
        viewing_url ? [{ id: 0, path: extractInitialPath(viewing_url) }] : [],
    );
    const [editingScreenId, setEditingScreenId] = useState<number | null>(null);
    const [tempPath, setTempPath] = useState<string>("");
    const [routeSuggestions, setRouteSuggestions] = useState<
      Array<{ route: string; group?: string; }>
    >([]);

    // Terminal state
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [terminalHeight, setTerminalHeight] = useState(250); // Default height in pixels
    const [isResizingTerminal, setIsResizingTerminal] = useState(false);

    // QR code modal state
    const [isQRModalOpen, setIsQRModalOpen] = useState(false);

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

      const routes: Array<{ route: string; group?: string; }> = [];
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
      if (!prototypeId || !files || !assets) {
        logger.debug(
          "error",
          "Cannot start dev server: missing prototype ID, files, assets, or building state callback",
        );
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

        // Convert files from Record<string, PrototypeFile> to array format expected by API
        const filesArray: PrototypeFile[] = Object.entries(files).map(
          ([path, file]) => ({
            contents: file.contents,
            name: path, // Use the path as the name
            prototype_id: file.prototype_id || prototypeId,
            id: file.id,
            created_at: file.created_at,
            updated_at: file.updated_at,
          }),
        );

        const assetsArray: PrototypeAsset[] = Object.entries(assets).map(
          ([path, asset]) => ({
            ...asset,
            name: path,
          }),
        );

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
        logger.debug("error", "Cannot restart dev server: missing prototype ID");
        return;
      }

      setIsRestartingDevServer(true);
      onRenderStatusChange("Updating..");

      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          logger.debug("error", "No authentication token available");
          return;
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/dev-server/restart`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              prototype_id: prototypeId,
            } as RestartDevServerRequestBody),
          },
        );

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
        onRenderStatusChange("Connected");
      } finally {
        setIsRestartingDevServer(false);
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

      if (userPlan !== "pro") {
        alert(
          "Exporting files is a Pro member feature. Upgrade to Pro to export your project.",
        );
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

        if (assets && Object.keys(assets).length > 0) {
          const assetsFolder = zip.folder("assets");
          if (assetsFolder) {
            await Promise.all(
              Object.values(assets).map(async (asset) => {
                const sanitizedName = asset.name.replace(/^assets\//i, "");

                try {
                  const response = await fetch(asset.storage_url);
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
          ? `materialize-project-${prototypeId}.zip`
          : "materialize-project-export.zip";

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
                "h-10 gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary cursor-default shadow-sm",
              dotClassName: "w-2.5 h-2.5 bg-blue-500 rounded-full",
              dotStyle: { boxShadow: "0 0 8px rgba(59, 130, 246, 0.6)" },
              text: "Static Build",
              animate: false,
            };
          case "Updating..":
          case "Connecting..":
          case "Starting Dev Server..":
            return {
              className:
                "h-10 gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary cursor-default shadow-sm",
              dotClassName:
                "w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse",
              dotStyle: { boxShadow: "0 0 8px rgba(245, 158, 11, 0.6)" },
              text: status,
              animate: true,
            };
          case "Disconnected":
            return {
              className:
                "h-10 gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary cursor-default shadow-sm",
              dotClassName: "w-2.5 h-2.5 bg-red-500 rounded-full",
              dotStyle: { boxShadow: "0 0 8px rgba(239, 68, 68, 0.6)" },
              text: "Disconnected",
              animate: false,
            };
          case "Connected":
            return {
              className:
                "h-10 gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary cursor-default shadow-sm",
              dotClassName: "w-2.5 h-2.5 bg-green-500 rounded-full",
              dotStyle: { boxShadow: "0 0 8px rgba(34, 197, 94, 0.6)" },
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
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ${config.className}`}
        >
          <div className={config.dotClassName} style={config.dotStyle}></div>
          {config.text}
          {isStaticBuild && prototypeId && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartDevServer();
                    }}
                    className="ml-1 p-1 hover:bg-primary/10 rounded transition-colors"
                    aria-label="Start Dev Server"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
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
                      handleRestartDevServer();
                    }}
                    className="ml-1 p-1 hover:bg-primary/10 rounded transition-colors"
                    aria-label="Restart Dev Server"
                    disabled={isRestartingDevServer}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRestartingDevServer ? "animate-spin" : ""}`} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Restart Dev Server</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    };

    // Connection loading overlay for iframe
    const ConnectionLoadingOverlay = ({ mode }: { mode: PreviewMode; }) => (
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
        <div className="text-center bg-card p-6 rounded-lg border border-border shadow-lg">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-primary" />
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
    const ConnectionErrorOverlay = ({ mode }: { mode: PreviewMode; }) => (
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
        <div className="text-center bg-card p-6 rounded-lg border border-border shadow-lg">
          <div className="w-6 h-6 mx-auto mb-3 text-destructive">⚠️</div>
          <p className="text-foreground font-medium mb-1">Connection Failed</p>
          <p className="text-muted-foreground text-sm mb-3">
            Unable to load {mode === "mobile" ? "mobile" : "web"} preview
          </p>
          <Button
            size="sm"
            onClick={() => {
              setIframeError(false);
              setIsIframeLoading(true);
              setRefreshKey((prev) => prev + 1);
            }}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </div>
      </div>
    );

    const renderPreviewContent = (): ReactNode => {
      if (!viewing_url) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-card p-8 rounded-lg border border-border">
              <p className="text-foreground text-lg font-medium">
                No preview URL provided
              </p>
            </div>
          </div>
        );
      }

      if (previewMode === "mobile") {
        return (
          <div className="w-full h-full overflow-auto">
            <div className="min-h-full flex items-center justify-center">
              <div className="flex flex-wrap justify-center gap-x-8 gap-y-12 py-4 pt-4 relative">
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
                        {mobileScreens.length > 1 && (
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-20">
                            {editingScreenId === screen.id ? (
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1 bg-background/95 backdrop-blur-sm border border-border px-2 py-1 rounded-md shadow-lg">
                                  <Input
                                    value={tempPath}
                                    onChange={(e) =>
                                      handlePathInputChange(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                      handlePathKeyDown(screen.id, e)
                                    }
                                    className="h-6 w-32 text-xs text-center border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary px-1"
                                    placeholder="/"
                                    autoFocus
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 hover:bg-green-500/10"
                                    onClick={() =>
                                      handleConfirmPathChange(screen.id)
                                    }
                                    aria-label="Confirm path change"
                                  >
                                    <Check className="w-3 h-3 text-green-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 hover:bg-destructive/10"
                                    onClick={handleCancelEdit}
                                    aria-label="Cancel edit"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                                {routeSuggestions.length > 0 && (
                                  <div className="bg-background/95 backdrop-blur-sm border border-border rounded-md shadow-lg overflow-hidden">
                                    {routeSuggestions.map((item) => (
                                      <button
                                        key={item.route}
                                        onClick={() =>
                                          handleSuggestionClick(
                                            screen.id,
                                            item.route,
                                          )
                                        }
                                        className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                                      >
                                        <span>{item.route}</span>
                                        {item.group && (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] px-1.5 py-0 h-4 opacity-50 border-muted-foreground/30"
                                          >
                                            {item.group}
                                          </Badge>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Badge
                                  className="cursor-pointer hover:bg-primary/90 transition-colors"
                                  onClick={() =>
                                    handleBadgeClick(screen.id, screen.path)
                                  }
                                >
                                  {screen.path || "/"}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 hover:bg-destructive/10"
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
                        <div
                          className="relative bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900 shadow-2xl"
                          style={{
                            width: mobileSize.width + 16,
                            height: mobileSize.height + 16,
                            borderRadius: "2.5rem",
                            border: "1px solid #1f2937",
                            boxShadow:
                              "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                          }}
                        >
                          <div
                            className="absolute bg-black rounded-full"
                            style={{
                              width: mobileSize.width * 0.4,
                              height: "24px",
                              top: "6px",
                              left: "50%",
                              transform: "translateX(-50%)",
                              borderRadius: "12px",
                            }}
                          ></div>

                          <div className="absolute -left-[3px] top-[80px] w-[2px] h-[32px] bg-gray-600 rounded-l-lg"></div>
                          <div className="absolute -left-[3px] top-[120px] w-[2px] h-[32px] bg-gray-600 rounded-l-lg"></div>
                          <div className="absolute -left-[3px] top-[160px] w-[2px] h-[48px] bg-gray-600 rounded-l-lg"></div>

                          <div className="absolute -right-[3px] top-[140px] w-[2px] h-[48px] bg-gray-600 rounded-r-lg"></div>

                          <div
                            className="absolute bg-black overflow-hidden"
                            style={{
                              width: mobileSize.width,
                              height: mobileSize.height,
                              top: "8px",
                              left: "8px",
                              borderRadius: "2.2rem",
                              boxShadow:
                                "inset 0 0 0 1px rgba(255, 255, 255, 0.1)",
                            }}
                          >
                            <div className="relative w-full h-full">
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

                          <div
                            className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize opacity-60 hover:opacity-100 transition-opacity"
                            onMouseDown={handleMouseDown}
                          >
                            <div className="w-full h-full bg-gray-400 rounded-sm flex items-center justify-center">
                              <svg
                                width="8"
                                height="8"
                                viewBox="0 0 8 8"
                                fill="currentColor"
                              >
                                <path d="M8 0v2L6 0h2zM8 4v2L6 4h2zM8 8v0L6 6h2zM4 8v0L2 6h2z" />
                              </svg>
                            </div>
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
        <div className="w-full h-full max-w-6xl mx-auto">
          <div className="bg-card rounded-lg border border-border overflow-hidden h-full">
            <div className="bg-muted px-6 py-4 border-b border-border flex items-center space-x-3">
              <div className="flex space-x-2">
                <div className="w-3 h-3 bg-destructive rounded-full"></div>
                <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <span className="text-sm text-foreground font-medium ml-3">
                Web Preview
              </span>
            </div>
            <div className="relative w-full h-full min-h-[500px]">
              <iframe
                key={`web-${refreshKey}`}
                ref={(c) => {
                  webPreviewRef.current = c?.contentWindow ?? null;
                }}
                className="w-full h-full"
                title="React Native Web Preview"
                src={viewing_url}
                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-presentation"
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
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm px-3 py-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {!publicView && (
                <>
                  <TooltipProvider delayDuration={200}>
                    <div className="flex items-center bg-muted rounded-lg p-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isPreviewView ? "ghost" : "ghost"}
                            size="sm"
                            onClick={() => onPreviewViewChange(true)}
                            className={`flex items-center gap-2 ${isPreviewView ? "bg-background shadow-sm hover:bg-background/80" : ""}`}
                          >
                            <Eye className="w-4 h-4" />
                            {isPreviewView && !isMobileLayout && "Preview"}
                          </Button>
                        </TooltipTrigger>
                        {!isPreviewView && (
                          <TooltipContent>Preview</TooltipContent>
                        )}
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={!isPreviewView ? "ghost" : "ghost"}
                            size="sm"
                            onClick={() => onPreviewViewChange(false)}
                            className={`flex items-center gap-2 ${!isPreviewView ? "bg-background shadow-sm hover:bg-background/80" : ""}`}
                          >
                            <Code2 className="w-4 h-4" />
                            {!isPreviewView && !isMobileLayout && "Code"}
                          </Button>
                        </TooltipTrigger>
                        {isPreviewView && <TooltipContent>Code</TooltipContent>}
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                  <ConnectionStatusIndicator />
                  {currentRenderStatus === "Starting Dev Server.." && (
                    <div className="flex items-center gap-2 bg-background/60 backdrop-blur-sm px-3 py-1.5 rounded-md border border-border/50">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground whitespace-nowrap">
                        This can take about 1 minute
                      </span>
                    </div>
                  )}
                  {mobileHint && isMobileLayout && (
                    <span className="text-xs text-muted-foreground">
                      {mobileHint}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {!publicView && !isPreviewView && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex-shrink-0"
                  title="Export project files"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span className="ml-1.5 hidden md:inline">Export</span>
                </Button>
              )}
              {!publicView && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsQRModalOpen(true)}
                  className="flex-shrink-0"
                  title="View on Device"
                  disabled={!viewing_url}
                >
                  <QrCode className="w-4 h-4" />
                  <span className="ml-1.5 hidden md:inline">
                    View on Device
                  </span>
                </Button>
              )}
              {!publicView && (
                <Button
                  variant={isTerminalOpen ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                  className="flex-shrink-0"
                  title="Toggle Terminal"
                >
                  <TerminalIcon className="w-4 h-4" />
                  <span className="ml-1.5 hidden md:inline">Terminal</span>
                </Button>
              )}
              {designSystemLabel && onDesignSystemClick && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onDesignSystemClick}
                  className="hidden sm:flex items-center gap-2"
                >
                  <Palette className="w-4 h-4" />
                  {/* <Badge variant="outline" className="border-0 px-0">
                    {designSystemLabel}
                  </Badge> */}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-shrink-0"
                    title="Actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => handleModeChange("mobile")}
                    className={previewMode === "mobile" ? "bg-accent" : ""}
                  >
                    <Smartphone className="w-4 h-4 mr-2" />
                    Mobile View
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleModeChange("web")}
                    className={previewMode === "web" ? "bg-accent" : ""}
                  >
                    <Monitor className="w-4 h-4 mr-2" />
                    Web View
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {onShare && (
                    <DropdownMenuItem onClick={onShare}>
                      <Share2 className="w-4 h-4 mr-2" />
                      Share
                    </DropdownMenuItem>
                  )}
                  {onClone && (
                    <DropdownMenuItem
                      onClick={onClone}
                      disabled={isCloningPrototype}
                    >
                      {isCloningPrototype ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Copy className="w-4 h-4 mr-2" />
                      )}
                      {isCloningPrototype ? "Cloning..." : "Clone"}
                    </DropdownMenuItem>
                  )}
                  {(onShare || onClone) && <DropdownMenuSeparator />}
                  {designSystemLabel && onDesignSystemClick && (
                    <>
                      <DropdownMenuItem
                        onClick={onDesignSystemClick}
                        className="sm:hidden"
                      >
                        <Palette className="w-4 h-4 mr-2" />
                        {/* <Badge variant="outline" className="border-0 px-0">
                          {designSystemLabel}
                        </Badge> */}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="sm:hidden" />
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={handleRefresh}
                    disabled={!viewing_url}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Preview
                  </DropdownMenuItem>
                  {onResetToDefault && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={onResetToDefault}
                        className="text-destructive focus:text-destructive"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset to Default
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div
          className={`relative flex items-center justify-center bg-background ${isPreviewView ? "p-8" : "p-0"}`}
          style={{
            height: isTerminalOpen
              ? `calc(100% - ${terminalHeight}px)`
              : "100%",
            transition: isResizingTerminal ? "none" : "height 0.2s ease-in-out",
          }}
        >
          {isPreviewView ? (
            renderPreviewContent()
          ) : (
            <div className="h-full w-full overflow-hidden">{codeView}</div>
          )}
        </div>

        {/* Terminal Panel */}
        {!publicView && isTerminalOpen && (
          <div
            className="relative border-t border-border bg-background"
            style={{ height: `${terminalHeight}px` }}
          >
            {/* Terminal Header with Resize Handle */}
            <div
              className="absolute top-0 left-0 right-0 h-8 bg-muted border-b border-border flex items-center justify-between px-4 cursor-ns-resize hover:bg-muted/80 transition-colors group"
              onMouseDown={handleTerminalResizeStart}
            >
              <div className="flex items-center gap-2">
                <TerminalIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Terminal
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  Drag to resize
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setIsTerminalOpen(false)}
                >
                  {isTerminalOpen ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronUp className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Terminal Content */}
            <div className="absolute top-8 left-0 right-0 bottom-0 p-2">
              <Terminal className="w-full h-full" baseTunnelUrl={base_tunnel_url} />
            </div>
          </div>
        )}

        {/* QR Code Modal */}
        <Dialog open={isQRModalOpen} onOpenChange={setIsQRModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>View on Device</DialogTitle>
              <DialogDescription>
                {currentRenderStatus === "Connected"
                  ? "Scan this QR code with your phone's camera to open the app in Expo Go"
                  : "URL for viewing"}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center gap-4 py-4">
              {viewing_url && currentRenderStatus === "Connected" ? (
                <>
                  <div className="bg-white p-6 rounded-lg">
                    <QRCodeSVG
                      value={getExpoGoDeepLink()}
                      size={256}
                      level="H"
                    />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Make sure you have Expo Go installed on your device
                    </p>
                    <p className="text-xs font-mono bg-muted px-3 py-2 rounded break-all">
                      {getExpoGoDeepLink()}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center space-y-2 w-full">
                  <p className="text-sm text-muted-foreground">
                    Your viewing URL:
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono bg-muted px-3 py-2 rounded break-all flex-1">
                      {viewing_url}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(viewing_url);
                        toast.success("URL copied to clipboard!");
                      }}
                      title="Copy URL"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
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
