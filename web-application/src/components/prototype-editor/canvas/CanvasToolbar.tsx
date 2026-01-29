"use client";

import { memo, useState } from "react";
import {
  MousePointer2,
  Hand,
  ZoomIn,
  ZoomOut,
  Maximize,
  Sparkles,
  FileText,
  GitCompare,
  LayoutGrid,
  Move,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GlobalAIAction, LayoutMode } from "./types";

export type CanvasToolMode = "select" | "pan";
export type { GlobalAIAction };

interface CanvasToolbarProps {
  toolMode: CanvasToolMode;
  onToolModeChange: (mode: CanvasToolMode) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  readOnly?: boolean;
  layoutMode?: LayoutMode;
  onLayoutModeChange?: (mode: LayoutMode) => void;
  onGlobalAIAction?: (action: GlobalAIAction) => void;
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
  layoutMode = "grid",
  onLayoutModeChange,
  onGlobalAIAction,
}: CanvasToolbarProps) {
  const [isAIMenuOpen, setIsAIMenuOpen] = useState(false);

  return (
    <div
      className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-popover/95 backdrop-blur-sm border border-border rounded-lg shadow-lg px-1.5 py-1 z-50"
      style={{ pointerEvents: "auto" }}
      role="toolbar"
      aria-label="Canvas controls"
    >
      {/* Layout Mode Toggle */}
      {!readOnly && onLayoutModeChange && (
        <>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onLayoutModeChange("grid")}
                  aria-label="Grid layout"
                  aria-pressed={layoutMode === "grid"}
                  className={`p-1.5 rounded-md transition-colors ${
                    layoutMode === "grid"
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Grid layout</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onLayoutModeChange("freeform")}
                  aria-label="Freeform layout"
                  aria-pressed={layoutMode === "freeform"}
                  className={`p-1.5 rounded-md transition-colors ${
                    layoutMode === "freeform"
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <Move className="w-4 h-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Freeform layout</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-5 w-px bg-border mx-1" aria-hidden="true" />
        </>
      )}

      {/* Tool Selection - only in freeform mode */}
      {!readOnly && layoutMode === "freeform" && (
        <>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onToolModeChange("select")}
                  aria-label="Select tool (V)"
                  aria-pressed={toolMode === "select"}
                  className={`p-1.5 rounded-md transition-colors ${
                    toolMode === "select"
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <MousePointer2 className="w-4 h-4" aria-hidden="true" />
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
                  aria-label="Pan tool (H)"
                  aria-pressed={toolMode === "pan"}
                  className={`p-1.5 rounded-md transition-colors ${
                    toolMode === "pan"
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <Hand className="w-4 h-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Pan (H)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-5 w-px bg-border mx-1" aria-hidden="true" />
        </>
      )}

      {/* Zoom Controls */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onZoomOut}
              aria-label="Zoom out"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <ZoomOut className="w-4 h-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Zoom out</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <span
        className="text-xs text-muted-foreground font-mono w-12 text-center select-none"
        aria-live="polite"
        aria-label={`Zoom level ${Math.round(zoom * 100)} percent`}
      >
        {Math.round(zoom * 100)}%
      </span>

      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onZoomIn}
              aria-label="Zoom in"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <ZoomIn className="w-4 h-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Zoom in</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="h-5 w-px bg-border mx-1" aria-hidden="true" />

      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onZoomToFit}
              aria-label="Zoom to fit all screens"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <Maximize className="w-4 h-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Zoom to fit</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* AI Actions */}
      {!readOnly && onGlobalAIAction && (
        <>
          <div className="h-5 w-px bg-border mx-1" aria-hidden="true" />
          <DropdownMenu open={isAIMenuOpen} onOpenChange={setIsAIMenuOpen}>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="AI Tools"
                      className="p-1.5 rounded-md text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 transition-colors"
                    >
                      <Sparkles className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>AI Tools</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent
              align="center"
              side="top"
              sideOffset={8}
              className="w-48"
            >
              <DropdownMenuItem
                onClick={() => {
                  onGlobalAIAction("generate-prd");
                  setIsAIMenuOpen(false);
                }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <FileText size={14} className="text-blue-400" aria-hidden="true" />
                <span>Generate PRD</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onGlobalAIAction("critique-designs");
                  setIsAIMenuOpen(false);
                }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <GitCompare size={14} className="text-green-400" aria-hidden="true" />
                <span>Critique designs</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
});
