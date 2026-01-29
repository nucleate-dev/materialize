"use client";

import { memo, useState, useCallback } from "react";
import { Check } from "lucide-react";
import { BROWSER_FRAME } from "./constants";
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

interface BrowserFrameProps {
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
 * Browser window frame component with macOS-like styling
 */
export const BrowserFrame = memo(function BrowserFrame({
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
}: BrowserFrameProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [tempPath, setTempPath] = useState("");
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
      className="browser-frame-container"
      style={{
        width,
        height,
        backgroundColor: "hsl(var(--accent))",
        borderRadius: BROWSER_FRAME.BORDER_RADIUS,
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
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
      {/* Browser Header */}
      <div
        className="browser-header"
        style={{
          height: BROWSER_FRAME.HEADER_HEIGHT,
          backgroundColor: "hsl(var(--accent))",
          borderBottom: "1px solid hsl(var(--border))",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
        }}
      >
        {/* Traffic Lights */}
        <div style={{ display: "flex", gap: BROWSER_FRAME.TRAFFIC_LIGHT_GAP }}>
          <div
            style={{
              width: BROWSER_FRAME.TRAFFIC_LIGHT_SIZE,
              height: BROWSER_FRAME.TRAFFIC_LIGHT_SIZE,
              borderRadius: "50%",
              backgroundColor: "rgba(239, 68, 68, 0.2)",
              border: "1px solid rgba(239, 68, 68, 0.5)",
            }}
          />
          <div
            style={{
              width: BROWSER_FRAME.TRAFFIC_LIGHT_SIZE,
              height: BROWSER_FRAME.TRAFFIC_LIGHT_SIZE,
              borderRadius: "50%",
              backgroundColor: "rgba(245, 158, 11, 0.2)",
              border: "1px solid rgba(245, 158, 11, 0.5)",
            }}
          />
          <div
            style={{
              width: BROWSER_FRAME.TRAFFIC_LIGHT_SIZE,
              height: BROWSER_FRAME.TRAFFIC_LIGHT_SIZE,
              borderRadius: "50%",
              backgroundColor: "rgba(34, 197, 94, 0.2)",
              border: "1px solid rgba(34, 197, 94, 0.5)",
            }}
          />
        </div>

        {/* URL Bar */}
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
          }}
        >
          {canEdit ? (
            <Popover open={isEditing} onOpenChange={handleOpenChange}>
              <PopoverTrigger asChild>
                <button
                  className="path-editor-trigger"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    height: 24,
                    padding: "0 16px",
                    borderRadius: 6,
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 200,
                    maxWidth: 400,
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "hsl(var(--primary))";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "hsl(var(--border))";
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "hsl(var(--muted-foreground))",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayPath}
                  </span>
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
                height: 24,
                padding: "0 16px",
                borderRadius: 6,
                backgroundColor: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 200,
                maxWidth: 400,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "hsl(var(--muted-foreground))",
                  opacity: 0.6,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayPath}
              </span>
            </div>
          )}
        </div>

        {/* Spacer for balance */}
        <div style={{ width: 40 }} />
      </div>

      {/* Browser Content */}
      <div
        style={{
          flex: 1,
          backgroundColor: "white",
          overflow: "hidden",
        }}
      >
        {viewingUrl ? (
          <iframe
            key={refreshKey}
            src={iframeSrc}
            title={`Browser Preview - ${path}`}
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
  );
});
