"use client";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ENABLE_ASSET_UPLOAD } from "@/GlobalConstants";
import { UseFileSystemReturn } from "@/hooks/useFileSystem";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { cn } from "@/lib/classNames";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { getBulkAssetSignedUrls } from "@/lib/utils/assetUtils";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import Editor from "@monaco-editor/react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode,
  FileImage,
  Folder,
  FolderOpen,
  Loader2,
  Lock,
  Minus,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

interface CodeEditorProps {
  fileSystem: UseFileSystemReturn;
  prototypeId: string;
  language?: string;
  readOnly?: boolean;
  onViewingUrlUpdate?: (url: string) => void;
  onBuildingStateChange?: (isBuilding: boolean) => void;
  saveMode?: "single-file" | "all-files";
  currentRenderStatus?: RenderStatus;
  onFilesSaved?: (fileNames: string[], assetNames?: string[]) => void;
}

const ROOT_FOLDER_VALUE = "__ROOT__";

// File size limits (in bytes)
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_LOCK_FILE_SIZE = 5 * 1024 * 1024; // 5MB for lock files

// Blocked folder patterns (common gitignore patterns)
// Note: .env FILES are allowed (see ALLOWED_ASSET_EXTENSIONS), but env/venv FOLDERS are blocked
const BLOCKED_FOLDERS = new Set([
  "ios",
  "android",
  "node_modules",
  ".git",
  "build",
  "dist",
  ".expo",
  ".next",
  "out",
  // Additional common gitignore folders
  ".cache",
  ".parcel-cache",
  ".vscode",
  ".idea",
  ".DS_Store",
  "coverage",
  ".nyc_output",
  ".pytest_cache",
  "__pycache__",
  "venv",
  ".venv",
  "env", // Block env folder but not .env file
  ".gradle",
  ".yarn",
  ".pnp",
  "tmp",
  "temp",
  ".tmp",
  ".temp",
  "logs",
  ".turbo",
  ".nuxt",
  ".output",
  ".vercel",
  ".netlify",
  "public/build",
  "server/build",
]);

const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "json",
  "mjs",
  "cjs",
  "mts",
  "cts", // JS/TS variants
  "lock", // package-lock.json, yarn.lock
  "yaml",
  "yml", // Config files
  "sh", // Shell scripts
  "css", // Stylesheets
  "md", // Markdown files
  "txt", // Text files
  "env", // Environment files
  "gitignore", // Git configuration
  "npmrc", // NPM configuration
  "prettierrc", // Prettier configuration
  "eslintrc", // ESLint configuration
  "editorconfig", // Editor configuration
  "watchmanconfig", // Watchman configuration
  "xml", // XML/Android config files
]);

const ALLOWED_ASSET_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "ttf",
  "otf",
  "woff",
  "woff2",
]);

type UploadMode = "merge" | "replace" | "replace-all";

const CodeEditor: React.FC<CodeEditorProps> = ({
  fileSystem,
  prototypeId,
  language = "typescript",
  readOnly = false,
  onViewingUrlUpdate,
  onBuildingStateChange,
  saveMode = "single-file",
  currentRenderStatus,
  onFilesSaved,
}) => {
  const logger = useProductLogger();
  const router = useRouter();
  const { userPlan } = useSubscriptionAccess();

  const availableFiles = Object.keys(fileSystem.state.files);
  const canDelete = availableFiles.length > 1;

  // --- File Logic ---
  const onChange = (value: string | undefined) => {
    if (userPlan === "free") return;
    if (value !== undefined && fileSystem.state.selectedFile) {
      fileSystem.updateFileContentLocally(fileSystem.state.selectedFile, value);
    }
  };

  const getLanguageFromFileName = (name: string) => {
    const ext = name?.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "js":
      case "jsx":
        return "javascript";
      case "ts":
      case "tsx":
        return "typescript";
      case "json":
        return "json";
      case "md":
        return "markdown";
      case "css":
        return "css";
      case "html":
        return "html";
      default:
        return "javascript";
    }
  };

  const editorLanguage = fileSystem.state.selectedFile
    ? getLanguageFromFileName(fileSystem.state.selectedFile)
    : language;

  const isAsset = (fileName: string) =>
    fileName && fileSystem.state.assets && fileName in fileSystem.state.assets;

  const isImageFile = (name: string) => {
    const ext = name?.split(".").pop()?.toLowerCase();
    return ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(
      ext || "",
    );
  };

  const currentFile =
    fileSystem.state.selectedFile &&
      fileSystem.state.files &&
      fileSystem.state.selectedFile in fileSystem.state.files
      ? fileSystem.state.files[fileSystem.state.selectedFile]
      : fileSystem.state.selectedFile &&
        fileSystem.state.assets &&
        fileSystem.state.selectedFile in fileSystem.state.assets
        ? fileSystem.state.assets[fileSystem.state.selectedFile]
        : null;

  const isAssetImage =
    fileSystem.state.selectedFile &&
    isAsset(fileSystem.state.selectedFile) &&
    isImageFile(fileSystem.state.selectedFile);

  // --- State ---
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoadingImageUrl, setIsLoadingImageUrl] = useState(false);
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileError, setNewFileError] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [uploadTargetFolder, setUploadTargetFolder] =
    useState<string>(ROOT_FOLDER_VALUE);
  const [uploadMode, setUploadMode] = useState<UploadMode>("merge");
  const [uploadType, setUploadType] = useState<"files" | "folder">("files");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadAsProjectRoot, setUploadAsProjectRoot] = useState(false);
  const [showProjectRootConfirm, setShowProjectRootConfirm] = useState(false);

  // File selection and validation state
  type FileValidationStatus =
    | "ready"
    | "blocked-folder"
    | "blocked-extension"
    | "too-large"
    | "conflict";
  const [fileValidation, setFileValidation] = useState<
    Map<string, { status: FileValidationStatus; reason?: string; size: number; }>
  >(new Map());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );

  // --- Helper Functions (defined before useMemo) ---

  // Build nested folder structure for display
  type FileNode = {
    name: string;
    path: string;
    isFolder: boolean;
    children: FileNode[];
    validation?: {
      status: FileValidationStatus;
      reason?: string;
      size: number;
    };
  };

  const getAllFilesInNode = (node: FileNode): string[] => {
    if (!node.isFolder) {
      return [node.path];
    }
    return node.children.flatMap((child) => getAllFilesInNode(child));
  };

  const buildFileTree = (
    filePaths: string[],
    validationMap: Map<
      string,
      { status: FileValidationStatus; reason?: string; size: number; }
    >,
  ): FileNode[] => {
    const root: FileNode[] = [];

    filePaths.forEach((filePath) => {
      const parts = filePath.split("/");
      let currentLevel = root;

      parts.forEach((part, index) => {
        const isLastPart = index === parts.length - 1;
        const currentPath = parts.slice(0, index + 1).join("/");

        let existingNode = currentLevel.find((node) => node.name === part);

        if (!existingNode) {
          const newNode: FileNode = {
            name: part,
            path: currentPath,
            isFolder: !isLastPart,
            children: [],
            validation: isLastPart ? validationMap.get(filePath) : undefined,
          };
          currentLevel.push(newNode);
          existingNode = newNode;
        }

        if (!isLastPart) {
          currentLevel = existingNode.children;
        }
      });
    });

    return root;
  };

  // --- Computed ---
  const directoryOptions = useMemo(() => {
    const directories = new Set<string>([ROOT_FOLDER_VALUE]);
    availableFiles.forEach((filePath) => {
      const parts = filePath.split("/");
      parts.pop();
      if (parts.length === 0) return;
      let currentPath = "";
      parts.forEach((part) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        directories.add(currentPath);
      });
    });
    return Array.from(directories).sort((a, b) => {
      if (a === ROOT_FOLDER_VALUE) return -1;
      if (b === ROOT_FOLDER_VALUE) return 1;
      return a.localeCompare(b);
    });
  }, [availableFiles]);

  const defaultUploadFolderValue = useMemo(() => {
    if (
      !fileSystem.state.selectedFile ||
      !fileSystem.state.selectedFile.includes("/")
    ) {
      return ROOT_FOLDER_VALUE;
    }
    const folderPath = fileSystem.state.selectedFile
      .split("/")
      .slice(0, -1)
      .join("/");
    return folderPath || ROOT_FOLDER_VALUE;
  }, [fileSystem.state.selectedFile]);

  useEffect(() => {
    if (showUploadModal) {
      setUploadTargetFolder(defaultUploadFolderValue);
      setUploadError("");
    }
  }, [showUploadModal, defaultUploadFolderValue]);

  // Generate signed URL on-demand when an image asset is selected
  useEffect(() => {
    async function generateImageUrl() {
      if (!isAssetImage || !fileSystem.state.selectedFile || !prototypeId) {
        setImageUrl(null);
        setIsLoadingImageUrl(false);
        return;
      }

      setIsLoadingImageUrl(true);
      try {
        const signedUrls = await getBulkAssetSignedUrls(prototypeId, [
          fileSystem.state.selectedFile,
        ]);
        setImageUrl(signedUrls[fileSystem.state.selectedFile] || null);
      } catch (error) {
        logger.debug("error", "Failed to generate signed URL for image:", {
          error: error instanceof Error ? error.message : String(error),
        });
        setImageUrl(null);
      } finally {
        setIsLoadingImageUrl(false);
      }
    }

    generateImageUrl();
  }, [isAssetImage, fileSystem.state.selectedFile, prototypeId, logger]);

  const resolvedUploadFolder =
    uploadTargetFolder === ROOT_FOLDER_VALUE ? "" : uploadTargetFolder;

  const buildUploadPath = useCallback(
    (fileName: string) =>
      resolvedUploadFolder ? `${resolvedUploadFolder}/${fileName}` : fileName,
    [resolvedUploadFolder],
  );

  const uploadConflicts = useMemo(() => {
    return Array.from(fileValidation.entries())
      .filter(([, validation]) => validation.status === "conflict")
      .map(([path]) => path);
  }, [fileValidation]);

  const uploadSummary = useMemo(() => {
    const total = fileValidation.size;
    const selected = selectedFiles.size;
    const blocked = Array.from(fileValidation.values()).filter(
      (v) =>
        v.status === "blocked-folder" ||
        v.status === "blocked-extension" ||
        v.status === "too-large",
    ).length;
    const conflicts = Array.from(fileValidation.values()).filter(
      (v) => v.status === "conflict",
    ).length;
    const totalSize = Array.from(fileValidation.entries())
      .filter(([path]) => selectedFiles.has(path))
      .reduce((sum, [_, v]) => sum + v.size, 0);

    return { total, selected, blocked, conflicts, totalSize };
  }, [fileValidation, selectedFiles]);

  const fileTree = useMemo(() => {
    if (fileValidation.size === 0) return [];
    const paths = Array.from(fileValidation.keys());
    return buildFileTree(paths, fileValidation);
  }, [fileValidation]);

  const saveButtonState = useMemo(() => {
    if (userPlan === "free")
      return { disabled: true, tooltip: "Upgrade plan to save files" };
    switch (currentRenderStatus) {
      case "Static build":
        return {
          disabled: true,
          tooltip: "Start dev server to enable file saving",
        };
      case "Starting Dev Server..":
        return { disabled: true, tooltip: "Wait for dev server to start" };
      case "Disconnected":
        return { disabled: true, tooltip: "Dev server disconnected" };
      default:
        return {
          disabled: false,
          tooltip:
            saveMode === "single-file" ? "Save current file" : "Save all files",
        };
    }
  }, [currentRenderStatus, saveMode, userPlan]);

  // --- Handlers ---
  const handleCreateFile = async () => {
    if (userPlan === "free")
      return setNewFileError("Upgrade plan to create files");
    if (!newFileName.trim()) return setNewFileError("File name is required");
    if (availableFiles.includes(newFileName.trim()))
      return setNewFileError("File already exists");

    const fileName = newFileName.trim();
    if (!/^[a-zA-Z0-9._/-]+$/.test(fileName)) {
      setNewFileError(
        "Invalid file name. Use letters, numbers, dots, hyphens, slashes.",
      );
      return;
    }

    const getDefaultContent = (name: string) => {
      const ext = name.split(".").pop()?.toLowerCase();
      const componentName =
        name.split(".").pop() === name
          ? name
          : name
            .split(".")[0]
            .split("/")
            .pop()
            ?.replace(/[^a-zA-Z0-9]/g, "");

      switch (ext) {
        case "js":
        case "jsx":
          return `import React from 'react';\nimport { View, Text } from 'react-native';\n\nexport default function ${componentName}() {\n  return (\n    <View>\n      <Text>Hello from ${name}!</Text>\n    </View>\n  );\n}`;
        case "ts":
        case "tsx":
          return `import React from 'react';\nimport { View, Text } from 'react-native';\n\ninterface Props {}\n\nexport default function ${componentName}({}: Props) {\n  return (\n    <View>\n      <Text>Hello from ${name}!</Text>\n    </View>\n  );\n}`;
        case "json":
          return "{\n  \n}";
        case "md":
          return `# ${name.split(".")[0]}\n\nAdd your content here.`;
        case "css":
          return "/* Add your styles here */";
        default:
          return "";
      }
    };

    setIsSaving(true);
    onBuildingStateChange?.(true);

    try {
      const content = getDefaultContent(fileName);
      const result = await fileSystem.syncFilesAndAssets({
        filesToUpsert: [{ name: fileName, content }],
      });

      if (result.success) {
        fileSystem.selectFile(fileName);
        setShowNewFileModal(false);
        setNewFileName("");
        setNewFileError("");
      } else {
        setNewFileError("Failed to create file. Please try again.");
      }
    } catch (error) {
      logger.debug("error", "Error creating file");
      setNewFileError("Failed to create file. Please try again.");
    } finally {
      setIsSaving(false);
      onBuildingStateChange?.(false);
    }
  };

  const handleDeleteFile = () => {
    if (userPlan !== "free" && fileSystem.state.selectedFile) {
      setShowDeleteConfirm(true);
    }
  };

  const handleModalClose = () => {
    setNewFileName("");
    setNewFileError("");
  };

  const handleUploadModalClose = () => {
    setUploadFiles([]);
    setUploadError("");
    setIsUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    setUploadMode("merge");
    setUploadType("files");
    setFileValidation(new Map());
    setSelectedFiles(new Set());
    setExpandedFolders(new Set());
    setUploadAsProjectRoot(false);
    setShowProjectRootConfirm(false);
  };

  const toggleFileSelection = (filePath: string) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return newSet;
    });
  };

  const toggleFolderExpansion = (folderPath: string) => {
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

  const toggleFolderSelection = (node: FileNode) => {
    // Get all file paths under this folder
    const getAllFilePaths = (n: FileNode): string[] => {
      if (!n.isFolder) {
        return [n.path];
      }
      return n.children.flatMap((child) => getAllFilePaths(child));
    };

    const filePaths = getAllFilePaths(node).filter((path) => {
      const validation = fileValidation.get(path);
      return (
        validation &&
        (validation.status === "ready" || validation.status === "conflict")
      );
    });

    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      const allSelected = filePaths.every((path) => newSet.has(path));

      if (allSelected) {
        // Deselect all
        filePaths.forEach((path) => newSet.delete(path));
      } else {
        // Select all
        filePaths.forEach((path) => newSet.add(path));
      }

      return newSet;
    });
  };

  const toggleAllFiles = () => {
    const allSelectableFiles = Array.from(fileValidation.entries())
      .filter(
        ([_, validation]) =>
          validation.status === "ready" || validation.status === "conflict",
      )
      .map(([path]) => path);

    if (selectedFiles.size === allSelectableFiles.length) {
      // Deselect all
      setSelectedFiles(new Set());
    } else {
      // Select all
      setSelectedFiles(new Set(allSelectableFiles));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getStatusBadge = (status: FileValidationStatus) => {
    switch (status) {
      case "ready":
        return {
          text: "Ready",
          className: "bg-green-500/10 text-green-400 border-green-500/20",
        };
      case "conflict":
        return {
          text: "Conflict",
          className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        };
      case "blocked-folder":
        return {
          text: "Blocked",
          className: "bg-red-500/10 text-red-400 border-red-500/20",
        };
      case "blocked-extension":
        return {
          text: "Unsupported",
          className: "bg-red-500/10 text-red-400 border-red-500/20",
        };
      case "too-large":
        return {
          text: "Too Large",
          className: "bg-red-500/10 text-red-400 border-red-500/20",
        };
      default:
        return {
          text: "Unknown",
          className:
            "bg-muted-foreground/10 text-muted-foreground border-border",
        };
    }
  };

  // Recursive tree node renderer
  const renderFileNode = (
    node: FileNode,
    depth: number = 0,
  ): React.ReactNode => {
    if (node.isFolder) {
      const isExpanded = expandedFolders.has(node.path);
      const folderFiles = getAllFilesInNode(node);
      const selectableFiles = folderFiles.filter((path) => {
        const validation = fileValidation.get(path);
        return (
          validation &&
          (validation.status === "ready" || validation.status === "conflict")
        );
      });
      const selectedCount = selectableFiles.filter((path) =>
        selectedFiles.has(path),
      ).length;
      const isPartiallySelected =
        selectedCount > 0 && selectedCount < selectableFiles.length;
      const isFullySelected =
        selectableFiles.length > 0 && selectedCount === selectableFiles.length;

      return (
        <div key={node.path}>
          <div
            className={cn(
              "flex items-center gap-2 p-2 hover:bg-accent/50 transition-colors cursor-pointer",
              isFullySelected && "bg-accent/30",
            )}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFolderExpansion(node.path);
              }}
              className="p-0.5 hover:bg-accent/50 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>

            <Checkbox
              checked={
                isFullySelected
                  ? true
                  : isPartiallySelected
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={() => toggleFolderSelection(node)}
              disabled={selectableFiles.length === 0}
              className="border-border data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500 data-[state=indeterminate]:bg-indigo-500 data-[state=indeterminate]:border-indigo-500"
            />

            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
            )}

            <span
              className="text-sm font-medium text-foreground flex-1"
              onClick={() => toggleFolderExpansion(node.path)}
            >
              {node.name}
            </span>

            {selectableFiles.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {selectedCount}/{selectableFiles.length}
              </span>
            )}
          </div>

          {isExpanded && (
            <div>
              {node.children.map((child) => renderFileNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    } else {
      // File node
      const validation = node.validation;
      if (!validation) return null;

      const isSelected = selectedFiles.has(node.path);
      const isBlocked =
        validation.status === "blocked-folder" ||
        validation.status === "blocked-extension" ||
        validation.status === "too-large";
      const badge = getStatusBadge(validation.status);

      return (
        <div
          key={node.path}
          className={cn(
            "flex items-center gap-2 p-2 transition-colors",
            isBlocked ? "opacity-50" : "hover:bg-accent/50",
            isSelected && !isBlocked && "bg-accent/30",
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <div className="w-4" /> {/* Spacer for alignment with folders */}
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => !isBlocked && toggleFileSelection(node.path)}
            disabled={isBlocked}
            className="border-border data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
          />
          <FileCode className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-foreground truncate">
              {node.name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatFileSize(validation.size)}
            </p>
          </div>
          <div
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium border shrink-0",
              badge.className,
            )}
          >
            {badge.text}
          </div>
        </div>
      );
    }
  };

  const handleUploadFolderChange = (value: string) => {
    setUploadTargetFolder(value);
    setUploadError("");
  };

  const isFileInBlockedFolder = (filePath: string): boolean => {
    const pathParts = filePath.split("/");
    // Check if any part of the path matches blocked folders
    return pathParts.some((part) => BLOCKED_FOLDERS.has(part));
  };

  const getUploadKindForPath = (path: string): "code" | "asset" => {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    if (ENABLE_ASSET_UPLOAD && ALLOWED_ASSET_EXTENSIONS.has(ext)) {
      return "asset";
    }
    return "code";
  };

  const getFileSizeLimit = (fileName: string): number => {
    // Lock files get higher limit
    if (
      fileName.endsWith(".lock") ||
      fileName === "package-lock.json" ||
      fileName === "yarn.lock"
    ) {
      return MAX_LOCK_FILE_SIZE;
    }
    return MAX_FILE_SIZE;
  };

  const validateFile = (
    file: File,
    targetPath: string,
  ): { status: FileValidationStatus; reason?: string; } => {
    // Block system files
    const fileName = file.name.toLowerCase();
    if (
      fileName === ".ds_store" ||
      fileName === "thumbs.db" ||
      fileName === "desktop.ini"
    ) {
      return {
        status: "blocked-extension",
        reason: "System files are not allowed",
      };
    }

    // Block common gitignore file patterns (except .env which is explicitly allowed)
    const blockedFilePatterns = [
      // Log files
      /^\.log$/i,
      /\.log$/i,
      /^npm-debug\.log/i,
      /^yarn-debug\.log/i,
      /^yarn-error\.log/i,
      /^lerna-debug\.log/i,
      /^\.pnpm-debug\.log/i,
      // Editor files
      /\.swp$/i,
      /\.swo$/i,
      /~$/,
      // Cache and build artifacts
      /^\.cache$/i,
      /^\.vscode$/i,
      /^\.idea$/i,
      /^\.*.pid$/i,
      /^\.*.seed$/i,
      /^\.grunt$/i,
      /^bower_components/i,
      /^\.lock-wscript$/i,
      /^\.wafpickle-/i,
      /^\.node_repl_history$/i,
      /^\.npm$/i,
      /^\.eslintcache$/i,
      /^\.stylelintcache$/i,
      /^\.rpt2_cache/i,
      /^\.rts2_cache/i,
      /^\.next$/i,
      /^\.nuxt$/i,
      /^\.vercel$/i,
      /^\.serverless/i,
      /^\.fusebox/i,
      /^\.dynamodb/i,
      /^\.tern-port$/i,
      /^\.vscode-test$/i,
      // Package manager artifacts
      /^\.yarn\/cache/i,
      /^\.yarn\/unplugged/i,
      /^\.yarn\/build-state\.yml$/i,
      /^\.yarn\/install-state\.gz$/i,
      /^\.pnp\./i,
      // OS and IDE files
      /^Thumbs\.db$/i,
      /^ehthumbs\.db$/i,
      /^Desktop\.ini$/i,
      /^\$RECYCLE\.BIN/i,
      /^\.AppleDouble$/i,
      /^\.LSOverride$/i,
      // Python
      /^\.pyc$/i,
      /^\.pyo$/i,
      /^\.pyd$/i,
      // Misc
      /^\.sass-cache/i,
      /^\.turbo$/i,
    ];

    // Check if file matches any blocked patterns (but allow .env files)
    // Allow .env but NOT .env.local, .env.*.local variants
    for (const pattern of blockedFilePatterns) {
      if (pattern.test(fileName) || pattern.test(targetPath)) {
        return {
          status: "blocked-extension",
          reason: "File matches gitignore pattern and cannot be uploaded",
        };
      }
    }

    // Check blocked folders
    if (isFileInBlockedFolder(targetPath)) {
      return {
        status: "blocked-folder",
        reason:
          "Native folders (ios/, android/) and build artifacts are not supported",
      };
    }

    // Check file extension
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isCodeFile = ALLOWED_UPLOAD_EXTENSIONS.has(ext);
    const isAssetFile =
      ENABLE_ASSET_UPLOAD && ALLOWED_ASSET_EXTENSIONS.has(ext);

    if (!isCodeFile && !isAssetFile) {
      return {
        status: "blocked-extension",
        reason: `File type '.${ext}' is not supported`,
      };
    }

    // Check file size
    const sizeLimit = getFileSizeLimit(file.name);
    if (file.size > sizeLimit) {
      const limitMB = (sizeLimit / (1024 * 1024)).toFixed(1);
      return {
        status: "too-large",
        reason: `File exceeds ${limitMB}MB limit`,
      };
    }

    // Check conflicts
    if (
      fileSystem.state.files[targetPath] ||
      fileSystem.state.assets[targetPath]
    ) {
      return { status: "conflict", reason: "Path already exists" };
    }

    return { status: "ready" };
  };

  const handleUploadFileSelection = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const filesList = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";

    if (!filesList.length) {
      setUploadFiles([]);
      setFileValidation(new Map());
      setSelectedFiles(new Set());
      return;
    }

    let nextUploadAsProjectRoot = uploadAsProjectRoot;

    // Auto-detect project root upload: check if folder contains package.json at root level
    if (uploadType === "folder" && !nextUploadAsProjectRoot) {
      const hasRootPackageJson = filesList.some((file) => {
        if (file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split("/");
          // Check if package.json is at the second level (first level is folder name)
          return parts.length === 2 && parts[1] === "package.json";
        }
        return false;
      });

      if (hasRootPackageJson) {
        // Auto-enable project root mode
        nextUploadAsProjectRoot = true;
        setUploadAsProjectRoot(true);
      }
    }

    const validationMap = new Map<
      string,
      { status: FileValidationStatus; reason?: string; size: number; }
    >();
    const selectedSet = new Set<string>();
    const validFiles: File[] = [];

    filesList.forEach((file) => {
      let targetPath: string;
      if (uploadType === "folder" && (file.webkitRelativePath || file.name)) {
        const relativePath = file.webkitRelativePath || file.name;

        // Strip top-level folder if uploading as project root
        if (nextUploadAsProjectRoot) {
          const parts = relativePath.split("/");
          const strippedPath = parts.slice(1).join("/");
          targetPath = strippedPath || parts[parts.length - 1] || file.name;
        } else {
          targetPath = resolvedUploadFolder
            ? `${resolvedUploadFolder}/${relativePath}`
            : relativePath;
        }
      } else {
        targetPath = buildUploadPath(file.name);
      }

      const validation = validateFile(file, targetPath);

      validationMap.set(targetPath, {
        status: validation.status,
        reason: validation.reason,
        size: file.size,
      });

      // Auto-select files that are ready or have conflicts (can be overridden based on mode)
      if (validation.status === "ready" || validation.status === "conflict") {
        selectedSet.add(targetPath);
        validFiles.push(file);
      }
    });

    setFileValidation(validationMap);
    setSelectedFiles(selectedSet);
    setUploadFiles(validFiles);
    setUploadError("");

    // Auto-expand first level folders when uploading a folder
    if (uploadType === "folder" && filesList.length > 0) {
      const firstLevelFolders = new Set<string>();
      filesList.forEach((file) => {
        if (file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split("/");
          if (parts.length > 1) {
            const firstFolder = resolvedUploadFolder
              ? `${resolvedUploadFolder}/${parts[0]}`
              : parts[0];
            firstLevelFolders.add(firstFolder);
          }
        }
      });
      setExpandedFolders(firstLevelFolders);
    }
  };

  const handleUploadFiles = async () => {
    if (userPlan === "free")
      return setUploadError("Upgrade plan to upload files");
    if (selectedFiles.size === 0)
      return setUploadError("No files selected to upload");

    // Check for unresolved conflicts in merge mode
    const selectedWithConflicts = Array.from(selectedFiles).filter((path) => {
      const validation = fileValidation.get(path);
      return validation?.status === "conflict";
    });

    if (uploadMode === "merge" && selectedWithConflicts.length > 0) {
      setUploadError(
        `${selectedWithConflicts.length} conflict(s) must be resolved. Use Replace mode or deselect conflicting files.`,
      );
      return;
    }

    // Show confirmation dialog for project root uploads
    if (uploadAsProjectRoot) {
      setShowProjectRootConfirm(true);
      return;
    }

    // Otherwise, proceed with upload
    await executeUpload();
  };

  const executeUpload = async () => {
    // Build a mapping of files to their target paths (calculated during selection)
    // We need to recalculate using the original upload context, not current uploadAsProjectRoot state
    const filePathMap = new Map<
      File,
      { path: string; kind: "code" | "asset"; }
    >();

    uploadFiles.forEach((file) => {
      let targetPath: string;
      if (uploadType === "folder" && file.webkitRelativePath) {
        const relativePath = file.webkitRelativePath;

        // Strip top-level folder if uploading as project root
        if (uploadAsProjectRoot) {
          const parts = relativePath.split("/");
          const strippedPath = parts.slice(1).join("/");
          targetPath = strippedPath;
        } else {
          targetPath = resolvedUploadFolder
            ? `${resolvedUploadFolder}/${relativePath}`
            : relativePath;
        }
      } else {
        targetPath = buildUploadPath(file.name);
      }

      // Only include files that were actually selected
      if (selectedFiles.has(targetPath)) {
        filePathMap.set(file, {
          path: targetPath,
          kind: getUploadKindForPath(targetPath),
        });
      }
    });

    const uploads = Array.from(filePathMap.entries());
    const totalUploads = uploads.length;

    setIsUploading(true);
    setUploadProgress({ current: 0, total: totalUploads });

    try {
      // Collect all files to delete
      const filesToDelete: string[] = [];
      const assetsToDelete: string[] = [];

      // Delete all files if in project root mode OR replace-all mode
      if (uploadAsProjectRoot || uploadMode === "replace-all") {
        filesToDelete.push(...Object.keys(fileSystem.state.files));
        assetsToDelete.push(...Object.keys(fileSystem.state.assets));
      } else if (uploadMode === "replace") {
        // Delete individual files/assets that are being replaced
        for (const [, info] of uploads) {
          if (fileSystem.state.files[info.path]) {
            filesToDelete.push(info.path);
          } else if (fileSystem.state.assets[info.path]) {
            assetsToDelete.push(info.path);
          }
        }
      }

      // Collect all code files to upsert
      const filesToUpsert: Array<{ name: string; content: string; }> = [];
      for (const [file, info] of uploads) {
        if (info.kind === "code") {
          const fileContents = await file.text();
          filesToUpsert.push({ name: info.path, content: fileContents });
        }
      }

      // Collect all assets to upload
      const assetsToUpload = uploads
        .filter(([, info]) => info.kind === "asset")
        .map(([file, info]) => ({ file, path: info.path }));

      // Make ONE unified call to sync everything
      const result = await fileSystem.syncFilesAndAssets({
        filesToUpsert,
        filesToDelete,
        assetsToUpload,
        assetsToDelete,
      });

      if (result.success) {
        onFilesSaved?.(
          filesToUpsert.map((f) => f.name),
          assetsToUpload.map((a) => a.path),
        );
      }

      setUploadProgress({ current: totalUploads, total: totalUploads });
      setShowUploadModal(false);
      handleUploadModalClose();
    } catch (error) {
      logger.debug("error", "Error uploading");
      setUploadError(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const handleSaveSingleFile = async () => {
    if (
      !prototypeId ||
      !fileSystem.state.selectedFile ||
      fileSystem.getSelectedFileContent() === undefined
    )
      return;
    setIsSaving(true);
    onBuildingStateChange?.(true);

    try {
      const selectedFile =
        fileSystem.state.files[fileSystem.state.selectedFile];
      if (!selectedFile) return;

      const result = await fileSystem.syncFilesAndAssets({
        filesToUpsert: [
          {
            name: fileSystem.state.selectedFile,
            content: selectedFile.contents,
          },
        ],
      });

      if (result.success) {
        onFilesSaved?.([fileSystem.state.selectedFile], []);
      }
    } catch (error) {
      logger.debug("error", "Error saving file");
    } finally {
      setIsSaving(false);
      onBuildingStateChange?.(false);
    }
  };

  const handleSaveFiles = async () => {
    if (!prototypeId || !fileSystem.state.files) return;
    setIsSaving(true);
    onBuildingStateChange?.(true);

    try {
      const filesToUpsert = Object.entries(fileSystem.state.files).map(
        ([name, file]) => ({
          name,
          content: file.contents,
        }),
      );

      const result = await fileSystem.syncFilesAndAssets({
        filesToUpsert,
      });

      if (result.success) {
        onFilesSaved?.(Object.keys(fileSystem.state.files), []);
      }
    } catch (error) {
      logger.debug("error", "Error saving files");
    } finally {
      setIsSaving(false);
      onBuildingStateChange?.(false);
    }
  };

  const handleDeleteFileWithAPI = async (fileName: string) => {
    if (!prototypeId) return;
    setIsDeleting(true);
    onBuildingStateChange?.(true);

    try {
      const wasAsset = isAsset(fileName);
      await fileSystem.syncFilesAndAssets({
        filesToDelete: wasAsset ? [] : [fileName],
        assetsToDelete: wasAsset ? [fileName] : [],
      });
    } catch (error) {
      logger.debug("error", "Error deleting file");
    } finally {
      setIsDeleting(false);
      onBuildingStateChange?.(false);
    }
  };

  // --- Monaco Config ---
  const beforeMount = (monaco: typeof import("monaco-editor")) => {
    // Define Materialize Dark Theme
    monaco.editor.defineTheme("materialize-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0B0C0E", // Main background
        "editor.lineHighlightBackground": "#141517", // Active line
        "editorGutter.background": "#0B0C0E", // Gutter
        "editorIndentGuide.background": "#FFFFFF10", // Guide lines
        "scrollbarSlider.background": "#FFFFFF10",
        "scrollbarSlider.hoverBackground": "#FFFFFF20",
        "scrollbarSlider.activeBackground": "#FFFFFF30",
      },
    });

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: "React",
      allowJs: true,
      typeRoots: ["node_modules/@types"],
      strict: false,
      skipLibCheck: true,
    });

    // Add extra libs...
    const extraLibs = [
      `declare module 'react-native' { export * from 'react-native'; }`,
    ]; // Simplified for brevity
    extraLibs.forEach((lib) => {
      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        lib,
        "react-native-types.d.ts",
      );
    });
  };

  // --- RENDER ---
  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-background text-foreground">
        {/* Header Toolbar */}
        {fileSystem.state.selectedFile && (
          <div className="flex items-center justify-between p-3 border-b border-border bg-accent/50">
            {/* Left: Filename */}
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded bg-accent border border-border">
                {isAssetImage ? (
                  <FileImage className="w-3.5 h-3.5 text-indigo-400" />
                ) : (
                  <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                )}
              </div>
              <span className="text-sm font-medium tracking-tight text-foreground">
                {fileSystem.state.selectedFile}
              </span>
              {readOnly && (
                <span className="px-1.5 py-0.5 text-[10px] bg-accent text-muted-foreground rounded uppercase tracking-wider font-semibold">
                  Read Only
                </span>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-block text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mr-2">
                {isAssetImage ? "Image" : editorLanguage}
              </span>

              {!readOnly && (
                <div className="flex items-center gap-1">
                  {/* Save Button */}
                  {prototypeId && fileSystem.state.files && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                            isSaving && "text-indigo-400 animate-pulse",
                            saveButtonState.disabled &&
                            "opacity-30 cursor-not-allowed hover:bg-transparent",
                          )}
                          onClick={
                            saveMode === "single-file"
                              ? handleSaveSingleFile
                              : handleSaveFiles
                          }
                          disabled={isSaving || saveButtonState.disabled}
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        className="bg-accent border-border text-xs"
                      >
                        <p>{saveButtonState.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Add / Upload Menu */}
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors data-[state=open]:bg-accent"
                            disabled={userPlan === "free"}
                          >
                            <Plus
                              className={cn(
                                "w-4 h-4",
                                userPlan === "free" && "opacity-30",
                              )}
                            />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        className="bg-accent border-border text-xs"
                      >
                        <p>
                          {userPlan === "free"
                            ? "Upgrade to add files"
                            : "Create or upload"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent
                      align="end"
                      className="w-48 bg-accent border border-border text-foreground shadow-2xl"
                    >
                      <DropdownMenuItem
                        onSelect={() => setShowNewFileModal(true)}
                        disabled={userPlan === "free"}
                        className="focus:bg-accent/80 focus:text-foreground cursor-pointer"
                      >
                        <FileCode className="mr-2 h-4 w-4 text-indigo-400" />
                        Create new file
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setShowUploadModal(true)}
                        disabled={userPlan === "free"}
                        className="focus:bg-accent/80 focus:text-foreground cursor-pointer"
                      >
                        <Upload className="mr-2 h-4 w-4 text-indigo-400" />
                        Upload files
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Delete Button */}
                  {canDelete && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          onClick={handleDeleteFile}
                          disabled={userPlan === "free"}
                        >
                          <Trash2
                            className={cn(
                              "w-4 h-4",
                              userPlan === "free" && "opacity-30",
                            )}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        className="bg-accent border-border text-xs"
                      >
                        <p>Delete file</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Free Plan Banner */}
          {userPlan === "free" && (
            <div className="absolute top-0 left-0 right-0 z-20 bg-amber-500/10 border-b border-amber-500/20 backdrop-blur-md px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-3 h-3 text-amber-500" />
                <span className="text-xs text-amber-200/80 font-medium">
                  Read-only mode
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/20 rounded-full"
                onClick={() => handleCheckout("plus", router)}
              >
                Upgrade Plan
              </Button>
            </div>
          )}

          <div className="flex-1 h-full relative">
            {isAssetImage ? (
              isLoadingImageUrl ? (
                // Loading state while generating signed URL
                <div className="h-full flex items-center justify-center bg-[#0B0C0E]">
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                    <p className="text-sm text-muted-foreground">
                      Loading asset...
                    </p>
                  </div>
                </div>
              ) : imageUrl ? (
                // Image Preview
                <div className="h-full flex items-center justify-center bg-opacity-5 relative">
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0E] via-transparent to-transparent opacity-50 pointer-events-none" />

                  <div className="relative flex flex-col items-center gap-6 max-w-full p-8">
                    <div className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt={fileSystem.state.selectedFile}
                        className="relative max-w-full max-h-[50vh] object-contain rounded-lg border border-white/10 shadow-2xl bg-[#0B0C0E]"
                      />
                    </div>

                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                        <FileImage className="w-3 h-3 text-white/50" />
                        <span className="text-xs font-mono text-white/70">
                          {fileSystem.state.selectedFile}
                        </span>
                      </div>
                      <a
                        href={imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
                      >
                        Open original
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                // Error state - failed to load signed URL
                <div className="h-full flex items-center justify-center bg-[#0B0C0E]">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Failed to load asset
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Unable to generate preview URL
                      </p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              // Code Editor
              <Editor
                height="100%"
                language={editorLanguage}
                value={fileSystem.getSelectedFileContent()}
                onChange={onChange}
                theme="materialize-dark"
                beforeMount={beforeMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontLigatures: true,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: "on",
                  folding: true,
                  padding: { top: 16, bottom: 16 },
                  renderLineHighlight: "line",
                  readOnly: readOnly || userPlan === "free",
                  contextmenu: !(readOnly || userPlan === "free"),
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  scrollbar: {
                    vertical: "visible",
                    horizontal: "visible",
                    useShadows: false,
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10,
                  },
                }}
              />
            )}
          </div>
        </div>

        {/* --- Modals (Styled for Materialize) --- */}

        {/* Upload Modal */}
        <Dialog
          open={showUploadModal}
          onOpenChange={(open) => {
            setShowUploadModal(open);
            if (!open) handleUploadModalClose();
          }}
        >
          <DialogContent className="sm:max-w-2xl max-h-[90vh] bg-white dark:bg-[#141517] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white shadow-2xl p-0 overflow-hidden gap-0 flex flex-col">
            <DialogHeader className="px-6 pt-6 pb-2 text-center space-y-3 bg-white dark:bg-[#141517]">
              <div className="flex items-center justify-center">
                <div className="p-2.5 bg-zinc-50 dark:bg-[#0B0C0E] border border-zinc-200 dark:border-white/10 rounded-xl shadow-inner">
                  <Upload className="w-5 h-5 text-zinc-900 dark:text-white" />
                </div>
              </div>
              <DialogTitle className="text-xl font-medium tracking-tight text-zinc-900 dark:text-white">
                Upload Files
              </DialogTitle>
            </DialogHeader>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Type Selection */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#8A8F98]">
                  Upload Type
                </Label>
                <RadioGroup
                  value={uploadType}
                  onValueChange={(val: "files" | "folder") => {
                    setUploadType(val);
                    setUploadFiles([]);
                    setUploadError("");
                    setUploadAsProjectRoot(false);
                  }}
                  className="grid grid-cols-2 gap-4"
                >
                  <div
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                      uploadType === "files"
                        ? "bg-zinc-50 dark:bg-white/5 border-zinc-900 dark:border-white shadow-sm"
                        : "bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20",
                    )}
                  >
                    <RadioGroupItem
                      value="files"
                      id="type-files"
                      className="border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white shrink-0"
                    />
                    <Label
                      htmlFor="type-files"
                      className="cursor-pointer text-sm font-medium flex-1"
                    >
                      Individual Files
                    </Label>
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                      uploadType === "folder"
                        ? "bg-zinc-50 dark:bg-white/5 border-zinc-900 dark:border-white shadow-sm"
                        : "bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20",
                    )}
                  >
                    <RadioGroupItem
                      value="folder"
                      id="type-folder"
                      className="border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white shrink-0"
                    />
                    <Label
                      htmlFor="type-folder"
                      className="cursor-pointer text-sm font-medium flex-1"
                    >
                      Entire Folder
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Project Root Option (only for folder uploads) */}
              {uploadType === "folder" && (
                <div className="space-y-3">
                  <div
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border transition-all",
                      uploadAsProjectRoot
                        ? "bg-amber-50 dark:bg-amber-900/10 border-amber-500 dark:border-amber-500/50"
                        : "bg-zinc-50 dark:bg-white/5 border-zinc-200 dark:border-white/10",
                    )}
                  >
                    <Checkbox
                      id="upload-as-root"
                      checked={uploadAsProjectRoot}
                      onCheckedChange={(checked) =>
                        setUploadAsProjectRoot(checked === true)
                      }
                      className="mt-0.5 border-border data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                    />
                    <div className="flex-1 space-y-1">
                      <Label
                        htmlFor="upload-as-root"
                        className="cursor-pointer text-sm font-medium flex items-center gap-2"
                      >
                        Upload as Project Root
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      </Label>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Replace entire project structure. All existing files
                        will be deleted.
                      </p>
                    </div>
                  </div>
                  {uploadAsProjectRoot && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 dark:text-amber-200/90 space-y-1">
                        <p className="font-semibold">
                          Warning: Destructive Operation
                        </p>
                        <p>
                          The top-level folder will be stripped and its contents
                          will replace your entire project. Files like
                          package.json, tsconfig.json will be overwritten.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Destination (if files or folder without project root) */}
              {uploadType === "files" && !uploadAsProjectRoot && (
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#8A8F98]">
                    Destination
                  </Label>
                  <Select
                    value={uploadTargetFolder}
                    onValueChange={handleUploadFolderChange}
                  >
                    <SelectTrigger className="h-11 bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white focus:ring-0 focus:border-indigo-500 dark:focus:border-white/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#141517] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white">
                      {directoryOptions.map((dir) => (
                        <SelectItem
                          key={dir}
                          value={dir}
                          className="focus:bg-accent/80 focus:text-foreground cursor-pointer"
                        >
                          {dir === ROOT_FOLDER_VALUE ? "/" : dir}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* File Input */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#8A8F98]">
                  Select Content
                </Label>
                <div className="relative">
                  <Input
                    id="fileUpload"
                    type="file"
                    {...(uploadType === "folder"
                      ? { webkitdirectory: "", directory: "" }
                      : { multiple: true })}
                    onChange={handleUploadFileSelection}
                    className="cursor-pointer h-11 bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white py-2 file:cursor-pointer file:bg-zinc-100 dark:file:bg-white/10 file:text-zinc-900 dark:file:text-white file:border-0 file:rounded-md file:mr-4 file:px-4 file:py-1 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:hover:file:bg-white/20 file:transition-colors"
                  />
                </div>
                {uploadError && (
                  <p className="text-red-400 text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {uploadError}
                  </p>
                )}
              </div>

              {/* File Selection Preview */}
              {fileValidation.size > 0 && (
                <>
                  {/* Conflict Mode Selection */}
                  {uploadSummary.conflicts > 0 && (
                    <div className="space-y-3">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#8A8F98]">
                        Conflict Resolution
                      </Label>
                      <RadioGroup
                        value={uploadMode}
                        onValueChange={(val: UploadMode) => setUploadMode(val)}
                        className="grid grid-cols-2 gap-3"
                      >
                        <div
                          className={cn(
                            "flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer",
                            uploadMode === "merge"
                              ? "bg-zinc-50 dark:bg-white/5 border-zinc-900 dark:border-white shadow-sm"
                              : "bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20",
                          )}
                        >
                          <RadioGroupItem
                            value="merge"
                            id="mode-merge"
                            className="border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white"
                          />
                          <Label
                            htmlFor="mode-merge"
                            className="cursor-pointer text-xs font-medium"
                          >
                            Skip conflicts
                          </Label>
                        </div>
                        <div
                          className={cn(
                            "flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer",
                            uploadMode === "replace"
                              ? "bg-zinc-50 dark:bg-white/5 border-zinc-900 dark:border-white shadow-sm"
                              : "bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20",
                          )}
                        >
                          <RadioGroupItem
                            value="replace"
                            id="mode-replace"
                            className="border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white"
                          />
                          <Label
                            htmlFor="mode-replace"
                            className="cursor-pointer text-xs font-medium"
                          >
                            Replace conflicts
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}

                  {/* File List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#8A8F98]">
                        Files to Upload
                      </Label>
                      <div className="flex items-center gap-2">
                        {uploadType === "folder" && fileTree.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const allPaths = Array.from(
                                fileValidation.keys(),
                              );
                              const allExpanded = allPaths.every((path) => {
                                const parts = path.split("/");
                                return parts.slice(0, -1).every((_, i) => {
                                  const folderPath = parts
                                    .slice(0, i + 1)
                                    .join("/");
                                  return expandedFolders.has(folderPath);
                                });
                              });

                              if (allExpanded) {
                                setExpandedFolders(new Set());
                              } else {
                                const allFolderPaths = new Set<string>();
                                allPaths.forEach((path) => {
                                  const parts = path.split("/");
                                  parts.slice(0, -1).forEach((_, i) => {
                                    allFolderPaths.add(
                                      parts.slice(0, i + 1).join("/"),
                                    );
                                  });
                                });
                                setExpandedFolders(allFolderPaths);
                              }
                            }}
                            className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                          >
                            {expandedFolders.size === 0
                              ? "Expand All"
                              : "Collapse All"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={toggleAllFiles}
                          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          {selectedFiles.size ===
                            uploadSummary.total - uploadSummary.blocked
                            ? "Deselect All"
                            : "Select All"}
                        </button>
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto border border-zinc-200 dark:border-white/10 rounded-xl bg-white/50 dark:bg-[#0B0C0E]/50">
                      <div>
                        {fileTree.map((node) => renderFileNode(node, 0))}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#0B0C0E] border border-zinc-200 dark:border-white/10">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-green-400" />
                        <span className="text-zinc-500 dark:text-[#8A8F98]">Selected:</span>
                        <span className="font-semibold text-foreground">
                          {uploadSummary.selected}/{uploadSummary.total}
                        </span>
                      </div>
                      {uploadSummary.blocked > 0 && (
                        <div className="flex items-center gap-2">
                          <X className="w-3 h-3 text-red-400" />
                          <span className="text-zinc-500 dark:text-[#8A8F98]">
                            Blocked:
                          </span>
                          <span className="font-semibold text-foreground">
                            {uploadSummary.blocked}
                          </span>
                        </div>
                      )}
                      {uploadSummary.conflicts > 0 && (
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          <span className="text-zinc-500 dark:text-[#8A8F98]">
                            Conflicts:
                          </span>
                          <span className="font-semibold text-foreground">
                            {uploadSummary.conflicts}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Minus className="w-3 h-3 text-indigo-400" />
                        <span className="text-zinc-500 dark:text-[#8A8F98]">Size:</span>
                        <span className="font-semibold text-foreground">
                          {formatFileSize(uploadSummary.totalSize)}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <DialogFooter className="p-6 bg-white dark:bg-[#141517] border-t border-zinc-200 dark:border-white/10">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowUploadModal(false)}
                className="h-11 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 font-medium rounded-lg"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUploadFiles}
                disabled={isUploading || selectedFiles.size === 0}
                className="h-11 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium rounded-lg px-6"
              >
                {isUploading
                  ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
                  : `Upload ${selectedFiles.size} file${selectedFiles.size !== 1 ? "s" : ""}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New File Modal */}
        <Dialog
          open={showNewFileModal}
          onOpenChange={(open) => {
            setShowNewFileModal(open);
            if (!open) handleModalClose();
          }}
        >
          <DialogContent className="sm:max-w-md bg-white dark:bg-[#141517] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-500" />
                Create New File
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label
                  htmlFor="fileName"
                  className="text-xs text-zinc-500 dark:text-[#8A8F98] uppercase tracking-wider font-semibold"
                >
                  Path & Name
                </Label>
                <Input
                  id="fileName"
                  value={newFileName}
                  onChange={(e) => {
                    setNewFileName(e.target.value);
                    setNewFileError("");
                  }}
                  placeholder="components/Button.tsx"
                  className="bg-white dark:bg-[#0B0C0E] border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                  autoFocus
                />
                {newFileError && (
                  <p className="text-red-400 text-xs">{newFileError}</p>
                )}
              </div>
              <div className="p-3 rounded bg-zinc-50 dark:bg-[#0B0C0E] border border-zinc-200 dark:border-white/10 text-xs text-zinc-500 dark:text-[#8A8F98] space-y-1">
                <p className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-indigo-400" /> Tips:
                </p>
                <ul className="list-disc list-inside pl-1 space-y-0.5 opacity-80">
                  <li>
                    Use <code>.tsx</code> for React components
                  </li>
                  <li>
                    Use forward slashes <code>/</code> to create folders
                  </li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowNewFileModal(false)}
                className="text-muted-foreground hover:text-zinc-900 dark:hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreateFile()}
                className="bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-white/90 rounded-full font-semibold"
              >
                Create File
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-sm bg-white dark:bg-[#141517] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white">
            <DialogHeader>
              <DialogTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Delete File?
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="text-zinc-900 dark:text-white font-mono bg-zinc-100 dark:bg-white/10 px-1 py-0.5 rounded">
                {fileSystem.state.selectedFile}
              </span>
              ?
              <br />
              This action cannot be undone.
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowDeleteConfirm(false)}
                className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (fileSystem.state.selectedFile)
                    await handleDeleteFileWithAPI(
                      fileSystem.state.selectedFile,
                    );
                  setShowDeleteConfirm(false);
                }}
                className="bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-200 dark:border-red-500/20"
              >
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Project Root Upload Confirmation */}
        <Dialog
          open={showProjectRootConfirm}
          onOpenChange={setShowProjectRootConfirm}
        >
          <DialogContent className="sm:max-w-md bg-white dark:bg-[#141517] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white">
            <DialogHeader>
              <DialogTitle className="text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Replace Entire Project?
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                This will{" "}
                <span className="text-zinc-900 dark:text-white font-semibold">
                  delete all existing files
                </span>{" "}
                and replace your entire project structure with the uploaded
                folder.
              </p>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-900 dark:text-amber-200/90 font-medium mb-2">
                  Files that will be affected:
                </p>
                <ul className="text-xs text-amber-900/90 dark:text-amber-200/80 space-y-1">
                  <li>
                    • All {Object.keys(fileSystem.state.files).length} existing
                    files will be deleted
                  </li>
                  <li>
                    • {selectedFiles.size} new files will be uploaded to project
                    root
                  </li>
                  <li>
                    • Configuration files (package.json, etc.) will be
                    overwritten
                  </li>
                </ul>
              </div>
              <p className="text-xs text-red-400 font-semibold">
                ⚠️ This action cannot be undone
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowProjectRootConfirm(false)}
                className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  setShowProjectRootConfirm(false);
                  await executeUpload();
                }}
                className="bg-amber-500 text-white dark:text-black hover:bg-amber-600 dark:hover:bg-amber-400 rounded-full font-semibold"
              >
                Replace Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default CodeEditor;
