"use client";

import { memo, useState, useCallback } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { PHONE_FRAME } from "./constants";
import { resolveIframeSrc } from "./utils";
import { ScreenActions, type AIActionType } from "./ScreenActions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classNames";

interface ElaboratePhoneFrameProps {
  screenId: number;
  path: string;
  viewingUrl: string;
  width: number;
  height: number;
  refreshKey?: number;
  onAIAction?: (screenId: number, path: string, action: AIActionType) => void;
  onLoad?: () => void;
  onError?: () => void;
  availableRoutes?: Array<{ route: string; group?: string }>;
  onPathChange?: (screenId: number, newPath: string) => void;
  onRefresh?: (screenId: number) => void;
  onRemove?: (screenId: number) => void;
  readOnly?: boolean;
  showRemoveButton?: boolean;
  isLoading?: boolean;
  hasError?: boolean;
}

const normalizePath = (value: string): string => {
  if (!value) return "/";
  const trimmed = value.trim();
  if (!trimmed) return "/";
  if (trimmed.startsWith("/")) return trimmed;
  return `/${trimmed}`;
};

/**
 * Elaborate phone frame with full features:
 * - Dark bezel with physical buttons
 * - URL bar with path editing popover
 * - Refresh/remove controls
 * - ScreenActions AI button
 * - Loading/error overlays
 * - Resize handle
 */
export const ElaboratePhoneFrame = memo(function ElaboratePhoneFrame({
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
  readOnly = false,
  showRemoveButton = true,
  isLoading = false,
  hasError = false,
}: ElaboratePhoneFrameProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [tempPath, setTempPath] = useState("");

  // Calculate screen dimensions (inside the bezel)
  const bezelPadding = 8;
  const screenWidth = width - bezelPadding * 2;
  const screenHeight = height - bezelPadding * 2;
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

  const canEdit = !readOnly && !!onPathChange;

  return (
    <div
      className="elaborate-phone-frame-wrapper"
      style={{ position: "relative" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* URL Bar / Controls - Positioned above the frame */}
      <div
        className="absolute -top-12 left-1/2 -translate-x-1/2 z-20"
        style={{ transform: "translateX(-50%)" }}
      >
        <div className="flex items-center gap-1.5">
          {canEdit ? (
            <Popover open={isEditing} onOpenChange={handleOpenChange}>
              <PopoverTrigger asChild>
                <button
                  className="path-editor-trigger"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "rgba(30, 30, 30, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: 16,
                    fontSize: 12,
                    fontFamily: "monospace",
                    color: "rgba(255, 255, 255, 0.7)",
                    whiteSpace: "nowrap",
                    maxWidth: 250,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    cursor: "pointer",
                    transition: "border-color 0.2s, background-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "hsl(var(--primary))";
                    e.currentTarget.style.backgroundColor =
                      "rgba(40, 40, 40, 0.95)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor =
                      "rgba(255, 255, 255, 0.1)";
                    e.currentTarget.style.backgroundColor =
                      "rgba(30, 30, 30, 0.9)";
                  }}
                >
                  {displayPath}
                </button>
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
            <div
              style={{
                padding: "6px 12px",
                backgroundColor: "rgba(30, 30, 30, 0.9)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 16,
                fontSize: 12,
                fontFamily: "monospace",
                color: "rgba(255, 255, 255, 0.5)",
                whiteSpace: "nowrap",
                maxWidth: 250,
                overflow: "hidden",
                textOverflow: "ellipsis",
                pointerEvents: "none",
              }}
            >
              {displayPath}
            </div>
          )}

          {/* Refresh and Remove buttons */}
          {!readOnly && (
            <>
              {onRefresh && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 bg-accent border border-border rounded-full hover:bg-accent/80 text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefresh(screenId);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label="Refresh screen"
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              )}
              {showRemoveButton && onRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 bg-accent border border-border rounded-full hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(screenId);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label="Remove screen"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Phone Frame Container */}
      <div
        className="phone-frame-container relative bg-[#0B0C0E] shadow-2xl"
        style={{
          width,
          height,
          borderRadius: "2.5rem",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow:
            "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0,0,0,0.5)",
        }}
      >
        {/* Physical Side Buttons - Left (volume) */}
        <div className="absolute -left-[2px] top-[80px] w-[2px] h-[24px] bg-[#333] rounded-l-md" />
        <div className="absolute -left-[2px] top-[120px] w-[2px] h-[40px] bg-[#333] rounded-l-md" />
        <div className="absolute -left-[2px] top-[170px] w-[2px] h-[40px] bg-[#333] rounded-l-md" />

        {/* Physical Side Button - Right (power) */}
        <div className="absolute -right-[2px] top-[140px] w-[2px] h-[60px] bg-[#333] rounded-r-md" />

        {/* Screen Content Area */}
        <div
          className="absolute bg-white overflow-hidden"
          style={{
            width: screenWidth,
            height: screenHeight,
            top: bezelPadding,
            left: bezelPadding,
            borderRadius: "2rem",
          }}
        >
          {/* Screen Actions - visible on hover */}
          {isHovered && !readOnly && (
            <ScreenActions
              screenId={screenId}
              path={path}
              onAIAction={onAIAction}
            />
          )}

          <div className="relative w-full h-full bg-white">
            {viewingUrl ? (
              <iframe
                key={refreshKey}
                src={iframeSrc}
                title={`Phone Preview - ${path}`}
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
                  <span className="text-xs text-muted-foreground">
                    Loading...
                  </span>
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
                  <span className="text-xs text-muted-foreground">
                    Failed to load
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
