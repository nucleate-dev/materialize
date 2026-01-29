"use client";

import {
  ReactNode,
  useCallback,
  useRef,
  useState,
  MouseEvent as ReactMouseEvent,
} from "react";
import { ScreenModeSelector } from "./ScreenModeSelector";
import { MIN_DIMENSIONS } from "./constants";
import type { PreviewMode } from "./types";

interface GridScreenProps {
  children: ReactNode;
  width: number;
  height: number;
  readOnly: boolean;
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onResize: (deltaWidth: number, deltaHeight: number) => void;
  onResizeEnd: () => void;
}

/**
 * Wrapper component for screens in grid layout mode
 * Supports resizing and mode switching but not free-form dragging
 */
export function GridScreen({
  children,
  width,
  height,
  readOnly,
  previewMode,
  onPreviewModeChange,
  onResize,
  onResizeEnd,
}: GridScreenProps) {
  const isResizing = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleResizeMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (e.button !== 0 || readOnly) return;

      e.preventDefault();
      e.stopPropagation();

      isResizing.current = true;
      lastPosition.current = { x: e.clientX, y: e.clientY };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizing.current) return;

        const deltaX = moveEvent.clientX - lastPosition.current.x;
        const deltaY = moveEvent.clientY - lastPosition.current.y;

        onResize(deltaX, deltaY);

        lastPosition.current = { x: moveEvent.clientX, y: moveEvent.clientY };
      };

      const handleMouseUp = () => {
        if (isResizing.current) {
          isResizing.current = false;
          onResizeEnd();
        }
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
      };

      document.body.style.cursor = "nwse-resize";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [readOnly, onResize, onResizeEnd]
  );

  return (
    <div
      className="grid-screen-wrapper"
      style={{
        position: "relative",
        width: width,
        height: height,
        minWidth: MIN_DIMENSIONS.WIDTH,
        minHeight: MIN_DIMENSIONS.HEIGHT,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Mode selector in top-right corner */}
      {!readOnly && (
        <div
          className="screen-mode-selector"
          style={{
            position: "absolute",
            top: -36,
            right: 0,
            zIndex: 40,
          }}
        >
          <ScreenModeSelector
            mode={previewMode}
            onChange={onPreviewModeChange}
            disabled={readOnly}
          />
        </div>
      )}

      {children}

      {/* Resize handle in bottom-right corner */}
      {!readOnly && isHovered && (
        <div
          className="resize-handle"
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 16,
            height: 16,
            cursor: "nwse-resize",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(59, 130, 246, 0.9)",
            borderRadius: 3,
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
          }}
          onMouseDown={handleResizeMouseDown}
        >
          {/* Diagonal resize icon */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            style={{ opacity: 0.9 }}
          >
            <path
              d="M9 1L1 9M9 5L5 9M9 9L9 9"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
