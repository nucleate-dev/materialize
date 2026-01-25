"use client";

import { memo } from "react";
import { PHONE_FRAME } from "./constants";
import { resolveIframeSrc } from "./utils";

interface PhoneFrameProps {
  screenId: number;
  path: string;
  viewingUrl: string;
  width: number;
  height: number;
  refreshKey?: number;
}

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
}: PhoneFrameProps) {
  const screenWidth = width - PHONE_FRAME.PADDING * 2;
  const screenHeight = height - PHONE_FRAME.PADDING * 2;
  const iframeSrc = resolveIframeSrc(viewingUrl, path);

  return (
    <div className="phone-frame-wrapper" style={{ position: "relative" }}>
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
          pointerEvents: "none",
        }}
      >
        {path || "/"}
      </div>

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
