"use client";

import { supabase } from "@/ClientConstants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  APIResponse,
  RestartDevServerRequestBody,
  RestartDevServerSuccessResponse,
  RunCommandRequestBody,
  RunCommandSuccessResponse,
  StandardErrorResponse,
  StartDevServerRequestBody,
  StartDevServerSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";

import { RenderStatus } from "@/app/dashboard/prototypes/[prototype_id]/InternalPrototypePage";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import {
  Check,
  Loader2,
  Monitor,
  Plus,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  Smartphone,
  X,
} from "lucide-react";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

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
      onResetToDefault,
      prototypeId,
      files,
      assets,
      onViewingUrlUpdate,
      currentRenderStatus = "Static build",
      onRenderStatusChange,
      designSystemLabel,
      onDesignSystemClick,
    },
    ref,
  ) => {
    const logger = useProductLogger();
    const [previewMode, setPreviewMode] = useState<PreviewMode>("mobile");
    const [refreshKey, setRefreshKey] = useState(0);
    const [mobileSize, setMobileSize] = useState({ width: 320, height: 640 });
    const [isIframeLoading, setIsIframeLoading] = useState(false);
    const [iframeError, setIframeError] = useState(false);
    const [isRestartingDevServer, setIsRestartingDevServer] = useState(false);
    const [isRunningLint, setIsRunningLint] = useState(false);
    const [mobileScreens, setMobileScreens] = useState<MobileScreenConfig[]>(() =>
      viewing_url ? [{ id: 0, path: extractInitialPath(viewing_url) }] : [],
    );
    const [editingScreenId, setEditingScreenId] = useState<number | null>(null);
    const [tempPath, setTempPath] = useState<string>("");
    const [routeSuggestions, setRouteSuggestions] = useState<string[]>([]);

    const nextMobileScreenId = useRef(1);

    // Ref for the iframe's contentWindow
    const webPreviewRef = useRef<Window | null>(null);

    // Track iframe refs for each mobile screen to monitor navigation
    const iframeRefs = useRef<Map<number, HTMLIFrameElement>>(new Map());

    useEffect(() => {
      if (!viewing_url) {
        setMobileScreens([]);
        nextMobileScreenId.current = 1;
        return;
      }

      setMobileScreens([{ id: 0, path: extractInitialPath(viewing_url) }]);
      nextMobileScreenId.current = 1;
    }, [viewing_url]);

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
                  if (screen.id === screenId && screen.path !== currentPath && editingScreenId !== screenId) {
                    return { ...screen, path: currentPath };
                  }
                  return screen;
                }),
              );
            }
          } catch (e) {
            // Cross-origin restrictions will throw errors, which is expected
            // We can't track navigation for cross-origin iframes
            // For same-origin but client-side routed apps, this will still work
          }
        });
      };

      // Check periodically for navigation changes
      const interval = setInterval(checkIframeNavigation, 200);
      return () => clearInterval(interval);
    }, [viewing_url, editingScreenId]);

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
                  if (screen.id === screenId && screen.path !== newPath && editingScreenId !== screenId) {
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
    }, [viewing_url, editingScreenId]);

    const handleAddMobileScreen = () => {
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

      const routes: string[] = [];
      Object.keys(files).forEach((filePath) => {
        // Look for files in app/ directory that could be routes
        if (filePath.startsWith("app/")) {
          // Extract route from file path
          // app/about/page.tsx -> /about
          // app/(tabs)/index.tsx -> /
          // app/(tabs)/profile.tsx -> /profile
          const pathWithoutApp = filePath.replace(/^app\//, "");

          // Handle page.tsx files
          if (pathWithoutApp.includes("/page.")) {
            const route = "/" + pathWithoutApp.split("/page.")[0].replace(/\(.*?\)\//g, "");
            routes.push(route === "/" ? "/" : route);
          }
          // Handle index files
          else if (pathWithoutApp.includes("/index.")) {
            const route = "/" + pathWithoutApp.split("/index.")[0].replace(/\(.*?\)\//g, "");
            routes.push(route === "/" ? "/" : route);
          }
          // Handle direct route files (e.g., app/profile.tsx)
          else if (!pathWithoutApp.includes("/") && pathWithoutApp.match(/\.(tsx?|jsx?)$/)) {
            const routeName = pathWithoutApp.split(".")[0];
            if (routeName !== "page" && routeName !== "layout" && routeName !== "_layout") {
              routes.push("/" + routeName);
            }
          }
        }
      });

      return Array.from(new Set(routes)).sort();
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
        const filtered = availableRoutes.filter((route) =>
          route.toLowerCase().includes(input.toLowerCase())
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

    const handleRefresh = () => {
      if (webPreviewRef.current && viewing_url) {
        setIsIframeLoading(true);
        setIframeError(false);
        webPreviewRef.current.location = viewing_url;
      }
    };

    // Function to restart dev server (simple API call with prototype_id)
    const handleRestartDevServer = async () => {
      if (!prototypeId) return;
      setIsRestartingDevServer(true);
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;

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

        // TODO(Sourish): Handle Badge Status
        // onRenderStatusChange("Restarting..");
        // If restart fails -> Static Build OR /dispatch to start new dev server
        // If restart succeeds -> Connected

        const result: APIResponse<
          RestartDevServerSuccessResponse,
          StandardErrorResponse
        > = await response.json();

        if (response.ok && result.data) {
          logger.debug("log", "Dev server restarted successfully", {
            message: result.data.message,
          });
        } else {
          logger.debug("error", "Failed to restart dev server", {
            error: result.error?.message,
          });
        }

        // Force a refresh regardless to reconnect iframe to server
        forceRefresh();
      } finally {
        setIsRestartingDevServer(false);
      }
    };

    const handleRunLint = async () => {
      if (!prototypeId) return;
      setIsRunningLint(true);
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) {
          return;
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/dev-server/run-command`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              prototype_id: prototypeId,
              command: "npm",
              args: ["run", "lint"],
            } as RunCommandRequestBody),
          },
        );

        const result: APIResponse<
          RunCommandSuccessResponse,
          StandardErrorResponse
        > = await response.json();

        if (response.ok && result.data) {
          // TODO: Display lint results in a better way
          if (result.data.exit_code === 0) {
            alert("Lint passed successfully!");
          } else {
            alert(
              `Lint failed with exit code ${result.data.exit_code}\n\nCheck console for details.`,
            );
          }
        } else {
          logger.debug("error", "Failed to run lint command", {
            error: result.error?.message,
          });
          alert("Failed to run lint command");
        }
      } catch (error) {
        logger.debug("error", "Error running lint command", {
          error: error instanceof Error ? error.message : String(error),
        });
        alert("Error running lint command");
      } finally {
        setIsRunningLint(false);
      }
    };

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
                "gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-full hover:bg-blue-50 dark:hover:bg-blue-950",
              dotClassName: "w-2 h-2 bg-blue-500 rounded-full",
              text: "Static Build",
              animate: false,
            };
          case "Updating..":
          case "Connecting..":
          case "Starting Dev Server..":
            return {
              className:
                "gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-full hover:bg-amber-50 dark:hover:bg-amber-950",
              dotClassName: "w-2 h-2 bg-amber-500 rounded-full animate-pulse",
              text: status,
              animate: true,
            };
          case "Disconnected":
            return {
              className:
                "gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-full hover:bg-red-50 dark:hover:bg-red-950",
              dotClassName: "w-2 h-2 bg-red-500 rounded-full",
              text: "Disconnected",
              animate: false,
            };
          case "Connected":
            return {
              className:
                "gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-full hover:bg-green-50 dark:hover:bg-green-950",
              dotClassName: "w-2 h-2 bg-green-500 rounded-full",
              text: "Connected",
              animate: false,
            };
        }
      };

      const config = getBadgeConfig(currentRenderStatus);

      return (
        <Badge variant="outline" className={config.className}>
          <div className={config.dotClassName}></div>
          {config.text}
        </Badge>
      );
    };

    // Connection loading overlay for iframe
    const ConnectionLoadingOverlay = ({ mode }: { mode: PreviewMode }) => (
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
    const ConnectionErrorOverlay = ({ mode }: { mode: PreviewMode }) => (
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

    return (
      <div className="flex flex-col h-full bg-background">
        {/* Preview */}
        <div className="flex-1 relative flex items-center justify-center bg-background p-8">
          {/* Floating Connection Status Indicator */}
          <div className="absolute top-4 left-4 z-10">
            <ConnectionStatusIndicator />
          </div>

          {/* Floating Options Button */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            {/* Design System Pill */}
            {designSystemLabel && onDesignSystemClick && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onDesignSystemClick}
                className="bg-background/90 backdrop-blur-sm shadow-lg border border-border"
              >
                <Badge variant="outline" className="border-0 px-0">
                  {designSystemLabel}
                </Badge>
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-background/90 backdrop-blur-sm shadow-lg border border-border"
                >
                  <Settings className="w-4 h-4" />
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
                {prototypeId && files && (
                  <DropdownMenuItem
                    onClick={handleStartDevServer}
                    disabled={
                      currentRenderStatus === "Connected" ||
                      currentRenderStatus === "Starting Dev Server.." ||
                      currentRenderStatus === "Connecting.." ||
                      !prototypeId ||
                      !files
                    }
                  >
                    {currentRenderStatus === "Starting Dev Server.." ||
                    currentRenderStatus === "Connecting.." ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    {currentRenderStatus === "Starting Dev Server.." ||
                    currentRenderStatus === "Connecting.."
                      ? "Starting..."
                      : "Start Dev Server"}
                  </DropdownMenuItem>
                )}
                {prototypeId && (
                  <DropdownMenuItem
                    onClick={handleRestartDevServer}
                    disabled={!prototypeId || isRestartingDevServer}
                  >
                    {isRestartingDevServer ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    {isRestartingDevServer ? "Restarting..." : "Restart Server"}
                  </DropdownMenuItem>
                )}
                {prototypeId && currentRenderStatus === "Connected" && (
                  <DropdownMenuItem
                    onClick={handleRunLint}
                    disabled={!prototypeId || isRunningLint}
                  >
                    {isRunningLint ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Settings className="w-4 h-4 mr-2" />
                    )}
                    {isRunningLint ? "Running Lint..." : "Run Lint"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={handleRefresh}
                  disabled={!viewing_url}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Preview
                </DropdownMenuItem>
                {onResetToDefault && (
                  <DropdownMenuItem
                    onClick={onResetToDefault}
                    className="text-destructive focus:text-destructive"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset to Default
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {previewMode === "mobile" && viewing_url && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
              <Button
                onClick={handleAddMobileScreen}
                size="sm"
                variant="secondary"
                className="bg-background/90 backdrop-blur-sm shadow-lg border border-border"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add screen
              </Button>
            </div>
          )}

          {!viewing_url ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center bg-card p-8 rounded-lg border border-border">
                <p className="text-foreground text-lg font-medium">
                  No preview URL provided
                </p>
              </div>
            </div>
          ) : previewMode === "mobile" ? (
            <div className="w-full h-full overflow-auto">
              <div className="min-h-full flex items-center justify-center">
                <div className="flex flex-wrap justify-center gap-8 py-8">
                  {mobileScreens.map((screen, index) => {
                    const iframeSrc = resolveIframeSrc(viewing_url, screen.path);
                    const isPrimaryScreen = index === 0;

                    return (
                      <div
                        key={`mobile-screen-${screen.id}`}
                        className="flex flex-col items-center gap-2"
                      >
                        <div
                          className="relative mx-auto select-none"
                          style={{
                            width: mobileSize.width + 16,
                            height: mobileSize.height + 16,
                          }}
                        >
                          {mobileScreens.length > 1 && (
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-20">
                              {editingScreenId === screen.id ? (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex items-center gap-1 bg-background/95 backdrop-blur-sm border border-border px-2 py-1 rounded-md shadow-lg">
                                    <Input
                                      value={tempPath}
                                      onChange={(e) => handlePathInputChange(e.target.value)}
                                      onKeyDown={(e) => handlePathKeyDown(screen.id, e)}
                                      className="h-6 w-32 text-xs text-center border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary px-1"
                                      placeholder="/"
                                      autoFocus
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 hover:bg-green-500/10"
                                      onClick={() => handleConfirmPathChange(screen.id)}
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
                                      {routeSuggestions.map((route) => (
                                        <button
                                          key={route}
                                          onClick={() => handleSuggestionClick(screen.id, route)}
                                          className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                                        >
                                          {route}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Badge
                                    className="cursor-pointer hover:bg-primary/90 transition-colors"
                                    onClick={() => handleBadgeClick(screen.id, screen.path)}
                                  >
                                    {screen.path || "/"}
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 hover:bg-destructive/10"
                                    onClick={() => handleRemoveMobileScreen(screen.id)}
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
                                boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.1)",
                              }}
                            >
                              <div className="relative w-full h-full">
                                <iframe
                                  key={`mobile-${screen.id}-${refreshKey}`}
                                  ref={(c) => {
                                    if (c) {
                                      iframeRefs.current.set(screen.id, c);
                                      if (isPrimaryScreen) {
                                        webPreviewRef.current = c.contentWindow ?? null;
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
          ) : (
            /* --- END: Mobile device frame --- */
            /* --- START: Web preview --- */
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
                  {/* Show loading overlay when iframe is connecting */}
                  {isIframeLoading && <ConnectionLoadingOverlay mode="web" />}
                  {/* Show error overlay when iframe fails to load */}
                  {iframeError && <ConnectionErrorOverlay mode="web" />}
                </div>
              </div>
            </div>
            /* --- END: Web preview --- */
          )}
        </div>
      </div>
    );
  },
);

MaterializeRenderSection.displayName = "MaterializeRenderSection";

export default MaterializeRenderSection;
