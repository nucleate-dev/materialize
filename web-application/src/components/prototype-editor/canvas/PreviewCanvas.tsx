"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { PhoneFrame } from "./PhoneFrame";
import { BrowserFrame } from "./BrowserFrame";
import { DraggableScreen } from "./DraggableScreen";
import { GridLayout } from "./GridLayout";
import { GridScreen } from "./GridScreen";
import { CanvasToolbar, type CanvasToolMode } from "./CanvasToolbar";
import { usePanZoom } from "./usePanZoom";
import { getDefaultPosition, getDefaultDimensions } from "./utils";
import { CANVAS, MIN_DIMENSIONS } from "./constants";
import type {
  CanvasStateData,
  LayoutMode,
  PreviewCanvasProps,
  PreviewCanvasRef,
  PreviewMode,
  ScreenConfig,
  ScreenState,
} from "./types";

const PreviewCanvas = forwardRef<PreviewCanvasRef, PreviewCanvasProps>(
  (
    {
      viewingUrl,
      previewMode,
      initialScreens = [{ id: 0, path: "/" }],
      initialCanvasState,
      onCanvasStateChange,
      onScreensChange,
      readOnly = false,
      onScreenshot,
      onClone,
      onAIAction,
      onGlobalAIAction,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [screens, setScreensState] = useState<ScreenState[]>([]);
    const [isInitialized, setIsInitialized] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [toolMode, setToolMode] = useState<CanvasToolMode>("select");
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const [layoutMode, setLayoutMode] = useState<LayoutMode>(
      initialCanvasState?.layoutMode ?? "grid"
    );
    const [screenOrder, setScreenOrder] = useState<number[]>(
      initialCanvasState?.screenOrder ?? []
    );
    const screenIdCounter = useRef(
      Math.max(...initialScreens.map((s) => s.id), 0) + 1
    );
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Effective tool mode (space key temporarily activates pan)
    const effectiveToolMode = isSpacePressed ? "pan" : toolMode;

    // Ensure screenOrder is valid (contains all screen IDs)
    const validScreenOrder = useMemo(() => {
      const screenIds = new Set(screens.map(s => s.id));
      const orderedIds = screenOrder.filter(id => screenIds.has(id));
      // Add any screens not in the order (e.g., newly added)
      const missingIds = screens
        .filter(s => !screenOrder.includes(s.id))
        .map(s => s.id);
      return [...orderedIds, ...missingIds];
    }, [screens, screenOrder]);

    // Initialize pan/zoom
    const {
      zoom,
      camera,
      setZoom: setPanZoom,
      setCamera,
      zoomIn,
      zoomOut,
      zoomToFit: panZoomToFit,
      zoomToBounds,
      getTransformStyle,
      startPan,
    } = usePanZoom({
      containerRef,
      initialZoom: initialCanvasState?.zoom ?? 1,
      initialCamera: initialCanvasState?.camera ?? { x: 0, y: 0 },
    });

    // Get current canvas state for persistence
    const getCanvasState = useCallback((): CanvasStateData | null => {
      if (!isInitialized) return null;

      return {
        screens,
        zoom,
        camera,
        previewMode,
        lastModified: new Date().toISOString(),
        layoutMode,
        screenOrder,
      };
    }, [screens, zoom, camera, previewMode, isInitialized, layoutMode, screenOrder]);

    // Debounced state change handler
    const debouncedSave = useCallback(() => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        if (onCanvasStateChange) {
          const state = getCanvasState();
          if (state) {
            onCanvasStateChange(state);
          }
        }
      }, CANVAS.SAVE_DEBOUNCE_MS);
    }, [getCanvasState, onCanvasStateChange]);

    // Notify parent of screen changes
    const notifyScreensChanged = useCallback(
      (currentScreens: ScreenState[]) => {
        if (onScreensChange) {
          const configs: ScreenConfig[] = currentScreens.map((s) => ({
            id: s.id,
            path: s.path,
          }));
          onScreensChange(configs);
        }
        debouncedSave();
      },
      [onScreensChange, debouncedSave]
    );

    // Calculate bounds of all screens
    const calculateBounds = useCallback((screenList: ScreenState[]) => {
      if (screenList.length === 0) {
        return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const screen of screenList) {
        minX = Math.min(minX, screen.position.x);
        minY = Math.min(minY, screen.position.y);
        maxX = Math.max(maxX, screen.position.x + screen.position.width);
        maxY = Math.max(maxY, screen.position.y + screen.position.height);
      }

      return { minX, minY, maxX, maxY };
    }, []);

    // Derive screen order from positions (left-to-right, top-to-bottom)
    const deriveOrderFromPositions = useCallback((screenList: ScreenState[]): number[] => {
      if (screenList.length === 0) return [];

      // Sort by y first (row), then by x (column within row)
      // Use a tolerance for y to group items in the same row
      const ROW_TOLERANCE = 50;

      const sorted = [...screenList].sort((a, b) => {
        const rowA = Math.floor(a.position.y / ROW_TOLERANCE);
        const rowB = Math.floor(b.position.y / ROW_TOLERANCE);
        if (rowA !== rowB) return rowA - rowB;
        return a.position.x - b.position.x;
      });

      return sorted.map(s => s.id);
    }, []);

    // Handle layout mode change
    const handleLayoutModeChange = useCallback((newMode: LayoutMode) => {
      if (newMode === layoutMode) return;

      if (newMode === "grid") {
        // Switching to grid: derive order from current positions
        const newOrder = deriveOrderFromPositions(screens);
        setScreenOrder(newOrder);
      } else {
        // Switching to freeform: keep current grid positions as absolute positions
        // The screens already have position data, no change needed
      }

      setLayoutMode(newMode);
      debouncedSave();
    }, [layoutMode, screens, deriveOrderFromPositions, debouncedSave]);

    // Handle screen order change (from grid drag-to-reorder)
    const handleReorder = useCallback((newOrder: number[]) => {
      setScreenOrder(newOrder);
      debouncedSave();
    }, [debouncedSave]);

    // Load canvas state from persistence
    const loadCanvasState = useCallback(
      (state: CanvasStateData) => {
        // Migrate old state format: add previewMode to screens that don't have it
        const migratedScreens = state.screens.map((screen) => ({
          ...screen,
          previewMode: screen.previewMode || state.previewMode || previewMode,
        }));
        setScreensState(migratedScreens);
        setPanZoom(state.zoom);
        setCamera(state.camera);

        // Load layout mode (default to grid for new/migrated states)
        setLayoutMode(state.layoutMode ?? "grid");

        // Load or derive screen order
        if (state.screenOrder && state.screenOrder.length > 0) {
          setScreenOrder(state.screenOrder);
        } else {
          // Derive order from positions for migrated states
          const derivedOrder = deriveOrderFromPositions(migratedScreens);
          setScreenOrder(derivedOrder);
        }

        // Update screen ID counter
        if (state.screens.length > 0) {
          screenIdCounter.current =
            Math.max(...state.screens.map((s) => s.id), 0) + 1;
        }
      },
      [setPanZoom, setCamera, previewMode, deriveOrderFromPositions]
    );

    // Add a new screen
    const addScreen = useCallback(
      (path: string) => {
        const newScreenId = screenIdCounter.current++;
        const dimensions = getDefaultDimensions(previewMode);
        const position = getDefaultPosition(screens.length, previewMode);

        const newScreen: ScreenState = {
          id: newScreenId,
          path,
          previewMode,
          position: {
            x: position.x,
            y: position.y,
            width: dimensions.width,
            height: dimensions.height,
          },
        };

        setScreensState((prev) => {
          const updated = [...prev, newScreen];
          notifyScreensChanged(updated);
          return updated;
        });

        // Add to screen order (append to end)
        setScreenOrder((prev) => [...prev, newScreenId]);
      },
      [screens.length, previewMode, notifyScreensChanged]
    );

    // Remove a screen
    const removeScreen = useCallback(
      (screenId: number) => {
        setScreensState((prev) => {
          const updated = prev.filter((s) => s.id !== screenId);
          notifyScreensChanged(updated);
          return updated;
        });

        // Remove from screen order
        setScreenOrder((prev) => prev.filter((id) => id !== screenId));
      },
      [notifyScreensChanged]
    );

    // Set all screens (replace existing)
    const setScreens = useCallback(
      (screenConfigs: ScreenConfig[]) => {
        const dimensions = getDefaultDimensions(previewMode);
        const newScreens: ScreenState[] = screenConfigs.map((config, index) => {
          const position = getDefaultPosition(index, previewMode);
          return {
            id: config.id,
            path: config.path,
            previewMode,
            position: {
              x: position.x,
              y: position.y,
              width: dimensions.width,
              height: dimensions.height,
            },
          };
        });

        setScreensState(newScreens);

        // Update screen order to match new screens
        setScreenOrder(screenConfigs.map((s) => s.id));

        // Update screen ID counter
        if (screenConfigs.length > 0) {
          screenIdCounter.current =
            Math.max(...screenConfigs.map((s) => s.id), 0) + 1;
        }

        notifyScreensChanged(newScreens);
      },
      [previewMode, notifyScreensChanged]
    );

    // Zoom to fit all screens
    const zoomToFit = useCallback(() => {
      const bounds = calculateBounds(screens);
      panZoomToFit(bounds);
    }, [screens, calculateBounds, panZoomToFit]);

    // Zoom to a specific screen
    const zoomToScreen = useCallback(
      (screenId: number) => {
        const screen = screens.find((s) => s.id === screenId);
        if (screen) {
          const bounds = {
            minX: screen.position.x,
            minY: screen.position.y,
            maxX: screen.position.x + screen.position.width,
            maxY: screen.position.y + screen.position.height,
          };
          zoomToBounds(bounds);
        }
      },
      [screens, zoomToBounds]
    );

    // Force refresh all iframes
    const forceRefresh = useCallback(() => {
      setRefreshKey((prev) => prev + 1);
    }, []);

    // Get current zoom level
    const getZoom = useCallback(() => {
      return zoom;
    }, [zoom]);

    // Set zoom level
    const setZoom = useCallback(
      (newZoom: number) => {
        setPanZoom(newZoom);
        debouncedSave();
      },
      [setPanZoom, debouncedSave]
    );

    // Handle screen drag
    const handleScreenDrag = useCallback(
      (screenId: number, deltaX: number, deltaY: number) => {
        setScreensState((prev) =>
          prev.map((s) =>
            s.id === screenId
              ? {
                  ...s,
                  position: {
                    ...s.position,
                    x: s.position.x + deltaX,
                    y: s.position.y + deltaY,
                  },
                }
              : s
          )
        );
      },
      []
    );

    // Handle screen drag end
    const handleScreenDragEnd = useCallback(() => {
      debouncedSave();
    }, [debouncedSave]);

    // Handle screen resize
    const handleScreenResize = useCallback(
      (screenId: number, deltaWidth: number, deltaHeight: number) => {
        setScreensState((prev) =>
          prev.map((s) =>
            s.id === screenId
              ? {
                  ...s,
                  position: {
                    ...s.position,
                    width: Math.max(MIN_DIMENSIONS.WIDTH, s.position.width + deltaWidth),
                    height: Math.max(MIN_DIMENSIONS.HEIGHT, s.position.height + deltaHeight),
                  },
                }
              : s
          )
        );
      },
      []
    );

    // Handle screen resize end
    const handleScreenResizeEnd = useCallback(() => {
      debouncedSave();
    }, [debouncedSave]);

    // Handle double-click on screen
    const handleScreenDoubleClick = useCallback(
      (screenId: number) => {
        zoomToScreen(screenId);
      },
      [zoomToScreen]
    );

    // Handle screen preview mode change
    const handleScreenPreviewModeChange = useCallback(
      (screenId: number, newMode: PreviewMode) => {
        const newDimensions = getDefaultDimensions(newMode);
        setScreensState((prev) =>
          prev.map((s) =>
            s.id === screenId
              ? {
                  ...s,
                  previewMode: newMode,
                  position: {
                    ...s.position,
                    width: newDimensions.width,
                    height: newDimensions.height,
                  },
                }
              : s
          )
        );
        debouncedSave();
      },
      [debouncedSave]
    );

    // Handle mouse down on canvas
    const handleCanvasMouseDown = useCallback(
      (e: React.MouseEvent) => {
        // In pan mode, start panning from anywhere
        if (effectiveToolMode === "pan") {
          startPan(e);
          return;
        }

        // In select mode, only pan if clicking directly on background
        if (e.target === e.currentTarget) {
          startPan(e);
        }
      },
      [effectiveToolMode, startPan]
    );

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
      ]
    );

    // Keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore if typing in an input
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }

        switch (e.key.toLowerCase()) {
          case "v":
            setToolMode("select");
            break;
          case "h":
            setToolMode("pan");
            break;
          case " ":
            e.preventDefault();
            setIsSpacePressed(true);
            break;
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === " ") {
          setIsSpacePressed(false);
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, []);

    // Initialize screens on mount
    useEffect(() => {
      if (isInitialized) return;

      // Check if initialCanvasState has valid screens
      const hasValidCanvasState =
        initialCanvasState &&
        initialCanvasState.screens &&
        initialCanvasState.screens.length > 0;

      let screensToUse: ScreenState[];

      if (hasValidCanvasState) {
        // Load from saved state
        loadCanvasState(initialCanvasState);
        screensToUse = initialCanvasState.screens.map((screen) => ({
          ...screen,
          previewMode: screen.previewMode || initialCanvasState.previewMode || previewMode,
        }));
      } else {
        // Create initial screens from props, or use a default screen if none provided
        const dimensions = getDefaultDimensions(previewMode);
        const screensToCreate = initialScreens.length > 0
          ? initialScreens
          : [{ id: 0, path: "/" }];
        screensToUse = screensToCreate.map((config, index) => {
          const position = getDefaultPosition(index, previewMode);
          return {
            id: config.id,
            path: config.path,
            previewMode,
            position: {
              x: position.x,
              y: position.y,
              width: dimensions.width,
              height: dimensions.height,
            },
          };
        });
        setScreensState(screensToUse);
        // Initialize screen order
        setScreenOrder(screensToCreate.map((s) => s.id));
      }

      // Zoom to fit after initial load - wait for container to have dimensions
      const attemptZoomToFit = (attempts = 0) => {
        const container = containerRef.current;
        if (!container) {
          if (attempts < 10) {
            setTimeout(() => attemptZoomToFit(attempts + 1), 50);
          }
          return;
        }

        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const bounds = calculateBounds(screensToUse);
          panZoomToFit(bounds);
        } else if (attempts < 10) {
          // Container not ready yet, retry
          setTimeout(() => attemptZoomToFit(attempts + 1), 50);
        }
      };

      // Start attempting after a brief delay to allow initial render
      setTimeout(() => attemptZoomToFit(), 50);

      setIsInitialized(true);
    }, [
      isInitialized,
      initialCanvasState,
      initialScreens,
      previewMode,
      loadCanvasState,
      calculateBounds,
      panZoomToFit,
    ]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
      };
    }, []);

    // Render frame based on screen's preview mode
    const renderFrame = (screen: ScreenState) => {
      const frameProps = {
        screenId: screen.id,
        path: screen.path,
        viewingUrl,
        width: screen.position.width,
        height: screen.position.height,
        refreshKey,
        onScreenshot,
        onClone,
        onAIAction,
        showActions: !readOnly,
      };

      if (screen.previewMode === "mobile" || screen.previewMode === "tablet") {
        return <PhoneFrame {...frameProps} />;
      }
      return <BrowserFrame {...frameProps} />;
    };

    // Determine cursor based on tool mode
    const getCursor = () => {
      if (readOnly) return "default";
      if (effectiveToolMode === "pan") return "grab";
      return "default";
    };

    // Render a screen in grid mode
    const renderGridScreen = (screen: ScreenState) => (
      <GridScreen
        key={screen.id}
        width={screen.position.width}
        height={screen.position.height}
        readOnly={readOnly}
        previewMode={screen.previewMode}
        onPreviewModeChange={(mode) =>
          handleScreenPreviewModeChange(screen.id, mode)
        }
        onResize={(deltaWidth, deltaHeight) =>
          handleScreenResize(screen.id, deltaWidth, deltaHeight)
        }
        onResizeEnd={handleScreenResizeEnd}
      >
        {renderFrame(screen)}
      </GridScreen>
    );

    return (
      <div
        ref={containerRef}
        className="preview-canvas-container"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: layoutMode === "grid" ? "auto" : "hidden",
          backgroundColor: "hsl(var(--background))",
          cursor: getCursor(),
        }}
        onMouseDown={layoutMode === "freeform" ? handleCanvasMouseDown : undefined}
      >
        {layoutMode === "grid" ? (
          /* Grid layout mode */
          <GridLayout
            screens={screens}
            screenOrder={validScreenOrder}
            zoom={zoom}
            readOnly={readOnly}
            onReorder={handleReorder}
            onScreenResize={handleScreenResize}
            onScreenResizeEnd={handleScreenResizeEnd}
            onScreenPreviewModeChange={handleScreenPreviewModeChange}
            renderScreen={renderGridScreen}
          />
        ) : (
          /* Freeform layout mode */
          <div
            className="preview-canvas-content"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              ...getTransformStyle(),
            }}
          >
            {screens.map((screen) => (
              <DraggableScreen
                key={screen.id}
                x={screen.position.x}
                y={screen.position.y}
                width={screen.position.width}
                height={screen.position.height}
                zoom={zoom}
                readOnly={readOnly || effectiveToolMode === "pan"}
                previewMode={screen.previewMode}
                onPreviewModeChange={(mode) =>
                  handleScreenPreviewModeChange(screen.id, mode)
                }
                onDrag={(deltaX, deltaY) =>
                  handleScreenDrag(screen.id, deltaX, deltaY)
                }
                onDragEnd={handleScreenDragEnd}
                onResize={(deltaWidth, deltaHeight) =>
                  handleScreenResize(screen.id, deltaWidth, deltaHeight)
                }
                onResizeEnd={handleScreenResizeEnd}
                onDoubleClick={() => handleScreenDoubleClick(screen.id)}
              >
                {renderFrame(screen)}
              </DraggableScreen>
            ))}
          </div>
        )}

        {/* Floating Toolbar */}
        <CanvasToolbar
          toolMode={toolMode}
          onToolModeChange={setToolMode}
          zoom={zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomToFit={zoomToFit}
          readOnly={readOnly}
          layoutMode={layoutMode}
          onLayoutModeChange={handleLayoutModeChange}
          onGlobalAIAction={onGlobalAIAction}
        />
      </div>
    );
  }
);

PreviewCanvas.displayName = "PreviewCanvas";

export { PreviewCanvas };
export type { PreviewCanvasRef, PreviewCanvasProps };
