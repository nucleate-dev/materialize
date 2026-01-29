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
}

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
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedId: null,
    draggedIndex: -1,
    dropIndex: -1,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    elementRect: null,
  });

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

  // Handle drag start
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
    });
  }, [readOnly]);

  // Handle mouse move during drag
  useEffect(() => {
    if (!dragState.isDragging) return;

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
      if (dragState.dropIndex !== dragState.draggedIndex && dragState.draggedId !== null) {
        // Reorder the screens
        const newOrder = [...screenOrder];
        const draggedId = dragState.draggedId;
        const fromIndex = dragState.draggedIndex;
        let toIndex = dragState.dropIndex;

        // Adjust toIndex if moving forward
        if (toIndex > fromIndex) {
          toIndex--;
        }

        // Remove from old position
        newOrder.splice(fromIndex, 1);
        // Insert at new position
        newOrder.splice(toIndex, 0, draggedId);

        onReorder(newOrder);
      }

      setDragState({
        isDragging: false,
        draggedId: null,
        draggedIndex: -1,
        dropIndex: -1,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        elementRect: null,
      });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState.isDragging, dragState.draggedIndex, dragState.dropIndex, dragState.draggedId, screenOrder, calculateDropIndex, onReorder]);

  // Calculate transform for dragged item
  const getDragTransform = useCallback(() => {
    if (!dragState.isDragging || !dragState.elementRect) return undefined;

    const deltaX = dragState.currentX - dragState.startX;
    const deltaY = dragState.currentY - dragState.startY;

    return `translate(${deltaX}px, ${deltaY}px)`;
  }, [dragState]);

  // Get the visual order accounting for drag
  const getVisualIndex = useCallback((actualIndex: number): number => {
    if (!dragState.isDragging) return actualIndex;

    const { draggedIndex, dropIndex } = dragState;

    if (actualIndex === draggedIndex) {
      // This is being dragged, keep it in place visually
      return actualIndex;
    }

    if (draggedIndex < dropIndex) {
      // Dragging forward
      if (actualIndex > draggedIndex && actualIndex < dropIndex) {
        return actualIndex - 1;
      }
    } else if (draggedIndex > dropIndex) {
      // Dragging backward
      if (actualIndex >= dropIndex && actualIndex < draggedIndex) {
        return actualIndex + 1;
      }
    }

    return actualIndex;
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
      <div
        className="grid-layout-content"
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
              className="grid-layout-item"
              style={{
                position: "relative",
                cursor: readOnly ? "default" : "grab",
                userSelect: "none",
                opacity: isDragged ? 0.5 : 1,
                transform: isDragged ? getDragTransform() : undefined,
                zIndex: isDragged ? 1000 : 1,
                transition: isDragged ? "none" : "transform 200ms ease-out",
              }}
              onMouseDown={(e) => handleDragStart(e, screen.id, index)}
            >
              {/* Drop indicator line */}
              {showDropIndicator && (
                <div
                  style={{
                    position: "absolute",
                    left: -GRID_LAYOUT.GAP / 2 - 2,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    backgroundColor: "hsl(var(--primary))",
                    borderRadius: 2,
                    zIndex: 100,
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
            style={{
              position: "relative",
              minHeight: 100,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: -GRID_LAYOUT.GAP / 2 - 2,
                top: 0,
                bottom: 0,
                width: 4,
                backgroundColor: "hsl(var(--primary))",
                borderRadius: 2,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
