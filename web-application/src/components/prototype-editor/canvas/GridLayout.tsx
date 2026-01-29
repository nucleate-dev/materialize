"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { GRID_LAYOUT } from "./constants";
import type { ScreenState, PreviewMode } from "./types";

interface GridLayoutProps {
  screens: ScreenState[];
  screenOrder: number[];
  zoom: number;
  readOnly: boolean;
  onReorder: (newOrder: number[]) => void;
  onScreenResize: (screenId: number, deltaWidth: number, deltaHeight: number) => void;
  onScreenResizeEnd: () => void;
  onScreenPreviewModeChange: (screenId: number, mode: PreviewMode) => void;
  renderScreen: (screen: ScreenState) => ReactNode;
}

interface DragState {
  isDragging: boolean;
  draggedId: number | null;
  draggedIndex: number;
  dropIndex: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  elementRect: DOMRect | null;
  // Keyboard drag state
  isKeyboardDrag: boolean;
}

const initialDragState: DragState = {
  isDragging: false,
  draggedId: null,
  draggedIndex: -1,
  dropIndex: -1,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  elementRect: null,
  isKeyboardDrag: false,
};

/**
 * Calculate number of columns based on viewport width
 */
function getColumnsForWidth(width: number): number {
  for (const bp of GRID_LAYOUT.BREAKPOINTS) {
    if (width >= bp.minWidth) {
      return bp.columns;
    }
  }
  return GRID_LAYOUT.DEFAULT_COLUMNS;
}

/**
 * GridLayout component - displays screens in a responsive grid with drag-to-reorder
 */
export function GridLayout({
  screens,
  screenOrder,
  zoom,
  readOnly,
  onReorder,
  onScreenResize,
  onScreenResizeEnd,
  onScreenPreviewModeChange,
  renderScreen,
}: GridLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(GRID_LAYOUT.DEFAULT_COLUMNS);
  const [dragState, setDragState] = useState<DragState>(initialDragState);
  const [announcement, setAnnouncement] = useState("");

  // Get ordered screens based on screenOrder
  const orderedScreens = useMemo(() => {
    const screenMap = new Map(screens.map(s => [s.id, s]));
    return screenOrder
      .map(id => screenMap.get(id))
      .filter((s): s is ScreenState => s !== undefined);
  }, [screens, screenOrder]);

  // Calculate item positions for drop detection
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Update columns on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateColumns = () => {
      const width = container.clientWidth;
      setColumns(getColumnsForWidth(width));
    };

    updateColumns();

    const resizeObserver = new ResizeObserver(updateColumns);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Set cursor to grabbing during drag
  useEffect(() => {
    if (dragState.isDragging && !dragState.isKeyboardDrag) {
      document.body.style.cursor = "grabbing";
      return () => {
        document.body.style.cursor = "";
      };
    }
  }, [dragState.isDragging, dragState.isKeyboardDrag]);

  // Calculate drop index based on mouse position
  const calculateDropIndex = useCallback((clientX: number, clientY: number): number => {
    const items: [number, HTMLDivElement][] = Array.from(itemRefs.current.entries());
    if (items.length === 0) return 0;

    // Get all item rects
    const rects = items.map(([id, el]: [number, HTMLDivElement]) => ({
      id,
      rect: el.getBoundingClientRect(),
      index: screenOrder.indexOf(id),
    })).sort((a, b) => a.index - b.index);

    // Find the closest position
    for (let i = 0; i < rects.length; i++) {
      const { rect, index } = rects[i];
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // If mouse is above the center of this item, insert before it
      if (clientY < centerY || (clientY < rect.bottom && clientX < centerX)) {
        return index;
      }
    }

    // If we're past all items, insert at the end
    return screenOrder.length;
  }, [screenOrder]);

  // Complete the reorder operation
  const completeReorder = useCallback((fromIndex: number, toIndex: number, draggedId: number) => {
    if (toIndex !== fromIndex) {
      const newOrder = [...screenOrder];
      let adjustedToIndex = toIndex;

      // Adjust toIndex if moving forward
      if (adjustedToIndex > fromIndex) {
        adjustedToIndex--;
      }

      // Remove from old position
      newOrder.splice(fromIndex, 1);
      // Insert at new position
      newOrder.splice(adjustedToIndex, 0, draggedId);

      onReorder(newOrder);

      // Announce the change
      const screen = screens.find(s => s.id === draggedId);
      if (screen) {
        setAnnouncement(`Screen ${screen.path} moved to position ${adjustedToIndex + 1} of ${screens.length}`);
      }
    }
  }, [screenOrder, screens, onReorder]);

  // Handle drag start (mouse)
  const handleDragStart = useCallback((
    e: React.MouseEvent,
    screenId: number,
    index: number
  ) => {
    if (readOnly || e.button !== 0) return;

    const target = e.target as HTMLElement;
    // Don't start drag on interactive elements
    if (
      target.tagName === "IFRAME" ||
      target.closest(".screen-mode-selector") ||
      target.closest(".resize-handle") ||
      target.closest("button")
    ) return;

    e.preventDefault();
    e.stopPropagation();

    const element = itemRefs.current.get(screenId);
    const rect = element?.getBoundingClientRect() || null;

    setDragState({
      isDragging: true,
      draggedId: screenId,
      draggedIndex: index,
      dropIndex: index,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      elementRect: rect,
      isKeyboardDrag: false,
    });

    const screen = screens.find(s => s.id === screenId);
    if (screen) {
      setAnnouncement(`Picked up screen ${screen.path}. Use mouse to drag, release to drop.`);
    }
  }, [readOnly, screens]);

  // Handle keyboard events for drag-to-reorder
  const handleKeyDown = useCallback((
    e: React.KeyboardEvent,
    screenId: number,
    index: number
  ) => {
    if (readOnly) return;

    const screen = screens.find(s => s.id === screenId);

    // Start keyboard drag with Space or Enter
    if ((e.key === " " || e.key === "Enter") && !dragState.isDragging) {
      e.preventDefault();
      setDragState({
        ...initialDragState,
        isDragging: true,
        draggedId: screenId,
        draggedIndex: index,
        dropIndex: index,
        isKeyboardDrag: true,
      });
      if (screen) {
        setAnnouncement(`Picked up screen ${screen.path}, position ${index + 1} of ${orderedScreens.length}. Use arrow keys to move, Enter to drop, Escape to cancel.`);
      }
      return;
    }

    // Handle keyboard drag operations
    if (dragState.isDragging && dragState.isKeyboardDrag && dragState.draggedId === screenId) {
      // Move with arrow keys
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const newDropIndex = Math.max(0, dragState.dropIndex - 1);
        setDragState((prev: DragState) => ({ ...prev, dropIndex: newDropIndex }));
        setAnnouncement(`Moving to position ${newDropIndex + 1} of ${orderedScreens.length}`);
        return;
      }

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const newDropIndex = Math.min(orderedScreens.length, dragState.dropIndex + 1);
        setDragState((prev: DragState) => ({ ...prev, dropIndex: newDropIndex }));
        setAnnouncement(`Moving to position ${newDropIndex + 1} of ${orderedScreens.length}`);
        return;
      }

      // Drop with Enter or Space
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        completeReorder(dragState.draggedIndex, dragState.dropIndex, screenId);
        setDragState(initialDragState);
        // Return focus to the moved item
        setTimeout(() => {
          itemRefs.current.get(screenId)?.focus();
        }, 0);
        return;
      }

      // Cancel with Escape
      if (e.key === "Escape") {
        e.preventDefault();
        setDragState(initialDragState);
        if (screen) {
          setAnnouncement(`Cancelled moving screen ${screen.path}`);
        }
        return;
      }
    }
  }, [readOnly, screens, dragState, orderedScreens.length, completeReorder]);

  // Handle mouse move during drag
  useEffect(() => {
    if (!dragState.isDragging || dragState.isKeyboardDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dropIndex = calculateDropIndex(e.clientX, e.clientY);
      setDragState((prev: DragState) => ({
        ...prev,
        currentX: e.clientX,
        currentY: e.clientY,
        dropIndex,
      }));
    };

    const handleMouseUp = () => {
      if (dragState.draggedId !== null) {
        completeReorder(dragState.draggedIndex, dragState.dropIndex, dragState.draggedId);
      }
      setDragState(initialDragState);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState.isDragging, dragState.isKeyboardDrag, dragState.draggedIndex, dragState.dropIndex, dragState.draggedId, calculateDropIndex, completeReorder]);

  // Calculate transform for dragged item
  const getDragTransform = useCallback(() => {
    if (!dragState.isDragging || !dragState.elementRect || dragState.isKeyboardDrag) return undefined;

    const deltaX = dragState.currentX - dragState.startX;
    const deltaY = dragState.currentY - dragState.startY;

    return `translate(${deltaX}px, ${deltaY}px)`;
  }, [dragState]);

  return (
    <div
      ref={containerRef}
      className="grid-layout-container"
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        padding: GRID_LAYOUT.PADDING,
      }}
    >
      {/* Screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {announcement}
      </div>

      <div
        className="grid-layout-content"
        role="list"
        aria-label={`Screen grid with ${orderedScreens.length} screens`}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: GRID_LAYOUT.GAP,
          alignItems: "start",
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
          width: `${100 / zoom}%`,
        }}
      >
        {orderedScreens.map((screen, index) => {
          const isDragged = dragState.draggedId === screen.id;
          const isKeyboardDragged = isDragged && dragState.isKeyboardDrag;
          const showDropIndicator = dragState.isDragging &&
            dragState.dropIndex === index &&
            dragState.draggedIndex !== index;

          return (
            <div
              key={screen.id}
              ref={(el) => {
                if (el) {
                  itemRefs.current.set(screen.id, el);
                } else {
                  itemRefs.current.delete(screen.id);
                }
              }}
              role="listitem"
              aria-label={`Screen ${screen.path}, position ${index + 1} of ${orderedScreens.length}${isDragged ? ", currently being moved" : ""}. ${readOnly ? "" : "Press Space or Enter to pick up and reorder."}`}
              tabIndex={readOnly ? -1 : 0}
              className="grid-layout-item"
              style={{
                position: "relative",
                cursor: readOnly ? "default" : isDragged && !dragState.isKeyboardDrag ? "grabbing" : "grab",
                userSelect: "none",
                opacity: isDragged && !isKeyboardDragged ? 0.5 : 1,
                transform: isDragged && !isKeyboardDragged ? getDragTransform() : undefined,
                zIndex: isDragged ? 1000 : 1,
                transition: isDragged && !isKeyboardDragged ? "none" : "transform 200ms ease-out, opacity 200ms ease-out",
                outline: isKeyboardDragged ? "2px solid hsl(var(--primary))" : undefined,
                outlineOffset: isKeyboardDragged ? 4 : undefined,
              }}
              onMouseDown={(e) => handleDragStart(e, screen.id, index)}
              onKeyDown={(e) => handleKeyDown(e, screen.id, index)}
            >
              {/* Drop indicator - full height bar with glow effect */}
              {showDropIndicator && (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: -GRID_LAYOUT.GAP / 2 - 3,
                    top: -8,
                    bottom: -8,
                    width: 6,
                    backgroundColor: "hsl(var(--primary))",
                    borderRadius: 3,
                    zIndex: 100,
                    boxShadow: "0 0 8px 2px hsl(var(--primary) / 0.4)",
                  }}
                />
              )}
              {renderScreen(screen)}
            </div>
          );
        })}

        {/* Drop indicator at end */}
        {dragState.isDragging && dragState.dropIndex === orderedScreens.length && (
          <div
            aria-hidden="true"
            style={{
              position: "relative",
              minHeight: 100,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: -GRID_LAYOUT.GAP / 2 - 3,
                top: -8,
                bottom: -8,
                width: 6,
                backgroundColor: "hsl(var(--primary))",
                borderRadius: 3,
                boxShadow: "0 0 8px 2px hsl(var(--primary) / 0.4)",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
