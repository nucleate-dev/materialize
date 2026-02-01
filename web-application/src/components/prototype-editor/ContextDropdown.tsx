"use client";

import { useEffect, useRef } from "react";

interface ContextDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ContextDropdown({ isOpen, onClose }: ContextDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Add a small delay to prevent immediate close from the button click
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full mb-2 right-0 w-64 bg-background border border-border rounded-lg shadow-lg p-3 z-50"
    >
      <div className="text-sm font-medium text-foreground mb-2">Context</div>
      <div className="text-xs text-muted-foreground">
        Link context for your agent to reference.
      </div>
      {/* Additional content will be added here */}
    </div>
  );
}
