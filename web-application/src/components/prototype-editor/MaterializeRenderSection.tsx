"use client";

import { supabase } from "@/ClientConstants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  StartDevServerRequestBody,
  StartDevServerResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";

import { RenderStatus } from "@/app/dashboard/prototypes/[prototype_id]/InternalPrototypePage";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import {
  Loader2,
  Monitor,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  Smartphone,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import html2canvas from "html2canvas";

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
    },
    ref,
  ) => {
    const logger = useProductLogger();
    const [previewMode, setPreviewMode] = useState<PreviewMode>("mobile");
    const [refreshKey, setRefreshKey] = useState(0);
    const [mobileSize, setMobileSize] = useState({ width: 375, height: 750 });
    const [isIframeLoading, setIsIframeLoading] = useState(false);
    const [iframeError, setIframeError] = useState(false);

    // Ref for the iframe's contentWindow
    const webPreviewRef = useRef<Window | null>(null);

    // Ref for the screenshot interval
    const screenshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
    // Track if screenshots are currently active to prevent duplicates
    const [screenshotsActive, setScreenshotsActive] = useState(false);
    // Cache ownership check result to avoid repeated database queries
    const [isOwner, setIsOwner] = useState<boolean | null>(null);

    // Function to capture screenshot of iframe and upload to Supabase
    const captureAndUploadScreenshot = useCallback(async () => {
      // Don't take screenshots if conditions aren't right
      if (!prototypeId || !viewing_url || isIframeLoading || iframeError) {
        logger.debug("log", "Skipping screenshot - conditions not met", {
          prototypeId: !!prototypeId,
          viewing_url: !!viewing_url,
          isIframeLoading,
          iframeError,
        });
        return;
      }

      // Don't take screenshots of loading states or error pages
      if (
        currentRenderStatus === "Connecting.." ||
        currentRenderStatus === "Starting Dev Server.." ||
        currentRenderStatus === "Updating.." ||
        currentRenderStatus === "Disconnected"
      ) {
        logger.debug("log", "Skipping screenshot due to render status", {
          currentRenderStatus,
        });
        return;
      }

      // Check if current user is the prototype owner (use cached result if available)
      if (isOwner === null) {
        logger.debug(
          "log",
          "Ownership not yet determined, skipping screenshot",
        );
        return;
      }

      if (!isOwner) {
        logger.debug(
          "log",
          "Skipping screenshot - user is not prototype owner",
        );
        return;
      }

      try {
        // Find the iframe element
        const iframe = document.querySelector(
          'iframe[title="React Native Preview"], iframe[title="React Native Web Preview"]',
        ) as HTMLIFrameElement;

        if (!iframe) {
          logger.debug("error", "No iframe found for screenshot");
          return;
        }

        // Get the iframe's parent container to capture the whole preview area
        const iframeContainer =
          previewMode === "mobile"
            ? (iframe.closest("#mobile-frame") as HTMLElement)
            : (iframe.closest(".bg-card") as HTMLElement);

        if (!iframeContainer) {
          logger.debug("error", "No iframe container found for screenshot");
          return;
        }

        logger.debug("log", "Capturing screenshot");

        // Capture screenshot using html2canvas
        const canvas = await html2canvas(iframeContainer, {
          useCORS: true,
          allowTaint: true,
          scale: 0.5, // Reduce size for storage efficiency
          backgroundColor: "#ffffff",
          logging: false,
          onclone: (clonedDoc) => {
            // Ensure iframe content is visible in the cloned document
            const clonedIframe = clonedDoc.querySelector("iframe");
            if (clonedIframe) {
              clonedIframe.style.visibility = "visible";
            }
          },
        });

        // Convert canvas to blob
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
            },
            "image/png",
            0.8,
          );
        });

        logger.debug("log", "Uploading screenshot to Supabase");

        // Generate filename that works with RLS policy: {prototypeId}.png
        // This allows the RLS policy to extract the UUID using split_part(objects.name, '.', 1)
        const filename = `${prototypeId}.png`;

        // Upload to Supabase storage with upsert: true to overwrite previous screenshots
        const { data, error } = await supabase.storage
          .from("prototype-thumbnails")
          .upload(filename, blob, {
            contentType: "image/png",
            upsert: true, // Overwrite existing screenshot for this prototype
          });

        if (error) {
          logger.debug("error", "Failed to upload screenshot to Supabase", {
            error: error.message,
            prototypeId,
          });
        } else {
          logger.debug("log", "Screenshot uploaded successfully", {
            filename,
            prototypeId,
            path: data.path,
            overwritten: true,
          });
        }
      } catch (error) {
        logger.debug("error", "Error capturing screenshot", {
          error: error instanceof Error ? error.message : String(error),
          prototypeId,
        });
      }
    }, [
      prototypeId,
      viewing_url,
      isIframeLoading,
      iframeError,
      previewMode,
      logger,
      currentRenderStatus,
      isOwner,
    ]);

    // Function to start the screenshot interval
    const startScreenshotInterval = useCallback(() => {
      // Don't start if already active or conditions aren't met
      if (
        screenshotsActive ||
        !prototypeId ||
        !viewing_url ||
        isIframeLoading ||
        iframeError
      ) {
        return;
      }

      // Clear any existing interval first
      if (screenshotIntervalRef.current) {
        clearInterval(screenshotIntervalRef.current);
        screenshotIntervalRef.current = null;
      }

      // Set active state
      setScreenshotsActive(true);

      // Start new interval (4 minutes = 240000ms)
      screenshotIntervalRef.current = setInterval(() => {
        captureAndUploadScreenshot();
      }, 240000); // 4 minutes

      // Take an initial screenshot after a delay to let iframe fully load
      setTimeout(() => {
        captureAndUploadScreenshot();
      }, 10000); // 10 seconds initial delay for better loading

      logger.debug("log", "Screenshot interval started", { prototypeId });
    }, [
      screenshotsActive,
      prototypeId,
      viewing_url,
      isIframeLoading,
      iframeError,
      captureAndUploadScreenshot,
      logger,
    ]);

    // Function to stop the screenshot interval
    const stopScreenshotInterval = useCallback(() => {
      if (screenshotIntervalRef.current) {
        clearInterval(screenshotIntervalRef.current);
        screenshotIntervalRef.current = null;
        setScreenshotsActive(false);
        logger.debug("log", "Screenshot interval stopped", { prototypeId });
      }
    }, [logger, prototypeId]);

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

        const result: StartDevServerResponse = await response.json();

        if (response.ok && "success" in result && result.success) {
          // Update viewing URL if provided
          if (result.viewing_url && onViewingUrlUpdate) {
            onViewingUrlUpdate(result.viewing_url);
          }

          // Force refresh the preview to load the new dev server
          forceRefresh();
        } else {
          const errorMessage =
            "error" in result ? result.error : result.message;
          logger.debug("error", "Failed to start dev server:", {
            error: errorMessage,
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

    // Single effect to manage screenshot interval lifecycle
    useEffect(() => {
      // Only start screenshots when all conditions are met and not already active
      if (
        prototypeId &&
        viewing_url &&
        !isIframeLoading &&
        !iframeError &&
        !screenshotsActive
      ) {
        // Wait for iframe to fully load before starting screenshots
        const timer = setTimeout(() => {
          startScreenshotInterval();
        }, 5000); // 5 second delay

        return () => clearTimeout(timer);
      }

      // Stop screenshots if conditions are no longer met
      if (
        (!prototypeId || !viewing_url || isIframeLoading || iframeError) &&
        screenshotsActive
      ) {
        stopScreenshotInterval();
      }

      // Cleanup interval on unmount
      return () => {
        stopScreenshotInterval();
      };
    }, [
      prototypeId,
      viewing_url,
      isIframeLoading,
      iframeError,
      screenshotsActive,
      startScreenshotInterval,
      stopScreenshotInterval,
    ]);

    // Check ownership once when prototypeId is available
    useEffect(() => {
      async function checkOwnership() {
        if (!prototypeId) {
          setIsOwner(null);
          return;
        }

        try {
          const { data: user } = await supabase.auth.getUser();
          if (!user?.user?.id) {
            logger.debug("log", "No authenticated user for ownership check");
            setIsOwner(false);
            return;
          }

          const { data: prototype, error: prototypeError } = await supabase
            .from("prototypes")
            .select("owner_id")
            .eq("id", prototypeId)
            .single();

          if (prototypeError) {
            logger.debug(
              "error",
              "Failed to fetch prototype for ownership check",
              {
                error: prototypeError.message,
                prototypeId,
              },
            );
            setIsOwner(false);
            return;
          }

          const isUserOwner = prototype?.owner_id === user.user.id;
          setIsOwner(isUserOwner);

          logger.debug("log", "Ownership check completed", {
            userId: user.user.id,
            ownerId: prototype?.owner_id,
            prototypeId,
            isOwner: isUserOwner,
          });
        } catch (error) {
          logger.debug("error", "Error during ownership check", {
            error: error instanceof Error ? error.message : String(error),
            prototypeId,
          });
          setIsOwner(false);
        }
      }

      checkOwnership();
    }, [prototypeId, logger]);

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
          <div className="absolute top-4 right-4 z-10">
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

          {!viewing_url ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center bg-card p-8 rounded-lg border border-border">
                <p className="text-foreground text-lg font-medium">
                  No preview URL provided
                </p>
              </div>
            </div>
          ) : previewMode === "mobile" ? (
            /* --- START: iPhone 15 Pro device frame --- */
            <div
              id="mobile-frame"
              className="relative mx-auto select-none"
              style={{
                width: mobileSize.width + 16,
                height: mobileSize.height + 16,
              }}
            >
              {/* iPhone 15 Pro frame with titanium-like appearance */}
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
                {/* Dynamic Island */}
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

                {/* Volume buttons */}
                <div className="absolute -left-[3px] top-[80px] w-[2px] h-[32px] bg-gray-600 rounded-l-lg"></div>
                <div className="absolute -left-[3px] top-[120px] w-[2px] h-[32px] bg-gray-600 rounded-l-lg"></div>
                <div className="absolute -left-[3px] top-[160px] w-[2px] h-[48px] bg-gray-600 rounded-l-lg"></div>

                {/* Power button */}
                <div className="absolute -right-[3px] top-[140px] w-[2px] h-[48px] bg-gray-600 rounded-r-lg"></div>

                {/* Screen area */}
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
                      key={`mobile-${refreshKey}`}
                      ref={(c) => {
                        webPreviewRef.current = c?.contentWindow ?? null;
                      }}
                      className="w-full h-full"
                      title="React Native Preview"
                      src={viewing_url}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-presentation"
                      onLoad={handleIframeLoad}
                      onError={handleIframeError}
                    />
                    {/* Show loading overlay when iframe is connecting */}
                    {isIframeLoading && (
                      <ConnectionLoadingOverlay mode="mobile" />
                    )}
                    {/* Show error overlay when iframe fails to load */}
                    {iframeError && <ConnectionErrorOverlay mode="mobile" />}
                  </div>
                </div>

                {/* Resize handle */}
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
