"use client";

import { memo, useState } from "react";
import { BROWSER_FRAME } from "./constants";
import { resolveIframeSrc } from "./utils";
import { ScreenActions, type AIActionType } from "./ScreenActions";

interface BrowserFrameProps {
  screenId: number;
  path: string;
  viewingUrl: string;
  width: number;
  height: number;
  refreshKey?: number;
  onScreenshot?: (screenId: number, path: string) => void;
  onClone?: (screenId: number, path: string) => void;
  onAIAction?: (screenId: number, path: string, action: AIActionType) => void;
  showActions?: boolean;
}

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
  onScreenshot,
  onClone,
  onAIAction,
  showActions = true,
}: BrowserFrameProps) {
  const [isHovered, setIsHovered] = useState(false);
  const iframeSrc = resolveIframeSrc(viewingUrl, path);
  const displayUrl = path === "/" ? viewingUrl : `${viewingUrl}${path}`;

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
          onScreenshot={onScreenshot}
          onClone={onClone}
          onAIAction={onAIAction}
        />
      )}
      {/* Browser Header */}
      <div
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
              {displayUrl || "No URL"}
            </span>
          </div>
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
