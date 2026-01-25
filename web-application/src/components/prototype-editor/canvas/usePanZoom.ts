"use client";

import { useCallback, useState, useRef, useEffect, RefObject } from "react";
import { CANVAS } from "./constants";
import { clamp, zoomTowardsPoint, calculateZoomToFit } from "./utils";

interface PanZoomState {
  zoom: number;
  camera: { x: number; y: number };
}

interface UsePanZoomOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  initialZoom?: number;
  initialCamera?: { x: number; y: number };
  onStateChange?: (state: PanZoomState) => void;
}

interface UsePanZoomReturn {
  zoom: number;
  camera: { x: number; y: number };
  setZoom: (zoom: number) => void;
  setCamera: (camera: { x: number; y: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: (bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }) => void;
  zoomToBounds: (bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }) => void;
  resetView: () => void;
  getTransformStyle: () => React.CSSProperties;
  handleWheel: (e: WheelEvent) => void;
  isPanning: boolean;
  startPan: (e: React.MouseEvent) => void;
}

/**
 * Hook for managing canvas pan and zoom with CSS transforms
 */
export function usePanZoom({
  containerRef,
  initialZoom = 1,
  initialCamera = { x: 0, y: 0 },
  onStateChange,
}: UsePanZoomOptions): UsePanZoomReturn {
  const [zoom, setZoomState] = useState(initialZoom);
  const [camera, setCameraState] = useState(initialCamera);
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPosition = useRef({ x: 0, y: 0 });

  // Update state and notify parent
  const updateState = useCallback(
    (newZoom: number, newCamera: { x: number; y: number }) => {
      setZoomState(newZoom);
      setCameraState(newCamera);
      onStateChange?.({ zoom: newZoom, camera: newCamera });
    },
    [onStateChange]
  );

  const setZoom = useCallback(
    (newZoom: number) => {
      const clampedZoom = clamp(newZoom, CANVAS.MIN_ZOOM, CANVAS.MAX_ZOOM);
      updateState(clampedZoom, camera);
    },
    [camera, updateState]
  );

  const setCamera = useCallback(
    (newCamera: { x: number; y: number }) => {
      updateState(zoom, newCamera);
    },
    [zoom, updateState]
  );

  const zoomIn = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const newZoom = clamp(zoom * CANVAS.ZOOM_STEP, CANVAS.MIN_ZOOM, CANVAS.MAX_ZOOM);
    const newCamera = zoomTowardsPoint(zoom, newZoom, camera, centerX, centerY);
    updateState(newZoom, newCamera);
  }, [zoom, camera, containerRef, updateState]);

  const zoomOut = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const newZoom = clamp(zoom / CANVAS.ZOOM_STEP, CANVAS.MIN_ZOOM, CANVAS.MAX_ZOOM);
    const newCamera = zoomTowardsPoint(zoom, newZoom, camera, centerX, centerY);
    updateState(newZoom, newCamera);
  }, [zoom, camera, containerRef, updateState]);

  const zoomToFit = useCallback(
    (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const { zoom: newZoom, camera: newCamera } = calculateZoomToFit(
        bounds,
        rect.width,
        rect.height
      );
      updateState(newZoom, newCamera);
    },
    [containerRef, updateState]
  );

  const zoomToBounds = useCallback(
    (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const { zoom: newZoom, camera: newCamera } = calculateZoomToFit(
        bounds,
        rect.width,
        rect.height,
        100 // More padding for single screen focus
      );
      updateState(newZoom, newCamera);
    },
    [containerRef, updateState]
  );

  const resetView = useCallback(() => {
    updateState(1, { x: 0, y: 0 });
  }, [updateState]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Determine zoom direction
      const zoomFactor = e.deltaY < 0 ? CANVAS.ZOOM_STEP : 1 / CANVAS.ZOOM_STEP;
      const newZoom = clamp(zoom * zoomFactor, CANVAS.MIN_ZOOM, CANVAS.MAX_ZOOM);

      // Zoom towards mouse position
      const newCamera = zoomTowardsPoint(zoom, newZoom, camera, mouseX, mouseY);
      updateState(newZoom, newCamera);
    },
    [zoom, camera, containerRef, updateState]
  );

  // Start panning (middle-click or background drag)
  const startPan = useCallback(
    (e: React.MouseEvent) => {
      // Middle mouse button or left button on background
      if (e.button !== 1 && e.button !== 0) return;

      e.preventDefault();
      setIsPanning(true);
      lastPanPosition.current = { x: e.clientX, y: e.clientY };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - lastPanPosition.current.x;
        const deltaY = moveEvent.clientY - lastPanPosition.current.y;

        setCameraState((prev) => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));

        lastPanPosition.current = { x: moveEvent.clientX, y: moveEvent.clientY };
      };

      const handleMouseUp = () => {
        setIsPanning(false);
        onStateChange?.({ zoom, camera });
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [zoom, camera, onStateChange]
  );

  // Set up wheel event listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [containerRef, handleWheel]);

  const getTransformStyle = useCallback((): React.CSSProperties => {
    return {
      transform: `translate(${camera.x}px, ${camera.y}px) scale(${zoom})`,
      transformOrigin: "0 0",
      willChange: "transform",
    };
  }, [zoom, camera]);

  return {
    zoom,
    camera,
    setZoom,
    setCamera,
    zoomIn,
    zoomOut,
    zoomToFit,
    zoomToBounds,
    resetView,
    getTransformStyle,
    handleWheel,
    isPanning,
    startPan,
  };
}
