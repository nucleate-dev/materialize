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
import {
  ChatMessage,
  CodeExtractionResult,
  SnackFiles,
} from "@/lib/types/chat";
import { Database } from "@/lib/types/database.types";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import {
  extractCodeFromMessage,
  updateSnackFiles,
} from "@/lib/utils/code/codeExtractor";
import { extractExecutionPlan } from "@/lib/utils/code/planningExtractor";
import { getDefaultSnackFiles } from "@/templates/defaultApp";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SparklesIcon, CodeBracketIcon, EyeIcon } from "@heroicons/react/24/outline";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type PrototypeChatSession =
  Database["public"]["Tables"]["prototype_chat_sessions"]["Row"];
type PrototypeChatMessage =
  Database["public"]["Tables"]["prototype_chat_messages"]["Row"];

export default function CreatePage() {
  const { user, userIsLoading } = useUser();
  const params = useParams<{ prototype_id: string; }>();
  const prototypeId = params?.prototype_id;
  const { setSidebarExpanded } = useSidebar();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [prototype, setPrototype] = useState<Prototype | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [prototypeChatSession, setPrototypeChatSession] =
    useState<PrototypeChatSession | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [prototypeChatMessages, setPrototypeChatMessages] = useState<
    PrototypeChatMessage[]
  >([]);

  // Automatically collapse sidebar when page opens
  useEffect(() => {
    setSidebarExpanded(false);
  }, [setSidebarExpanded]);

  // Fetch project data
  useEffect(() => {
    async function fetchPrototype() {
      if (!prototypeId) return;

      const { data, error } = await supabase
        .from("prototypes")
        .select("*")
        .eq("id", prototypeId)
        .single();

      if (error) {
        console.error("Error fetching project:", error);
        return;
      }

      setPrototype(data);
      console.log("Fetched project:", data);
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

    if (prototypeId && user?.id) {
      fetchPrototype();
      fetchPrototypeChatSessionAndMessages();
    }
  }, [
    prototypeId,
    user,
    setPrototype,
    setPrototypeChatSession,
    setPrototypeChatMessages,
  ]);

  // Convert database messages to ChatMessage format
  //   useEffect(() => {
  //     if (chatMessages.length > 0 && !loadedFromDB) {
  //       const convertedMessages: ChatMessage[] = chatMessages.map((msg) => ({
  //         id: msg.id,
  //         role: msg.role as "user" | "assistant",
  //         content: msg.content,
  //         timestamp: new Date(msg.created_at || ""),
  //       }));

  //       setMessages(convertedMessages);
  //       setLoadedFromDB(true);
  //       console.log("Converted and loaded messages from database");
  //     }
  //   }, [chatMessages, loadedFromDB]);
  // Define the default file to show in the editor
  const defaultFile = "app/_layout.tsx";

  // Initialize SnackFiles state as before
  const [snackFiles, setSnackFiles] = useState<SnackFiles>(
    getDefaultSnackFiles()
  );
  const [isChatView, setIsChatView] = useState(true);

  // Set the selected file to a file that actually exists
  const [selectedFile, setSelectedFile] = useState<string>(defaultFile);

  // Set the editor code to the contents of that existing file
  const [mainAppCode, setMainAppCode] = useState(
    snackFiles[defaultFile]?.contents || ""
  );
  const snackViewerRef = useRef<ExpoSnackViewerRef>(null);

  const handleSendMessage = async (content: string) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Phase 1: Get the planning response
      const planningResponse = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          currentCode: mainAppCode,
          phase: "planning",
        }),
      });

      if (!planningResponse.ok) {
        throw new Error(`HTTP error! status: ${planningResponse.status}`);
      }

      const planningData = await planningResponse.json();
      console.log("Planning data:", planningData);

      const planningMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: planningData.content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, planningMessage]);

      // Check if the response contains an execution plan
      if (planningData.content.includes("EXECUTION_PLAN")) {
        // Extract planned file paths from the planning response
        const planningResult = extractExecutionPlan(planningData.content);
        const plannedFilePaths = planningResult.operations
          .filter(op => op.type === "create" || op.type === "modify")
          .map(op => op.filePath);

        // Phase 2: Get the execution response automatically
        const executionResponse = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [...messages, userMessage, planningMessage],
            currentCode: mainAppCode,
            phase: "execution",
          }),
        });

        if (!executionResponse.ok) {
          throw new Error(`HTTP error! status: ${executionResponse.status}`);
        }

        const executionData = await executionResponse.json();
        console.log("Execution data:", executionData);

        const executionMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: executionData.content,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, executionMessage]);

        // Auto-apply the execution code immediately with planned file paths
        const codeResult = extractCodeFromMessage(executionData.content);
        if (codeResult.hasCode) {
          handleApplyCode(codeResult, plannedFilePaths);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);

      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "Sorry, I encountered an error. Please make sure your Google AI API key is configured and try again.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyCode = (result: CodeExtractionResult, plannedFilePaths?: string[]) => {
    if (result.hasCode) {
      const newFiles = updateSnackFiles(snackFiles, result.codeBlocks, plannedFilePaths);
      // Create a deep copy to ensure React detects the change
      setSnackFiles(JSON.parse(JSON.stringify(newFiles)));

      // Update the main app code if the selected file was modified
      if (newFiles[selectedFile]) {
        setMainAppCode(newFiles[selectedFile].contents);
      }
    }
  };

  const handleExecutePlannedOperation = async (
    operationId: string
  ): Promise<void> => {
    console.log(`Executing planned operation ${operationId}`);
    // This is now handled automatically by the two-message flow
    // The execution message will contain code blocks that can be applied
  };

  const handleFilesChange = (files: SnackFiles) => {
    // Create a deep copy to ensure React detects the change
    setSnackFiles(JSON.parse(JSON.stringify(files)));

    // Update the main app code based on selected file
    if (files[selectedFile]) {
      setMainAppCode(files[selectedFile].contents);
    } else if (files[defaultFile]) {
      // Fallback to default file if selected file doesn't exist
      setSelectedFile(defaultFile);
      setMainAppCode(files[defaultFile].contents);
    }
  };

  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath);
    if (snackFiles[filePath]) {
      setMainAppCode(snackFiles[filePath].contents);
    }
  };

  const handleCodeChange = (value: string | undefined) => {
    if (value !== undefined && selectedFile) {
      setMainAppCode(value);

      // Update the snack files with the new code for the selected file
      const updatedFiles = {
        ...snackFiles,
        [selectedFile]: {
          ...snackFiles[selectedFile],
          contents: value,
        },
      };
      // Create a deep copy to ensure React detects the change
      setSnackFiles(JSON.parse(JSON.stringify(updatedFiles)));
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

      {/* Left Panel - Chat/Code */}
      <div className="w-2/5 min-w-[420px] flex flex-col relative z-10">
        {/* Glassmorphism Container */}
        <div className="h-full m-4 bg-white/80 dark:bg-boxdark/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-strokedark/30 overflow-hidden">
          {/* Enhanced Header */}
          <div className="relative">
            {/* Header gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-secondary/5 to-meta-5/5 dark:from-primary/10 dark:via-secondary/10 dark:to-meta-5/10"></div>
            
            <div className="relative p-6 border-b border-white/20 dark:border-strokedark/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-lg blur-sm"></div>
                    <div className="relative p-2 bg-gradient-to-r from-primary to-secondary rounded-lg shadow-lg">
                      {isChatView ? (
                        <SparklesIcon className="w-5 h-5 text-white" />
                      ) : (
                        <CodeBracketIcon className="w-5 h-5 text-white" />
                      )}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-black dark:text-white">
                      {isChatView ? "AI Assistant" : "Code Editor"}
                    </h2>
                    <p className="text-sm text-body dark:text-bodydark">
                      {isChatView ? "Build with AI-powered development" : "Edit your prototype code"}
                    </p>
                  </div>
                </div>
                
                {/* Enhanced Toggle Buttons */}
                <div className="flex items-center bg-white/60 dark:bg-boxdark/60 rounded-xl p-1 backdrop-blur-sm border border-white/30 dark:border-strokedark/40">
                  <button
                    onClick={() => setIsChatView(true)}
                    className={`relative px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                      isChatView
                        ? "bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/25 transform scale-105"
                        : "text-body dark:text-bodydark hover:text-black dark:hover:text-white hover:bg-white/40 dark:hover:bg-boxdark/40"
                    }`}
                  >
                    <SparklesIcon className="w-4 h-4 inline mr-2" />
                    Chat
                  </button>
                  <button
                    onClick={() => setIsChatView(false)}
                    className={`relative px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                      !isChatView
                        ? "bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/25 transform scale-105"
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
          <div className="flex-1 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent dark:from-white/2 pointer-events-none"></div>
            
            <div className="relative h-full">
              {isChatView ? (
                <ChatWindow
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onApplyCode={handleApplyCode}
                  onExecutePlannedOperation={handleExecutePlannedOperation}
                  isLoading={isLoading}
                />
              ) : (
                <div className="h-full flex">
                  {/* File Explorer */}
                  <div className="w-1/3 min-w-[200px] max-w-[300px] border-r border-white/20 dark:border-strokedark/30">
                    <FileTree
                      files={snackFiles}
                      selectedFile={selectedFile}
                      onFileSelect={handleFileSelect}
                    />
                  </div>

                  {/* Code Editor */}
                  <div className="flex-1">
                    <CodeEditor
                      value={mainAppCode}
                      onChange={handleCodeChange}
                      fileName={selectedFile}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Expo Snack Viewer */}
      <div className="w-3/5 min-w-[500px] flex flex-col relative z-10">
        {/* Glassmorphism Container */}
        <div className="h-full m-4 ml-0 bg-white/80 dark:bg-boxdark/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-strokedark/30 overflow-hidden">
          {/* Preview Header */}
          <div className="relative">
            {/* Header gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-meta-3/5 via-meta-5/5 to-meta-6/5 dark:from-meta-3/10 dark:via-meta-5/10 dark:to-meta-6/10"></div>
            
            <div className="relative p-6 border-b border-white/20 dark:border-strokedark/30">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-meta-3/20 to-meta-5/20 rounded-lg blur-sm"></div>
                  <div className="relative p-2 bg-gradient-to-r from-meta-3 to-meta-5 rounded-lg shadow-lg">
                    <EyeIcon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-black dark:text-white">
                    Live Preview
                  </h2>
                  <p className="text-sm text-body dark:text-bodydark">
                    See your changes in real-time
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Content */}
          <div className="flex-1 relative">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent dark:from-white/2 pointer-events-none"></div>
            
            <div className="relative h-full">
              <ExpoSnackViewer
                ref={snackViewerRef}
                files={snackFiles}
                onFilesChange={handleFilesChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
