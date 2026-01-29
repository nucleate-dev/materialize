"use client";

import { memo, useState, useCallback } from "react";
import {
  Sparkles,
  Wand2,
  Lightbulb,
  Type,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AIActionType } from "./types";

export type { AIActionType };

export interface ScreenActionsProps {
  screenId: number;
  path: string;
  onAIAction?: (screenId: number, path: string, action: AIActionType) => void;
  disabled?: boolean;
}

/**
 * Quick actions overlay for screen frames.
 * Shows on hover with AI actions menu.
 */
export const ScreenActions = memo(function ScreenActions({
  screenId,
  path,
  onAIAction,
  disabled = false,
}: ScreenActionsProps) {
  const [isAIMenuOpen, setIsAIMenuOpen] = useState(false);

  const handleAIAction = useCallback(
    (action: AIActionType) => {
      onAIAction?.(screenId, path, action);
      setIsAIMenuOpen(false);
    },
    [screenId, path, onAIAction]
  );

  if (disabled) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="screen-actions"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          gap: 4,
          zIndex: 35,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* AI Actions dropdown */}
        <DropdownMenu open={isAIMenuOpen} onOpenChange={setIsAIMenuOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  className="screen-action-button"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    backgroundColor: "rgba(139, 92, 246, 0.8)",
                    border: "1px solid rgba(139, 92, 246, 0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(139, 92, 246, 0.95)";
                    e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.6)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isAIMenuOpen) {
                      e.currentTarget.style.backgroundColor = "rgba(139, 92, 246, 0.8)";
                      e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.4)";
                    }
                  }}
                >
                  <Sparkles size={14} color="white" strokeWidth={2} />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <p className="text-xs">AI Actions</p>
            </TooltipContent>
          </Tooltip>

          <DropdownMenuContent
            align="end"
            sideOffset={4}
            className="w-52"
            style={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
            }}
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
    </TooltipProvider>
  );
});
