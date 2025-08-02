"use client";

import CodeEditor from "@/components/CodeEditor";
import Loader from "@/components/dashboard/Loader";
import ExpoSnackViewer, {
  ExpoSnackViewerRef,
} from "@/components/ExpoSnackViewer";
import FileTree from "@/components/FileTree";
import PrototypeChatWindow from "@/components/PrototypeChatWindow";
import { supabase } from "@/GlobalConstants";
import { useFileSystem } from "@/hooks/useFileSystem";
import { useSidebar } from "@/hooks/useSidebar";
import { Database } from "@/lib/types/database.types";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import {
  CodeBracketIcon,
  EyeIcon,
  SparklesIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      setPrototype(prev => prev ? { ...prev, name: editedName.trim() } : null);
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

  return (
    <div className="h-full flex overflow-hidden relative bg-gradient-to-br from-gray-2 via-whiter to-gray-3 dark:from-boxdark-2 dark:via-boxdark dark:to-meta-4">
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-primary/5 to-secondary/5 dark:from-primary/10 dark:to-secondary/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-tr from-meta-5/5 to-meta-3/5 dark:from-meta-5/10 dark:to-meta-3/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-r from-secondary/3 to-primary/3 dark:from-secondary/8 dark:to-primary/8 rounded-full blur-2xl animate-pulse delay-500"></div>
      </div>

      {/* Left Panel - AI Assistant Chat */}
      <div className="w-2/5 min-w-[420px] flex flex-col relative z-10">
        {/* Glassmorphism Container */}
        <div className="h-full m-4 bg-white/80 dark:bg-boxdark/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-strokedark/30 overflow-hidden">
          {/* Enhanced Header */}
          <div className="relative">
            {/* Header gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-secondary/5 to-meta-5/5 dark:from-primary/10 dark:via-secondary/10 dark:to-meta-5/10"></div>

            <div className="relative p-6 border-b border-white/20 dark:border-strokedark/30">
              {/* Debug info - remove after testing */}
              <div className="mb-2 text-xs text-gray-500">
                Debug: prototypeId={prototypeId}, prototype={prototype ? "loaded" : "null"}, name={prototype?.name}
              </div>
              
              {/* Prototype Name Section */}
              {prototype && (
                <div className="mb-4 group">
                  <div className="flex items-center gap-3">
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          className="text-lg font-semibold text-black dark:text-white bg-background border-2 border-primary/50 focus:border-primary"
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
                          className="h-7 w-7 p-0"
                        >
                          {isUpdating ? (
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <CheckIcon className="w-3 h-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                          disabled={isUpdating}
                          className="h-7 w-7 p-0"
                        >
                          <XMarkIcon className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        <h1 className="text-lg font-semibold text-black dark:text-white">
                          {prototype.name}
                        </h1>
                        {user && prototype.owner_id === user.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleStartEdit}
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-white/20 dark:hover:bg-boxdark/40 transition-opacity"
                          >
                            <PencilIcon className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* AI Assistant Section */}
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-lg blur-sm"></div>
                  <div className="relative p-2 bg-gradient-to-r from-primary to-secondary rounded-lg shadow-lg">
                    <SparklesIcon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-black dark:text-white">
                    AI Assistant
                  </h2>
                  <p className="text-sm text-body dark:text-bodydark">
                    Build with AI-powered development
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Content Area with subtle inner glow */}
          <div className="flex-1 flex flex-col overflow-hidden relative h-full">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent dark:from-white/2 pointer-events-none"></div>

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
        </div>
      </div>

      {/* Right Panel - Preview/Code Toggle */}
      <div className="w-3/5 min-w-[500px] flex flex-col relative z-10">
        {/* Glassmorphism Container */}
        <div className="h-full m-4 ml-0 bg-white/80 dark:bg-boxdark/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-strokedark/30 overflow-hidden">
          {/* Enhanced Header with Toggle */}
          <div className="relative">
            {/* Header gradient overlay */}
            <div className="absolute inset-0"></div>

            <div className="relative p-6 border-b border-white/20 dark:border-strokedark/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-lg blur-sm"></div>
                    <div className="relative p-2 rounded-lg shadow-lg">
                      {isPreviewView ? (
                        <EyeIcon className="w-5 h-5 text-black dark:text-white" />
                      ) : (
                        <CodeBracketIcon className="w-5 h-5 text-black dark:text-white" />
                      )}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-black dark:text-white">
                      {isPreviewView ? "Live Preview" : "Code Editor"}
                    </h2>
                    <p className="text-sm text-body dark:text-bodydark">
                      {isPreviewView
                        ? "See your changes in real-time"
                        : "Edit your prototype files"}
                    </p>
                  </div>
                </div>

                {/* Enhanced Toggle Buttons */}
                <div className="flex items-center bg-white/80 dark:bg-boxdark/60 rounded-xl p-1 backdrop-blur-sm border border-white/40 dark:border-strokedark/40 shadow-lg">
                  <button
                    onClick={() => setIsPreviewView(true)}
                    className={`relative px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${isPreviewView
                      ? "bg-primary text-white shadow-lg transform scale-105"
                      : "text-gray-700 dark:text-bodydark hover:text-black dark:hover:text-white hover:bg-white/60 dark:hover:bg-boxdark/40"
                      }`}
                  >
                    <EyeIcon className={`w-4 h-4 inline mr-2 ${isPreviewView ? "text-white" : "text-gray-700 dark:text-bodydark"}`} />
                    Preview
                  </button>
                  <button
                    onClick={() => setIsPreviewView(false)}
                    className={`relative px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${!isPreviewView
                      ? "bg-primary text-white shadow-lg transform scale-105"
                      : "text-gray-700 dark:text-bodydark hover:text-black dark:hover:text-white hover:bg-white/60 dark:hover:bg-boxdark/40"
                      }`}
                  >
                    <CodeBracketIcon className={`w-4 h-4 inline mr-2 ${!isPreviewView ? "text-white" : "text-gray-700 dark:text-bodydark"}`} />
                    Code
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Content Area with subtle inner glow */}
          <div className="flex-1 overflow-hidden h-full">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent dark:from-white/2 pointer-events-none"></div>

            <div className="relative h-full">
              {isPreviewView ? (
                <div className="h-full">
                  <ExpoSnackViewer
                    ref={snackViewerRef}
                    files={fileSystem.state.files}
                    onResetToDefault={handleResetToDefault}
                  />
                </div>
              ) : (
                <div className="max-h-[550px] flex">
                  {/* File Explorer */}
                  <div className="w-1/4 min-w-[200px] max-w-[280px] border-r border-white/20 dark:border-strokedark/30 h-full">
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
        </div>
      </div>
    </div>
  );
}
