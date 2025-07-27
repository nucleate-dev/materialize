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
import { extractCodeFromMessage, updateSnackFiles } from "@/lib/utils/code/codeExtractor";
import { getDefaultSnackFiles } from "@/templates/defaultApp";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type PrototypeChatSession =
  Database["public"]["Tables"]["prototype_chat_sessions"]["Row"];
type PrototypeChatMessage =
  Database["public"]["Tables"]["prototype_chat_messages"]["Row"];

export default function CreatePage() {
  const { user, userIsLoading } = useUser();
  const params = useParams<{ project_id: string; }>();
  const projectId = params?.project_id;
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
      if (!projectId) return;

      const { data, error } = await supabase
        .from("prototypes")
        .select("*")
        .eq("id", projectId)
        .single();

      if (error) {
        console.error("Error fetching project:", error);
        return;
      }

      setPrototype(data);
      console.log("Fetched project:", data);
    }

    async function fetchPrototypeChatSessionAndMessages() {
      if (!projectId || !user?.id) return;

      // fetch or create project chat session
      const { data, error } = await supabase
        .from("prototype_chat_sessions")
        .select("*")
        .eq("prototype_id", projectId)
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
          .insert({ prototype_id: projectId, user_id: user.id })
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

    if (projectId && user?.id) {
      fetchPrototype();
      fetchPrototypeChatSessionAndMessages();
    }
  }, [
    projectId,
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
      if (planningData.content.includes('EXECUTION_PLAN')) {

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

        // Auto-apply the execution code immediately
        const codeResult = extractCodeFromMessage(executionData.content);
        if (codeResult.hasCode) {
          handleApplyCode(codeResult);
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

  const handleApplyCode = (result: CodeExtractionResult) => {
    if (result.hasCode) {
      const newFiles = updateSnackFiles(snackFiles, result.codeBlocks);
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

  if (!projectId || userIsLoading) {
    return <Loader />;
  }

  return (
    <div className="flex bg-gray-100 overflow-hidden h-full">
      {/* Left Panel - 40% width */}
      <div className="w-2/5 min-w-[400px] flex flex-col">
        {/* Toggle Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              {isChatView ? "AI Assistant" : "Code Editor"}
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsChatView(true)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${isChatView
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
              >
                Chat
              </button>
              <button
                onClick={() => setIsChatView(false)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${!isChatView
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
              >
                Code
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
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
              {/* File Explorer - 30% width */}
              <div className="w-1/3 min-w-[200px] max-w-[300px]">
                <FileTree
                  files={snackFiles}
                  selectedFile={selectedFile}
                  onFileSelect={handleFileSelect}
                />
              </div>

              {/* Code Editor - 70% width */}
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

      {/* Expo Snack Viewer - 60% width */}
      <div className="w-3/5 min-w-[500px]">
        <ExpoSnackViewer
          ref={snackViewerRef}
          files={snackFiles}
          onFilesChange={handleFilesChange}
        />
      </div>
    </div>
  );
}
