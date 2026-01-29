"use client";

import { memo, useState, useCallback } from "react";
import { Check } from "lucide-react";
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

interface PhoneFrameProps {
  screenId: number;
  path: string;
  viewingUrl: string;
  width: number;
  height: number;
  refreshKey?: number;
  onAIAction?: (screenId: number, path: string, action: AIActionType) => void;
  showActions?: boolean;
  onLoad?: () => void;
  onError?: () => void;
  availableRoutes?: Array<{ route: string; group?: string }>;
  onPathChange?: (screenId: number, newPath: string) => void;
  readOnly?: boolean;
}

const normalizePath = (value: string): string => {
  if (!value) return "/";
  const trimmed = value.trim();
  if (!trimmed) return "/";
  if (trimmed.startsWith("/")) return trimmed;
  return `/${trimmed}`;
};

/**
 * Phone device frame component with iPhone-like styling
 */
export const PhoneFrame = memo(function PhoneFrame({
  screenId,
  path,
  viewingUrl,
  width,
  height,
  refreshKey,
  onAIAction,
  showActions = true,
  onLoad,
  onError,
  availableRoutes = [],
  onPathChange,
  readOnly = false,
}: PhoneFrameProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [tempPath, setTempPath] = useState("");
  const screenWidth = width - PHONE_FRAME.PADDING * 2;
  const screenHeight = height - PHONE_FRAME.PADDING * 2;
  const iframeSrc = resolveIframeSrc(viewingUrl, path);
  const displayPath = path || "/";

  const handleOpenChange = useCallback((open: boolean) => {
    setIsEditing(open);
    if (open) {
      setTempPath(path || "/");
    }
  }, [path]);

  const handleConfirmPath = useCallback(() => {
    const normalized = normalizePath(tempPath);
    if (onPathChange && normalized !== path) {
      onPathChange(screenId, normalized);
    }
    setIsEditing(false);
    setTempPath("");
  }, [tempPath, path, screenId, onPathChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirmPath();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setTempPath("");
    }
  }, [handleConfirmPath]);

  const handleRouteSelect = useCallback((route: string) => {
    if (onPathChange) {
      onPathChange(screenId, route);
    }
    setIsEditing(false);
    setTempPath("");
  }, [screenId, onPathChange]);

  const canEdit = !readOnly && !!onPathChange;

  return (
    <div
      className="phone-frame-wrapper"
      style={{ position: "relative" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Screen Actions - visible on hover */}
      {showActions && isHovered && (
        <ScreenActions
          screenId={screenId}
          path={path}
          onAIAction={onAIAction}
        />
      )}
      {/* Path Badge - Positioned above the frame */}
      {canEdit ? (
        <Popover open={isEditing} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <button
              className="path-editor-trigger"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: -32,
                left: "50%",
                transform: "translateX(-50%)",
                padding: "4px 12px",
                backgroundColor: "rgba(30, 30, 30, 0.9)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 16,
                fontSize: 12,
                fontFamily: "monospace",
                color: "rgba(255, 255, 255, 0.7)",
                whiteSpace: "nowrap",
                zIndex: 30,
                cursor: "pointer",
                transition: "border-color 0.2s, background-color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "hsl(var(--primary))";
                e.currentTarget.style.backgroundColor = "rgba(40, 40, 40, 0.95)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                e.currentTarget.style.backgroundColor = "rgba(30, 30, 30, 0.9)";
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
            position: "absolute",
            top: -32,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "4px 12px",
            backgroundColor: "rgba(30, 30, 30, 0.9)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 16,
            fontSize: 12,
            fontFamily: "monospace",
            color: "rgba(255, 255, 255, 0.7)",
            whiteSpace: "nowrap",
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          {displayPath}
        </div>
      )}

      {/* Phone Frame Container */}
      <div
        className="phone-frame-container"
        style={{
          width,
          height,
          backgroundColor: PHONE_FRAME.BACKGROUND_COLOR,
          borderRadius: PHONE_FRAME.BORDER_RADIUS,
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow:
            "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0,0,0,0.5)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Dynamic Island / Notch */}
        <div
          style={{
            position: "absolute",
            width: `${PHONE_FRAME.NOTCH_WIDTH_PERCENT}%`,
            height: PHONE_FRAME.NOTCH_HEIGHT,
            top: PHONE_FRAME.NOTCH_TOP,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "black",
            borderRadius: 12,
            zIndex: 20,
          }}
        />

        {/* Side Buttons - Left */}
        <div
          style={{
            position: "absolute",
            left: -PHONE_FRAME.BUTTON_WIDTH,
            top: 80,
            width: PHONE_FRAME.BUTTON_WIDTH,
            height: 24,
            backgroundColor: "#333",
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -PHONE_FRAME.BUTTON_WIDTH,
            top: 120,
            width: PHONE_FRAME.BUTTON_WIDTH,
            height: 40,
            backgroundColor: "#333",
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -PHONE_FRAME.BUTTON_WIDTH,
            top: 170,
            width: PHONE_FRAME.BUTTON_WIDTH,
            height: 40,
            backgroundColor: "#333",
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
          }}
        />

        {/* Side Button - Right (Power) */}
        <div
          style={{
            position: "absolute",
            right: -PHONE_FRAME.BUTTON_WIDTH,
            top: 140,
            width: PHONE_FRAME.BUTTON_WIDTH,
            height: 60,
            backgroundColor: "#333",
            borderTopRightRadius: 4,
            borderBottomRightRadius: 4,
          }}
        />

        {/* Screen Content Area */}
        <div
          style={{
            position: "absolute",
            top: PHONE_FRAME.PADDING,
            left: PHONE_FRAME.PADDING,
            width: screenWidth,
            height: screenHeight,
            borderRadius: PHONE_FRAME.BORDER_RADIUS - PHONE_FRAME.PADDING,
            overflow: "hidden",
            backgroundColor: "white",
          }}
        >
          {viewingUrl ? (
            <iframe
              key={refreshKey}
              src={iframeSrc}
              title={`Phone Preview - ${path}`}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
              }}
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
        </div>
      </div>
    </div>
  );
});
