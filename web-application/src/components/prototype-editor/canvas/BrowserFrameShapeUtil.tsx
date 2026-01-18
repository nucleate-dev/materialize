"use client";

import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  T,
  TLBaseShape,
  TLResizeInfo,
} from "@/lib/tldraw";
import type { BrowserFrameShapeProps } from "./types";

// Define the shape type
export type BrowserFrameShape = TLBaseShape<
  "browser-frame",
  BrowserFrameShapeProps
>;

// Browser frame dimensions
const HEADER_HEIGHT = 40;
const BORDER_RADIUS = 12;
const TRAFFIC_LIGHT_SIZE = 10;
const TRAFFIC_LIGHT_GAP = 6;

// Default browser size
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;

export class BrowserFrameShapeUtil extends BaseBoxShapeUtil<BrowserFrameShape> {
  static override type = "browser-frame" as const;

  static override props = {
    screenId: T.number,
    path: T.string,
    w: T.number,
    h: T.number,
  };

  override isAspectRatioLocked(shape: BrowserFrameShape): boolean {
    void shape;
    return false;
  }

  override canResize(shape: BrowserFrameShape): boolean {
    void shape;
    return true;
  }

  override canEdit(shape: BrowserFrameShape): boolean {
    void shape;
    return false;
  }

  getDefaultProps(): BrowserFrameShapeProps {
    return {
      screenId: 0,
      path: "/",
      w: DEFAULT_WIDTH,
      h: DEFAULT_HEIGHT,
    };
  }

  getGeometry(shape: BrowserFrameShape): Rectangle2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(
    shape: BrowserFrameShape,
    info: TLResizeInfo<BrowserFrameShape>,
  ) {
    return resizeBox(shape, info);
  }

  component(shape: BrowserFrameShape) {
    const { w, h, path, screenId } = shape.props;

    // Get viewing URL from the shape's meta
    const viewingUrl = (shape.meta?.viewingUrl as string) || "";
    const iframeSrc = this.resolveIframeSrc(viewingUrl, path);
    const displayUrl = path === "/" ? viewingUrl : `${viewingUrl}${path}`;

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          width: "100%",
          height: "100%",
          pointerEvents: "all",
        }}
      >
        {/* Browser Frame Container */}
        <div
          className="browser-frame-container"
          style={{
            width: w,
            height: h,
            backgroundColor: "hsl(var(--accent))",
            borderRadius: BORDER_RADIUS,
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Browser Header */}
          <div
            style={{
              height: HEADER_HEIGHT,
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
            <div style={{ display: "flex", gap: TRAFFIC_LIGHT_GAP }}>
              <div
                style={{
                  width: TRAFFIC_LIGHT_SIZE,
                  height: TRAFFIC_LIGHT_SIZE,
                  borderRadius: "50%",
                  backgroundColor: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid rgba(239, 68, 68, 0.5)",
                }}
              />
              <div
                style={{
                  width: TRAFFIC_LIGHT_SIZE,
                  height: TRAFFIC_LIGHT_SIZE,
                  borderRadius: "50%",
                  backgroundColor: "rgba(245, 158, 11, 0.2)",
                  border: "1px solid rgba(245, 158, 11, 0.5)",
                }}
              />
              <div
                style={{
                  width: TRAFFIC_LIGHT_SIZE,
                  height: TRAFFIC_LIGHT_SIZE,
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
      </HTMLContainer>
    );
  }

  indicator(shape: BrowserFrameShape) {
    const { w, h } = shape.props;
    return (
      <rect
        width={w}
        height={h}
        rx={BORDER_RADIUS}
        ry={BORDER_RADIUS}
        fill="none"
      />
    );
  }

  // Helper to resolve iframe source URL
  private resolveIframeSrc(baseUrl: string, path: string): string {
    if (!baseUrl) return "";

    try {
      return new URL(path, baseUrl).toString();
    } catch {
      try {
        return new URL(baseUrl).toString();
      } catch {
        return baseUrl;
      }
    }
  }
}
