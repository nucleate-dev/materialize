/**
 * Screen state with position information
 */
export interface ScreenState {
  id: number;
  path: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Canvas state that gets persisted to the database
 * Simple, WebSocket-friendly format (~200-500 bytes)
 */
export interface CanvasStateData {
  /** Array of screen configurations with positions */
  screens: ScreenState[];
  /** Current zoom level (1 = 100%) */
  zoom: number;
  /** Camera position */
  camera: { x: number; y: number };
  /** Current preview mode */
  previewMode: "mobile" | "web" | "tablet";
  /** ISO timestamp of last modification */
  lastModified: string;
}

/**
 * Structure for prototype_context column in database
 */
export interface PrototypeContextData {
  canvas?: CanvasStateData;
}

/**
 * Screen configuration matching existing MobileScreenConfig
 */
export interface ScreenConfig {
  id: number;
  path: string;
}

/**
 * Actions for screen management via updateScreens ref method
 */
export interface ScreenUpdateAction {
  action: "add" | "remove" | "set";
  path?: string;
  screenId?: number;
  screens?: ScreenConfig[];
}

/**
 * Ref interface for PreviewCanvas component
 */
export interface PreviewCanvasRef {
  /** Add a new screen at the specified path */
  addScreen: (path: string) => void;
  /** Remove a screen by its ID */
  removeScreen: (screenId: number) => void;
  /** Replace all screens with new configuration */
  setScreens: (screens: ScreenConfig[]) => void;
  /** Get the current canvas state for persistence (returns null if editor not ready) */
  getState: () => CanvasStateData | null;
  /** Restore canvas state from database */
  loadState: (state: CanvasStateData) => void;
  /** Zoom to fit all shapes in view */
  zoomToFit: () => void;
  /** Zoom to focus on a specific screen */
  zoomToScreen: (screenId: number) => void;
  /** Force refresh all iframes */
  forceRefresh: () => void;
  /** Get the current zoom level */
  getZoom: () => number;
  /** Set the zoom level */
  setZoom: (zoom: number) => void;
}

/**
 * Props for the PreviewCanvas component
 */
export interface PreviewCanvasProps {
  /** Base URL for the preview (e.g., sandbox URL) */
  viewingUrl: string;
  /** Current preview mode - determines which shape type to use */
  previewMode: "mobile" | "web" | "tablet";
  /** Initial screen configurations */
  initialScreens?: ScreenConfig[];
  /** Initial canvas state to restore */
  initialCanvasState?: CanvasStateData;
  /** Callback when canvas state changes (for persistence) */
  onCanvasStateChange?: (state: CanvasStateData) => void;
  /** Callback when screens change */
  onScreensChange?: (screens: ScreenConfig[]) => void;
  /** Callback when a screen's path changes */
  onScreenPathChange?: (screenId: number, path: string) => void;
  /** Whether the canvas is in read-only mode (public view) */
  readOnly?: boolean;
  /** Available route suggestions for path editing */
  availableRoutes?: Array<{ route: string; group?: string }>;
  /** Callback when iframe loads */
  onIframeLoad?: () => void;
  /** Callback when iframe errors */
  onIframeError?: () => void;
}
