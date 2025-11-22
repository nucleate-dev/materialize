"use client";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { supabase } from "@/ClientConstants";
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
import type {
  APIResponse,
  UpdateFilesErrorResponse,
  UpdateFilesRequestBody,
  UpdateFilesSuccessResponse,
} from "@/lib/types/serverAPITypes";
import { handleCheckout } from "@/lib/utils/payments/CheckoutUtils";
import Editor from "@monaco-editor/react";
import {
  AlertTriangle,
  Code2,
  FileCode,
  FileImage, Lock,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload
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
const ALLOWED_UPLOAD_EXTENSIONS = new Set(["js", "jsx", "ts", "tsx", "json"]);

const ALLOWED_ASSET_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico",
  "ttf", "otf", "woff", "woff2",
  "md", "txt", "env", "gitignore",
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
      case "jsx": return "javascript";
      case "ts":
      case "tsx": return "typescript";
      case "json": return "json";
      case "md": return "markdown";
      case "css": return "css";
      case "html": return "html";
      default: return "javascript";
    }
  };

  const editorLanguage = fileSystem.state.selectedFile
    ? getLanguageFromFileName(fileSystem.state.selectedFile)
    : language;

  const isAsset = (fileName: string) =>
    fileName && fileSystem.state.assets && fileName in fileSystem.state.assets;

  const isImageFile = (name: string) => {
    const ext = name?.split(".").pop()?.toLowerCase();
    return ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext || "");
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

  const imageUrl =
    isAssetImage && currentFile && "storage_url" in currentFile
      ? currentFile?.storage_url
      : null;

  // --- State ---
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileError, setNewFileError] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [uploadTargetFolder, setUploadTargetFolder] = useState<string>(ROOT_FOLDER_VALUE);
  const [uploadMode, setUploadMode] = useState<UploadMode>("merge");
  const [uploadType, setUploadType] = useState<"files" | "folder">("files");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    if (!fileSystem.state.selectedFile || !fileSystem.state.selectedFile.includes("/")) {
      return ROOT_FOLDER_VALUE;
    }
    const folderPath = fileSystem.state.selectedFile.split("/").slice(0, -1).join("/");
    return folderPath || ROOT_FOLDER_VALUE;
  }, [fileSystem.state.selectedFile]);

  useEffect(() => {
    if (showUploadModal) {
      setUploadTargetFolder(defaultUploadFolderValue);
      setUploadError("");
    }
  }, [showUploadModal, defaultUploadFolderValue]);

  const resolvedUploadFolder = uploadTargetFolder === ROOT_FOLDER_VALUE ? "" : uploadTargetFolder;

  const buildUploadPath = useCallback(
    (fileName: string) =>
      resolvedUploadFolder ? `${resolvedUploadFolder}/${fileName}` : fileName,
    [resolvedUploadFolder]
  );

  const uploadConflicts = useMemo(() => {
    if (!uploadFiles.length) return [] as string[];
    return uploadFiles
      .map((file) => buildUploadPath(file.name))
      .filter((path) => Boolean(fileSystem.state.files[path]));
  }, [uploadFiles, fileSystem.state.files, buildUploadPath]);

  const saveButtonState = useMemo(() => {
    if (userPlan === "free") return { disabled: true, tooltip: "Upgrade plan to save files" };
    switch (currentRenderStatus) {
      case "Static build":
        return { disabled: true, tooltip: "Start dev server to enable file saving" };
      case "Starting Dev Server..":
        return { disabled: true, tooltip: "Wait for dev server to start" };
      case "Disconnected":
        return { disabled: true, tooltip: "Dev server disconnected" };
      default:
        return {
          disabled: false,
          tooltip: saveMode === "single-file" ? "Save current file" : "Save all files",
        };
    }
  }, [currentRenderStatus, saveMode, userPlan]);

  // --- Handlers ---
  const handleCreateFile = () => {
    if (userPlan === "free") return setNewFileError("Upgrade plan to create files");
    if (!newFileName.trim()) return setNewFileError("File name is required");
    if (availableFiles.includes(newFileName.trim())) return setNewFileError("File already exists");

    const fileName = newFileName.trim();
    if (!/^[a-zA-Z0-9._/-]+$/.test(fileName)) {
      setNewFileError("Invalid file name. Use letters, numbers, dots, hyphens, slashes.");
      return;
    }

    const getDefaultContent = (name: string) => {
      const ext = name.split(".").pop()?.toLowerCase();
      const componentName = name.split(".").pop() === name ? name : name.split(".")[0].split("/").pop()?.replace(/[^a-zA-Z0-9]/g, "");

      switch (ext) {
        case "js":
        case "jsx":
          return `import React from 'react';\nimport { View, Text } from 'react-native';\n\nexport default function ${componentName}() {\n  return (\n    <View>\n      <Text>Hello from ${name}!</Text>\n    </View>\n  );\n}`;
        case "ts":
        case "tsx":
          return `import React from 'react';\nimport { View, Text } from 'react-native';\n\ninterface Props {}\n\nexport default function ${componentName}({}: Props) {\n  return (\n    <View>\n      <Text>Hello from ${name}!</Text>\n    </View>\n  );\n}`;
        case "json": return "{\n  \n}";
        case "md": return `# ${name.split(".")[0]}\n\nAdd your content here.`;
        case "css": return "/* Add your styles here */";
        default: return "";
      }
    };

    fileSystem.createFile(fileName, getDefaultContent(fileName));
    setShowNewFileModal(false);
    setNewFileName("");
    setNewFileError("");
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
  };

  const handleUploadFolderChange = (value: string) => {
    setUploadTargetFolder(value);
    setUploadError("");
  };

  const handleUploadFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";

    if (!filesList.length) {
      setUploadFiles([]);
      return;
    }

    const validFiles: File[] = [];
    const skippedFiles: string[] = [];

    filesList.forEach((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isCodeFile = ALLOWED_UPLOAD_EXTENSIONS.has(ext);
      const isAssetFile = ENABLE_ASSET_UPLOAD && ALLOWED_ASSET_EXTENSIONS.has(ext);

      if (isCodeFile || isAssetFile) validFiles.push(file);
      else skippedFiles.push(file.name);
    });

    if (skippedFiles.length) {
      setUploadError(`Skipped ${skippedFiles.length} unsupported file(s).`);
    } else {
      setUploadError("");
    }
    setUploadFiles(validFiles);
  };

  const handleUploadFiles = async () => {
    if (userPlan === "free") return setUploadError("Upgrade plan to upload files");
    if (!uploadFiles.length) return setUploadError("Select files to upload");
    if (uploadMode === "merge" && uploadConflicts.length) {
      setUploadError(`${uploadConflicts.length} conflicts. Use Replace mode.`);
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: uploadFiles.length });

    try {
      if (uploadMode === "replace-all") {
        for (const filePath of Object.keys(fileSystem.state.files)) {
          await fileSystem.deleteFile(filePath);
        }
      }

      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        setUploadProgress({ current: i + 1, total: uploadFiles.length });

        let newFilePath: string;
        if (uploadType === "folder" && file.webkitRelativePath) {
          const relativePath = file.webkitRelativePath;
          newFilePath = resolvedUploadFolder ? `${resolvedUploadFolder}/${relativePath}` : relativePath;
        } else {
          newFilePath = buildUploadPath(file.name);
        }

        if (uploadMode === "replace" && fileSystem.state.files[newFilePath]) {
          await fileSystem.deleteFile(newFilePath);
        }

        const fileContents = await file.text();
        await fileSystem.createFile(newFilePath, fileContents);
      }
      setShowUploadModal(false);
      handleUploadModalClose();
    } catch (error) {
      logger.debug("error", "Error uploading:");
      setUploadError("Upload failed.");
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const handleSaveSingleFile = async () => {
    if (!prototypeId || !fileSystem.state.selectedFile || fileSystem.getSelectedFileContent() === undefined) return;
    setIsSaving(true);
    onBuildingStateChange?.(true);

    try {
      const saveSuccess = await fileSystem.saveSingleFile(fileSystem.state.selectedFile);
      if (!saveSuccess) return;

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const requestBody: UpdateFilesRequestBody = {
        files: [fileSystem.state.files[fileSystem.state.selectedFile]],
        assets: [],
        prototype_id: prototypeId,
      };

      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/files/update-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error("Update failed");

      const result: APIResponse<UpdateFilesSuccessResponse, UpdateFilesErrorResponse> = await response.json();
      if (result.data) {
        if (result.data.viewing_url) onViewingUrlUpdate?.(result.data.viewing_url);
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
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const filesArray = Object.entries(fileSystem.state.files).map(([path, file]) => ({
        contents: file.contents,
        name: path,
        prototype_id: file.prototype_id || prototypeId,
        id: file.id,
        created_at: file.created_at || null,
        updated_at: file.updated_at || null,
      }));

      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/files/update-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ files: filesArray, assets: [], prototype_id: prototypeId }),
      });

      if (!response.ok) throw new Error("Update failed");

      const result = await response.json();
      if (result.data) {
        if (result.data.viewing_url) onViewingUrlUpdate?.(result.data.viewing_url);
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
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_ENDPOINT}/files/update-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ files: [], assets: [], prototype_id: prototypeId, deleted_files: [fileName] }),
      });

      if (!response.ok) throw new Error("Delete failed");
      const result = await response.json();

      if (result.data) {
        if (result.data.viewing_url) onViewingUrlUpdate?.(result.data.viewing_url);
        fileSystem.deleteFile(fileName);
      }
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
    monaco.editor.defineTheme('materialize-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0B0C0E', // Main background
        'editor.lineHighlightBackground': '#141517', // Active line
        'editorGutter.background': '#0B0C0E', // Gutter
        'editorIndentGuide.background': '#FFFFFF10', // Guide lines
        'scrollbarSlider.background': '#FFFFFF10',
        'scrollbarSlider.hoverBackground': '#FFFFFF20',
        'scrollbarSlider.activeBackground': '#FFFFFF30',
      }
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
    const extraLibs = [`declare module 'react-native' { export * from 'react-native'; }`]; // Simplified for brevity
    extraLibs.forEach((lib) => {
      monaco.languages.typescript.typescriptDefaults.addExtraLib(lib, "react-native-types.d.ts");
    });
  };

  // --- RENDER ---
  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-[#0B0C0E] text-white">

        {/* Header Toolbar */}
        {fileSystem.state.selectedFile && (
          <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/[0.02]">

            {/* Left: Filename */}
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded bg-white/5 border border-white/5">
                {isAssetImage ? <FileImage className="w-3.5 h-3.5 text-indigo-400" /> : <Code2 className="w-3.5 h-3.5 text-indigo-400" />}
              </div>
              <span className="text-sm font-medium tracking-tight text-white/90">
                {fileSystem.state.selectedFile}
              </span>
              {readOnly && (
                <span className="px-1.5 py-0.5 text-[10px] bg-white/10 text-white/50 rounded uppercase tracking-wider font-semibold">
                  Read Only
                </span>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-block text-[10px] text-white/20 uppercase tracking-widest font-semibold mr-2">
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
                            "h-7 w-7 p-0 text-[#8A8F98] hover:text-white hover:bg-white/10 transition-colors",
                            isSaving && "text-indigo-400 animate-pulse",
                            saveButtonState.disabled && "opacity-30 cursor-not-allowed hover:bg-transparent"
                          )}
                          onClick={saveMode === "single-file" ? handleSaveSingleFile : handleSaveFiles}
                          disabled={isSaving || saveButtonState.disabled}
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-[#141517] border-white/10 text-xs">
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
                            className="h-7 w-7 p-0 text-[#8A8F98] hover:text-white hover:bg-white/10 transition-colors data-[state=open]:bg-white/10"
                            disabled={userPlan === "free"}
                          >
                            <Plus className={cn("w-4 h-4", userPlan === "free" && "opacity-30")} />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-[#141517] border-white/10 text-xs">
                        <p>{userPlan === "free" ? "Upgrade to add files" : "Create or upload"}</p>
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-48 bg-[#141517] border border-white/10 text-white shadow-2xl">
                      <DropdownMenuItem
                        onSelect={() => setShowNewFileModal(true)}
                        disabled={userPlan === "free"}
                        className="focus:bg-white/10 focus:text-white cursor-pointer"
                      >
                        <FileCode className="mr-2 h-4 w-4 text-indigo-400" />
                        Create new file
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setShowUploadModal(true)}
                        disabled={userPlan === "free"}
                        className="focus:bg-white/10 focus:text-white cursor-pointer"
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
                          className="h-7 w-7 p-0 text-[#8A8F98] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          onClick={handleDeleteFile}
                          disabled={userPlan === "free"}
                        >
                          <Trash2 className={cn("w-4 h-4", userPlan === "free" && "opacity-30")} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-[#141517] border-white/10 text-xs">
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
                <span className="text-xs text-amber-200/80 font-medium">Read-only mode</span>
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
            {isAssetImage && imageUrl ? (
              // Image Preview
              <div className="h-full flex items-center justify-center bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-opacity-5 relative">
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
                      <span className="text-xs font-mono text-white/70">{fileSystem.state.selectedFile}</span>
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
        <Dialog open={showUploadModal} onOpenChange={(open) => { setShowUploadModal(open); if (!open) handleUploadModalClose(); }}>
          <DialogContent className="sm:max-w-xl bg-[#141517] border border-white/10 text-white shadow-2xl p-0 overflow-hidden gap-0">
            <DialogHeader className="p-6 border-b border-white/5 bg-white/[0.02]">
              <DialogTitle className="text-lg font-medium flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-500" />
                Upload Files
              </DialogTitle>
            </DialogHeader>

            <div className="p-6 space-y-6">
              {/* Type Selection */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-white/40">Upload Type</Label>
                <RadioGroup value={uploadType} onValueChange={(val: "files" | "folder") => { setUploadType(val); setUploadFiles([]); setUploadError(""); }} className="grid grid-cols-2 gap-4">
                  <div className={cn("flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer", uploadType === 'files' ? "bg-indigo-500/10 border-indigo-500/50" : "bg-white/5 border-white/5 hover:bg-white/10")}>
                    <RadioGroupItem value="files" id="type-files" className="border-white/20 text-indigo-500" />
                    <Label htmlFor="type-files" className="cursor-pointer text-sm font-medium">Individual Files</Label>
                  </div>
                  <div className={cn("flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer", uploadType === 'folder' ? "bg-indigo-500/10 border-indigo-500/50" : "bg-white/5 border-white/5 hover:bg-white/10")}>
                    <RadioGroupItem value="folder" id="type-folder" className="border-white/20 text-indigo-500" />
                    <Label htmlFor="type-folder" className="cursor-pointer text-sm font-medium">Entire Folder</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Destination (if files) */}
              {uploadType === "files" && (
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-white/40">Destination</Label>
                  <Select value={uploadTargetFolder} onValueChange={handleUploadFolderChange}>
                    <SelectTrigger className="bg-[#0B0C0E] border-white/10 text-white focus:ring-indigo-500/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141517] border-white/10 text-white">
                      {directoryOptions.map((dir) => (
                        <SelectItem key={dir} value={dir} className="focus:bg-white/10 focus:text-white cursor-pointer">
                          {dir === ROOT_FOLDER_VALUE ? "/" : dir}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* File Input */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-white/40">Select Content</Label>
                <div className="relative group">
                  <Input
                    id="fileUpload"
                    type="file"
                    {...(uploadType === "folder" ? { webkitdirectory: "", directory: "" } : { multiple: true })}
                    onChange={handleUploadFileSelection}
                    className="cursor-pointer bg-[#0B0C0E] border-white/10 file:bg-white/10 file:text-white file:border-0 file:rounded-sm file:mr-4 file:px-2 file:text-xs hover:file:bg-white/20 text-white/70"
                  />
                </div>
                {uploadError && <p className="text-red-400 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {uploadError}</p>}
              </div>

              {/* Conflict Warnings */}
              {uploadConflicts.length > 0 && uploadMode === "merge" && (
                <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs">
                  <p className="font-semibold mb-1">Conflicts detected:</p>
                  <p>{uploadConflicts.length} files already exist.</p>
                </div>
              )}
            </div>

            <DialogFooter className="p-6 bg-white/[0.02] border-t border-white/5">
              <Button variant="ghost" onClick={() => setShowUploadModal(false)} className="text-white/50 hover:text-white hover:bg-white/5">Cancel</Button>
              <Button
                onClick={handleUploadFiles}
                disabled={isUploading || uploadFiles.length === 0 || (uploadMode === "merge" && uploadConflicts.length > 0)}
                className="bg-white text-black hover:bg-white/90 rounded-full px-6 font-semibold"
              >
                {isUploading ? "Uploading..." : "Upload"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New File Modal */}
        <Dialog open={showNewFileModal} onOpenChange={(open) => { setShowNewFileModal(open); if (!open) handleModalClose(); }}>
          <DialogContent className="sm:max-w-md bg-[#141517] border border-white/10 text-white shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-500" />
                Create New File
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="fileName" className="text-xs text-white/60 uppercase tracking-wider font-semibold">Path & Name</Label>
                <Input
                  id="fileName"
                  value={newFileName}
                  onChange={(e) => { setNewFileName(e.target.value); setNewFileError(""); }}
                  placeholder="components/Button.tsx"
                  className="bg-[#0B0C0E] border-white/10 text-white focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                  autoFocus
                />
                {newFileError && <p className="text-red-400 text-xs">{newFileError}</p>}
              </div>
              <div className="p-3 rounded bg-white/5 border border-white/5 text-xs text-white/50 space-y-1">
                <p className="flex items-center gap-2"><Sparkles className="w-3 h-3 text-indigo-400" /> Tips:</p>
                <ul className="list-disc list-inside pl-1 space-y-0.5 opacity-80">
                  <li>Use <code>.tsx</code> for React components</li>
                  <li>Use forward slashes <code>/</code> to create folders</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowNewFileModal(false)} className="text-white/50 hover:text-white">Cancel</Button>
              <Button onClick={handleCreateFile} className="bg-white text-black hover:bg-white/90 rounded-full font-semibold">Create File</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-sm bg-[#141517] border border-white/10 text-white">
            <DialogHeader>
              <DialogTitle className="text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Delete File?
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 text-sm text-white/70 leading-relaxed">
              Are you sure you want to delete <span className="text-white font-mono bg-white/10 px-1 py-0.5 rounded">{fileSystem.state.selectedFile}</span>?
              <br />This action cannot be undone.
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} className="text-white/50 hover:text-white">Cancel</Button>
              <Button
                variant="destructive"
                onClick={async () => { if (fileSystem.state.selectedFile) await handleDeleteFileWithAPI(fileSystem.state.selectedFile); setShowDeleteConfirm(false); }}
                className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
              >
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
};

export default CodeEditor;