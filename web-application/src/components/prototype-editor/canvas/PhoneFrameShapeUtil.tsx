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
import type { PhoneFrameShapeProps } from "./types";

// Define the shape type
export type PhoneFrameShape = TLBaseShape<"phone-frame", PhoneFrameShapeProps>;

// Phone frame dimensions
const FRAME_PADDING = 8; // Padding around the screen
const BORDER_RADIUS = 40; // 2.5rem equivalent
const NOTCH_WIDTH_PERCENT = 35;
const NOTCH_HEIGHT = 24;
const NOTCH_TOP = 8;
const BUTTON_WIDTH = 2;

// Default phone size (matches existing implementation)
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 640;

export class PhoneFrameShapeUtil extends BaseBoxShapeUtil<PhoneFrameShape> {
  static override type = "phone-frame" as const;

  static override props = {
    screenId: T.number,
    path: T.string,
    w: T.number,
    h: T.number,
  };

  override isAspectRatioLocked(shape: PhoneFrameShape): boolean {
    void shape;
    return false;
  }

  override canResize(shape: PhoneFrameShape): boolean {
    void shape;
    return true;
  }

  override canEdit(shape: PhoneFrameShape): boolean {
    void shape;
    return false;
  }

  getDefaultProps(): PhoneFrameShapeProps {
    return {
      screenId: 0,
      path: "/",
      w: DEFAULT_WIDTH + FRAME_PADDING * 2,
      h: DEFAULT_HEIGHT + FRAME_PADDING * 2,
    };
  }

  getGeometry(shape: PhoneFrameShape): Rectangle2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(
    shape: PhoneFrameShape,
    info: TLResizeInfo<PhoneFrameShape>,
  ) {
    return resizeBox(shape, info);
  }

  component(shape: PhoneFrameShape) {
    const { w, h, path, screenId } = shape.props;
    const screenWidth = w - FRAME_PADDING * 2;
    const screenHeight = h - FRAME_PADDING * 2;

    // Get viewing URL from the shape's meta or context
    // This will be injected when the shape is created
    const viewingUrl = (shape.meta?.viewingUrl as string) || "";
    const iframeSrc = this.resolveIframeSrc(viewingUrl, path);

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          width: "100%",
          height: "100%",
          pointerEvents: "all",
        }}
      >
        {/* Phone Frame Container */}
        <div
          className="phone-frame-container"
          style={{
            width: w,
            height: h,
            backgroundColor: "#0B0C0E",
            borderRadius: BORDER_RADIUS,
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
              width: `${NOTCH_WIDTH_PERCENT}%`,
              height: NOTCH_HEIGHT,
              top: NOTCH_TOP,
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
              left: -BUTTON_WIDTH,
              top: 80,
              width: BUTTON_WIDTH,
              height: 24,
              backgroundColor: "#333",
              borderTopLeftRadius: 4,
              borderBottomLeftRadius: 4,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: -BUTTON_WIDTH,
              top: 120,
              width: BUTTON_WIDTH,
              height: 40,
              backgroundColor: "#333",
              borderTopLeftRadius: 4,
              borderBottomLeftRadius: 4,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: -BUTTON_WIDTH,
              top: 170,
              width: BUTTON_WIDTH,
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
              right: -BUTTON_WIDTH,
              top: 140,
              width: BUTTON_WIDTH,
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
              top: FRAME_PADDING,
              left: FRAME_PADDING,
              width: screenWidth,
              height: screenHeight,
              borderRadius: BORDER_RADIUS - FRAME_PADDING,
              overflow: "hidden",
              backgroundColor: "white",
            }}
          >
            {viewingUrl ? (
              <iframe
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

        {/* Path Badge - Positioned above the frame */}
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
          }}
        >
          {path || "/"}
        </div>
      </HTMLContainer>
    );
  }

  indicator(shape: PhoneFrameShape) {
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
