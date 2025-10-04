"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
} from "lucide-react";

export type ControlPlaneFileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ControlPlaneFileNode[];
  hasChanges?: boolean;
};

type ControlPlaneFileExplorerProps = {
  files: ControlPlaneFileNode[];
  selectedPaths: string[];
  onToggle: (path: string) => void;
};

type ExpandedState = Record<string, boolean>;

function NodeItem({
  node,
  depth,
  expanded,
  toggleExpanded,
  selected,
  onToggle,
}: {
  node: ControlPlaneFileNode;
  depth: number;
  expanded: ExpandedState;
  toggleExpanded: (path: string) => void;
  selected: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isDirectory = node.type === "directory";
  const isExpanded = isDirectory
    ? expanded[node.path] ?? depth === 0
    : false;
  const isSelected = selected.has(node.path);
  const hasChanges = Boolean(node.hasChanges);

  return (
    <div key={node.path} className="space-y-1">
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm transition-colors",
          isSelected && "bg-accent text-accent-foreground",
          !isSelected && hasChanges && "border-amber-300 bg-amber-50/70 text-amber-900",
          !isSelected && !hasChanges && "hover:bg-muted/60"
        )}
      >
        {isDirectory ? (
          <button
            type="button"
            onClick={() => toggleExpanded(node.path)}
            className="flex size-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border hover:bg-muted/60"
            aria-label={isExpanded ? "Collapse directory" : "Expand directory"}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="inline-flex size-6 items-center justify-center text-muted-foreground">
            <FileIcon className="h-4 w-4" />
          </span>
        )}

        <label className="flex flex-1 cursor-pointer items-center gap-2" title={node.path}>
          <input
            type="checkbox"
            className="h-4 w-4 accent-purple-600"
            checked={isSelected}
            onChange={() => onToggle(node.path)}
          />
          <div className="flex flex-1 items-center gap-2">
            {isDirectory ? (
              isExpanded ? (
                <FolderOpen className="h-4 w-4 text-blue-600" />
              ) : (
                <Folder className="h-4 w-4 text-blue-600" />
              )
            ) : (
              <FileIcon className="h-4 w-4 text-muted-foreground" />
            )}
            <span
              className={cn(
                "truncate",
                isDirectory ? "font-medium" : undefined,
                hasChanges && !isSelected && "font-semibold text-amber-700"
              )}
            >
              {node.name}
            </span>
          </div>
          {hasChanges ? (
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
              Changed
            </span>
          ) : null}
        </label>
      </div>

      {isDirectory && isExpanded && node.children?.length ? (
        <div className="ml-4 border-l border-border pl-3">
          {node.children.map((child) => (
            <NodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}

      {isDirectory && isExpanded && !node.children?.length ? (
        <div className="ml-4 text-xs text-muted-foreground">(empty)</div>
      ) : null}
    </div>
  );
}

export function ControlPlaneFileExplorer({
  files,
  selectedPaths,
  onToggle,
}: ControlPlaneFileExplorerProps) {
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const selected = useMemo(() => new Set(selectedPaths), [selectedPaths]);

  const toggleExpanded = (path: string) => {
    setExpanded((prev) => ({
      ...prev,
      [path]: !(prev[path] ?? false),
    }));
  };

  if (!files.length) {
    return (
      <div className="text-sm text-muted-foreground">No files found.</div>
    );
  }

  return (
    <div className="space-y-1">
      {files.map((node) => (
        <NodeItem
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          toggleExpanded={toggleExpanded}
          selected={selected}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
