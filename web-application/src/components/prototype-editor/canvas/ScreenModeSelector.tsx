"use client";

import { memo } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { PreviewMode } from "./types";

interface ScreenModeSelectorProps {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
  disabled?: boolean;
}

/**
 * Small mode selector that appears on each screen frame
 */
export const ScreenModeSelector = memo(function ScreenModeSelector({
  mode,
  onChange,
  disabled = false,
}: ScreenModeSelectorProps) {
  const modes: { value: PreviewMode; icon: typeof Smartphone; label: string }[] = [
    { value: "mobile", icon: Smartphone, label: "Mobile" },
    { value: "tablet", icon: Tablet, label: "Tablet" },
    { value: "web", icon: Monitor, label: "Desktop" },
  ];

  return (
    <div
      className="flex items-center gap-0.5 bg-popover/95 backdrop-blur-sm border border-border rounded-md p-0.5"
      style={{ pointerEvents: disabled ? "none" : "auto" }}
    >
      {modes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={(e) => {
            e.stopPropagation();
            onChange(value);
          }}
          disabled={disabled}
          title={label}
          className={`p-1 rounded transition-colors ${
            mode === value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Icon className="w-3 h-3" />
        </button>
      ))}
    </div>
  );
});
