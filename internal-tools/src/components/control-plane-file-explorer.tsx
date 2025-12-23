"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  onToggleWithChildren?: (paths: string[]) => void;
};

type ExpandedState = Record<string, boolean>;

function NodeItem({
  node,
  depth,
  expanded,
  toggleExpanded,
  selected,
  onToggle,
  onToggleWithChildren,
}: {
  node: ControlPlaneFileNode;
  depth: number;
  expanded: ExpandedState;
  toggleExpanded: (path: string) => void;
  selected: Set<string>;
  onToggle: (path: string) => void;
  onToggleWithChildren?: (paths: string[]) => void;
}) {
  const isDirectory = node.type === "directory";
  const isExpanded = isDirectory ? (expanded[node.path] ?? false) : false;
  const isSelected = selected.has(node.path);
  const hasChanges = Boolean(node.hasChanges);
  const checkboxId = `cp-node-${node.path.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  // Helper to collect all descendant paths
  const getAllDescendantPaths = (n: ControlPlaneFileNode): string[] => {
    const paths: string[] = [n.path];
    if (n.children) {
      for (const child of n.children) {
        paths.push(...getAllDescendantPaths(child));
      }
    }
    return paths;
  };

  const handleCheckboxChange = () => {
    if (isDirectory && onToggleWithChildren) {
      const allPaths = getAllDescendantPaths(node);
      onToggleWithChildren(allPaths);
    } else {
      onToggle(node.path);
    }
  };

  return (
    <div key={node.path} className="space-y-1">
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm transition-colors",
          isSelected && "bg-accent text-accent-foreground",
          !isSelected &&
            hasChanges &&
            "border-amber-300 bg-amber-50/70 text-amber-900",
          !isSelected && !hasChanges && "hover:bg-muted/60",
        )}
      >
        {isDirectory ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => toggleExpanded(node.path)}
            className="size-6 shrink-0 border border-transparent text-muted-foreground hover:border-border"
            aria-label={isExpanded ? "Collapse directory" : "Expand directory"}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <span className="size-6 shrink-0" />
        )}

        <div className="flex flex-1 items-center gap-2" title={node.path}>
          <Checkbox
            id={checkboxId}
            checked={isSelected}
            onCheckedChange={handleCheckboxChange}
          />
          <Label
            htmlFor={checkboxId}
            className={cn(
              "flex flex-1 cursor-pointer select-none items-center gap-2 truncate",
              isDirectory ? "font-medium" : undefined,
              hasChanges && !isSelected && "font-semibold text-amber-700",
            )}
          >
            {isDirectory ? (
              isExpanded ? (
                <FolderOpen className="h-4 w-4 text-blue-600" />
              ) : (
                <Folder className="h-4 w-4 text-blue-600" />
              )
            ) : (
              <FileIcon className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="truncate">{node.name}</span>
          </Label>
        </div>

        {hasChanges ? (
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50 text-amber-700"
          >
            Changed
          </Badge>
        ) : null}
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
              onToggleWithChildren={onToggleWithChildren}
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

  const handleToggleWithChildren = (paths: string[]) => {
    // Check if the directory itself is currently selected
    const isCurrentlySelected = selectedPaths.includes(paths[0]);

    if (isCurrentlySelected) {
      // If selected, remove all paths
      paths.forEach((path) => onToggle(path));
    } else {
      // If not selected, add all paths that aren't already selected
      paths.forEach((path) => {
        if (!selectedPaths.includes(path)) {
          onToggle(path);
        }
      });
    }
  };

  if (!files.length) {
    return <div className="text-sm text-muted-foreground">No files found.</div>;
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
          onToggleWithChildren={handleToggleWithChildren}
        />
      ))}
    </div>
  );
}
