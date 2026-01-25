import { CANVAS, FRAME_DIMENSIONS } from "./constants";

/**
 * Resolve relative path against base URL for iframe src
 */
export function resolveIframeSrc(baseUrl: string, path: string): string {
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

/**
 * Calculate default position for a new screen based on index and preview mode
 */
export function getDefaultPosition(
  index: number,
  previewMode: "mobile" | "web" | "tablet"
): { x: number; y: number } {
  const dimensions = FRAME_DIMENSIONS[previewMode];
  const spacing = dimensions.width + CANVAS.DEFAULT_SCREEN_GAP;
  return {
    x: index * spacing + 100,
    y: 100,
  };
}

/**
 * Get default dimensions for a frame based on preview mode
 */
export function getDefaultDimensions(
  previewMode: "mobile" | "web" | "tablet"
): { width: number; height: number } {
  return FRAME_DIMENSIONS[previewMode];
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate zoom to fit bounds within viewport
 */
export function calculateZoomToFit(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  padding: number = 50
): { zoom: number; camera: { x: number; y: number } } {
  const boundsWidth = bounds.maxX - bounds.minX;
  const boundsHeight = bounds.maxY - bounds.minY;

  if (boundsWidth === 0 || boundsHeight === 0) {
    return { zoom: 1, camera: { x: 0, y: 0 } };
  }

  const availableWidth = viewportWidth - padding * 2;
  const availableHeight = viewportHeight - padding * 2;

  const scaleX = availableWidth / boundsWidth;
  const scaleY = availableHeight / boundsHeight;
  const zoom = clamp(Math.min(scaleX, scaleY), CANVAS.MIN_ZOOM, CANVAS.MAX_ZOOM);

  // Center the bounds in the viewport
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  const camera = {
    x: viewportWidth / 2 - centerX * zoom,
    y: viewportHeight / 2 - centerY * zoom,
  };

  return { zoom, camera };
}

/**
 * Calculate camera position to zoom towards a specific point
 */
export function zoomTowardsPoint(
  currentZoom: number,
  newZoom: number,
  currentCamera: { x: number; y: number },
  pointX: number,
  pointY: number
): { x: number; y: number } {
  const zoomRatio = newZoom / currentZoom;
  return {
    x: pointX - (pointX - currentCamera.x) * zoomRatio,
    y: pointY - (pointY - currentCamera.y) * zoomRatio,
  };
}
