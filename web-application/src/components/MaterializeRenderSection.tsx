"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Monitor,
  RefreshCw,
  RotateCcw,
  Settings,
  Smartphone,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

interface MaterializeRenderSectionProps {
  viewing_url: string;
  onResetToDefault?: () => void;
  hideControls?: boolean;
}

export interface MaterializeRenderSectionRef {
  forceRefresh: () => void;
}

type PreviewMode = "web" | "mobile";

const MaterializeRenderSection = forwardRef<MaterializeRenderSectionRef, MaterializeRenderSectionProps>(
  (
    {
      viewing_url,
      onResetToDefault,
      hideControls = false,
    },
    ref,
  ) => {
    const [previewMode, setPreviewMode] = useState<PreviewMode>("mobile");
    const [refreshKey, setRefreshKey] = useState(0);
    const [mobileSize, setMobileSize] = useState({ width: 300, height: 600 });

    // Ref for the iframe's contentWindow
    const webPreviewRef = useRef<Window | null>(null);

    // Force refresh method
    const forceRefresh = useCallback(() => {
      if (viewing_url) {
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

    const handleRefresh = () => {
      if (webPreviewRef.current && viewing_url) {
        webPreviewRef.current.location = viewing_url;
      }
    };

    const handleModeChange = (mode: PreviewMode) => {
      setPreviewMode(mode);
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
                <DropdownMenuItem
                  onClick={handleRefresh}
                  disabled={!viewing_url}
                >
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
                  <iframe
                    key={`mobile-${refreshKey}`}
                    ref={(c) => {
                      webPreviewRef.current = c?.contentWindow ?? null;
                    }}
                    className="w-full h-full"
                    title="React Native Preview"
                    src={viewing_url}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-presentation"
                  />
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
                <iframe
                  key={`web-${refreshKey}`}
                  ref={(c) => {
                    webPreviewRef.current = c?.contentWindow ?? null;
                  }}
                  className="w-full h-full min-h-[500px]"
                  title="React Native Web Preview"
                  src={viewing_url}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-presentation"
                />
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