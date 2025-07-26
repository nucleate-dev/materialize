"use client";

import { useRef, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSidebar } from "@/hooks/useSidebar";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";
import { supabase } from "@/GlobalConstants";
import { Database } from "@/lib/types/database.types";
import Loader from "@/components/dashboard/Loader";
import ChatWindow from "@/components/ChatWindow";
import FileTree from "@/components/FileTree";
import CodeEditor from "@/components/CodeEditor";
import ExpoSnackViewer, {
  ExpoSnackViewerRef,
} from "@/components/ExpoSnackViewer";
import { getDefaultSnackFiles } from "@/templates/defaultApp";
import {
  ChatMessage,
  CodeExtractionResult,
  EditOperation,
  EditOperationResult,
  SnackFiles,
} from "@/lib/types/chat";
import { updateSnackFiles } from "@/lib/utils/code/codeExtractor";
import {
  EditProcessor,
  EditProcessorResult,
} from "@/lib/utils/code/editProcessor";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type ProjectChatSession =
  Database["public"]["Tables"]["project_chat_sessions"]["Row"];
type ProjectChatMessage =
  Database["public"]["Tables"]["project_chat_messages"]["Row"];

export default function CreatePage() {
  const { user, userIsLoading } = useUser();
  const params = useParams<{ project_id: string }>();
  const projectId = params?.project_id;
  const { setSidebarExpanded } = useSidebar();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [project, setProject] = useState<Project | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [projectChatSession, setProjectChatSession] =
    useState<ProjectChatSession | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [chatMessages, setChatMessages] = useState<ProjectChatMessage[]>([]);

  // Automatically collapse sidebar when page opens
  useEffect(() => {
    setSidebarExpanded(false);
  }, [setSidebarExpanded]);

  // Fetch project data
  useEffect(() => {
    async function fetchProject() {
      if (!projectId) return;

      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (error) {
        console.error("Error fetching project:", error);
        return;
      }

      setProject(data);
      console.log("Fetched project:", data);
    }

    async function fetchProjectChatSessionAndMessages() {
      if (!projectId || !user?.id) return;

      // fetch or create project chat session
      const { data, error } = await supabase
        .from("project_chat_sessions")
        .select("*")
        .eq("project_id", projectId)
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
          .from("project_chat_sessions")
          .insert({ project_id: projectId, user_id: user.id })
          .select()
          .single();
        if (createError) {
          console.error("Error creating project chat session:", createError);
          return;
        }
        chatSession = newSession;
        setProjectChatSession(newSession);
        console.log("Created new project chat session:", chatSession);
      } else {
        setProjectChatSession(chatSession);
        console.log("Fetched project chat session:", chatSession);
      }

      // Then fetch the messages for this session
      const { data: messagesData, error: messagesError } = await supabase
        .from("project_chat_messages")
        .select("*")
        .eq("chat_session_id", chatSession.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (messagesError) {
        console.error("Error fetching chat messages:", messagesError);
        return;
      }

      // Reverse to get chronological order (oldest first)
      setChatMessages(messagesData?.reverse() || []);
      console.log("Fetched chat messages:", messagesData);
    }

    if (projectId && user?.id) {
      fetchProject();
      fetchProjectChatSessionAndMessages();
    }
  }, [projectId, user]);

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
  const [snackFiles, setSnackFiles] = useState<SnackFiles>(
    getDefaultSnackFiles()
  );
  const [isChatView, setIsChatView] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string>("App.js");
  const [mainAppCode, setMainAppCode] = useState(
    snackFiles["App.js"]?.contents || ""
  );
  const [useGranularEdits, setUseGranularEdits] = useState(true);
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
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          currentCode: mainAppCode,
          useGranularEdit: useGranularEdits,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("data", data);
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
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

      // Update the main app code if it was modified
      if (newFiles["App.js"]) {
        setMainAppCode(newFiles["App.js"].contents);
      }
    }
  };

  const handleApplyEditOperations = (result: EditOperationResult) => {
    if (result.hasOperations) {
      console.log("Applying edit operations:", result.operations);

      const processor = new EditProcessor(snackFiles);
      const processorResult: EditProcessorResult = processor.applyOperations(
        result.operations
      );

      if (processorResult.success) {
        // Create a deep copy to ensure React detects the change
        setSnackFiles(JSON.parse(JSON.stringify(processorResult.updatedFiles)));

        // Update the main app code if App.js was modified
        if (processorResult.updatedFiles["App.js"]) {
          setMainAppCode(processorResult.updatedFiles["App.js"].contents);
        }

        console.log("Edit operations applied successfully");
      } else {
        console.error(
          "Failed to apply edit operations:",
          processorResult.errors
        );

        // Show error message to user
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: `Failed to apply changes:\n${processorResult.errors.join("\n")}`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, errorMessage]);
      }
    }
  };

  const handleApplyWithToggle = (
    result: CodeExtractionResult,
    editResult: EditOperationResult
  ) => {
    if (useGranularEdits && editResult.hasOperations) {
      handleApplyEditOperations(editResult);
    } else if (result.hasCode) {
      handleApplyCode(result);
    }
  };

  const handleExecutePlannedOperation = async (
    operationId: string, 
    operations: EditOperation[]
  ): Promise<void> => {
    console.log(`Executing planned operation ${operationId} with ${operations.length} edit operations`);

    const processor = new EditProcessor(snackFiles);
    const processorResult: EditProcessorResult = processor.applyOperations(operations);

    if (processorResult.success) {
      // Create a deep copy to ensure React detects the change
      setSnackFiles(JSON.parse(JSON.stringify(processorResult.updatedFiles)));

      // Update the main app code if App.js was modified
      if (processorResult.updatedFiles["App.js"]) {
        setMainAppCode(processorResult.updatedFiles["App.js"].contents);
      }

      console.log(`Planned operation ${operationId} executed successfully`);
    } else {
      console.error(`Failed to execute planned operation ${operationId}:`, processorResult.errors);
      throw new Error(`Failed to execute operation: ${processorResult.errors.join(", ")}`);
    }
  };

  const handleFilesChange = (files: SnackFiles) => {
    // Create a deep copy to ensure React detects the change
    setSnackFiles(JSON.parse(JSON.stringify(files)));
    
    // Update the main app code based on selected file
    if (files[selectedFile]) {
      setMainAppCode(files[selectedFile].contents);
    } else if (files["App.js"]) {
      // Fallback to App.js if selected file doesn't exist
      setSelectedFile("App.js");
      setMainAppCode(files["App.js"].contents);
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
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  isChatView
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setIsChatView(false)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  !isChatView
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
              onApplyWithToggle={handleApplyWithToggle}
              onExecutePlannedOperation={handleExecutePlannedOperation}
              useGranularEdits={useGranularEdits}
              onToggleGranularEdits={setUseGranularEdits}
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
