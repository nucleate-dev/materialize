"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Editor,
  TLShapeId,
  Tldraw,
  createShapeId,
} from "@/lib/tldraw";

import { PhoneFrameShapeUtil } from "./PhoneFrameShapeUtil";
import { BrowserFrameShapeUtil } from "./BrowserFrameShapeUtil";
import type {
  CanvasStateData,
  PreviewCanvasProps,
  PreviewCanvasRef,
  ScreenConfig,
} from "./types";

// Custom shape utils array
const customShapeUtils = [PhoneFrameShapeUtil, BrowserFrameShapeUtil];

// Grid spacing for initial shape placement
const GRID_SPACING = 50;

// Default positions for new shapes
const getDefaultPosition = (index: number, previewMode: "mobile" | "web") => {
  const baseWidth = previewMode === "mobile" ? 336 : 800;
  const spacing = baseWidth + GRID_SPACING;
  return {
    x: index * spacing + 100,
    y: 100,
  };
};

const PreviewCanvas = forwardRef<PreviewCanvasRef, PreviewCanvasProps>(
  (
    {
      viewingUrl,
      previewMode,
      initialScreens = [{ id: 0, path: "/" }],
      initialCanvasState,
      onCanvasStateChange,
      onScreensChange,
      onScreenPathChange,
      readOnly = false,
      availableRoutes = [],
      onIframeLoad,
      onIframeError,
    },
    ref,
  ) => {
    void onScreenPathChange;
    void availableRoutes;
    void onIframeLoad;
    void onIframeError;
    const editorRef = useRef<Editor | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const screenIdCounter = useRef(
      Math.max(...initialScreens.map((s) => s.id), 0) + 1,
    );

    // Track screen ID to shape ID mapping
    const screenToShapeMap = useRef<Map<number, TLShapeId>>(new Map());

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Get current canvas state for persistence
    const getCanvasState = useCallback((): CanvasStateData | null => {
      if (!editorRef.current) return null;

      const editor = editorRef.current;
      const snapshot = editor.getSnapshot();
      const camera = editor.getCamera();
      const zoom = editor.getZoomLevel();

      return {
        document: snapshot.document,
        zoom,
        camera: { x: camera.x, y: camera.y },
        previewMode,
        lastModified: new Date().toISOString(),
      };
    }, [previewMode]);

    // Debounced state change handler
    const debouncedSave = useCallback(() => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        if (editorRef.current && onCanvasStateChange) {
          const state = getCanvasState();
          if (state) {
            onCanvasStateChange(state);
          }
        }
      }, 1000);
    }, [getCanvasState, onCanvasStateChange]);

    // Rebuild the mapping between screen IDs and shape IDs
    const rebuildScreenShapeMap = useCallback(() => {
      if (!editorRef.current) return;

      const editor = editorRef.current;
      screenToShapeMap.current.clear();

      const allShapes = editor.getCurrentPageShapes();
      for (const shape of allShapes) {
        if (shape.type === "phone-frame" || shape.type === "browser-frame") {
          const props = shape.props as { screenId: number };
          screenToShapeMap.current.set(props.screenId, shape.id);
        }
      }
    }, []);

    // Load canvas state from persistence
    const loadCanvasState = useCallback(
      (state: CanvasStateData) => {
        if (!editorRef.current) return;

        const editor = editorRef.current;

        try {
          // Load the document snapshot
          editor.loadSnapshot({
            document: state.document,
            session: editor.getSnapshot().session,
          });

          // Restore camera position and zoom
          editor.setCamera({
            x: state.camera.x,
            y: state.camera.y,
            z: state.zoom,
          });

          // Rebuild the screen to shape mapping
          rebuildScreenShapeMap();
        } catch (error) {
          // eslint-disable-next-line no-restricted-syntax
          console.error("Error loading canvas state:", error);
        }
      },
      [rebuildScreenShapeMap],
    );

    // Notify parent of screen changes
    const notifyScreensChanged = useCallback(() => {
      if (!editorRef.current || !onScreensChange) return;

      const editor = editorRef.current;
      const shapes = editor.getCurrentPageShapes();
      const screens: ScreenConfig[] = [];

      for (const shape of shapes) {
        if (shape.type === "phone-frame" || shape.type === "browser-frame") {
          const props = shape.props as { screenId: number; path: string };
          screens.push({
            id: props.screenId,
            path: props.path,
          });
        }
      }

      onScreensChange(screens);
    }, [onScreensChange]);

    // Add a new screen
    const addScreen = useCallback(
      (path: string) => {
        if (!editorRef.current) return;

        const editor = editorRef.current;
        const newScreenId = screenIdCounter.current++;
        const shapeId = createShapeId();
        const existingShapes = editor.getCurrentPageShapes().length;
        const position = getDefaultPosition(existingShapes, previewMode);

        const shapeType =
          previewMode === "mobile" ? "phone-frame" : "browser-frame";
        const defaultProps =
          previewMode === "mobile" ? { w: 336, h: 656 } : { w: 800, h: 600 };

        editor.createShape({
          id: shapeId,
          type: shapeType,
          x: position.x,
          y: position.y,
          props: {
            screenId: newScreenId,
            path,
            ...defaultProps,
          },
          meta: {
            viewingUrl,
          },
        });

        screenToShapeMap.current.set(newScreenId, shapeId);

        // Notify parent of screen change
        notifyScreensChanged();
        debouncedSave();
      },
      [debouncedSave, notifyScreensChanged, previewMode, viewingUrl],
    );

    // Remove a screen
    const removeScreen = useCallback(
      (screenId: number) => {
        if (!editorRef.current) return;

        const shapeId = screenToShapeMap.current.get(screenId);
        if (shapeId) {
          editorRef.current.deleteShape(shapeId);
          screenToShapeMap.current.delete(screenId);
          notifyScreensChanged();
          debouncedSave();
        }
      },
      [debouncedSave, notifyScreensChanged],
    );

    // Set all screens (replace existing)
    const setScreens = useCallback(
      (screens: ScreenConfig[]) => {
        if (!editorRef.current) return;

        const editor = editorRef.current;

        // Delete all existing screen shapes
        const existingShapes = editor.getCurrentPageShapes();
        const screenShapeIds = existingShapes
          .filter((s) => s.type === "phone-frame" || s.type === "browser-frame")
          .map((s) => s.id);

        if (screenShapeIds.length > 0) {
          editor.deleteShapes(screenShapeIds);
        }

        screenToShapeMap.current.clear();

        // Create new shapes for each screen
        const shapeType =
          previewMode === "mobile" ? "phone-frame" : "browser-frame";
        const defaultProps =
          previewMode === "mobile" ? { w: 336, h: 656 } : { w: 800, h: 600 };

        screens.forEach((screen, index) => {
          const shapeId = createShapeId();
          const position = getDefaultPosition(index, previewMode);

          editor.createShape({
            id: shapeId,
            type: shapeType,
            x: position.x,
            y: position.y,
            props: {
              screenId: screen.id,
              path: screen.path,
              ...defaultProps,
            },
            meta: {
              viewingUrl,
            },
          });

          screenToShapeMap.current.set(screen.id, shapeId);
        });

        // Update screen ID counter
        if (screens.length > 0) {
          screenIdCounter.current =
            Math.max(...screens.map((s) => s.id), 0) + 1;
        }

        notifyScreensChanged();
        debouncedSave();
      },
      [debouncedSave, notifyScreensChanged, previewMode, viewingUrl],
    );

    // Zoom to fit all shapes
    const zoomToFit = useCallback(() => {
      if (!editorRef.current) return;
      editorRef.current.zoomToFit({ animation: { duration: 300 } });
    }, []);

    // Zoom to a specific screen
    const zoomToScreen = useCallback((screenId: number) => {
      if (!editorRef.current) return;

      const shapeId = screenToShapeMap.current.get(screenId);
      if (shapeId) {
        const shape = editorRef.current.getShape(shapeId);
        if (shape) {
          editorRef.current.zoomToBounds(
            editorRef.current.getShapePageBounds(shape)!,
            { animation: { duration: 300 } },
          );
        }
      }
    }, []);

    // Force refresh all iframes
    const forceRefresh = useCallback(() => {
      // This will be handled by updating the viewingUrl meta on all shapes
      if (!editorRef.current) return;

      const editor = editorRef.current;
      const shapes = editor.getCurrentPageShapes();

      for (const shape of shapes) {
        if (shape.type === "phone-frame" || shape.type === "browser-frame") {
          // Update the shape to trigger a re-render
          editor.updateShape({
            id: shape.id,
            type: shape.type,
            meta: {
              ...shape.meta,
              refreshKey: Date.now(),
            },
          });
        }
      }
    }, []);

    // Get current zoom level
    const getZoom = useCallback(() => {
      return editorRef.current?.getZoomLevel() ?? 1;
    }, []);

    // Set zoom level
    const setZoom = useCallback((zoom: number) => {
      if (!editorRef.current) return;
      editorRef.current.setCamera({
        ...editorRef.current.getCamera(),
        z: zoom,
      });
    }, []);

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        addScreen,
        removeScreen,
        setScreens,
        getState: getCanvasState,
        loadState: loadCanvasState,
        zoomToFit,
        zoomToScreen,
        forceRefresh,
        getZoom,
        setZoom,
      }),
      [
        addScreen,
        removeScreen,
        setScreens,
        getCanvasState,
        loadCanvasState,
        zoomToFit,
        zoomToScreen,
        forceRefresh,
        getZoom,
        setZoom,
      ],
    );

    // Handle editor mount
    const handleEditorMount = useCallback(
      (editor: Editor) => {
        editorRef.current = editor;

        // Configure editor for read-only mode if needed
        if (readOnly) {
          editor.updateInstanceState({ isReadonly: true });
        }

        // Load initial state if provided
        if (initialCanvasState) {
          loadCanvasState(initialCanvasState);
          setIsInitialized(true);
        } else {
          // Create initial shapes from initialScreens
          const shapeType =
            previewMode === "mobile" ? "phone-frame" : "browser-frame";
          const defaultProps =
            previewMode === "mobile" ? { w: 336, h: 656 } : { w: 800, h: 600 };

          initialScreens.forEach((screen, index) => {
            const shapeId = createShapeId();
            const position = getDefaultPosition(index, previewMode);

            editor.createShape({
              id: shapeId,
              type: shapeType,
              x: position.x,
              y: position.y,
              props: {
                screenId: screen.id,
                path: screen.path,
                ...defaultProps,
              },
              meta: {
                viewingUrl,
              },
            });

            screenToShapeMap.current.set(screen.id, shapeId);
          });

          // Zoom to fit initial shapes
          setTimeout(() => {
            editor.zoomToFit({ animation: { duration: 0 } });
          }, 100);

          setIsInitialized(true);
        }

        // Set up store listener for auto-save
        const unsubscribe = editor.store.listen(
          () => {
            debouncedSave();
          },
          { scope: "document" },
        );

        // Double-click to zoom to shape
        editor.on("event", (event) => {
          if (
            event.name === "double_click" &&
            event.target === "shape" &&
            "shape" in event
          ) {
            const shape = event.shape;
            if (shape) {
              const bounds = editor.getShapePageBounds(shape);
              if (bounds) {
                editor.zoomToBounds(bounds, {
                  animation: { duration: 300 },
                });
              }
            }
          }
        });

        return () => {
          unsubscribe();
        };
      },
      [
        readOnly,
        initialCanvasState,
        loadCanvasState,
        previewMode,
        initialScreens,
        viewingUrl,
        debouncedSave,
      ],
    );

    // Update viewingUrl on all shapes when it changes
    useEffect(() => {
      if (!editorRef.current || !isInitialized) return;

      const editor = editorRef.current;
      const shapes = editor.getCurrentPageShapes();

      for (const shape of shapes) {
        if (shape.type === "phone-frame" || shape.type === "browser-frame") {
          editor.updateShape({
            id: shape.id,
            type: shape.type,
            meta: {
              ...shape.meta,
              viewingUrl,
            },
          });
        }
      }
    }, [viewingUrl, isInitialized]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
      };
    }, []);

    return (
      <div
        className="preview-canvas-container"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        <Tldraw
          shapeUtils={customShapeUtils}
          hideUi
          inferDarkMode
          onMount={handleEditorMount}
        />
      </div>
    );
  },
);

PreviewCanvas.displayName = "PreviewCanvas";

export { PreviewCanvas };
export type { PreviewCanvasRef, PreviewCanvasProps };
