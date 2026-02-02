"use client";

import { memo, useState, useCallback, useMemo } from "react";
import { ElaboratePhoneFrame } from "./ElaboratePhoneFrame";
import { ElaborateTabletFrame } from "./ElaborateTabletFrame";
import { ElaborateWebFrame } from "./ElaborateWebFrame";
import type { ScreenState, AIActionType } from "./types";

interface GridModeRendererProps {
  screens: ScreenState[];
  viewingUrl: string;
  refreshKey: number;
  readOnly?: boolean;
  availableRoutes?: Array<{ route: string; group?: string }>;
  onScreenPathChange?: (screenId: number, path: string) => void;
  onScreenRemove?: (screenId: number) => void;
  onAIAction?: (screenId: number, path: string, action: AIActionType) => void;
  onIframeLoad?: () => void;
  onIframeError?: () => void;
}

/**
 * Grid Mode Renderer - renders screens with elaborate frames in a responsive grid layout.
 * Uses the same visual style as Regular Mode (NucleateRenderSection) but with
 * the simplified grid layout from Canvas Mode.
 *
 * Features:
 * - Elaborate phone/tablet/web frames with full controls
 * - URL bar with path editing and route suggestions
 * - Refresh/remove buttons
 * - AI Actions button (sparkles) on each screen
 * - Traffic lights for web frames (mobile-size toggle, fullscreen toggle)
 * - Responsive grid layout
 */
export const GridModeRenderer = memo(function GridModeRenderer({
  screens,
  viewingUrl,
  refreshKey,
  readOnly = false,
  availableRoutes = [],
  onScreenPathChange,
  onScreenRemove,
  onAIAction,
  onIframeLoad,
  onIframeError,
}: GridModeRendererProps) {
  // Track per-screen state for web frames
  const [webScreenStates, setWebScreenStates] = useState<
    Record<number, { isMobileSize: boolean; isFullScreen: boolean }>
  >({});

  // Track per-screen refresh keys for individual refresh
  const [screenRefreshKeys, setScreenRefreshKeys] = useState<Record<number, number>>({});

  // Get screen state with defaults
  const getWebScreenState = useCallback(
    (screenId: number) => {
      return (
        webScreenStates[screenId] || { isMobileSize: false, isFullScreen: false }
      );
    },
    [webScreenStates]
  );

  // Toggle mobile size for a web screen
  const handleMobileSizeToggle = useCallback((screenId: number) => {
    setWebScreenStates((prev) => ({
      ...prev,
      [screenId]: {
        ...prev[screenId],
        isMobileSize: !prev[screenId]?.isMobileSize,
        isFullScreen: prev[screenId]?.isFullScreen || false,
      },
    }));
  }, []);

  // Toggle fullscreen for a web screen
  const handleFullScreenToggle = useCallback((screenId: number) => {
    setWebScreenStates((prev) => ({
      ...prev,
      [screenId]: {
        ...prev[screenId],
        isMobileSize: prev[screenId]?.isMobileSize || false,
        isFullScreen: !prev[screenId]?.isFullScreen,
      },
    }));
  }, []);

  // Handle individual screen refresh
  const handleScreenRefresh = useCallback((screenId: number) => {
    setScreenRefreshKeys((prev) => ({
      ...prev,
      [screenId]: (prev[screenId] || 0) + 1,
    }));
  }, []);

  // Calculate scaled mobile size based on screen count
  const scaledMobileSize = useMemo(() => {
    const mobileScreens = screens.filter(
      (s) => s.previewMode === "mobile" || s.previewMode === "tablet"
    );
    const count = mobileScreens.length;

    // Base dimensions
    const baseWidth = 320;
    const baseHeight = 640;

    // Scale factor based on count
    let scale = 1;
    if (count >= 4) {
      scale = 0.7;
    } else if (count >= 3) {
      scale = 0.8;
    } else if (count >= 2) {
      scale = 0.9;
    }

    return {
      width: Math.round(baseWidth * scale),
      height: Math.round(baseHeight * scale),
    };
  }, [screens]);

  // Calculate tablet size based on screen count
  const scaledTabletSize = useMemo(() => {
    const tabletScreens = screens.filter((s) => s.previewMode === "tablet");
    const count = tabletScreens.length;

    // Base dimensions
    const baseWidth = 768;
    const baseHeight = 1024;

    // Scale factor based on count
    let scale = 1;
    if (count >= 3) {
      scale = 0.6;
    } else if (count >= 2) {
      scale = 0.75;
    }

    return {
      width: Math.round(baseWidth * scale),
      height: Math.round(baseHeight * scale),
    };
  }, [screens]);

  // Check if there are any fullscreen web screens
  const hasFullScreenWeb = useMemo(() => {
    return screens.some((s) => {
      if (s.previewMode !== "web") return false;
      const state = getWebScreenState(s.id);
      return state.isFullScreen;
    });
  }, [screens, getWebScreenState]);

  // Separate screens by type for different layout strategies
  const mobileScreens = screens.filter((s) => s.previewMode === "mobile");
  const tabletScreens = screens.filter((s) => s.previewMode === "tablet");
  const webScreens = screens.filter((s) => s.previewMode === "web");

  // Render individual screen
  const renderScreen = useCallback(
    (screen: ScreenState) => {
      const screenRefreshKey =
        refreshKey + (screenRefreshKeys[screen.id] || 0);
      const showRemove = screens.length > 1;

      if (screen.previewMode === "mobile") {
        return (
          <div
            key={screen.id}
            className="flex flex-col items-center gap-2 pt-14"
          >
            <ElaboratePhoneFrame
              screenId={screen.id}
              path={screen.path}
              viewingUrl={viewingUrl}
              width={scaledMobileSize.width + 16}
              height={scaledMobileSize.height + 16}
              refreshKey={screenRefreshKey}
              onAIAction={onAIAction}
              onLoad={onIframeLoad}
              onError={onIframeError}
              availableRoutes={availableRoutes}
              onPathChange={onScreenPathChange}
              onRefresh={handleScreenRefresh}
              onRemove={onScreenRemove}
              readOnly={readOnly}
              showRemoveButton={showRemove}
            />
          </div>
        );
      }

      if (screen.previewMode === "tablet") {
        return (
          <div
            key={screen.id}
            className="flex flex-col items-center gap-2 pt-14"
          >
            <ElaborateTabletFrame
              screenId={screen.id}
              path={screen.path}
              viewingUrl={viewingUrl}
              width={scaledTabletSize.width + 24}
              height={scaledTabletSize.height + 24}
              refreshKey={screenRefreshKey}
              onAIAction={onAIAction}
              onLoad={onIframeLoad}
              onError={onIframeError}
              availableRoutes={availableRoutes}
              onPathChange={onScreenPathChange}
              onRefresh={handleScreenRefresh}
              onRemove={onScreenRemove}
              readOnly={readOnly}
              showRemoveButton={showRemove}
            />
          </div>
        );
      }

      // Web frame
      const webState = getWebScreenState(screen.id);
      return (
        <div
          key={screen.id}
          className="flex-1 min-w-0"
          style={{
            minHeight: 400,
            display: webState.isFullScreen ? "contents" : undefined,
          }}
        >
          <ElaborateWebFrame
            screenId={screen.id}
            path={screen.path}
            viewingUrl={viewingUrl}
            width={screen.position.width}
            height={screen.position.height}
            refreshKey={screenRefreshKey}
            onAIAction={onAIAction}
            onLoad={onIframeLoad}
            onError={onIframeError}
            availableRoutes={availableRoutes}
            onPathChange={onScreenPathChange}
            onRefresh={handleScreenRefresh}
            onRemove={onScreenRemove}
            readOnly={readOnly}
            showRemoveButton={showRemove}
            isMobileSize={webState.isMobileSize}
            onMobileSizeToggle={() => handleMobileSizeToggle(screen.id)}
            isFullScreen={webState.isFullScreen}
            onFullScreenToggle={() => handleFullScreenToggle(screen.id)}
          />
        </div>
      );
    },
    [
      refreshKey,
      screenRefreshKeys,
      screens.length,
      viewingUrl,
      scaledMobileSize,
      scaledTabletSize,
      onAIAction,
      onIframeLoad,
      onIframeError,
      availableRoutes,
      onScreenPathChange,
      handleScreenRefresh,
      onScreenRemove,
      readOnly,
      getWebScreenState,
      handleMobileSizeToggle,
      handleFullScreenToggle,
    ]
  );

  // Check if all screens are mobile/tablet (device frames)
  const hasOnlyDeviceFrames = webScreens.length === 0;

  // Check if all screens are web frames
  const hasOnlyWebFrames = mobileScreens.length === 0 && tabletScreens.length === 0;

  // Render layout based on screen types
  if (hasOnlyDeviceFrames) {
    // Mobile/tablet only - centered flex layout
    return (
      <div className="w-full h-full overflow-auto bg-background">
        <div className="h-full flex items-center justify-center">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-12 p-8">
            {screens.map(renderScreen)}
          </div>
        </div>
      </div>
    );
  }

  if (hasOnlyWebFrames) {
    // Web only - grid layout
    const columnCount = webScreens.length === 1 ? 1 : Math.min(webScreens.length, 2);
    const gridTemplate = columnCount === 1 ? "1fr" : "repeat(2, 1fr)";

    return (
      <div className="w-full h-full overflow-auto bg-background p-4 relative">
        <div
          className="gap-4 h-full relative w-full"
          style={{
            display: hasFullScreenWeb ? "block" : "grid",
            gridTemplateColumns: hasFullScreenWeb ? undefined : gridTemplate,
          }}
        >
          {webScreens.map(renderScreen)}
        </div>
      </div>
    );
  }

  // Mixed layout - device frames at top, web frames below
  return (
    <div className="w-full h-full overflow-auto bg-background">
      {/* Device frames section */}
      {(mobileScreens.length > 0 || tabletScreens.length > 0) && (
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-12 px-8">
            {mobileScreens.map(renderScreen)}
            {tabletScreens.map(renderScreen)}
          </div>
        </div>
      )}

      {/* Web frames section */}
      {webScreens.length > 0 && (
        <div className="p-4 relative">
          <div
            className="gap-4 relative w-full"
            style={{
              display: hasFullScreenWeb ? "block" : "grid",
              gridTemplateColumns: hasFullScreenWeb
                ? undefined
                : webScreens.length === 1
                  ? "1fr"
                  : "repeat(2, 1fr)",
              minHeight: 400,
            }}
          >
            {webScreens.map(renderScreen)}
          </div>
        </div>
      )}
    </div>
  );
});
