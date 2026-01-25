"use client";

import {
  ReactNode,
  useCallback,
  useRef,
  useState,
  MouseEvent as ReactMouseEvent,
} from "react";
import { ScreenModeSelector } from "./ScreenModeSelector";
import type { PreviewMode } from "./types";

interface DraggableScreenProps {
  children: ReactNode;
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  readOnly: boolean;
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onDrag: (deltaX: number, deltaY: number) => void;
  onDragEnd: () => void;
  onResize: (deltaWidth: number, deltaHeight: number) => void;
  onResizeEnd: () => void;
  onDoubleClick: () => void;
}

/**
 * Wrapper component that makes screens draggable and resizable on the canvas
 */
export function DraggableScreen({
  children,
  x,
  y,
  width,
  height,
  zoom,
  readOnly,
  previewMode,
  onPreviewModeChange,
  onDrag,
  onDragEnd,
  onResize,
  onResizeEnd,
  onDoubleClick,
}: DraggableScreenProps) {
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      // Only start drag on left mouse button and not on iframe
      if (e.button !== 0 || readOnly) return;

      const target = e.target as HTMLElement;
      // Don't start drag if clicking on iframe, mode selector, or resize handle
      if (
        target.tagName === "IFRAME" ||
        target.closest(".screen-mode-selector") ||
        target.closest(".resize-handle")
      ) return;

      e.preventDefault();
      e.stopPropagation();

      isDragging.current = true;
      lastPosition.current = { x: e.clientX, y: e.clientY };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;

        const deltaX = moveEvent.clientX - lastPosition.current.x;
        const deltaY = moveEvent.clientY - lastPosition.current.y;

        // Divide by zoom to move correct distance in canvas space
        onDrag(deltaX / zoom, deltaY / zoom);

        lastPosition.current = { x: moveEvent.clientX, y: moveEvent.clientY };
      };

      const handleMouseUp = () => {
        if (isDragging.current) {
          isDragging.current = false;
          onDragEnd();
        }
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [zoom, readOnly, onDrag, onDragEnd]
  );

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

        // Divide by zoom to resize correct amount in canvas space
        onResize(deltaX / zoom, deltaY / zoom);

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
    [zoom, readOnly, onResize, onResizeEnd]
  );

  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't trigger on iframe double-click or mode selector
      if (target.tagName === "IFRAME" || target.closest(".screen-mode-selector")) return;

      e.preventDefault();
      e.stopPropagation();
      onDoubleClick();
    },
    [onDoubleClick]
  );

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        cursor: readOnly ? "default" : "grab",
        userSelect: "none",
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
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
