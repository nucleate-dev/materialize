"use client";

import {
  ReactNode,
  useCallback,
  useRef,
  MouseEvent as ReactMouseEvent,
} from "react";

interface DraggableScreenProps {
  children: ReactNode;
  x: number;
  y: number;
  zoom: number;
  readOnly: boolean;
  onDrag: (deltaX: number, deltaY: number) => void;
  onDragEnd: () => void;
  onDoubleClick: () => void;
}

/**
 * Wrapper component that makes screens draggable on the canvas
 */
export function DraggableScreen({
  children,
  x,
  y,
  zoom,
  readOnly,
  onDrag,
  onDragEnd,
  onDoubleClick,
}: DraggableScreenProps) {
  const isDragging = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      // Only start drag on left mouse button and not on iframe
      if (e.button !== 0 || readOnly) return;

      const target = e.target as HTMLElement;
      // Don't start drag if clicking on iframe
      if (target.tagName === "IFRAME") return;

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

  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't trigger on iframe double-click
      if (target.tagName === "IFRAME") return;

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
    >
      {children}
    </div>
  );
}
