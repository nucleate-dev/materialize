"use client";

import { supabase } from "@/ClientConstants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UseFileSystemReturn } from "@/hooks/useFileSystem";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  UpdateFilesRequestBody,
  UpdateFilesResponse,
} from "@/lib/types/serverAPITypes";
import Editor from "@monaco-editor/react";
import { FileText, Plus, Save, Trash2 } from "lucide-react";
import React, { useState } from "react";

interface CodeEditorProps {
  fileSystem: UseFileSystemReturn;
  prototypeId: string;
  language?: string;
  readOnly?: boolean;
  onViewingUrlUpdate?: (url: string) => void;
  onBuildingStateChange?: (isBuilding: boolean) => void;
  // Save behavior control
  saveMode?: "single-file" | "all-files"; // Defaults to 'single-file' for better performance
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  fileSystem,
  prototypeId,
  language = "typescript",
  readOnly = false,
  onViewingUrlUpdate,
  onBuildingStateChange,
  saveMode = "single-file", // Default to single file saves
}) => {
  const logger = useProductLogger();
  // Extract values from fileSystem
  const availableFiles = Object.keys(fileSystem.state.files);
  const canDelete = availableFiles.length > 1;

  // File change handler
  const onChange = (value: string | undefined) => {
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleCreateFile = () => {
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
    if (fileSystem.state.selectedFile) {
      setShowDeleteConfirm(true);
    }
  };

  const handleModalClose = () => {
    setNewFileName("");
    setNewFileError("");
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

      const result: UpdateFilesResponse = await response.json();

      // Handle successful response
      if ("success" in result && result.success) {
        // Update viewing URL if provided
        if (result.viewing_url && onViewingUrlUpdate) {
          onViewingUrlUpdate(result.viewing_url);
        }
      } else {
        // Handle error response
        const errorResponse = result as { error: string; message: string };
        logger.debug("error", "Failed to update file:", {
          ...errorResponse,
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

      const result: UpdateFilesResponse = await response.json();

      // Handle successful response
      if ("success" in result && result.success) {
        // Update viewing URL if provided
        if (result.viewing_url && onViewingUrlUpdate) {
          onViewingUrlUpdate(result.viewing_url);
        }
      } else {
        // Handle error response
        const errorResponse = result as { error: string; message: string };
        logger.debug("error", "Failed to update files:", {
          ...errorResponse,
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={
                      saveMode === "single-file"
                        ? handleSaveSingleFile
                        : handleSaveFiles
                    }
                    disabled={isSaving}
                    title={
                      saveMode === "single-file"
                        ? "Save current file"
                        : "Save all files"
                    }
                  >
                    <Save
                      className={`w-3 h-3 ${isSaving ? "animate-pulse" : ""}`}
                    />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setShowNewFileModal(true)}
                  title="Create new file"
                >
                  <Plus className="w-3 h-3" />
                </Button>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={handleDeleteFile}
                    title={`Delete ${fileSystem.state.selectedFile}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex-1">
        {isAssetImage && imageUrl ? (
          <div className="h-full flex items-center justify-center bg-muted/20 p-4">
            <div className="max-w-full max-h-full flex flex-col items-center space-y-4">
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
              readOnly,
              contextmenu: !readOnly,
              quickSuggestions: !readOnly,
              parameterHints: { enabled: !readOnly },
              suggestOnTriggerCharacters: !readOnly,
              acceptSuggestionOnEnter: readOnly ? "off" : "on",
              tabCompletion: readOnly ? "off" : "on",
              wordBasedSuggestions: !readOnly ? "currentDocument" : "off",
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
                <p className="text-destructive text-sm mt-1">{newFileError}</p>
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
            <Button variant="ghost" onClick={() => setShowNewFileModal(false)}>
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
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (fileSystem.state.selectedFile) {
                  fileSystem.deleteFile(fileSystem.state.selectedFile);
                }
                setShowDeleteConfirm(false);
              }}
            >
              Delete File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CodeEditor;
