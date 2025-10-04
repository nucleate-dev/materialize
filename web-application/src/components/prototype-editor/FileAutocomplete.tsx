import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocumentIcon, FolderIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

interface FileAutocompleteProps {
  isOpen: boolean;
  files: string[];
  searchTerm: string;
  onFileSelect: (filePath: string) => void;
  onClose: () => void;
}

export function FileAutocomplete({
  isOpen,
  files,
  searchTerm,
  onFileSelect,
  onClose,
}: FileAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when files change
  useEffect(() => {
    setSelectedIndex(0);
  }, [files]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, files.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (files[selectedIndex]) {
            onFileSelect(files[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, files, selectedIndex, onFileSelect, onClose]);

  if (!isOpen) {
    return null;
  }

  // Show a message if no files are found
  if (files.length === 0) {
    return (
      <div className="w-full bg-background border border-border rounded-lg shadow-lg p-4">
        <div className="text-sm text-muted-foreground">
          {`No files found matching "${searchTerm}"`}
        </div>
      </div>
    );
  }

  const getFileIcon = (filePath: string) => {
    const extension = filePath.split(".").pop()?.toLowerCase();

    // You could expand this with more specific icons based on file type
    const iconClass = "w-4 h-4 flex-shrink-0";

    switch (extension) {
      case "tsx":
      case "ts":
      case "jsx":
      case "js":
        return <DocumentIcon className={`${iconClass} text-blue-500`} />;
      case "css":
      case "scss":
      case "sass":
        return <DocumentIcon className={`${iconClass} text-pink-500`} />;
      case "json":
        return <DocumentIcon className={`${iconClass} text-yellow-500`} />;
      case "md":
        return <DocumentIcon className={`${iconClass} text-gray-500`} />;
      default:
        return <DocumentIcon className={`${iconClass} text-gray-400`} />;
    }
  };

  const highlightMatch = (text: string, searchTerm: string) => {
    if (!searchTerm) return text;

    try {
      // Escape special regex characters to prevent crashes
      const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const parts = text.split(new RegExp(`(${escapedSearchTerm})`, "gi"));
      return parts.map((part, index) =>
        part.toLowerCase() === searchTerm.toLowerCase() ? (
          <span
            key={index}
            className="bg-yellow-200 dark:bg-yellow-900 font-medium"
          >
            {part}
          </span>
        ) : (
          part
        ),
      );
    } catch {
      // Fallback to plain text if regex fails
      return text;
    }
  };

  return (
    <div className="w-full bg-background border border-border rounded-lg shadow-lg">
      <div className="p-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderIcon className="w-3 h-3" />
          <span>Select a file to reference</span>
          {files.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {files.length} files
            </Badge>
          )}
        </div>
      </div>

      <ScrollArea className="max-h-64">
        <div className="p-1">
          {files.map((filePath, index) => {
            const fileName = filePath.split("/").pop() || filePath;
            const directory = filePath.substring(0, filePath.lastIndexOf("/"));

            return (
              <div
                key={filePath}
                className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                  index === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted"
                }`}
                onClick={() => onFileSelect(filePath)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {getFileIcon(filePath)}

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {highlightMatch(fileName, searchTerm)}
                  </div>
                  {directory && (
                    <div className="text-xs text-muted-foreground truncate">
                      {directory}
                    </div>
                  )}
                </div>

                {index === selectedIndex && (
                  <Badge variant="outline" className="text-xs">
                    Enter
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-2 border-t border-border text-xs text-muted-foreground">
        Use ↑↓ to navigate, Enter to select, Esc to close
      </div>
    </div>
  );
}
