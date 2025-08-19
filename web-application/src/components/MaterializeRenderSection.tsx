"use client";

import { supabase } from "@/ClientConstants";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Database } from "@/lib/types/database.types";
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

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

interface MaterializeRenderSectionProps {
  viewing_url: string; // ASSUMPTION: viewing_url is always normalized with protocol (e.g., https://)
  onResetToDefault?: () => void;
  hideControls?: boolean;
  isBuilding?: boolean; // New prop to indicate if a build is in progress
  // Props for dev server functionality
  prototypeId?: string;
  files?: Record<string, PrototypeFile>;
  onViewingUrlUpdate?: (url: string) => void;
  onBuildingStateChange?: (isBuilding: boolean) => void;
}

export interface MaterializeRenderSectionRef {
  forceRefresh: () => void;
}

type PreviewMode = "web" | "mobile";

const MaterializeRenderSection = forwardRef<
  MaterializeRenderSectionRef,
  MaterializeRenderSectionProps
>(({
  viewing_url,
  onResetToDefault,
  hideControls = false,
  isBuilding = false,
  prototypeId,
  files,
  onViewingUrlUpdate,
  onBuildingStateChange,
}, ref) => {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("mobile");
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileSize, setMobileSize] = useState({ width: 300, height: 600 });
  const [isIframeLoading, setIsIframeLoading] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  // Ref for the iframe's contentWindow
  const webPreviewRef = useRef<Window | null>(null);

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
    if (!prototypeId || !files || !onBuildingStateChange) {
      console.error("Cannot start dev server: missing prototype ID, files, or building state callback");
      return;
    }

    onBuildingStateChange(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        console.error("No authentication token available");
        return;
      }

      // Convert files from Record<string, PrototypeFile> to array format expected by API
      const filesArray: PrototypeFile[] = Object.entries(files).map(([path, file]) => ({
        contents: file.contents,
        name: path, // Use the path as the name
        file_type: file.file_type || "text" as const,
        prototype_id: file.prototype_id || prototypeId,
        id: file.id,
        storage_path: file.storage_path,
        created_at: file.created_at,
        updated_at: file.updated_at,
      }));

      console.log(`Starting dev server for prototype ${prototypeId} with ${filesArray.length} files`);

      const response = await fetch("/api/files/start-dev-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          files: filesArray,
          prototype_id: prototypeId,
          file_scope: "complete", // Send all files to properly initialize dev server
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log("✅ Dev server started successfully");

        // Update viewing URL if provided
        if (result.viewing_url && onViewingUrlUpdate) {
          onViewingUrlUpdate(result.viewing_url);
        }

        // Force refresh the preview to load the new dev server
        forceRefresh();
      } else {
        console.error("Failed to start dev server:", result.error || result.message);
      }
    } catch (error) {
      console.error("Error starting dev server:", error);
    } finally {
      onBuildingStateChange(false);
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
      setIsIframeLoading(true);
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
    console.log("Iframe loaded successfully");
    setIsIframeLoading(false);
    setIframeError(false);
  }, []);

  const handleIframeError = useCallback(() => {
    console.log("Iframe failed to load");
    setIsIframeLoading(false);
    setIframeError(true);
  }, []);

  // Start loading when viewing_url changes
  useEffect(() => {
    console.log("render_viewing_url: ", viewing_url);
    if (viewing_url) {
      setIsIframeLoading(true);
      setIframeError(false);
    }
  }, [viewing_url]);

  // Loading indicator component for build process
  const LoadingIndicator = ({ mode }: { mode: PreviewMode; }) => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center bg-card p-8 rounded-lg border border-border">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-foreground text-lg font-medium mb-2">
          Building Your App
        </p>
        <p className="text-muted-foreground text-sm">
          Please wait while we compile and deploy your changes...
        </p>
        {mode === "mobile" && (
          <p className="text-muted-foreground text-xs mt-2">
            Mobile preview will load shortly
          </p>
        )}
        {mode === "web" && (
          <p className="text-muted-foreground text-xs mt-2">
            Web preview will load shortly
          </p>
        )}
      </div>
    </div>
  );

  // Connection loading overlay for iframe
  const ConnectionLoadingOverlay = ({ mode }: { mode: PreviewMode; }) => (
    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
      <div className="text-center bg-card p-6 rounded-lg border border-border shadow-lg">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-primary" />
        <p className="text-foreground font-medium mb-1">
          Connecting to Preview
        </p>
        <p className="text-muted-foreground text-sm">
          {mode === "mobile" ? "Loading mobile preview..." : "Loading web preview..."}
        </p>
      </div>
    </div>
  );

  // Error overlay for iframe
  const ConnectionErrorOverlay = ({ mode }: { mode: PreviewMode; }) => (
    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
      <div className="text-center bg-card p-6 rounded-lg border border-border shadow-lg">
        <div className="w-6 h-6 mx-auto mb-3 text-destructive">
          ⚠️
        </div>
        <p className="text-foreground font-medium mb-1">
          Connection Failed
        </p>
        <p className="text-muted-foreground text-sm mb-3">
          Unable to load {mode === "mobile" ? "mobile" : "web"} preview
        </p>
        <Button
          size="sm"
          onClick={() => {
            setIframeError(false);
            setIsIframeLoading(true);
            setRefreshKey(prev => prev + 1);
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
      {/* Header */}
      {!hideControls && (
        <div className="flex items-center justify-between p-6 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="text-sm font-medium text-foreground">
              React Native Preview
            </span>
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="flex-1 relative flex items-center justify-center bg-background p-8">
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
              {prototypeId && files && onBuildingStateChange && (
                <DropdownMenuItem
                  onClick={handleStartDevServer}
                  disabled={isBuilding || !prototypeId || !files}
                >
                  {isBuilding ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {isBuilding ? "Starting..." : "Start Dev Server"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleRefresh} disabled={!viewing_url}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Preview
              </DropdownMenuItem>
              {!hideControls && onResetToDefault && (
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

        {isBuilding ? (
          <LoadingIndicator mode={previewMode} />
        ) : !viewing_url ? (
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
                  {isIframeLoading && <ConnectionLoadingOverlay mode="mobile" />}
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
});

MaterializeRenderSection.displayName = "MaterializeRenderSection";

export default MaterializeRenderSection;
