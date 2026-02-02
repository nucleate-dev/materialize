"use client";

import { memo, useState, useCallback, useRef, MouseEvent as ReactMouseEvent } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { resolveIframeSrc } from "./utils";
import { ScreenActions, type AIActionType } from "./ScreenActions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classNames";

interface ElaborateWebFrameProps {
  screenId: number;
  path: string;
  viewingUrl: string;
  width?: number;
  height?: number;
  refreshKey?: number;
  onAIAction?: (screenId: number, path: string, action: AIActionType) => void;
  onLoad?: () => void;
  onError?: () => void;
  availableRoutes?: Array<{ route: string; group?: string }>;
  onPathChange?: (screenId: number, newPath: string) => void;
  onRefresh?: (screenId: number) => void;
  onRemove?: (screenId: number) => void;
  onResize?: (screenId: number, width: number, height: number) => void;
  onResizeEnd?: () => void;
  readOnly?: boolean;
  showRemoveButton?: boolean;
  isLoading?: boolean;
  hasError?: boolean;
  /** If true, render in mobile-size mode (393x852) */
  isMobileSize?: boolean;
  onMobileSizeToggle?: () => void;
  /** If true, render in full-screen mode */
  isFullScreen?: boolean;
  onFullScreenToggle?: () => void;
}

const normalizePath = (value: string): string => {
  if (!value) return "/";
  const trimmed = value.trim();
  if (!trimmed) return "/";
  if (trimmed.startsWith("/")) return trimmed;
  return `/${trimmed}`;
};

// Mobile size dimensions (iPhone 14 Pro)
const MOBILE_SIZE_WIDTH = 393;
const MOBILE_SIZE_HEIGHT = 852;

/**
 * Elaborate web browser frame with full features:
 * - Browser chrome with traffic lights (close, mobile-size toggle, fullscreen toggle)
 * - URL bar with path editing popover
 * - Refresh/remove controls
 * - ScreenActions AI button
 * - Loading/error overlays
 * - Corner resize handle
 */
export const ElaborateWebFrame = memo(function ElaborateWebFrame({
  screenId,
  path,
  viewingUrl,
  width,
  height,
  refreshKey,
  onAIAction,
  onLoad,
  onError,
  availableRoutes = [],
  onPathChange,
  onRefresh,
  onRemove,
  onResize,
  onResizeEnd,
  readOnly = false,
  showRemoveButton = true,
  isLoading = false,
  hasError = false,
  isMobileSize = false,
  onMobileSizeToggle,
  isFullScreen = false,
  onFullScreenToggle,
}: ElaborateWebFrameProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [tempPath, setTempPath] = useState("");
  const isResizing = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });

  const iframeSrc = resolveIframeSrc(viewingUrl, path);
  const displayPath = path || "/";

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsEditing(open);
      if (open) {
        setTempPath(path || "/");
      }
    },
    [path]
  );

  const handleConfirmPath = useCallback(() => {
    const normalized = normalizePath(tempPath);
    if (onPathChange && normalized !== path) {
      onPathChange(screenId, normalized);
    }
    setIsEditing(false);
    setTempPath("");
  }, [tempPath, path, screenId, onPathChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirmPath();
      } else if (e.key === "Escape") {
        setIsEditing(false);
        setTempPath("");
      }
    },
    [handleConfirmPath]
  );

  const handleRouteSelect = useCallback(
    (route: string) => {
      if (onPathChange) {
        onPathChange(screenId, route);
      }
      setIsEditing(false);
      setTempPath("");
    },
    [screenId, onPathChange]
  );

  // Handle corner resize
  const handleResizeMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (e.button !== 0 || readOnly || !onResize) return;

      e.preventDefault();
      e.stopPropagation();

      isResizing.current = true;
      lastPosition.current = { x: e.clientX, y: e.clientY };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizing.current) return;

        const deltaX = moveEvent.clientX - lastPosition.current.x;
        const deltaY = moveEvent.clientY - lastPosition.current.y;

        const currentWidth = width || 800;
        const currentHeight = height || 600;
        const newWidth = Math.max(400, currentWidth + deltaX);
        const newHeight = Math.max(300, currentHeight + deltaY);

        onResize(screenId, newWidth, newHeight);
        lastPosition.current = { x: moveEvent.clientX, y: moveEvent.clientY };
      };

      const handleMouseUp = () => {
        if (isResizing.current) {
          isResizing.current = false;
          onResizeEnd?.();
        }
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
      };

      document.body.style.cursor = "nwse-resize";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [readOnly, onResize, onResizeEnd, screenId, width, height]
  );

  const canEdit = !readOnly && !!onPathChange;
  const showScreenControls = !readOnly && showRemoveButton;

  // Calculate dimensions based on mode
  const frameWidth = isMobileSize ? MOBILE_SIZE_WIDTH : width;
  const frameHeight = isMobileSize ? MOBILE_SIZE_HEIGHT : height;

  return (
    <div
      className={cn(
        "elaborate-web-frame-wrapper bg-accent rounded-xl border border-border overflow-hidden shadow-sm flex flex-col relative transition-all duration-300 min-w-0",
        isMobileSize && !isFullScreen && "mx-auto",
        isFullScreen && "absolute inset-4 z-50 mx-auto shadow-2xl"
      )}
      style={{
        ...(isFullScreen
          ? isMobileSize
            ? {
                width: MOBILE_SIZE_WIDTH,
                maxWidth: "100%",
                inset: "1rem auto",
                left: "50%",
                transform: "translateX(-50%)",
              }
            : {}
          : isMobileSize
            ? {
                width: MOBILE_SIZE_WIDTH,
                height: MOBILE_SIZE_HEIGHT,
                maxWidth: "100%",
              }
            : {
                width: frameWidth,
                height: frameHeight,
                minHeight: 400,
              }),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Browser Header */}
      <div className="bg-accent border-b border-border px-4 py-2.5 flex items-center gap-4 min-w-0 overflow-hidden">
        {/* Traffic Lights */}
        <div className="flex space-x-1.5">
          {/* Red - Close button or static */}
          {showScreenControls && onRemove ? (
            <button
              className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50 hover:bg-red-500 hover:border-red-500 transition-colors flex items-center justify-center group"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(screenId);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="Close screen"
            >
              <X
                className="w-1.5 h-1.5 text-transparent group-hover:text-white"
                strokeWidth={3}
              />
            </button>
          ) : (
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
          )}

          {/* Amber - Mobile size toggle */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "w-2.5 h-2.5 rounded-full transition-colors",
                    isMobileSize
                      ? "bg-amber-500 border border-amber-500"
                      : "bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500 hover:border-amber-500"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMobileSizeToggle?.();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label={isMobileSize ? "Switch to desktop size" : "Switch to mobile size"}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{isMobileSize ? "Desktop size" : "Mobile size"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Green - Fullscreen toggle */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "w-2.5 h-2.5 rounded-full transition-colors",
                    isFullScreen
                      ? "bg-emerald-500 border border-emerald-500"
                      : "bg-emerald-500/20 border border-emerald-500/50 hover:bg-emerald-500 hover:border-emerald-500"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFullScreenToggle?.();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label={isFullScreen ? "Exit full screen" : "Full screen"}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{isFullScreen ? "Exit full screen" : "Full screen"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* URL Bar */}
        <div className="flex-1 flex justify-center min-w-0 overflow-hidden">
          {canEdit ? (
            <Popover open={isEditing} onOpenChange={handleOpenChange}>
              <PopoverTrigger asChild>
                <div
                  className="h-6 px-4 rounded-md bg-background border border-border flex items-center justify-center w-full max-w-[400px] cursor-pointer hover:border-muted-foreground/50"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] text-muted-foreground font-mono truncate opacity-60">
                    {displayPath}
                  </span>
                </div>
              </PopoverTrigger>
              <PopoverContent
                className="w-56 p-0"
                align="center"
                sideOffset={8}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {availableRoutes.length > 0 && (
                  <div className="max-h-48 overflow-y-auto">
                    <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Available Routes
                    </div>
                    {availableRoutes.map((item) => (
                      <button
                        key={item.route}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRouteSelect(item.route);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={cn(
                          "flex items-center justify-between w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors",
                          path === item.route
                            ? "text-foreground bg-accent/50"
                            : "text-muted-foreground"
                        )}
                      >
                        <span className="font-mono">{item.route}</span>
                        {item.group && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground border border-border">
                            {item.group}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <div className="border-t border-border p-2">
                  <div className="flex items-center gap-1">
                    <Input
                      value={tempPath}
                      onChange={(e) => setTempPath(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="h-7 text-xs font-mono border-border"
                      placeholder="Custom path..."
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:bg-emerald-500/20 hover:text-emerald-400 text-emerald-500/70"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirmPath();
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      aria-label="Go to path"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="h-6 px-4 rounded-md bg-background border border-border flex items-center justify-center w-full max-w-[400px]">
              <span className="text-[10px] text-muted-foreground font-mono truncate opacity-60">
                {displayPath}
              </span>
            </div>
          )}
        </div>

        {/* Screen Controls */}
        {showScreenControls && onRefresh ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onRefresh(screenId);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            </Button>
          </div>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Iframe Content */}
      <div className="relative w-full flex-1 bg-white">
        {/* Screen Actions - visible on hover */}
        {isHovered && !readOnly && (
          <ScreenActions
            screenId={screenId}
            path={path}
            onAIAction={onAIAction}
          />
        )}

        {viewingUrl ? (
          <iframe
            key={refreshKey}
            src={iframeSrc}
            title={`Web Preview - ${path}`}
            className="w-full h-full"
            style={{ border: "none" }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-presentation"
            allow="microphone; camera;"
            data-screen-id={screenId}
            onLoad={onLoad}
            onError={onError}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#f5f5f5",
              color: "#666",
              fontSize: 14,
            }}
          >
            No preview URL
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">Loading...</span>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {hasError && (
          <div className="absolute inset-0 bg-background/90 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2 text-center px-4">
              <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                <X className="w-4 h-4 text-red-500" />
              </div>
              <span className="text-xs text-muted-foreground">Failed to load</span>
            </div>
          </div>
        )}
      </div>

      {/* Corner Resize Handle */}
      {!readOnly && onResize && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-10 group"
          onMouseDown={handleResizeMouseDown}
        >
          {/* Resize grip indicator */}
          <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex flex-col gap-[2px]">
              <div className="flex gap-[2px] justify-end">
                <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
              </div>
              <div className="flex gap-[2px] justify-end">
                <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                <div className="w-1 h-1 rounded-full bg-muted-foreground/40" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
