"use client";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { supabase } from "@/ClientConstants";
import { ENABLE_ASSET_UPLOAD } from "@/GlobalConstants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UseFileSystemReturn } from "@/hooks/useFileSystem";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  UpdateFilesErrorResponse,
  UpdateFilesRequestBody,
  UpdateFilesSuccessResponse,
} from "@/lib/types/serverAPITypes";
import Editor from "@monaco-editor/react";
import { FileText, Plus, Save, Trash2, Upload } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

interface CodeEditorProps {
  fileSystem: UseFileSystemReturn;
  prototypeId: string;
  language?: string;
  readOnly?: boolean;
  onViewingUrlUpdate?: (url: string) => void;
  onBuildingStateChange?: (isBuilding: boolean) => void;
  // Save behavior control
  saveMode?: "single-file" | "all-files"; // Defaults to 'single-file' for better performance
  currentRenderStatus?: RenderStatus;
}

const ROOT_FOLDER_VALUE = "__ROOT__";
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "json",
]);

const ALLOWED_ASSET_EXTENSIONS = new Set([
  // Images
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  // Fonts
  "ttf",
  "otf",
  "woff",
  "woff2",
  // Other common assets
  "md",
  "txt",
  "env",
  "gitignore",
]);

type UploadMode = "merge" | "replace" | "replace-all";

const CodeEditor: React.FC<CodeEditorProps> = ({
  fileSystem,
  prototypeId,
  language = "typescript",
  readOnly = false,
  onViewingUrlUpdate,
  onBuildingStateChange,
  saveMode = "single-file", // Default to single file saves
  currentRenderStatus,
}) => {
  const logger = useProductLogger();
  const { userPlan } = useSubscriptionAccess();

  // Extract values from fileSystem
  const availableFiles = Object.keys(fileSystem.state.files);
  const canDelete = availableFiles.length > 1;

  // File change handler
  const onChange = (value: string | undefined) => {
    // Prevent editing for free users
    if (userPlan === "free") {
      return;
    }

    if (value !== undefined && fileSystem.state.selectedFile) {
      fileSystem.updateFileContentLocally(fileSystem.state.selectedFile, value);
    }
  };
  // Determine language from file extension if not provided
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

  const isAsset = (fileName: string) => {
    return (
      fileName && fileSystem.state.assets && fileName in fileSystem.state.assets
    );
  };

  // Check if current file is an image asset
  const isImageFile = (name: string) => {
    const ext = name?.split(".").pop()?.toLowerCase();
    return ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(
      ext || "",
    );
  };

  // Get the current file data to check if it's an asset with storage_path
  // TODO: if the sole purpose of this currentFile is to check if the file is an asset, then we should just check if the file is an asset no need to check the files array
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
  const imageUrl =
    isAssetImage && currentFile && "storage_url" in currentFile
      ? currentFile?.storage_url
      : null;

  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileError, setNewFileError] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [uploadTargetFolder, setUploadTargetFolder] = useState<string>(
    ROOT_FOLDER_VALUE,
  );
  const [uploadMode, setUploadMode] = useState<UploadMode>("merge");
  const [uploadType, setUploadType] = useState<"files" | "folder">("files");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const directoryOptions = useMemo(() => {
    const directories = new Set<string>([ROOT_FOLDER_VALUE]);
    availableFiles.forEach((filePath) => {
      const parts = filePath.split("/");
      parts.pop();
      if (parts.length === 0) {
        return;
      }
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

  const resolvedUploadFolder =
    uploadTargetFolder === ROOT_FOLDER_VALUE ? "" : uploadTargetFolder;

  const buildUploadPath = useCallback(
    (fileName: string) =>
      resolvedUploadFolder ? `${resolvedUploadFolder}/${fileName}` : fileName,
    [resolvedUploadFolder],
  );

  const uploadConflicts = useMemo(() => {
    if (!uploadFiles.length) {
      return [] as string[];
    }

    return uploadFiles
      .map((file) => buildUploadPath(file.name))
      .filter((path) => Boolean(fileSystem.state.files[path]));
  }, [uploadFiles, fileSystem.state.files, buildUploadPath]);

  // Determine save button state based on render status and subscription
  const saveButtonState = useMemo(() => {
    // Check subscription first - free users can't save
    if (userPlan === "free") {
      return {
        disabled: true,
        tooltip: "Upgrade to Pro to save files",
      };
    }

    switch (currentRenderStatus) {
      case "Static build":
        return {
          disabled: true,
          tooltip: "Start dev server to enable file saving",
        };
      case "Starting Dev Server..":
        return {
          disabled: true,
          tooltip: "Wait for dev server to start before saving",
        };
      case "Disconnected":
        return {
          disabled: true,
          tooltip: "Dev server disconnected - restart to enable saving",
        };
      case "Connected":
      case "Connecting..":
      case "Updating..":
        return {
          disabled: false,
          tooltip:
            saveMode === "single-file" ? "Save current file" : "Save all files",
        };
      default:
        return {
          disabled: false,
          tooltip:
            saveMode === "single-file" ? "Save current file" : "Save all files",
        };
    }
  }, [currentRenderStatus, saveMode, userPlan]);

  const handleCreateFile = () => {
    // Prevent file creation for free users
    if (userPlan === "free") {
      setNewFileError("Upgrade to Pro to create files");
      return;
    }

    if (!newFileName.trim()) {
      setNewFileError("File name is required");
      return;
    }

    // Check if file already exists
    if (availableFiles.includes(newFileName.trim())) {
      setNewFileError("File already exists");
      return;
    }

    // Validate file name (basic validation)
    const fileName = newFileName.trim();
    if (!/^[a-zA-Z0-9._/-]+$/.test(fileName)) {
      setNewFileError(
        "Invalid file name. Use only letters, numbers, dots, hyphens, underscores, and forward slashes.",
      );
      return;
    }

    // Get default content based on file extension
    const getDefaultContent = (name: string) => {
      const ext = name.split(".").pop()?.toLowerCase();
      switch (ext) {
        case "js":
        case "jsx":
          return `import React from 'react';\nimport { View, Text } from 'react-native';\n\nexport default function ${name.split(".")[0].replace(/[^a-zA-Z0-9]/g, "")}() {\n  return (\n    <View>\n      <Text>Hello from ${name}!</Text>\n    </View>\n  );\n}`;
        case "ts":
        case "tsx":
          return `import React from 'react';\nimport { View, Text } from 'react-native';\n\ninterface Props {}\n\nexport default function ${name.split(".")[0].replace(/[^a-zA-Z0-9]/g, "")}({}: Props) {\n  return (\n    <View>\n      <Text>Hello from ${name}!</Text>\n    </View>\n  );\n}`;
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

    fileSystem.createFile(fileName, getDefaultContent(fileName));
    setShowNewFileModal(false);
    setNewFileName("");
    setNewFileError("");
  };

  const handleDeleteFile = () => {
    // Prevent file deletion for free users
    if (userPlan === "free") {
      return;
    }

    if (fileSystem.state.selectedFile) {
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
  };

  const handleUploadFolderChange = (value: string) => {
    setUploadTargetFolder(value);
    setUploadError("");
  };

  const handleUploadFileSelection = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const filesList = event.target.files
      ? Array.from(event.target.files)
      : [];

    // Allow selecting the same files again later
    event.target.value = "";

    if (!filesList.length) {
      setUploadFiles([]);
      setUploadError("");
      return;
    }

    const validFiles: File[] = [];
    const skippedFiles: string[] = [];

    filesList.forEach((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isCodeFile = ALLOWED_UPLOAD_EXTENSIONS.has(ext);
      const isAssetFile = ENABLE_ASSET_UPLOAD && ALLOWED_ASSET_EXTENSIONS.has(ext);

      if (isCodeFile || isAssetFile) {
        validFiles.push(file);
      } else {
        skippedFiles.push(file.name);
      }
    });

    if (skippedFiles.length) {
      const supportedTypes = ENABLE_ASSET_UPLOAD
        ? ".js, .jsx, .ts, .tsx, .json, images, fonts, .md, .txt"
        : ".js, .jsx, .ts, .tsx, .json";
      setUploadError(
        `Skipped ${skippedFiles.length} unsupported file(s). Supported types: ${supportedTypes}.`,
      );
    } else {
      setUploadError("");
    }

    setUploadFiles(validFiles);
  };

  const handleUploadFiles = async () => {
    if (userPlan === "free") {
      setUploadError("Upgrade to Pro to upload files");
      return;
    }

    if (!uploadFiles.length) {
      setUploadError("Select at least one file to upload");
      return;
    }

    if (uploadMode === "merge" && uploadConflicts.length) {
      setUploadError(
        `${uploadConflicts.length} file(s) already exist. Switch to "Replace" mode or choose a different folder.`,
      );
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: uploadFiles.length });

    try {
      // Handle replace-all mode: delete all existing files first
      if (uploadMode === "replace-all") {
        const filesToDelete = Object.keys(fileSystem.state.files);
        for (const filePath of filesToDelete) {
          await fileSystem.deleteFile(filePath);
        }
      }

      // Upload files with progress tracking
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        setUploadProgress({ current: i + 1, total: uploadFiles.length });

        // Build file path, preserving folder structure from folder upload
        let newFilePath: string;
        if (uploadType === "folder" && file.webkitRelativePath) {
          // For folder uploads, use the relative path
          const relativePath = file.webkitRelativePath;
          newFilePath = resolvedUploadFolder
            ? `${resolvedUploadFolder}/${relativePath}`
            : relativePath;
        } else {
          // For individual files, use the build path
          newFilePath = buildUploadPath(file.name);
        }

        // Handle replace mode: delete existing file if it exists
        if (
          uploadMode === "replace" &&
          fileSystem.state.files[newFilePath]
        ) {
          await fileSystem.deleteFile(newFilePath);
        }

        const fileContents = await file.text();
        await fileSystem.createFile(newFilePath, fileContents);
      }

      setShowUploadModal(false);
      handleUploadModalClose();
    } catch (error) {
      logger.debug("error", "Error uploading files:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      setUploadError("Failed to upload files. Please try again.");
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const handleSaveSingleFile = async () => {
    if (
      !prototypeId ||
      !fileSystem.state.selectedFile ||
      fileSystem.getSelectedFileContent() === undefined ||
      !fileSystem.state.files
    ) {
      logger.debug(
        "error",
        "Cannot save: missing prototype ID, filename, file content, or files object",
      );
      return;
    }

    setIsSaving(true);
    if (onBuildingStateChange) {
      onBuildingStateChange(true);
    }

    try {
      // First, persist the file to the database
      const saveSuccess = await fileSystem.saveSingleFile(
        fileSystem.state.selectedFile,
      );
      if (!saveSuccess) {
        logger.debug("error", "Failed to persist file to database");
        return;
      }

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        logger.debug("error", "No authentication token available");
        return;
      }

      const requestBody: UpdateFilesRequestBody = {
        files: [fileSystem.state.files[fileSystem.state.selectedFile]],
        assets: [],
        prototype_id: prototypeId,
      };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/files/update-files`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        logger.debug("error", "Update files request failed:", {
          ...errorData,
        });
        throw new Error(
          `Update failed: ${errorData.message || "Unknown error"}`,
        );
      }

      const result: APIResponse<UpdateFilesSuccessResponse, UpdateFilesErrorResponse> = await response.json();

      // Handle successful response
      if (result.data) {
        // Update viewing URL if provided
        if (result.data.viewing_url && onViewingUrlUpdate) {
          onViewingUrlUpdate(result.data.viewing_url);
        }
      } else if (result.error) {
        // Handle error response
        logger.debug("error", "Failed to update file:", {
          ...result.error,
        });
        // TODO: if no active dev server, provide helpful message
      }
    } catch (error) {
      logger.debug("error", "Error updating file:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsSaving(false);
      if (onBuildingStateChange) {
        onBuildingStateChange(false);
      }
    }
  };

  const handleSaveFiles = async () => {
    if (!prototypeId || !fileSystem.state.files) {
      logger.debug("error", "Cannot save: missing prototype ID or files");
      return;
    }

    setIsSaving(true);
    if (onBuildingStateChange) {
      onBuildingStateChange(true);
    }
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        logger.debug("error", "No authentication token available");
        return;
      }

      // Convert files from Record format to array format expected by update-files API
      const filesArray = Object.entries(fileSystem.state.files).map(
        ([path, file]) => ({
          contents: file.contents,
          name: path,
          prototype_id: file.prototype_id || prototypeId,
          id: file.id,
          created_at: file.created_at || null,
          updated_at: file.updated_at || null,
        }),
      );

      const requestBody: UpdateFilesRequestBody = {
        files: filesArray,
        assets: [],
        prototype_id: prototypeId,
      };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/files/update-files`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        logger.debug("error", "Update files request failed:", {
          ...errorData,
        });
        throw new Error(
          `Update failed: ${errorData.message || "Unknown error"}`,
        );
      }

      const result: APIResponse<UpdateFilesSuccessResponse, UpdateFilesErrorResponse> = await response.json();

      // Handle successful response
      if (result.data) {
        // Update viewing URL if provided
        if (result.data.viewing_url && onViewingUrlUpdate) {
          onViewingUrlUpdate(result.data.viewing_url);
        }
      } else if (result.error) {
        // Handle error response
        logger.debug("error", "Failed to update files:", {
          ...result.error,
        });

        // TODO: If no active dev server, provide helpful message
      }
    } catch (error) {
      logger.debug("error", "Error updating files:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsSaving(false);
      if (onBuildingStateChange) {
        onBuildingStateChange(false);
      }
    }
  };

  const handleDeleteFileWithAPI = async (fileName: string) => {
    if (!prototypeId) {
      logger.debug("error", "Cannot delete: missing prototype ID");
      return;
    }

    setIsDeleting(true);
    if (onBuildingStateChange) {
      onBuildingStateChange(true);
    }

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        logger.debug("error", "No authentication token available");
        return;
      }

      const requestBody: UpdateFilesRequestBody = {
        files: [],
        assets: [],
        prototype_id: prototypeId,
        deleted_files: [fileName],
      };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/files/update-files`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        logger.debug("error", "Delete file request failed:", {
          ...errorData,
        });
        throw new Error(
          `Delete failed: ${errorData.message || "Unknown error"}`,
        );
      }

      const result: APIResponse<UpdateFilesSuccessResponse, UpdateFilesErrorResponse> = await response.json();

      // Handle successful response
      if (result.data) {
        // Update viewing URL if provided
        if (result.data.viewing_url && onViewingUrlUpdate) {
          onViewingUrlUpdate(result.data.viewing_url);
        }

        // Delete the file from local state after successful API call
        fileSystem.deleteFile(fileName);
      } else if (result.error) {
        // Handle error response
        logger.debug("error", "Failed to delete file:", {
          ...result.error,
        });
      }
    } catch (error) {
      logger.debug("error", "Error deleting file:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsDeleting(false);
      if (onBuildingStateChange) {
        onBuildingStateChange(false);
      }
    }
  };

  // Configure Monaco Editor before it loads
  const beforeMount = (monaco: typeof import("monaco-editor")) => {
    // Configure TypeScript compiler options to be less strict
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
      // Disable strict checks that cause red lines
      strict: false,
      noImplicitAny: false,
      noImplicitReturns: false,
      noImplicitThis: false,
      noUnusedLocals: false,
      noUnusedParameters: false,
      skipLibCheck: true,
    });

    // Configure JavaScript defaults
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    // Add some common React Native/Expo types to reduce red lines
    const extraLibs = [
      `declare module 'react-native' {
        export * from 'react-native';
      }`,
      `declare module 'expo-router' {
        export * from 'expo-router';
      }`,
      `declare module '@expo/vector-icons' {
        export * from '@expo/vector-icons';
      }`,
      `declare module 'expo' {
        export * from 'expo';
      }`,
      `declare module 'expo-splash-screen' {
        export * from 'expo-splash-screen';
      }`,
      `declare module 'expo-constants' {
        export * from 'expo-constants';
      }`,
      `declare module 'expo-font' {
        export * from 'expo-font';
      }`,
      `declare module 'expo-haptics' {
        export * from 'expo-haptics';
      }`,
      `declare module 'expo-image' {
        export * from 'expo-image';
      }`,
      `declare module 'expo-image-picker' {
        export * from 'expo-image-picker';
      }`,
      `declare module 'expo-linear-gradient' {
        export * from 'expo-linear-gradient';
      }`,
      `declare module 'expo-linking' {
        export * from 'expo-linking';
      }`,
      `declare module 'expo-location' {
        export * from 'expo-location';
      }`,
      `declare module 'expo-status-bar' {
        export * from 'expo-status-bar';
      }`,
      `declare module 'expo-system-ui' {
        export * from 'expo-system-ui';
      }`,
      `declare module 'expo-web-browser' {
        export * from 'expo-web-browser';
      }`,
      `declare module 'lucide-react-native' {
        export * from 'lucide-react-native';
      }`,
      `declare module 'tamagui' {
        export * from 'tamagui';
      }`,
      `declare module 'react-native-gesture-handler' {
        export * from 'react-native-gesture-handler';
      }`,
      `declare module 'react-native-safe-area-context' {
        export * from 'react-native-safe-area-context';
      }`,
      `declare module 'react-native-screens' {
        export * from 'react-native-screens';
      }`,
      `declare module 'react-native-svg' {
        export * from 'react-native-svg';
      }`,
      `declare module 'zustand' {
        export * from 'zustand';
      }`,
      `declare module '@tanstack/react-query' {
        export * from '@tanstack/react-query';
      }`,
      `declare module '@react-native-async-storage/async-storage' {
        export * from '@react-native-async-storage/async-storage';
      }`,
    ];

    extraLibs.forEach((lib) => {
      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        lib,
        "react-native-types.d.ts",
      );
      monaco.languages.typescript.javascriptDefaults.addExtraLib(
        lib,
        "react-native-types.d.ts",
      );
    });
  };

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col">
        {fileSystem.state.selectedFile && (
          <div className="flex items-center justify-between p-3 bg-muted/60 border-b border-border">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                {fileSystem.state.selectedFile}
              </span>
              {readOnly && (
                <span className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded-md font-medium">
                  Read Only
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-muted-foreground uppercase font-medium tracking-wider">
                {isAssetImage ? "IMAGE ASSET" : editorLanguage}
              </span>
              {!readOnly && (
                <div className="flex items-center space-x-1">
                  {prototypeId && fileSystem.state.files && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-flex">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={
                              saveMode === "single-file"
                                ? handleSaveSingleFile
                                : handleSaveFiles
                            }
                            disabled={isSaving || saveButtonState.disabled}
                          >
                            <Save
                              className={`w-3 h-3 ${isSaving ? "animate-pulse" : ""} ${saveButtonState.disabled ? "opacity-50" : ""}`}
                            />
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>{saveButtonState.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={userPlan === "free"}
                          >
                            <Plus className={`w-3 h-3 ${userPlan === "free" ? "opacity-50" : ""}`} />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>
                          {userPlan === "free"
                            ? "Upgrade to Pro to manage files"
                            : "Create or upload files"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onSelect={() => setShowNewFileModal(true)}
                        disabled={userPlan === "free"}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create new file
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setShowUploadModal(true)}
                        disabled={userPlan === "free"}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload files
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {canDelete && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-flex">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={handleDeleteFile}
                            disabled={userPlan === "free"}
                          >
                            <Trash2 className={`w-3 h-3 ${userPlan === "free" ? "opacity-50" : ""}`} />
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>{userPlan === "free" ? "Upgrade to Pro to delete files" : `Delete ${fileSystem.state.selectedFile}`}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col">
          {/* Free plan upgrade banner */}
          {userPlan === "free" && (
            <Alert className="rounded-none border-l-0 border-r-0 border-t-0 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50">
              <Save className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Read-only mode
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Upgrade to Pro to edit and save files
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-4 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                >
                  Upgrade to Pro
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex-1">
            {isAssetImage && imageUrl ? (
              <div className="h-full flex items-center justify-center bg-muted/20 p-4">
                <div className="max-w-full max-h-full flex flex-col items-center space-y-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={fileSystem.state.selectedFile}
                    className="max-w-full max-h-[calc(100vh-200px)] object-contain rounded-lg shadow-lg"
                    onError={(e) => {
                      logger.debug("error", "Failed to load image:", {
                        imageurl: imageUrl,
                      });
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {fileSystem.state.selectedFile}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Asset file • Click to view full size
                    </p>
                    <a
                      href={imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                      View Full Size
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <Editor
                height="100%"
                language={editorLanguage}
                value={fileSystem.getSelectedFileContent()}
                onChange={onChange}
                theme="vs-dark"
                beforeMount={beforeMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: "on",
                  folding: true,
                  lineDecorationsWidth: 10,
                  lineNumbersMinChars: 3,
                  readOnly: readOnly || userPlan === "free",
                  contextmenu: !(readOnly || userPlan === "free"),
                  quickSuggestions: !(readOnly || userPlan === "free"),
                  parameterHints: {
                    enabled: !(readOnly || userPlan === "free"),
                  },
                  suggestOnTriggerCharacters: !(
                    readOnly || userPlan === "free"
                  ),
                  acceptSuggestionOnEnter:
                    readOnly || userPlan === "free" ? "off" : "on",
                  tabCompletion: readOnly || userPlan === "free" ? "off" : "on",
                  wordBasedSuggestions: !(readOnly || userPlan === "free")
                    ? "currentDocument"
                    : "off",
                  scrollbar: {
                    vertical: "visible",
                    horizontal: "visible",
                    useShadows: true,
                    verticalHasArrows: true,
                    horizontalHasArrows: true,
                    verticalScrollbarSize: 14,
                    horizontalScrollbarSize: 14,
                  },
                }}
              />
            )}
          </div>
        </div>

        {/* Upload Files Modal */}
        <Dialog
          open={showUploadModal}
          onOpenChange={(open) => {
            setShowUploadModal(open);
            if (!open) {
              handleUploadModalClose();
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upload files or folder</DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Upload Type Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Upload type</Label>
                <RadioGroup
                  value={uploadType}
                  onValueChange={(value: "files" | "folder") => {
                    setUploadType(value);
                    setUploadFiles([]);
                    setUploadError("");
                  }}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="files" id="upload-files" />
                    <Label htmlFor="upload-files" className="font-normal cursor-pointer">
                      Individual files
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="folder" id="upload-folder" />
                    <Label htmlFor="upload-folder" className="font-normal cursor-pointer">
                      Entire folder
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Upload Mode Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Upload mode</Label>
                <RadioGroup
                  value={uploadMode}
                  onValueChange={(value: UploadMode) => setUploadMode(value)}
                  className="space-y-2"
                >
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="merge" id="mode-merge" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="mode-merge" className="font-normal cursor-pointer">
                        Merge (add new files, skip conflicts)
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Keeps existing files unchanged
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="replace" id="mode-replace" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="mode-replace" className="font-normal cursor-pointer">
                        Replace (overwrite existing files)
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Updates files that already exist
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="replace-all" id="mode-replace-all" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="mode-replace-all" className="font-normal cursor-pointer text-destructive">
                        Replace all (delete all files first)
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ⚠️ Deletes all existing files before uploading
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {/* Destination Folder - Only show for individual files */}
              {uploadType === "files" && (
                <div>
                  <Label htmlFor="upload-destination" className="text-sm font-medium">
                    Destination folder
                  </Label>
                  <Select
                    value={uploadTargetFolder}
                    onValueChange={handleUploadFolderChange}
                  >
                    <SelectTrigger id="upload-destination" className="mt-2">
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {directoryOptions.map((directory) => (
                        <SelectItem key={directory} value={directory}>
                          {directory === ROOT_FOLDER_VALUE
                            ? "Repository root (/)"
                            : directory}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Files will be uploaded to
                    <span className="mx-1 font-mono text-foreground">
                      {resolvedUploadFolder ? `/${resolvedUploadFolder}` : "/"}
                    </span>
                    in your project.
                  </p>
                </div>
              )}

              {/* File/Folder Selection */}
              <div>
                <Label htmlFor="fileUpload" className="text-sm font-medium">
                  {uploadType === "folder" ? "Choose folder" : "Choose files"}
                </Label>
                <Input
                  id="fileUpload"
                  type="file"
                  {...(uploadType === "folder"
                    ? { webkitdirectory: "", directory: "" }
                    : { multiple: true })}
                  onChange={handleUploadFileSelection}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {ENABLE_ASSET_UPLOAD
                    ? "Supported: code files (.js, .jsx, .ts, .tsx, .json), images, fonts, .md, .txt"
                    : "Supported file types: .js, .jsx, .ts, .tsx, .json"}
                </p>

                {uploadFiles.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Upload preview ({uploadFiles.length} file{uploadFiles.length !== 1 ? "s" : ""})
                      </p>
                      {isUploading && uploadProgress.total > 0 && (
                        <p className="text-xs text-primary font-medium">
                          {uploadProgress.current} / {uploadProgress.total}
                        </p>
                      )}
                    </div>

                    {isUploading && uploadProgress.total > 0 && (
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{
                            width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                          }}
                        />
                      </div>
                    )}

                    <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2">
                      <ul className="space-y-1 text-xs font-mono">
                        {uploadFiles.slice(0, 50).map((file, index) => {
                          let previewPath: string;
                          if (uploadType === "folder" && file.webkitRelativePath) {
                            previewPath = file.webkitRelativePath;
                          } else {
                            previewPath = buildUploadPath(file.name);
                          }
                          return (
                            <li key={`${previewPath}-${index}`} className="text-foreground">
                              <code className="px-1 py-0.5 rounded bg-muted text-foreground">
                                {previewPath}
                              </code>
                            </li>
                          );
                        })}
                        {uploadFiles.length > 50 && (
                          <li className="text-muted-foreground italic">
                            ... and {uploadFiles.length - 50} more files
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}

                {uploadConflicts.length > 0 && uploadMode === "merge" && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertDescription>
                      <p className="font-semibold mb-2">
                        {uploadConflicts.length} file(s) already exist:
                      </p>
                      <ul className="mt-2 list-disc list-inside space-y-1 max-h-24 overflow-y-auto">
                        {uploadConflicts.slice(0, 10).map((conflict) => (
                          <li key={conflict} className="font-mono text-xs">
                            <code className="px-1 py-0.5 rounded bg-muted text-foreground">
                              {conflict}
                            </code>
                          </li>
                        ))}
                        {uploadConflicts.length > 10 && (
                          <li className="italic text-xs">
                            ... and {uploadConflicts.length - 10} more
                          </li>
                        )}
                      </ul>
                      <p className="mt-3 text-sm">
                        Switch to "Replace" mode to overwrite, or choose a different folder.
                      </p>
                    </AlertDescription>
                  </Alert>
                )}

                {uploadMode === "replace-all" && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertDescription className="flex items-start gap-2">
                      <span className="text-lg">⚠️</span>
                      <div>
                        <p className="font-semibold">Warning: Replace All Mode</p>
                        <p className="text-sm mt-1">
                          This will delete all {Object.keys(fileSystem.state.files).length} existing files before uploading. This action cannot be undone.
                        </p>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {uploadError && (
                  <p className="text-destructive text-sm mt-3">{uploadError}</p>
                )}
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button
                variant="outline"
                onClick={() => setShowUploadModal(false)}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUploadFiles}
                disabled={
                  isUploading ||
                  uploadFiles.length === 0 ||
                  (uploadMode === "merge" && uploadConflicts.length > 0)
                }
                variant={uploadMode === "replace-all" ? "destructive" : "default"}
              >
                {isUploading
                  ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
                  : uploadMode === "replace-all"
                    ? "Replace All & Upload"
                    : `Upload ${uploadFiles.length} file${uploadFiles.length !== 1 ? "s" : ""}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New File Modal */}
        <Dialog
          open={showNewFileModal}
          onOpenChange={(open) => {
            setShowNewFileModal(open);
            if (!open) {
              handleModalClose();
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New File</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="fileName" className="text-sm font-medium">
                  File Name
                </Label>
                <Input
                  id="fileName"
                  type="text"
                  value={newFileName}
                  onChange={(e) => {
                    setNewFileName(e.target.value);
                    setNewFileError("");
                  }}
                  placeholder="e.g., components/MyComponent.tsx"
                  className="mt-2"
                  autoFocus
                />
                {newFileError && (
                  <p className="text-destructive text-sm mt-1">
                    {newFileError}
                  </p>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="mb-2">Supported file types:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>.js, .jsx - JavaScript/React components</li>
                  <li>.ts, .tsx - TypeScript/React components</li>
                  <li>.json - JSON configuration files</li>
                  <li>.md - Markdown documentation</li>
                  <li>.css - Stylesheets</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowNewFileModal(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateFile}>Create File</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Modal */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete File</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete{" "}
                <span className="font-mono font-medium text-foreground">
                  {fileSystem.state.selectedFile}
                </span>
                ? This action cannot be undone.
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (fileSystem.state.selectedFile) {
                    await handleDeleteFileWithAPI(fileSystem.state.selectedFile);
                  }
                  setShowDeleteConfirm(false);
                }}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete File"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default CodeEditor;
