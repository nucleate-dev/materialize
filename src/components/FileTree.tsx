"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
} from "@heroicons/react/24/outline";
import { SnackFiles } from "@/lib/types/chat";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;
}

interface FileTreeProps {
  files: SnackFiles;
  selectedFile?: string;
  onFileSelect: (filePath: string) => void;
}

const FileTree: React.FC<FileTreeProps> = ({
  files,
  selectedFile,
  onFileSelect,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set([""])
  ); // Root is expanded by default

  // Convert flat files object to tree structure
  const fileTree = useMemo(() => {
    const root: FileNode = {
      name: "",
      path: "",
      type: "folder",
      children: [],
    };

    Object.keys(files).forEach((filePath) => {
      const parts = filePath.split("/");
      let currentNode = root;

      // Create folder structure
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        const folderPath = parts.slice(0, i + 1).join("/");

        if (!currentNode.children) {
          currentNode.children = [];
        }

        let folderNode = currentNode.children.find(
          (child) => child.name === folderName && child.type === "folder"
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

      // Add the file
      const fileName = parts[parts.length - 1];
      if (!currentNode.children) {
        currentNode.children = [];
      }

      currentNode.children.push({
        name: fileName,
        path: filePath,
        type: "file",
        content: files[filePath].contents,
      });
    });

    // Sort children: folders first, then files, both alphabetically
    const sortChildren = (node: FileNode) => {
      if (node.children) {
        node.children.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        node.children.forEach(sortChildren);
      }
    };

    sortChildren(root);
    return root.children || [];
  }, [files]);

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

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();

    switch (ext) {
      case "js":
      case "jsx":
        return "📄";
      case "ts":
      case "tsx":
        return "🔷";
      case "json":
        return "📋";
      case "md":
        return "📝";
      case "css":
        return "🎨";
      case "html":
        return "🌐";
      default:
        return "📄";
    }
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFile === node.path;

    if (node.type === "folder") {
      return (
        <div key={node.path}>
          <div
            className={`flex items-center py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
              depth > 0 ? `ml-${depth * 4}` : ""
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => toggleFolder(node.path)}
          >
            {isExpanded ? (
              <ChevronDownIcon className="h-4 w-4 text-gray-500 mr-1" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-gray-500 mr-1" />
            )}
            {isExpanded ? (
              <FolderOpenIcon className="h-4 w-4 text-blue-500 mr-2" />
            ) : (
              <FolderIcon className="h-4 w-4 text-blue-500 mr-2" />
            )}
            <span className="text-sm text-gray-700 dark:text-gray-300">
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
      return (
        <div
          key={node.path}
          className={`flex items-center py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
            isSelected ? "bg-blue-100 dark:bg-blue-900" : ""
          }`}
          style={{ paddingLeft: `${depth * 16 + 24}px` }}
          onClick={() => onFileSelect(node.path)}
        >
          <span className="mr-2 text-sm">{getFileIcon(node.name)}</span>
          <span
            className={`text-sm ${
              isSelected
                ? "text-blue-700 dark:text-blue-300 font-medium"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {node.name}
          </span>
        </div>
      );
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Project Files
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {Object.keys(files).length} files
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {fileTree.length > 0 ? (
          <div className="py-2">
            {fileTree.map((node) => renderNode(node, 0))}
          </div>
        ) : (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            No files to display
          </div>
        )}
      </div>
    </div>
  );
};

export default FileTree;
