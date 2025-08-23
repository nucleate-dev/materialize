"use client";

import { supabase } from "@/ClientConstants";
import CodeEditor from "@/components/CodeEditor";
import Loader from "@/components/dashboard/Loader";
import PrototypeSettingsModal from "@/components/dashboard/PrototypeSettingsModal";
import FileTree from "@/components/FileTree";
import MaterializeRenderSection, {
  MaterializeRenderSectionRef,
} from "@/components/MaterializeRenderSection";
import ProPlanUpsellModal from "@/components/ProPlanUpsellModal";
import PrototypeChatWindow from "@/components/PrototypeChatWindow";
import PublicPrototypeHeader from "@/components/PublicPrototypeHeader";
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
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useUser } from "@/hooks/useUser";
import { Database } from "@/lib/types/supabase";
import type {
  CreatePrototypeRequestBody,
  CreatePrototypeResponse,
  FetchViewingUrlRequestBody,
  FetchViewingUrlResponse,
  StartDevServerRequestBody,
  StartDevServerResponse,
} from "@/lib/types/serverAPITypes";
import {
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  DevicePhoneMobileIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

export default function CreatePage() {
  const router = useRouter();
  const { user, userIsLoading } = useUser();
  const { userPlan } = useSubscriptionAccess();
  const params = useParams<{ prototype_id: string }>();
  const prototypeId = params?.prototype_id;
  const { setSidebarExpanded } = useSidebar();

  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewView, setIsPreviewView] = useState(true);
  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);

  // Mobile-specific state
  const [activePanel, setActivePanel] = useState<"chat" | "preview">("preview");
  const [isMobile, setIsMobile] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [showUpsellModal, setShowUpsellModal] = useState(false);

  // Initialize FileSystem hook
  const defaultFile = "App.js";
  const fileSystem = useFileSystem(prototypeId, defaultFile);
  const renderRef = useRef<MaterializeRenderSectionRef>(null);

  // Automatically collapse sidebar when page opens
  useEffect(() => {
    setSidebarExpanded(false);
  }, [setSidebarExpanded]);

  // Mobile detection and resize handling
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Touch handling for swipe gestures
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && activePanel === "chat") {
      setActivePanel("preview");
    }
    if (isRightSwipe && activePanel === "preview") {
      setActivePanel("chat");
    }
  };

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

      // Call fetch-viewing-url API to get viewing URL
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const fetchViewResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/prototype/fetch-viewing-url`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              prototype_id: prototypeId,
              current_page: "edit",
            } as FetchViewingUrlRequestBody),
          },
        );

        if (fetchViewResponse.ok) {
          const fetchViewData: FetchViewingUrlResponse =
            await fetchViewResponse.json();
          if ("viewing_url" in fetchViewData) {
            console.log("Viewing URL:", fetchViewData.viewing_url);
            console.log("Source:", fetchViewData.source);
            setViewingUrl(fetchViewData.viewing_url);
          } else {
            console.error(
              "Error in fetch-viewing-url response:",
              fetchViewData,
            );
          }
        } else {
          console.error(
            "Failed to fetch viewing URL:",
            fetchViewResponse.status,
          );
        }
      } catch (fetchViewError) {
        console.error("Error calling fetch-viewing-url API:", fetchViewError);
      }
    }

    if (prototypeId) {
      fetchPrototype();
    }
  }, [prototypeId, router]);

  // Auto-start dev server when files are loaded
  useEffect(() => {
    async function autoStartDevServer() {
      // Only proceed if we have prototypeId, files, and no existing viewing URL
      if (
        !prototypeId ||
        !fileSystem.state.files ||
        Object.keys(fileSystem.state.files).length === 0
      ) {
        return;
      }

      console.log("Auto-starting dev server for prototype:", prototypeId);

      // TODO: badge -- set current status to starting dev server
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          console.error(
            "No authentication token available for dev server start",
          );
          return;
        }

        // Convert files from Record<string, PrototypeFile> to array format expected by API
        const filesArray = Object.entries(fileSystem.state.files).map(
          ([path, file]) => ({
            contents: file.contents,
            name: path,
            prototype_id: file.prototype_id || prototypeId,
            id: file.id,
            created_at: file.created_at || undefined,
            updated_at: file.updated_at || undefined,
          }),
        );

        console.log(`Auto-starting dev server with ${filesArray.length} files`);

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/files/start-dev-server`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              framework: "expo_react_native",
              files: filesArray,
              assets: [], // No assets in auto-start scenario
              prototype_id: prototypeId,
              file_scope: "complete", // Send all files to properly initialize dev server
            } as StartDevServerRequestBody),
          },
        );

        if (response.ok) {
          const result: StartDevServerResponse = await response.json();

          if ("success" in result && result.success) {
            console.log("✅ Dev server auto-started successfully");

            // Update viewing URL if provided
            if (result.viewing_url) {
              console.log(
                "Setting viewing URL from auto-started dev server:",
                result.viewing_url,
              );
              setViewingUrl(result.viewing_url);
            }
          } else {
            const errorMessage =
              "error" in result ? result.error : result.message;
            console.log("Dev server auto-start failed:", errorMessage);
          }
        } else {
          const errorData = await response.json();
          console.log("Dev server auto-start request failed:", errorData);
        }
      } catch (error) {
        console.error("Error auto-starting dev server:", error);
      } finally {
        // TODO: badge -- set current status to connected (if successful) or static build (if failed)
        setIsBuilding(false);
      }
    }

    // Add a small delay to ensure files are fully loaded before attempting to start dev server
    const timer = setTimeout(() => {
      autoStartDevServer();
    }, 1000);

    return () => clearTimeout(timer);
  }, [prototypeId, fileSystem.state.files]);

  const handleCodeChange = (value: string | undefined) => {
    if (value !== undefined && fileSystem.state.selectedFile) {
      fileSystem.updateFileContentLocally(fileSystem.state.selectedFile, value);
    }
  };

  const handleClonePrototype = async () => {
    if (!user || !prototype || !prototypeId) return;

    try {
      setIsCloning(true);

      // Create new prototype
      const clonedPrototypeName = `${prototype.name} (Copy)`;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        console.error("No authentication token available");
        return;
      }

      const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
      if (!serverEndpoint) {
        console.error("Server endpoint not configured");
        return;
      }

      const response = await fetch(`${serverEndpoint}/prototype/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: clonedPrototypeName,
          description: prototype.description,
          project_id: prototype.project_id,
          prototype_id: prototypeId, // For forking
          visibility: "SELF", // TODO: set this to PUBLIC if user is free
        } as CreatePrototypeRequestBody),
      });

      const result: CreatePrototypeResponse = await response.json();
      if (result.success) {
        // Navigate to the new prototype in dashboard
        router.push(`/dashboard/prototypes/${result.data.prototype_id}`);
      } else if (result.error === "PROTOTYPE_LIMIT_REACHED") {
        // Show upsell modal
        setShowUpsellModal(true);
      } else {
        console.error("Error cloning prototype:", result.message);
      }
    } catch (err) {
      console.error("Error cloning prototype:", err);
    } finally {
      setIsCloning(false);
    }
  };

  const handleUpdatePrototype = (updatedPrototype: Prototype) => {
    setPrototype(updatedPrototype);
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
        setPrototype((prev) =>
          prev ? { ...prev, visibility: "PUBLIC" } : null,
        );
      }

      await navigator.clipboard.writeText(window.location.href);
      console.log("Prototype URL copied to clipboard");

      // Close modal after successful copy
      setTimeout(() => {
        setShowShareModal(false);
      }, 1000);
    } catch (err) {
      console.error("Failed to copy URL:", err);
    } finally {
      setIsCopying(false);
    }
  };

  const handleVisibilityToggle = async (checked: boolean) => {
    if (!prototype) return;

    // Prevent free users from making prototypes private
    if (!checked && userPlan !== "pro") {
      return;
    }

    try {
      const newVisibility = checked ? "PUBLIC" : "SELF";
      await supabase
        .from("prototypes")
        .update({ visibility: newVisibility })
        .eq("id", prototype.id);

      setIsPublic(checked);
      setPrototype((prev) =>
        prev ? { ...prev, visibility: newVisibility } : null,
      );
    } catch (err) {
      console.error("Failed to update visibility:", err);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      {prototype && (
        <PublicPrototypeHeader
          prototype={prototype}
          prototypeFiles={fileSystem.state.files}
          isCloning={isCloning}
          onClonePrototype={handleClonePrototype}
          onUpdatePrototype={handleUpdatePrototype}
          onShare={handleShare}
        />
      )}

      {/* Mobile Panel Toggle */}
      {isMobile && (
        <div className="bg-background border-b border-border p-2">
          <div className="flex items-center justify-center space-x-2">
            <Button
              variant={activePanel === "chat" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActivePanel("chat")}
              className="flex items-center gap-2"
            >
              <ChatBubbleLeftRightIcon className="w-4 h-4" />
              Chat
            </Button>
            <Button
              variant={activePanel === "preview" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActivePanel("preview")}
              className="flex items-center gap-2"
            >
              <DevicePhoneMobileIcon className="w-4 h-4" />
              Preview
            </Button>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div
        className={`flex-1 flex overflow-hidden min-h-0 ${isMobile ? "flex-col" : ""}`}
        style={isMobile ? { height: "calc(100dvh - 120px)" } : {}}
        onTouchStart={isMobile ? onTouchStart : undefined}
        onTouchMove={isMobile ? onTouchMove : undefined}
        onTouchEnd={isMobile ? onTouchEnd : undefined}
      >
        {/* Left Panel - AI Assistant Chat */}
        <div
          className={`${
            isMobile
              ? `${activePanel === "chat" ? "flex" : "hidden"} w-full h-full`
              : "w-2/5 min-w-[420px] flex"
          } flex-col relative z-10`}
          style={isMobile ? { height: "100%" } : {}}
        >
          {/* Card Container */}
          <Card
            className={`h-full ${isMobile ? "m-2" : "m-2"} bg-background/80 backdrop-blur-sm border border-border`}
            style={isMobile ? { height: "calc(100% - 16px)" } : {}}
          >
            <CardContent className="h-full flex flex-col p-0 overflow-hidden">
              {/* Mobile Chat Header */}
              {isMobile && (
                <div className="p-6 border-b border-border flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <ChatBubbleLeftRightIcon className="w-4 h-4 text-foreground" />
                      <h2 className="text-base font-bold text-foreground">
                        AI Assistant
                      </h2>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Swipe left to see preview
                    </div>
                  </div>
                </div>
              )}

              {/* Content Area */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <PrototypeChatWindow
                  prototypeId={prototypeId}
                  // File system integration
                  files={fileSystem.state.files}
                  selectedFile={fileSystem.state.selectedFile}
                  onFilesUpdate={fileSystem.applyFileUpdates}
                  onRefetchFiles={
                    prototypeId
                      ? () => fileSystem.loadFilesFromDatabase(prototypeId)
                      : undefined
                  }
                  // Loading state
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  // Viewing URL integration
                  onViewingUrlUpdate={setViewingUrl}
                  onBuildingStateChange={setIsBuilding}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Preview/Code Toggle */}
        <div
          className={`${
            isMobile
              ? `${activePanel === "preview" ? "flex" : "hidden"} w-full h-full`
              : "w-3/5 min-w-[500px] flex"
          } flex-col relative z-10`}
        >
          {/* Card Container */}
          <Card
            className={`h-full ${isMobile ? "m-2" : "m-2 ml-0"} bg-background/80 backdrop-blur-sm border border-border`}
          >
            <CardContent className="h-full flex flex-col p-0">
              {/* Header with Toggle */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="rounded-lg">
                      {isPreviewView ? (
                        <EyeIcon className="w-4 h-4 text-foreground" />
                      ) : (
                        <CodeBracketIcon className="w-4 h-4 text-foreground" />
                      )}
                    </div>
                    <div>
                      <h2
                        className={`${isMobile ? "text-base" : "text-lg"} font-bold text-foreground`}
                      >
                        {isPreviewView ? "Live Preview" : "Code Editor"}
                      </h2>
                    </div>
                    {isMobile && (
                      <div className="text-xs text-muted-foreground ml-2">
                        Swipe right for chat
                      </div>
                    )}
                  </div>

                  {/* Enhanced Toggle Buttons */}
                  <div className="flex items-center bg-muted rounded-lg p-1">
                    <Button
                      variant={isPreviewView ? "default" : "ghost"}
                      size={isMobile ? "sm" : "sm"}
                      onClick={() => setIsPreviewView(true)}
                      className="flex items-center gap-2"
                    >
                      <EyeIcon className="w-4 h-4" />
                      {!isMobile && "Preview"}
                    </Button>
                    <Button
                      variant={!isPreviewView ? "default" : "ghost"}
                      size={isMobile ? "sm" : "sm"}
                      onClick={() => setIsPreviewView(false)}
                      className="flex items-center gap-2"
                    >
                      <CodeBracketIcon className="w-4 h-4" />
                      {!isMobile && "Code"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-hidden h-full">
                <div className="relative h-full">
                  {isPreviewView ? (
                    <div className="h-full flex flex-col">
                      <MaterializeRenderSection
                        viewing_url={viewingUrl ?? ""}
                        isBuilding={isBuilding}
                        prototypeId={prototypeId}
                        files={fileSystem.state.files}
                        onViewingUrlUpdate={setViewingUrl}
                        onBuildingStateChange={setIsBuilding}
                      />
                    </div>
                  ) : (
                    <div
                      className={`flex h-full ${isMobile ? "flex-col" : ""}`}
                    >
                      {/* File Explorer */}
                      <div
                        className={`${
                          isMobile
                            ? "w-full max-h-[200px] border-b"
                            : "w-1/4 min-w-[200px] max-w-[280px] border-r"
                        } border-border`}
                      >
                        <div className="h-full overflow-auto">
                          <FileTree
                            files={fileSystem.state.files}
                            selectedFile={fileSystem.state.selectedFile}
                            onFileSelect={fileSystem.selectFile}
                          />
                        </div>
                      </div>

                      {/* Code Editor */}
                      <div className="flex-1 h-full">
                        <CodeEditor
                          value={fileSystem.getSelectedFileContent()}
                          onChange={handleCodeChange}
                          fileName={fileSystem.state.selectedFile}
                          onCreateFile={fileSystem.createFile}
                          onDeleteFile={fileSystem.deleteFile}
                          availableFiles={Object.keys(fileSystem.state.files)}
                          canDelete={
                            Object.keys(fileSystem.state.files).length > 1
                          }
                          prototypeId={prototypeId}
                          files={fileSystem.state.files}
                          onViewingUrlUpdate={setViewingUrl}
                          onBuildingStateChange={setIsBuilding}
                          onForceRefresh={() =>
                            renderRef.current?.forceRefresh()
                          }
                        />
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
                  {isPublic
                    ? "Anyone with the link can view"
                    : "Only you can view"}
                </p>
                {userPlan !== "pro" && !isPublic && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Upgrade to Pro to make prototypes private
                  </p>
                )}
              </div>
              <label
                className={`relative inline-flex items-center ${
                  userPlan !== "pro" && !isPublic
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => handleVisibilityToggle(e.target.checked)}
                  disabled={userPlan !== "pro" && !isPublic}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 peer-disabled:cursor-not-allowed"></div>
              </label>
            </div>

            {/* Share Link */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Share Link</p>
              <div className="flex items-center gap-2">
                <Input
                  value={window.location.href.replace(
                    "dashboard/prototypes",
                    "prototype",
                  )}
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
                  {isCopying ? "Copying..." : "Copy"}
                </Button>
              </div>
              {!isPublic && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ Copying the link will automatically make this prototype
                  public
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="prototype_creation_limit_reached"
      />
    </div>
  );
}
