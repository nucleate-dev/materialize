"use client";

import { cn } from "@/lib/classNames"; // Assuming you have a standard cn utility
import { Database } from "@/lib/types/supabase";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FileJson,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Image,
  Music,
  Type,
} from "lucide-react";
import React, { useMemo, useState } from "react";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder" | "asset";
  children?: FileNode[];
  content?: string;
}

interface FileTreeProps {
  files: Record<string, Database["public"]["Tables"]["prototype_files"]["Row"]>;
  assets: Record<
    string,
    Database["public"]["Tables"]["prototype_assets"]["Row"]
  >;
  selectedFile?: string;
  onFileSelect: (filePath: string) => void;
}

const FileTree: React.FC<FileTreeProps> = ({
  files,
  assets,
  selectedFile,
  onFileSelect,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set([""]),
  );

  // Convert flat files object to tree structure
  const fileTree = useMemo(() => {
    const root: FileNode = {
      name: "",
      path: "",
      type: "folder",
      children: [],
    };

    const addItemToTree = (
      itemPath: string,
      itemType: "file" | "asset",
      content?: string,
    ) => {
      const parts = itemPath.split("/");
      let currentNode = root;

      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        const folderPath = parts.slice(0, i + 1).join("/");

        if (!currentNode.children) currentNode.children = [];

        let folderNode = currentNode.children.find(
          (child) => child.name === folderName && child.type === "folder",
        );

        if (!folderNode) {
          folderNode = {
            name: folderName,
            path: folderPath,
            type: "folder",
            children: [],
          };
          currentNode.children.push(folderNode);
        }
        currentNode = folderNode;
      }

      const itemName = parts[parts.length - 1];
      if (!currentNode.children) currentNode.children = [];

      currentNode.children.push({
        name: itemName,
        path: itemPath,
        type: itemType,
        content: content,
      });
    };

    Object.keys(files).forEach((filePath) => {
      addItemToTree(filePath, "file", files[filePath].contents || undefined);
    });

    Object.keys(assets).forEach((assetPath) => {
      addItemToTree(assetPath, "asset");
    });

    const sortChildren = (node: FileNode) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.type === "folder" && b.type !== "folder") return -1;
          if (a.type !== "folder" && b.type === "folder") return 1;
          return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortChildren);
      }
    };

    sortChildren(root);
    return root.children || [];
  }, [files, assets]);

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  };

  // --- Icon Logic (Lucide) ---
  const getFileIcon = (
    fileName: string,
    nodeType: "file" | "asset" = "file",
  ) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const className = "w-4 h-4";

    if (nodeType === "asset") {
      switch (ext) {
        case "png":
        case "jpg":
        case "jpeg":
        case "gif":
        case "svg":
        case "webp":
        case "ico":
          return <Image className={className} />;
        case "mp3":
        case "wav":
        case "ogg":
        case "m4a":
          return <Music className={className} />;
        case "mp4":
        case "mov":
        case "avi":
        case "webm":
          return <Film className={className} />;
        case "pdf":
          return <FileText className={className} />;
        case "zip":
        case "tar":
        case "gz":
          return <Archive className={className} />;
        case "ttf":
        case "otf":
        case "woff":
        case "woff2":
          return <Type className={className} />;
        default:
          return <File className={className} />;
      }
    }

    switch (ext) {
      case "js":
      case "jsx":
      case "ts":
      case "tsx":
        return <FileCode className={className} />;
      case "json":
        return <FileJson className={className} />;
      case "md":
      case "txt":
        return <FileText className={className} />;
      case "css":
      case "html":
        return <FileCode className={className} />; // Or generic code
      default:
        return <File className={className} />;
    }
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFile === node.path;
    const paddingLeft = depth * 12 + 12;

    if (node.type === "folder") {
      return (
        <div key={node.path}>
          <div
            className={cn(
              "flex items-center py-1.5 pr-2 my-0.5 rounded cursor-pointer transition-colors duration-200 group select-none",
              // Folder Hover State
              "hover:bg-white/5",
              // Active State (if needed, usually folders aren't 'selected' in this view, but visual feedback helps)
              isExpanded ? "text-white" : "text-[#8A8F98] hover:text-white"
            )}
            style={{ paddingLeft: `${paddingLeft}px` }}
            onClick={() => toggleFolder(node.path)}
          >
            <span className="mr-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </span>

            <span className="mr-2 text-indigo-400/80 group-hover:text-indigo-400 transition-colors">
              {isExpanded ? (
                <FolderOpen className="w-4 h-4" />
              ) : (
                <Folder className="w-4 h-4" />
              )}
            </span>

            <span className="text-xs font-medium tracking-tight truncate">
              {node.name}
            </span>
          </div>

          {isExpanded && node.children && (
            <div>
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    } else {
      // --- File / Asset Node ---
      return (
        <div
          key={node.path}
          onClick={() => onFileSelect(node.path)}
          className={cn(
            "flex items-center py-1.5 pr-2 my-0.5 rounded cursor-pointer transition-all duration-200 select-none",
            isSelected
              ? "bg-indigo-500/10 text-indigo-300"
              : "text-[#8A8F98] hover:text-white hover:bg-white/5"
          )}
          style={{ paddingLeft: `${paddingLeft + 18}px` }} // +18 to align with folder text, skipping arrows
        >
          <span className={cn(
            "mr-2 transition-colors",
            isSelected ? "text-indigo-400" : "text-white/30 group-hover:text-white/60"
          )}>
            {getFileIcon(node.name, node.type === "asset" ? "asset" : "file")}
          </span>

          <span className="text-xs font-medium truncate tracking-tight">
            {node.name}
          </span>

          {node.type === "asset" && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-white/20">
              Asset
            </span>
          )}
        </div>
      );
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0B0C0E] border-r border-white/5">
      {/* --- Header --- */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
        <h3 className="text-xs font-semibold text-white/90 uppercase tracking-widest">
          Explorer
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/30 font-mono">
            {Object.keys(files).length + Object.keys(assets).length} items
          </span>
        </div>
      </div>

      {/* --- Tree Content --- */}
      <div className="flex-1 overflow-y-auto py-2 px-2 custom-scrollbar">
        {fileTree.length > 0 ? (
          fileTree.map((node) => renderNode(node, 0))
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-center px-4">
            <FolderOpen className="w-8 h-8 text-white/10 mb-2" />
            <p className="text-xs text-white/30">
              No files in this project
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileTree;