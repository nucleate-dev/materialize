"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/GlobalConstants";
import { Database } from "@/lib/types/database.types";
import { CodeExtractionResult } from "@/lib/types/chat";
import {
  extractExecutionPlan,
  extractStepResult,
} from "@/lib/utils/code/planningExtractor";
import { v4 as uuidv4 } from "uuid";
import ChatWindow from "@/components/ChatWindow";
import { useUser } from "@/lib/utils/auth/SupabaseAuthUtils";

type PrototypeChatSession =
  Database["public"]["Tables"]["prototype_chat_sessions"]["Row"];
type PrototypeChatMessage =
  Database["public"]["Tables"]["prototype_chat_messages"]["Row"];
type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

export interface PrototypeChatWindowProps {
  prototypeId: string | undefined;

  // File system integration
  files: Record<string, PrototypeFile>;
  selectedFile: string;
  onFilesUpdate: (files: Record<string, PrototypeFile>) => void;
  onFileContentUpdate: (filePath: string, content: string) => void;

  // Loading state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Legacy props for backward compatibility
  onApplyCode?: (
    result: CodeExtractionResult,
    plannedFilePaths?: string[],
  ) => void;
  onClearChat?: () => void;
}

export default function PrototypeChatWindow({
  files,
  selectedFile,
  onFilesUpdate,
  onFileContentUpdate,
  prototypeId,
  isLoading,
  setIsLoading,
  onClearChat,
}: PrototypeChatWindowProps) {
  const [loadingDots, setLoadingDots] = useState(0);
  const [isExecutingOperations, setIsExecutingOperations] = useState(false);
  const [prototypeChatSession, setPrototypeChatSession] =
    useState<PrototypeChatSession | null>(null);
  const [prototypeChatMessages, setPrototypeChatMessages] = useState<
    PrototypeChatMessage[]
  >([]);

  const { user } = useUser();
  const userId = user?.id;

  useEffect(() => {
    async function fetchPrototypeChatSessionAndMessages() {
      if (!prototypeId || !userId) return;

      // fetch or create project chat session
      const { data, error } = await supabase
        .from("prototype_chat_sessions")
        .select("*")
        .eq("prototype_id", prototypeId)
        .eq("user_id", userId)
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
          .insert({ prototype_id: prototypeId, user_id: userId })
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

    if (prototypeId && userId) {
      fetchPrototypeChatSessionAndMessages();
    }
  }, [prototypeId, userId]);

  // Animate loading dots only when executing operations
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isExecutingOperations) {
      interval = setInterval(() => {
        setLoadingDots((prev) => (prev + 1) % 4);
      }, 500);
    } else {
      setLoadingDots(0); // Reset to 0 when not executing
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isExecutingOperations]);

  // Execute operations step by step
  const executeOperationsStepByStep = useCallback(
    async (
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

      setIsExecutingOperations(true); // Start animation
      let currentMessagesState = [...currentMessages, initialExecutionMessage];
      setPrototypeChatMessages(currentMessagesState);

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

          currentMessagesState = currentMessagesState.map((msg) =>
            msg.id === executionMessageId
              ? { ...msg, content: loadingContent }
              : msg,
          );
          setPrototypeChatMessages(currentMessagesState);

          // Execute the specific operation
          const { data: session } = await supabase.auth.getSession();
          if (!session.session?.access_token) {
            throw new Error("No access token available");
          }

          const stepResponse = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.session.access_token}`,
            },
            body: JSON.stringify({
              chat_session_id: prototypeChatSession?.id || "",
              messages: currentMessages,
              currentCode: files[selectedFile]?.contents || "",
              phase: "step_execution",
              snackFiles: files,
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
            // Update file content via callback
            onFileContentUpdate(operation.filePath, stepResult.content);

            // Save updated files to database if returned from API
            if (stepData.updatedFiles) {
              // Let parent handle database saving
              onFilesUpdate(stepData.updatedFiles);
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

      currentMessagesState = currentMessagesState.map((msg) =>
        msg.id === executionMessageId ? { ...msg, content: finalContent } : msg,
      );
      setPrototypeChatMessages(currentMessagesState);
      setIsExecutingOperations(false); // Stop animation
    },
    [
      prototypeChatMessages,
      prototypeChatMessages,
      files,
      selectedFile,
      setPrototypeChatMessages,
      onFilesUpdate,
      onFileContentUpdate,
      prototypeId,
      loadingDots,
    ],
  );

  // Handle sending messages
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
        return;
      }

      setPrototypeChatMessages([...prototypeChatMessages, userMessage]);

      try {
        setIsLoading(true);

        // Get access token for authentication
        const { data: session } = await supabase.auth.getSession();
        if (!session.session?.access_token) {
          throw new Error("No access token available");
        }

        // Phase 1: Get the planning response
        const planningResponse = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            chat_session_id: prototypeChatSession.id,
            messages: [...prototypeChatMessages, userMessage],
            currentCode: files[selectedFile]?.contents || "",
            phase: "planning",
            snackFiles: files,
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
          chat_session_id: prototypeChatSession?.id || "",
          role: "assistant",
          content: planningData.content,
          created_at: new Date().toISOString(),
          phase: "planning",
        };

        setPrototypeChatMessages([
          ...prototypeChatMessages,
          userMessage,
          planningMessage,
        ]);

        // Save updated files to database if returned from planning API
        if (planningData.updatedFiles) {
          onFilesUpdate(planningData.updatedFiles);
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
          chat_session_id: prototypeChatSession?.id || "",
          role: "assistant",
          content:
            "Sorry, I encountered an error. Please make sure your Google AI API key is configured and try again.",
          created_at: new Date().toISOString(),
          phase: "execution",
        };

        setPrototypeChatMessages([
          ...prototypeChatMessages,
          userMessage,
          errorMessage,
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [
      prototypeChatSession,
      prototypeChatMessages,
      setPrototypeChatMessages,
      setIsLoading,
      files,
      selectedFile,
      prototypeId,
      onFilesUpdate,
      executeOperationsStepByStep,
    ],
  );

  // Handle clear chat
  const handleClearChat = useCallback(async () => {
    if (onClearChat) {
      await onClearChat();
    } else if (prototypeChatSession?.id) {
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
    }
  }, [prototypeChatSession, onClearChat, setPrototypeChatMessages]);

  return (
    <ChatWindow
      messages={prototypeChatMessages}
      onSendMessage={handleSendMessage}
      isLoading={isLoading}
      onClearChat={handleClearChat}
    />
  );
}
