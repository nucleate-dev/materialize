"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/GlobalConstants";
import { Database } from "@/lib/types/database.types";
import { CodeExtractionResult } from "@/lib/types/chat";
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

  // Animate loading dots only while executing operations
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

  // Handle streaming execution updates
  const processStreamingResponse = useCallback(
    async (response: Response) => {
      if (!response.body) {
        throw new Error("No response body for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let executionMessageId: string | null = null;
      let operations: Array<{
        id: string;
        type: "create" | "modify" | "delete" | "move";
        title: string;
        description: string;
        filePath: string;
        newFilePath?: string;
      }> = [];

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                switch (data.type) {
                  case "planning": {
                    // Add planning message to UI
                    setPrototypeChatMessages((prev) => [
                      ...prev,
                      {
                        id: data.messageId || uuidv4(),
                        chat_session_id: prototypeChatSession?.id || "",
                        role: "assistant",
                        phase: "planning",
                        content: data.content,
                        created_at: new Date().toISOString(),
                      },
                    ]);

                    // Save updated files from planning
                    if (data.updatedFiles) {
                      onFilesUpdate(data.updatedFiles);
                    }
                    break;
                  }

                  case "execution_start": {
                    operations = data.operations;
                    executionMessageId = uuidv4();

                    const initialExecutionMessage: PrototypeChatMessage = {
                      id: executionMessageId,
                      chat_session_id: prototypeChatSession?.id || "",
                      role: "assistant",
                      phase: "execution",
                      content: `🔄 Executing ${operations.length} operations...\n\n${operations
                        .map(
                          (op, index) =>
                            `${index + 1}. ${op.title} (${op.type})`,
                        )
                        .join("\n")}`,
                      created_at: new Date().toISOString(),
                    };

                    setIsExecutingOperations(true);
                    setPrototypeChatMessages((prev) => [
                      ...prev,
                      initialExecutionMessage,
                    ]);
                    break;
                  }

                  case "step_start":
                    if (executionMessageId) {
                      const stepIndex = data.stepIndex;
                      const loadingContent = `🔄 Executing ${operations.length} operations...\n\n${operations
                        .map((op, index) => {
                          if (index < stepIndex) {
                            return `✅ ${op.title} (${op.type})`;
                          } else if (index === stepIndex) {
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
                    }
                    break;

                  case "step_complete": {
                    const { stepIndex, result, success } = data;

                    if (success && result.updatedFiles) {
                      onFilesUpdate(result.updatedFiles);
                    }

                    // Update the execution message to show completion
                    if (executionMessageId) {
                      const updatedContent = `🔄 Executing ${operations.length} operations...\n\n${operations
                        .map((op, index) => {
                          if (index <= stepIndex) {
                            return success
                              ? `✅ ${op.title} (${op.type})`
                              : `❌ ${op.title} (${op.type})`;
                          } else {
                            return `${index + 1}. ${op.title} (${op.type})`;
                          }
                        })
                        .join("\n")}`;

                      setPrototypeChatMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === executionMessageId
                            ? { ...msg, content: updatedContent }
                            : msg,
                        ),
                      );
                    }
                    break;
                  }

                  case "step_error":
                    console.error(
                      `Step ${data.stepIndex + 1} failed:`,
                      data.error,
                    );

                    // Update the execution message to show error
                    if (executionMessageId) {
                      const errorContent = `🔄 Executing ${operations.length} operations...\n\n${operations
                        .map((op, index) => {
                          if (index < data.stepIndex) {
                            return `✅ ${op.title} (${op.type})`;
                          } else if (index === data.stepIndex) {
                            return `❌ ${op.title} (${op.type}) - ${data.error}`;
                          } else {
                            return `${index + 1}. ${op.title} (${op.type})`;
                          }
                        })
                        .join("\n")}`;

                      setPrototypeChatMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === executionMessageId
                            ? { ...msg, content: errorContent }
                            : msg,
                        ),
                      );
                    }
                    break;

                  case "execution_complete":
                    setIsExecutingOperations(false);

                    // Save final updated files
                    if (data.updatedFiles) {
                      onFilesUpdate(data.updatedFiles);
                    }

                    // Update final execution message
                    if (executionMessageId) {
                      const completedCount = operations.length; // All operations assumed completed

                      const finalContent = `🎉 Execution completed!\n\n${operations
                        .map((op) => `✅ ${op.title} (${op.type})`)
                        .join("\n")}\n\n${completedCount} completed`;

                      setPrototypeChatMessages((prev) =>
                        prev.map((msg) =>
                          msg.id === executionMessageId
                            ? { ...msg, content: finalContent }
                            : msg,
                        ),
                      );
                    }
                    break;

                  case "error": {
                    console.error("Streaming error:", data.error);
                    setIsExecutingOperations(false);
                    setIsLoading(false);

                    const errorMessage: PrototypeChatMessage = {
                      id: uuidv4(),
                      chat_session_id: prototypeChatSession?.id || "",
                      role: "assistant",
                      content: `Sorry, I encountered an error: ${data.error}`,
                      created_at: new Date().toISOString(),
                      phase: "execution",
                    };

                    setPrototypeChatMessages((prev) => [...prev, errorMessage]);
                    break;
                  }
                }
              } catch (parseError) {
                console.error("Error parsing streaming data:", parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
    [
      prototypeChatSession,
      onFilesUpdate,
      setPrototypeChatMessages,
      setIsExecutingOperations,
      setIsLoading,
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

        // Make a single streaming request that handles both planning and execution
        const streamingResponse = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/stream", // Signal that we want streaming
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

        if (!streamingResponse.ok) {
          throw new Error(`HTTP error! status: ${streamingResponse.status}`);
        }

        // Process the streaming response
        await processStreamingResponse(streamingResponse);
      } catch (error) {
        console.error("Error sending message:", error);

        const errorMessage: PrototypeChatMessage = {
          id: uuidv4(),
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
      processStreamingResponse,
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
