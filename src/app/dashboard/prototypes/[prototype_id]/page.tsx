"use client";

import ChatWindow from "@/components/ChatWindow";
import CodeEditor from "@/components/CodeEditor";
import Loader from "@/components/dashboard/Loader";
import ExpoSnackViewer, {
  ExpoSnackViewerRef,
} from "@/components/ExpoSnackViewer";
import FileTree from "@/components/FileTree";
import { supabase } from "@/GlobalConstants";
import { useSidebar } from "@/hooks/useSidebar";
import { CodeExtractionResult } from "@/lib/types/chat";
import { Database } from "@/lib/types/database.types";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import { updateSnackFiles } from "@/lib/utils/code/codeExtractor";
import { getDefaultSnackFiles } from "@/templates/defaultApp";
import {
  extractExecutionPlan,
  extractStepResult,
} from "@/lib/utils/code/planningExtractor";
import {
  CodeBracketIcon,
  EyeIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type PrototypeChatSession =
  Database["public"]["Tables"]["prototype_chat_sessions"]["Row"];
type PrototypeChatMessage =
  Database["public"]["Tables"]["prototype_chat_messages"]["Row"];
type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

export default function CreatePage() {
  const router = useRouter();
  const { user, userIsLoading } = useUser();
  const params = useParams<{ prototype_id: string }>();
  const prototypeId = params?.prototype_id;
  const { setSidebarExpanded } = useSidebar();

  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewView, setIsPreviewView] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [prototypeChatSession, setPrototypeChatSession] =
    useState<PrototypeChatSession | null>(null);
  const [prototypeChatMessages, setPrototypeChatMessages] = useState<
    PrototypeChatMessage[]
  >([]);
  const [prototypeFiles, setPrototypeFiles] = useState<
    Record<string, PrototypeFile>
  >({});

  // Set the selected file to a file that actually exists
  const defaultFile = "App.js";
  const [selectedFile, setSelectedFile] = useState<string>(defaultFile);
  // Set the editor code to the contents of that existing file
  const [mainAppCode, setMainAppCode] = useState(
    prototypeFiles[defaultFile]?.contents || "",
  );
  const snackViewerRef = useRef<ExpoSnackViewerRef>(null);
  const [loadingDots, setLoadingDots] = useState(0);

  // Automatically collapse sidebar when page opens
  useEffect(() => {
    setSidebarExpanded(false);
  }, [setSidebarExpanded]);

  // Fetch prototype data
  useEffect(() => {
    async function fetchPrototype() {
      if (!prototypeId) return;

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
      console.log("Fetched prototype:", data);
    }

    async function fetchPrototypeChatSessionAndMessages() {
      if (!prototypeId || !user?.id) return;

      // fetch or create project chat session
      const { data, error } = await supabase
        .from("prototype_chat_sessions")
        .select("*")
        .eq("prototype_id", prototypeId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        console.error("Error fetching project chat session:", error);
        return;
      }

      let chatSession = data;
      if (!chatSession) {
        // No session found, create one
        const { data: newSession, error: createError } = await supabase
          .from("prototype_chat_sessions")
          .insert({ prototype_id: prototypeId, user_id: user.id })
          .select()
          .single();
        if (createError) {
          console.error("Error creating project chat session:", createError);
          return;
        }
        chatSession = newSession;
        setPrototypeChatSession(newSession);
        console.log("Created new project chat session:", chatSession);
      } else {
        setPrototypeChatSession(chatSession);
        console.log("Fetched project chat session:", chatSession);
      }

      // Then fetch the messages for this session
      const { data: messagesData, error: messagesError } = await supabase
        .from("prototype_chat_messages")
        .select("*")
        .eq("chat_session_id", chatSession.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (messagesError) {
        console.error("Error fetching chat messages:", messagesError);
        return;
      }

      // Reverse to get chronological order (oldest first)
      setPrototypeChatMessages(messagesData?.reverse() || []);
      console.log("Fetched chat messages:", messagesData);
    }

    async function fetchPrototypeFiles() {
      if (!prototypeId) return;

      const { data, error } = await supabase
        .from("prototype_files")
        .select("*")
        .eq("prototype_id", prototypeId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching prototype files:", error);
        return;
      }

      // Convert array to dictionary mapping name to PrototypeFile object
      const filesDict = (data || []).reduce(
        (acc, file) => {
          acc[file.name] = file;
          return acc;
        },
        {} as Record<string, PrototypeFile>,
      );

      setPrototypeFiles(filesDict);
      setMainAppCode(filesDict[defaultFile]?.contents || "");
      console.log("Fetched prototype files:", filesDict);
    }

    if (prototypeId && user?.id) {
      fetchPrototype();
      fetchPrototypeChatSessionAndMessages();
      fetchPrototypeFiles();
    }
  }, [
    prototypeId,
    user,
    setPrototype,
    setPrototypeChatSession,
    setPrototypeChatMessages,
  ]);

  // Animate loading dots
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingDots((prev) => (prev + 1) % 4);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const saveUpdatedFilesToDatabase = async (
    updatedFiles: Record<string, PrototypeFile>,
  ) => {
    if (!prototypeId) return;

    for (const [filePath, fileData] of Object.entries(updatedFiles)) {
      try {
        // Check if file exists
        const { data: existingFile } = await supabase
          .from("prototype_files")
          .select("id")
          .eq("prototype_id", prototypeId)
          .eq("name", filePath)
          .maybeSingle();

        if (existingFile) {
          // Update existing file
          const { error } = await supabase
            .from("prototype_files")
            .update({
              contents: fileData.contents,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingFile.id);

          if (error) {
            console.error(`Error updating file ${filePath}:`, error);
          }
        } else {
          // Create new file
          const { error } = await supabase.from("prototype_files").insert({
            prototype_id: prototypeId,
            name: filePath,
            contents: fileData.contents,
          });

          if (error) {
            console.error(`Error creating file ${filePath}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error saving file ${filePath}:`, error);
      }
    }
  };

  const executeOperationsStepByStep = async (
    operations: Array<{
      id: string;
      type: "create" | "modify" | "delete" | "move";
      title: string;
      description: string;
      filePath: string;
      newFilePath?: string;
    }>,
    currentMessages: PrototypeChatMessage[],
  ) => {
    // Create a single execution message that will be updated
    const executionMessageId = uuidv4();
    const initialExecutionMessage: PrototypeChatMessage = {
      id: executionMessageId,
      chat_session_id: prototypeChatSession?.id || "",
      role: "assistant",
      phase: "execution",
      content: `🔄 Executing ${operations.length} operations...\n\n${operations
        .map((op, index) => `${index + 1}. ${op.title} (${op.type})`)
        .join("\n")}`,
      created_at: new Date().toISOString(),
    };

    setPrototypeChatMessages((prev) => [...prev, initialExecutionMessage]);

    let completedSteps = 0;
    let failedSteps = 0;
    const stepResults: Array<{
      title: string;
      status: "success" | "error";
      message?: string;
    }> = [];

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];

      try {
        // Update the execution message to show current step
        const loadingContent = `🔄 Executing ${operations.length} operations...\n\n${operations
          .map((op, index) => {
            if (index < i) {
              return `✅ ${op.title} (${op.type})`;
            } else if (index === i) {
              return `🔄 ${op.title} (${op.type}) - Executing${".".repeat(loadingDots)}`;
            } else {
              return `${index + 1}. ${op.title} (${op.type})`;
            }
          })
          .join("\n")}`;

        setPrototypeChatMessages((prev) =>
          prev.map((msg) =>
            msg.id === executionMessageId
              ? { ...msg, content: loadingContent }
              : msg,
          ),
        );

        // Execute the specific operation
        const stepResponse = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_session_id: prototypeChatSession?.id || "",
            messages: currentMessages,
            currentCode: mainAppCode,
            phase: "step_execution",
            snackFiles: prototypeFiles,
            stepOperation: operation,
            prototype_id: prototypeId,
          }),
        });

        if (!stepResponse.ok) {
          throw new Error(`HTTP error! status: ${stepResponse.status}`);
        }

        const stepData = await stepResponse.json();
        console.log(`Step ${i + 1} data:`, stepData);

        // Extract the step result
        const stepResult = extractStepResult(stepData.content);

        if (stepResult.hasResult) {
          // Apply the code changes
          const newFiles = {
            ...prototypeFiles,
            [operation.filePath]: {
              contents: stepResult.content,
              type: "CODE" as const,
            },
          };

          // Create a deep copy to ensure React detects the change
          setPrototypeFiles(JSON.parse(JSON.stringify(newFiles)));

          // Update the main app code if the selected file was modified
          if (operation.filePath === selectedFile) {
            setMainAppCode(stepResult.content);
          }

          // Save updated files to database if returned from API
          if (stepData.updatedFiles) {
            await saveUpdatedFilesToDatabase(stepData.updatedFiles);
          }

          completedSteps++;
          stepResults.push({
            title: operation.title,
            status: "success",
            message: stepResult.message,
          });
        } else {
          failedSteps++;
          stepResults.push({
            title: operation.title,
            status: "error",
            message: stepData.content,
          });
        }

        // Update current messages for next iteration
        currentMessages = [
          ...currentMessages,
          {
            id: `step-${Date.now()}-${i}`,
            role: "assistant",
            chat_session_id: prototypeChatSession?.id || "",
            content: stepResult.hasResult
              ? `✅ Completed: ${operation.title}`
              : `❌ Failed: ${operation.title}`,
            created_at: new Date().toISOString(),
            phase: "step_execution",
          },
        ];
      } catch (error) {
        console.error(`Error executing step ${i + 1}:`, error);
        failedSteps++;
        stepResults.push({
          title: operation.title,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Update the final execution message with results
    const finalContent = `🎉 Execution completed!\n\n${operations
      .map((op, index) => {
        const result = stepResults[index];
        if (result?.status === "success") {
          return `✅ ${op.title} (${op.type})`;
        } else {
          return `❌ ${op.title} (${op.type}) - ${result?.message || "Failed"}`;
        }
      })
      .join("\n")}\n\n${completedSteps} completed, ${failedSteps} failed`;

    setPrototypeChatMessages((prev) =>
      prev.map((msg) =>
        msg.id === executionMessageId ? { ...msg, content: finalContent } : msg,
      ),
    );
  };

  const handleResetToDefault = useCallback(async () => {
    if (!prototypeId) {
      console.error("Reset failed: no prototype ID");
      return;
    }

    try {
      setIsLoading(true);

      // Get default app files
      const defaultSnackFiles = getDefaultSnackFiles();

      // Convert SnackFiles to PrototypeFile format
      const defaultPrototypeFiles: Record<string, PrototypeFile> = {};

      for (const [fileName, fileData] of Object.entries(defaultSnackFiles)) {
        defaultPrototypeFiles[fileName] = {
          id: "", // Will be set by database
          prototype_id: prototypeId,
          name: fileName,
          contents: fileData.contents,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      // Delete all existing files for this prototype
      const { error: deleteError } = await supabase
        .from("prototype_files")
        .delete()
        .eq("prototype_id", prototypeId);

      if (deleteError) {
        console.error("Error deleting existing files:", deleteError);
        return;
      }

      // Insert new default files
      const filesToInsert = Object.values(defaultPrototypeFiles).map(
        (file) => ({
          prototype_id: file.prototype_id,
          name: file.name,
          contents: file.contents,
        }),
      );

      const { data: newFiles, error: insertError } = await supabase
        .from("prototype_files")
        .insert(filesToInsert)
        .select();

      if (insertError) {
        console.error("Error inserting default files:", insertError);
        return;
      }

      // Update local state with new files
      const newFilesDict = (newFiles || []).reduce(
        (acc, file) => {
          acc[file.name] = file;
          return acc;
        },
        {} as Record<string, PrototypeFile>,
      );

      setPrototypeFiles(newFilesDict);
      setSelectedFile("App.js");
      setMainAppCode(newFilesDict["App.js"]?.contents || "");

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
  }, [prototypeId, supabase, snackViewerRef]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!prototypeChatSession?.id) {
        console.error("Sending message failed: no chat session found");
        return;
      }

      const { data: userMessage, error: insertError } = await supabase
        .from("prototype_chat_messages")
        .insert({
          chat_session_id: prototypeChatSession.id,
          content: content,
          role: "user" as const,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting user message:", insertError);
      }

      setPrototypeChatMessages((prev) => [...prev, userMessage]);

      try {
        setIsLoading(true);
        // Phase 1: Get the planning response
        const planningResponse = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_session_id: prototypeChatSession.id,
            messages: [...prototypeChatMessages, userMessage],
            currentCode: mainAppCode,
            phase: "planning",
            snackFiles: prototypeFiles,
            prototype_id: prototypeId,
          }),
        });

        if (!planningResponse.ok) {
          throw new Error(`HTTP error! status: ${planningResponse.status}`);
        }

        const planningData = await planningResponse.json();
        console.log("Planning data:", planningData);

        const planningMessage: PrototypeChatMessage = {
          id: (Date.now() + 1).toString(),
          chat_session_id: prototypeChatSession.id,
          role: "assistant",
          content: planningData.content,
          created_at: new Date().toISOString(),
          phase: "planning",
        };

        setPrototypeChatMessages((prev) => [...prev, planningMessage]);

        // Save updated files to database if returned from planning API
        if (planningData.updatedFiles) {
          await saveUpdatedFilesToDatabase(planningData.updatedFiles);
        }

        // Check if the response contains an execution plan
        if (planningData.content.includes("EXECUTION_PLAN")) {
          // Extract planned operations from the planning response
          const planningResult = extractExecutionPlan(planningData.content);

          if (planningResult.hasPlan && planningResult.operations.length > 0) {
            // Execute each operation step by step
            await executeOperationsStepByStep(planningResult.operations, [
              ...prototypeChatMessages,
              userMessage,
              planningMessage,
            ]);
          }
        }
      } catch (error) {
        console.error("Error sending message:", error);

        const errorMessage: PrototypeChatMessage = {
          id: (Date.now() + 1).toString(),
          chat_session_id: prototypeChatSession.id,
          role: "assistant",
          content:
            "Sorry, I encountered an error. Please make sure your Google AI API key is configured and try again.",
          created_at: new Date().toISOString(),
          phase: "execution",
        };

        setPrototypeChatMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [
      supabase,
      prototypeChatSession,
      setPrototypeChatMessages,
      setIsLoading,
      extractExecutionPlan,
      executeOperationsStepByStep,
      mainAppCode,
      prototypeFiles,
      prototypeChatMessages,
    ],
  );

  const handleApplyCode = (
    result: CodeExtractionResult,
    plannedFilePaths?: string[],
  ) => {
    if (result.hasCode) {
      const newFiles = updateSnackFiles(
        prototypeFiles,
        result.codeBlocks,
        plannedFilePaths,
      );
      // Create a deep copy to ensure React detects the change
      setPrototypeFiles(JSON.parse(JSON.stringify(newFiles)));

      // Update the main app code if the selected file was modified
      if (newFiles[selectedFile]) {
        setMainAppCode(newFiles[selectedFile].contents);
      }
    }
  };

  const handleExecutePlannedOperation = async (
    operationId: string,
  ): Promise<void> => {
    console.log(`Executing planned operation ${operationId}`);
    // This is now handled automatically by the step-by-step flow
  };

  const handleClearChat = useCallback(async () => {
    if (!prototypeChatSession?.id) {
      console.error("Clear chat failed: no chat session found");
      return;
    }

    try {
      // Delete all messages for this chat session
      const { error } = await supabase
        .from("prototype_chat_messages")
        .delete()
        .eq("chat_session_id", prototypeChatSession.id);

      if (error) {
        console.error("Error clearing chat messages:", error);
        return;
      }

      // Clear the local state
      setPrototypeChatMessages([]);
      console.log("Chat cleared successfully");
    } catch (error) {
      console.error("Error clearing chat:", error);
    }
  }, [prototypeChatSession, supabase]);

  // const handleFilesChange = (files: SnackFiles) => {
  //   // Create a deep copy to ensure React detects the change
  //   setPrototypeFiles(JSON.parse(JSON.stringify(files)));

  //   // Update the main app code based on selected file
  //   if (files[selectedFile]) {
  //     setMainAppCode(files[selectedFile].contents);
  //   } else if (files[defaultFile]) {
  //     // Fallback to default file if selected file doesn't exist
  //     setSelectedFile(defaultFile);
  //     setMainAppCode(files[defaultFile].contents);
  //   }
  // };

  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath);
    if (prototypeFiles[filePath]) {
      setMainAppCode(prototypeFiles[filePath].contents);
    }
  };

  const handleCodeChange = (value: string | undefined) => {
    if (value !== undefined && selectedFile) {
      setMainAppCode(value);

      // Update the snack files with the new code for the selected file
      const updatedFiles = {
        ...prototypeFiles,
        [selectedFile]: {
          ...prototypeFiles[selectedFile],
          contents: value,
        },
      };
      // Create a deep copy to ensure React detects the change
      setPrototypeFiles(JSON.parse(JSON.stringify(updatedFiles)));
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
              <ChatWindow
                // Legacy props for backward compatibility
                messages={prototypeChatMessages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                // Preserved functionality
                onApplyCode={handleApplyCode}
                onExecutePlannedOperation={handleExecutePlannedOperation}
                onClearChat={handleClearChat}
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
            <div className="absolute inset-0 bg-gradient-to-r from-meta-3/5 via-meta-5/5 to-meta-6/5 dark:from-meta-3/10 dark:via-meta-5/10 dark:to-meta-6/10"></div>

            <div className="relative p-6 border-b border-white/20 dark:border-strokedark/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-meta-3/20 to-meta-5/20 rounded-lg blur-sm"></div>
                    <div className="relative p-2 bg-gradient-to-r from-meta-3 to-meta-5 rounded-lg shadow-lg">
                      {isPreviewView ? (
                        <EyeIcon className="w-5 h-5 text-white" />
                      ) : (
                        <CodeBracketIcon className="w-5 h-5 text-white" />
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
                <div className="flex items-center bg-white/60 dark:bg-boxdark/60 rounded-xl p-1 backdrop-blur-sm border border-white/30 dark:border-strokedark/40">
                  <button
                    onClick={() => setIsPreviewView(true)}
                    className={`relative px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                      isPreviewView
                        ? "bg-gradient-to-r from-meta-3 to-meta-5 text-white shadow-lg shadow-meta-3/25 transform scale-105"
                        : "text-body dark:text-bodydark hover:text-black dark:hover:text-white hover:bg-white/40 dark:hover:bg-boxdark/40"
                    }`}
                  >
                    <EyeIcon className="w-4 h-4 inline mr-2" />
                    Preview
                  </button>
                  <button
                    onClick={() => setIsPreviewView(false)}
                    className={`relative px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                      !isPreviewView
                        ? "bg-gradient-to-r from-meta-3 to-meta-5 text-white shadow-lg shadow-meta-3/25 transform scale-105"
                        : "text-body dark:text-bodydark hover:text-black dark:hover:text-white hover:bg-white/40 dark:hover:bg-boxdark/40"
                    }`}
                  >
                    <CodeBracketIcon className="w-4 h-4 inline mr-2" />
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
                    files={prototypeFiles}
                    onResetToDefault={handleResetToDefault}
                  />
                </div>
              ) : (
                <div className="max-h-[550px] flex">
                  {/* File Explorer */}
                  <div className="w-1/4 min-w-[200px] max-w-[280px] border-r border-white/20 dark:border-strokedark/30 h-full">
                    <div className="h-full">
                      <FileTree
                        files={prototypeFiles}
                        selectedFile={selectedFile}
                        onFileSelect={handleFileSelect}
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
                        value={mainAppCode}
                        onChange={handleCodeChange}
                        fileName={selectedFile}
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
