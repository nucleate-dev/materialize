"use client";

import { supabase } from "@/ClientConstants";
import ChatWindow from "@/components/ChatWindow";
import ProPlanUpsellModal from "@/components/ProPlanUpsellModal";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useUser } from "@/hooks/useUser";
import { Database } from "@/lib/types/supabase";
import {
  ChatErrorResponse,
  ChatRequestBody,
  PrototypeFileInput,
  ChatMessage as ServerChatMessage,
} from "@/lib/types/serverAPITypes";
import { clearChatIntent, getChatIntent } from "@/lib/utils/chatIntentUtils";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

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
  onRefetchFiles?: () => Promise<void>;

  // Loading state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Viewing URL callback
  onViewingUrlUpdate?: (viewingUrl: string) => void;

  onClearChat?: () => void;
  onBuildingStateChange?: (isBuilding: boolean) => void;
}

export default function PrototypeChatWindow({
  files,
  // onFilesUpdate,
  onRefetchFiles,
  prototypeId,
  isLoading,
  setIsLoading,
  onViewingUrlUpdate,
  onClearChat,
  onBuildingStateChange,
}: PrototypeChatWindowProps) {
  const [loadingDots, setLoadingDots] = useState(0);
  const [isExecutingOperations, setIsExecutingOperations] = useState(false);
  const [prototypeChatSession, setPrototypeChatSession] =
    useState<PrototypeChatSession | null>(null);
  const [prototypeChatMessages, setPrototypeChatMessages] = useState<
    PrototypeChatMessage[]
  >([]);

  // Use ref to avoid stale closure issues in streaming
  const prototypeChatSessionRef = useRef<PrototypeChatSession | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    prototypeChatSessionRef.current = prototypeChatSession;
  }, [prototypeChatSession]);
  const [messageCount, setMessageCount] = useState<number>(0);
  const [loadingUsageCount, setLoadingCount] = useState<boolean>(true);
  const [showUpsellModal, setShowUpsellModal] = useState<boolean>(false);

  const { user } = useUser();
  const userId = user?.id;
  const {
    userPlan,
    currentPeriodStart,
    currentPeriodEnd,
    loadingSubscriptionData,
  } = useSubscriptionAccess();

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

  // Fetch message count for current billing period
  useEffect(() => {
    async function fetchMessageCount() {
      if (!userId || loadingSubscriptionData) return;

      setLoadingCount(true);
      try {
        const { count, error } = await supabase
          .from("api_usage")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("created_at", currentPeriodStart.toISOString())
          .lte("created_at", currentPeriodEnd.toISOString());

        if (error) {
          console.error("Error fetching message count:", error);
          setMessageCount(0);
        } else {
          console.log("Fetched message count:", count);
          setMessageCount(count || 0);
        }
      } catch (error) {
        console.error("Error fetching message count:", error);
        setMessageCount(0);
      } finally {
        setLoadingCount(false);
      }
    }

    fetchMessageCount();
  }, [userId, currentPeriodStart, currentPeriodEnd, loadingSubscriptionData]);

  // Note: Message count is now updated via the API response when a message is sent
  // This provides the most accurate count from the database

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
      console.log("🔄 [CLIENT] Starting to process streaming response");
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

      // Buffer for accumulating partial chunks
      let buffer = "";

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log("✅ [CLIENT] Stream reading completed");
            break;
          }

          const chunk = decoder.decode(value);
          console.log("📦 [CLIENT] Received chunk:", chunk);

          // Add chunk to buffer
          buffer += chunk;

          // Process complete lines from buffer
          const lines = buffer.split("\n");

          // Keep the last line in buffer (might be incomplete)
          buffer = lines.pop() || "";

          for (const line of lines) {
            console.log("📝 [CLIENT] Processing line:", line);
            if (line.startsWith("data: ")) {
              try {
                const jsonData = line.slice(6);
                const data = JSON.parse(jsonData);

                switch (data.type) {
                  case "planning": {
                    console.log(
                      "🧠 [CLIENT] Processing planning event, adding to UI",
                    );
                    // Add planning message to UI
                    setPrototypeChatMessages((prev) => {
                      const newMessage = {
                        id: data.messageId || uuidv4(),
                        chat_session_id:
                          prototypeChatSessionRef.current?.id || "",
                        role: "assistant" as const,
                        phase: "planning" as const,
                        content: data.content,
                        created_at: new Date().toISOString(),
                      };
                      console.log(
                        "🧠 [CLIENT] Adding planning message:",
                        newMessage,
                      );
                      console.log(
                        "🧠 [CLIENT] Previous messages count:",
                        prev.length,
                      );
                      const newMessages = [...prev, newMessage];
                      console.log(
                        "🧠 [CLIENT] New messages count:",
                        newMessages.length,
                      );
                      console.log(
                        "🧠 [CLIENT] All messages after planning:",
                        newMessages.map((m) => ({
                          id: m.id,
                          role: m.role,
                          phase: m.phase,
                        })),
                      );
                      return newMessages;
                    });

                    // Files will be refetched from database later
                    break;
                  }

                  case "dispatch_start": {
                    console.log("Received dispatch_start event");
                    if (onBuildingStateChange) {
                      onBuildingStateChange(true);
                    }
                    break;
                  }

                  case "dispatch_complete": {
                    console.log("Received dispatch_complete event");
                    if (onBuildingStateChange) {
                      onBuildingStateChange(false);
                    }
                    break;
                  }

                  case "execution_start": {
                    console.log("⚙️ [CLIENT] Processing execution_start event");
                    operations = data.operations;
                    executionMessageId = uuidv4();

                    const initialExecutionMessage: PrototypeChatMessage = {
                      id: executionMessageId,
                      chat_session_id:
                        prototypeChatSessionRef.current?.id || "",
                      role: "assistant" as const,
                      phase: "execution" as const,
                      content: `🔄 Executing ${operations.length} operations...\n\n${operations
                        .map(
                          (op, index) =>
                            `${index + 1}. ${op.title} (${op.type})`,
                        )
                        .join("\n")}`,
                      created_at: new Date().toISOString(),
                    };

                    console.log(
                      "⚙️ [CLIENT] Adding execution message:",
                      initialExecutionMessage,
                    );
                    setIsExecutingOperations(true);
                    setPrototypeChatMessages((prev) => {
                      console.log(
                        "⚙️ [CLIENT] Current messages count:",
                        prev.length,
                      );
                      return [...prev, initialExecutionMessage];
                    });
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
                    const { stepIndex, success } = data;

                    // Files will be refetched from database later

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

                    // Files will be refetched from database later

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

                  case "usage_update": {
                    // Update the local message count with the value returned from the API
                    console.log("Received usage update:", data.messageCount);
                    setMessageCount(data.messageCount);
                    break;
                  }

                  case "viewing_url": {
                    // Handle viewing URL update from dispatcher
                    console.log("Received viewing URL:", data.viewing_url);
                    if (onViewingUrlUpdate && data.viewing_url) {
                      onViewingUrlUpdate(data.viewing_url);
                    }
                    break;
                  }

                  case "error": {
                    console.error("Streaming error:", data.error);
                    setIsExecutingOperations(false);
                    setIsLoading(false);

                    const errorMessage: PrototypeChatMessage = {
                      id: uuidv4(),
                      chat_session_id:
                        prototypeChatSessionRef.current?.id || "",
                      role: "assistant",
                      content: `Sorry, I encountered an error: ${data.error}`,
                      created_at: new Date().toISOString(),
                      phase: "execution",
                    };

                    setPrototypeChatMessages((prev) => [...prev, errorMessage]);
                    break;
                  }

                  default: {
                    console.log(
                      "🔍 [CLIENT] Unhandled event type:",
                      data.type,
                      data,
                    );
                    break;
                  }
                }
              } catch (parseError) {
                console.error(
                  "❌ [CLIENT] Error parsing streaming data:",
                  parseError,
                );
                console.error("❌ [CLIENT] Problematic line:", line);
              }
            }
          }
        }

        // Refetch files from database after successful stream completion
        console.log(
          "🔄 [CLIENT] Refetching files from database after chat completion",
        );
        if (onRefetchFiles) {
          try {
            await onRefetchFiles();
            console.log(
              "✅ [CLIENT] Files successfully refetched from database",
            );
          } catch (refetchError) {
            console.error("❌ [CLIENT] Error refetching files:", refetchError);
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
    [
      onRefetchFiles,
      setPrototypeChatMessages,
      setIsExecutingOperations,
      setIsLoading,
      loadingDots,
      onViewingUrlUpdate,
      onBuildingStateChange,
    ],
  );

  // Calculate limits based on subscription plan
  const getMessageLimit = () => {
    switch (userPlan) {
      case "free":
        return 15;
      case "pro":
        return 100;
      case "team":
        return 100; // Assuming team has same limit as pro
      default:
        return 15;
    }
  };

  const messageLimit = getMessageLimit();
  const isAtLimit = userPlan === "free" && messageCount >= messageLimit;

  // Show upsell modal when free user reaches limit
  useEffect(() => {
    if (userPlan === "free" && messageCount >= 15 && !loadingUsageCount) {
      setShowUpsellModal(true);
    }
  }, [userPlan, messageCount, loadingUsageCount]);

  // Handle sending messages
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!prototypeChatSession?.id) {
        console.error("Sending message failed: no chat session found");
        return;
      }

      // Check if user is at limit before sending
      if (isAtLimit) {
        console.log("Message not sent: user has reached their limit");
        return;
      }

      // 1. INSERT USER MESSAGE TO DB
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
      setPrototypeChatMessages((prev) => [...prev, userMessage]);

      // 2. SEND MESSAGE TO CHAT API
      try {
        setIsLoading(true);

        // Get access token for authentication
        const { data: session } = await supabase.auth.getSession();
        if (!session.session?.access_token) {
          throw new Error("No access token available");
        }

        // Convert files to the expected PrototypeFileInput format
        const snackFiles: Record<string, PrototypeFileInput> = {};
        Object.entries(files).forEach(([path, file]) => {
          snackFiles[path] = {
            contents: file.contents || "",
            name: file.name,
            prototype_id: file.prototype_id || "",
            id: file.id,
            created_at: file.created_at || "",
            updated_at: file.updated_at || "",
          };
        });

        // Convert messages to the expected ServerChatMessage format
        const serverMessages: ServerChatMessage[] = [
          ...prototypeChatMessages,
          userMessage,
        ].map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }));

        const requestBody: ChatRequestBody = {
          messages: serverMessages,
          snackFiles,
          chat_session_id: prototypeChatSession.id,
          prototype_id: prototypeId || "",
        };

        const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT!;
        if (!serverEndpoint) {
          throw new Error("NEXT_PUBLIC_SERVER_ENDPOINT is not configured");
        }
        const chatUrl = `${serverEndpoint}/chat`;

        console.log("🌐 [CLIENT] Server endpoint:", serverEndpoint);
        console.log("🌐 [CLIENT] Making request to:", chatUrl);
        console.log("📋 [CLIENT] Request body:", {
          messagesCount: serverMessages.length,
          snackFilesCount: Object.keys(snackFiles).length,
          chat_session_id: prototypeChatSession.id,
          prototype_id: prototypeId,
        });
        console.log("🔑 [CLIENT] Headers:", {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${session.session.access_token?.substring(0, 20)}...`,
        });

        // Make a single streaming request that handles both planning and execution
        const streamingResponse = await fetch(chatUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream", // Signal that we want streaming
            Authorization: `Bearer ${session.session.access_token}`,
            "Cache-Control": "no-cache",
          },
          body: JSON.stringify(requestBody),
        });

        console.log("📡 [CLIENT] Response received:", {
          status: streamingResponse.status,
          statusText: streamingResponse.statusText,
          headers: Object.fromEntries(streamingResponse.headers.entries()),
        });

        if (!streamingResponse.ok) {
          // Try to parse error response
          try {
            const errorData: ChatErrorResponse = await streamingResponse.json();
            if (errorData.error) {
              // Handle specific error cases
              if (
                errorData.usage &&
                errorData.usage.current >= errorData.usage.limit
              ) {
                setShowUpsellModal(true);
                return;
              }
              throw new Error(errorData.error);
            }
          } catch (parseError) {
            // If we can't parse the error, use generic message
            throw new Error(`HTTP error! status: ${streamingResponse.status}`);
          }
        }

        // Process the streaming response
        await processStreamingResponse(streamingResponse);
      } catch (error) {
        console.error("❌ [CLIENT] Error sending message:", error);
        console.error("❌ [CLIENT] Error details:", {
          name: error instanceof Error ? error.name : "Unknown",
          message: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : "No stack trace",
          serverEndpoint: process.env.NEXT_PUBLIC_SERVER_ENDPOINT!,
          chatUrl: `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/chat`,
        });

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
      prototypeId,
      processStreamingResponse,
      isAtLimit,
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

  // Send chat intent if present in localStorage
  useEffect(() => {
    if (!prototypeId || !prototypeChatSession?.id) return;
    
    const intent = getChatIntent(prototypeId);
    if (intent) {
      clearChatIntent();
      handleSendMessage(intent.message);
    }
  }, [prototypeId, prototypeChatSession, handleSendMessage]);

  // Debug logging for messages
  useEffect(() => {
    console.log("🔍 [CHAT WINDOW] prototypeChatMessages updated:", {
      count: prototypeChatMessages.length,
      messages: prototypeChatMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        phase: msg.phase || "no_phase",
        contentPreview: msg.content.substring(0, 100) + "...",
      })),
    });
    console.log(
      "🔍 [CHAT WINDOW] Full message objects:",
      prototypeChatMessages,
    );
  }, [prototypeChatMessages]);

  return (
    <>
      <ChatWindow
        messages={prototypeChatMessages}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        onClearChat={handleClearChat}
        messageCount={messageCount}
        messageLimit={messageLimit}
        isAtLimit={isAtLimit}
        loadingUsageCount={loadingUsageCount}
      />

      {/* Upsell Modal */}
      <ProPlanUpsellModal
        open={showUpsellModal}
        onOpenChange={setShowUpsellModal}
        reason="free_message_limit_reached"
        messageCount={messageCount}
        messageLimit={messageLimit}
      />
    </>
  );
}
