"use client";

import { memo } from "react";
import {
  MousePointer2,
  Hand,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type CanvasToolMode = "select" | "pan";

interface CanvasToolbarProps {
  toolMode: CanvasToolMode;
  onToolModeChange: (mode: CanvasToolMode) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  readOnly?: boolean;
}

/**
 * Floating toolbar for canvas controls - Figma-style
 */
export const CanvasToolbar = memo(function CanvasToolbar({
  toolMode,
  onToolModeChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  readOnly = false,
}: CanvasToolbarProps) {
  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-popover/95 backdrop-blur-sm border border-border rounded-lg shadow-lg px-1.5 py-1 z-50"
      style={{ pointerEvents: "auto" }}
    >
      {/* Tool Selection */}
      {!readOnly && (
        <>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onToolModeChange("select")}
                  className={`p-1.5 rounded-md transition-colors ${
                    toolMode === "select"
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <MousePointer2 className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Select (V)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onToolModeChange("pan")}
                  className={`p-1.5 rounded-md transition-colors ${
                    toolMode === "pan"
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <Hand className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Pan (H)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-5 w-px bg-border mx-1" />
        </>
      )}

      {/* Zoom Controls */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onZoomOut}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Zoom out</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <span className="text-xs text-muted-foreground font-mono w-12 text-center select-none">
        {Math.round(zoom * 100)}%
      </span>

      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onZoomIn}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Zoom in</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="h-5 w-px bg-border mx-1" />

      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onZoomToFit}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Zoom to fit</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
});
