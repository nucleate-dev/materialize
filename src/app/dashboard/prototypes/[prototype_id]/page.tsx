"use client";

import { supabase } from "@/ClientConstants";
import CodeEditor from "@/components/CodeEditor";
import Loader from "@/components/dashboard/Loader";
import PrototypeSettingsModal from "@/components/dashboard/PrototypeSettingsModal";
import ExpoSnackViewer, { ExpoSnackViewerRef } from "@/components/ExpoSnackViewer";
import FileTree from "@/components/FileTree";
import PrototypeChatWindow from "@/components/PrototypeChatWindow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFileSystem } from "@/hooks/useFileSystem";
import { useSidebar } from "@/hooks/useSidebar";
import { Database } from "@/lib/types/database.types";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import {
  CheckIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  EyeIcon,
  PencilIcon,
  ShareIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

export default function CreatePage() {
  const router = useRouter();
  const { user, userIsLoading } = useUser();
  const params = useParams<{ prototype_id: string; }>();
  const prototypeId = params?.prototype_id;
  const { setSidebarExpanded } = useSidebar();

  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewView, setIsPreviewView] = useState(true);
  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // Initialize FileSystem hook
  const defaultFile = "App.js";
  const fileSystem = useFileSystem(prototypeId, defaultFile);
  const snackViewerRef = useRef<ExpoSnackViewerRef>(null);

  // Automatically collapse sidebar when page opens
  useEffect(() => {
    setSidebarExpanded(false);
  }, [setSidebarExpanded]);

  // Fetch prototype data
  useEffect(() => {
    async function fetchPrototype() {
      if (!prototypeId) return;

      console.log("Fetching prototype with ID:", prototypeId);

      const { data, error } = await supabase
        .from("prototypes")
        .select("*")
        .eq("id", prototypeId)
        .single();

      if (error) {
        console.error("Error fetching prototype:", error);
        router.push("/dashboard");
        return;
      }

      setPrototype(data);
      setIsPublic(data.visibility === "PUBLIC");
      console.log("Successfully fetched prototype:", data);
    }

    if (prototypeId) {
      fetchPrototype();
    }
  }, [prototypeId, router]);

  const handleResetToDefault = useCallback(async () => {
    if (!prototypeId) {
      console.error("Reset failed: no prototype ID");
      return;
    }

    setIsLoading(true);
    try {
      await fileSystem.resetToDefault(prototypeId);

      // Force refresh the preview
      if (snackViewerRef.current) {
        snackViewerRef.current.forceRefresh();
      }

      console.log("Successfully reset to default app");
    } catch (error) {
      console.error("Error resetting to default:", error);
    } finally {
      setIsLoading(false);
    }
  }, [prototypeId, fileSystem, snackViewerRef]);

  const handleCodeChange = (value: string | undefined) => {
    if (value !== undefined && fileSystem.state.selectedFile) {
      fileSystem.updateFileContent(fileSystem.state.selectedFile, value);
    }
  };

  const handleStartEdit = () => {
    if (!prototype || !user || prototype.owner_id !== user.id) return;
    setEditedName(prototype.name);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedName("");
  };

  const handleSaveEdit = async () => {
    if (!prototype || !user || !prototypeId || !editedName.trim()) return;

    try {
      setIsUpdating(true);

      const { error } = await supabase
        .from("prototypes")
        .update({ name: editedName.trim() })
        .eq("id", prototypeId);

      if (error) {
        throw error;
      }

      // Update local state
      setPrototype((prev) =>
        prev ? { ...prev, name: editedName.trim() } : null,
      );
      setIsEditing(false);
      setEditedName("");
    } catch (err) {
      console.error("Error updating prototype name:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!prototypeId || userIsLoading) {
    return <Loader />;
  }

  const handleShare = () => {
    setShowShareModal(true);
  };

  const handleCopyLink = async () => {
    if (!prototype) return;

    setIsCopying(true);
    try {
      // If not public, make it public first
      if (!isPublic) {
        await supabase
          .from("prototypes")
          .update({ visibility: "PUBLIC" })
          .eq("id", prototype.id);

        setIsPublic(true);
        setPrototype(prev => prev ? { ...prev, visibility: "PUBLIC" } : null);
      }

      await navigator.clipboard.writeText(window.location.href);
      console.log('Prototype URL copied to clipboard');

      // Close modal after successful copy
      setTimeout(() => {
        setShowShareModal(false);
      }, 1000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    } finally {
      setIsCopying(false);
    }
  };

  const handleVisibilityToggle = async (checked: boolean) => {
    if (!prototype) return;

    try {
      const newVisibility = checked ? "PUBLIC" : "SELF";
      await supabase
        .from("prototypes")
        .update({ visibility: newVisibility })
        .eq("id", prototype.id);

      setIsPublic(checked);
      setPrototype(prev => prev ? { ...prev, visibility: newVisibility } : null);
    } catch (err) {
      console.error('Failed to update visibility:', err);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <Card className="border-0 rounded-none bg-background/80 backdrop-blur-sm border-b border-border">
        <CardContent className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left side - Prototype name */}
            <div className="flex items-center gap-3 group">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="text-xl font-bold text-foreground bg-background border-2 border-primary/50 focus:border-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveEdit();
                      } else if (e.key === "Escape") {
                        handleCancelEdit();
                      }
                    }}
                    autoFocus
                    disabled={isUpdating}
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={isUpdating || !editedName.trim()}
                    className="h-8 w-8 p-0"
                  >
                    {isUpdating ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckIcon className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={isUpdating}
                    className="h-8 w-8 p-0"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-foreground">
                    {prototype?.name || 'Untitled Prototype'}
                  </h1>
                  {user && prototype?.owner_id === user.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleStartEdit}
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 hover:bg-white/20 dark:hover:bg-boxdark/40 transition-opacity"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Right side - Settings and Share buttons */}
            <div className="flex items-center gap-2">
              {user && prototype?.owner_id === user.id && (
                <Button
                  onClick={() => setShowSettingsModal(true)}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Cog6ToothIcon className="w-4 h-4" />
                  Settings
                </Button>
              )}
              <Button
                onClick={handleShare}
                className="flex items-center gap-2"
              >
                <ShareIcon className="w-4 h-4" />
                Share
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left Panel - AI Assistant Chat */}
        <div className="w-2/5 min-w-[420px] flex flex-col relative z-10">
          {/* Card Container */}
          <Card className="h-full m-4 bg-background/80 backdrop-blur-sm border border-border">
            <CardContent className="h-full flex flex-col p-0">
              {/* Header */}
              <div className="p-6 border-b border-border">

                {/* AI Assistant Section */}
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-lg blur-sm"></div>
                    <div className="relative p-2 bg-gradient-to-r from-primary to-secondary rounded-lg shadow-lg">
                      <SparklesIcon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      AI Assistant
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Build with AI-powered development
                    </p>
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 flex flex-col overflow-hidden relative h-full">
                <div className="relative flex-1 flex flex-col">
                  <PrototypeChatWindow
                    prototypeId={prototypeId}
                    // File system integration
                    files={fileSystem.state.files}
                    selectedFile={fileSystem.state.selectedFile}
                    onFilesUpdate={fileSystem.applyFileUpdates}
                    // Loading state
                    isLoading={isLoading}
                    setIsLoading={setIsLoading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Preview/Code Toggle */}
        <div className="w-3/5 min-w-[500px] flex flex-col relative z-10">
          {/* Card Container */}
          <Card className="h-full m-4 ml-0 bg-background/80 backdrop-blur-sm border border-border">
            <CardContent className="h-full flex flex-col p-0">
              {/* Header with Toggle */}
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-lg blur-sm"></div>
                      <div className="relative p-2 rounded-lg shadow-lg">
                        {isPreviewView ? (
                          <EyeIcon className="w-5 h-5 text-foreground" />
                        ) : (
                          <CodeBracketIcon className="w-5 h-5 text-foreground" />
                        )}
                      </div>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">
                        {isPreviewView ? "Live Preview" : "Code Editor"}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {isPreviewView
                          ? "See your changes in real-time"
                          : "Edit your prototype files"}
                      </p>
                    </div>
                  </div>

                  {/* Enhanced Toggle Buttons */}
                  <div className="flex items-center bg-muted rounded-lg p-1">
                    <Button
                      variant={isPreviewView ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setIsPreviewView(true)}
                      className="flex items-center gap-2"
                    >
                      <EyeIcon className="w-4 h-4" />
                      Preview
                    </Button>
                    <Button
                      variant={!isPreviewView ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setIsPreviewView(false)}
                      className="flex items-center gap-2"
                    >
                      <CodeBracketIcon className="w-4 h-4" />
                      Code
                    </Button>
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-hidden h-full">
                <div className="relative h-full">
                  {isPreviewView ? (
                    <div className="h-full flex flex-col">
                      <ExpoSnackViewer
                        ref={snackViewerRef}
                        files={fileSystem.state.files}
                        onResetToDefault={handleResetToDefault}
                        prototypeId={prototypeId}
                      />
                    </div>
                  ) : (
                    <div className="max-h-[550px] flex">
                      {/* File Explorer */}
                      <div className="w-1/4 min-w-[200px] max-w-[280px] border-r border-border h-full">
                        <div className="h-full">
                          <FileTree
                            files={fileSystem.state.files}
                            selectedFile={fileSystem.state.selectedFile}
                            onFileSelect={fileSystem.selectFile}
                          />
                        </div>
                      </div>

                      {/* Code Editor */}
                      <div
                        className="flex-1 overflow-y-auto"
                        style={{ minHeight: "calc(100vh - 120px)" }}
                      >
                        <div className="h-full">
                          <CodeEditor
                            value={fileSystem.getSelectedFileContent()}
                            onChange={handleCodeChange}
                            fileName={fileSystem.state.selectedFile}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Settings Modal */}
      <PrototypeSettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        prototype={prototype}
        onUpdated={() => {
          // Refetch prototype data after update
          if (prototypeId) {
            supabase
              .from("prototypes")
              .select("*")
              .eq("id", prototypeId)
              .single()
              .then(({ data }) => {
                if (data) {
                  setPrototype(data);
                  setIsPublic(data.visibility === "PUBLIC");
                }
              });
          }
        }}
      />

      {/* Share Modal */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Prototype</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Visibility Toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <p className="font-medium text-sm">Make Public</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {isPublic ? "Anyone with the link can view" : "Only you can view"}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => handleVisibilityToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Share Link */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Share Link</p>
              <div className="flex items-center gap-2">
                <Input
                  value={window.location.href}
                  readOnly
                  className="flex-1 bg-gray-50 dark:bg-gray-800"
                />
                <Button
                  onClick={handleCopyLink}
                  disabled={isCopying}
                  className="flex items-center gap-2"
                >
                  {isCopying ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ClipboardDocumentIcon className="w-4 h-4" />
                  )}
                  {isCopying ? 'Copying...' : 'Copy'}
                </Button>
              </div>
              {!isPublic && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ Copying the link will automatically make this prototype public
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
