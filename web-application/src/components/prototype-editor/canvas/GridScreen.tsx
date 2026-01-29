"use client";

import {
  ReactNode,
  useCallback,
  useRef,
  useState,
  MouseEvent as ReactMouseEvent,
} from "react";
import { Sparkles, Wand2, Lightbulb, Type } from "lucide-react";
import { ScreenModeSelector } from "./ScreenModeSelector";
import { MIN_DIMENSIONS } from "./constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PreviewMode, AIActionType } from "./types";

interface GridScreenProps {
  children: ReactNode;
  width: number;
  height: number;
  readOnly: boolean;
  previewMode: PreviewMode;
  screenId: number;
  path: string;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onResize: (deltaWidth: number, deltaHeight: number) => void;
  onResizeEnd: () => void;
  onAIAction?: (screenId: number, path: string, action: AIActionType) => void;
}

/**
 * Wrapper component for screens in grid layout mode
 * Supports resizing and mode switching but not free-form dragging
 */
export function GridScreen({
  children,
  width,
  height,
  readOnly,
  previewMode,
  screenId,
  path,
  onPreviewModeChange,
  onResize,
  onResizeEnd,
  onAIAction,
}: GridScreenProps) {
  const isResizing = useRef(false);
  const lastPosition = useRef({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isAIMenuOpen, setIsAIMenuOpen] = useState(false);

  const handleAIAction = useCallback(
    (action: AIActionType) => {
      onAIAction?.(screenId, path, action);
      setIsAIMenuOpen(false);
    },
    [screenId, path, onAIAction]
  );

  const handleResizeMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (e.button !== 0 || readOnly) return;

      e.preventDefault();
      e.stopPropagation();

      isResizing.current = true;
      lastPosition.current = { x: e.clientX, y: e.clientY };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizing.current) return;

        const deltaX = moveEvent.clientX - lastPosition.current.x;
        const deltaY = moveEvent.clientY - lastPosition.current.y;

        onResize(deltaX, deltaY);

        lastPosition.current = { x: moveEvent.clientX, y: moveEvent.clientY };
      };

      const handleMouseUp = () => {
        if (isResizing.current) {
          isResizing.current = false;
          onResizeEnd();
        }
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
      };

      document.body.style.cursor = "nwse-resize";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [readOnly, onResize, onResizeEnd]
  );

  return (
    <div
      className="grid-screen-wrapper"
      style={{
        position: "relative",
        width: width,
        height: height,
        minWidth: MIN_DIMENSIONS.WIDTH,
        minHeight: MIN_DIMENSIONS.HEIGHT,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Mode selector and AI button in top-right corner */}
      {!readOnly && (
        <div
          className="screen-toolbar"
          style={{
            position: "absolute",
            top: -36,
            right: 0,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <ScreenModeSelector
            mode={previewMode}
            onChange={onPreviewModeChange}
            disabled={readOnly}
          />
          {/* AI Actions button */}
          <DropdownMenu open={isAIMenuOpen} onOpenChange={setIsAIMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/90 hover:bg-violet-500 text-white text-xs font-medium transition-colors border border-violet-400/30"
                title="AI Actions"
              >
                <Sparkles className="w-3 h-3" />
                <span>AI</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={4}
              className="w-52"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuItem
                onClick={() => handleAIAction("redesign")}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Wand2 size={14} className="text-purple-400" />
                <span>Redesign this screen</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAIAction("suggest-improvements")}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Lightbulb size={14} className="text-yellow-400" />
                <span>Suggest improvements</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAIAction("copy-alternatives")}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Type size={14} className="text-blue-400" />
                <span>Generate copy alternatives</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {children}

      {/* Resize handle in bottom-right corner */}
      {!readOnly && isHovered && (
        <div
          className="resize-handle"
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 16,
            height: 16,
            cursor: "nwse-resize",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(59, 130, 246, 0.9)",
            borderRadius: 3,
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
          }}
          onMouseDown={handleResizeMouseDown}
        >
          {/* Diagonal resize icon */}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            style={{ opacity: 0.9 }}
          >
            <path
              d="M9 1L1 9M9 5L5 9M9 9L9 9"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
