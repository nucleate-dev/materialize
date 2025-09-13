"use client";

import { RenderStatus } from "@/app/dashboard/prototypes/[prototype_id]/InternalPrototypePage";
import { supabase } from "@/ClientConstants";
import ChatMessagesUI from "@/components/prototype-editor/ChatMessagesUI";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import { useUser } from "@/hooks/useUser";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import {
  ChatErrorResponse,
  ChatRequestBody,
  ChatMessage as ServerChatMessage,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import { clearChatIntent, getChatIntent } from "@/lib/utils/chatIntentUtils";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

type PrototypeChatSession =
  Database["public"]["Tables"]["prototype_chat_sessions"]["Row"];
type PrototypeChatMessage =
  Database["public"]["Tables"]["prototype_chat_messages"]["Row"];
type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];
type PrototypeAsset = Database["public"]["Tables"]["prototype_assets"]["Row"];

export interface PrototypeChatWindowProps {
  prototypeId: string | undefined;

  // File system integration
  files: Record<string, PrototypeFile>;
  assets: Record<string, PrototypeAsset>;
  onFilesUpdate: (files: Record<string, PrototypeFile>) => void;

  // Loading state
  isChatLoading: boolean;
  setIsChatLoading: (loading: boolean) => void;

  // Viewing URL callback
  onViewingUrlUpdate?: (viewingUrl: string) => void;

  // Render status for disabling input
  currentRenderStatus?: RenderStatus;
}

export default function PrototypeChatWindow({
  files,
  assets,
  onFilesUpdate,
  prototypeId,
  isChatLoading,
  setIsChatLoading,
  onViewingUrlUpdate,
  currentRenderStatus,
}: PrototypeChatWindowProps) {
  const logger = useProductLogger();
  const { user } = useUser();
  const userId = user?.id;
  const {
    userPlan,
    currentPeriodStart,
    currentPeriodEnd,
    loadingSubscriptionData,
  } = useSubscriptionAccess();

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
        logger.debug("error", "Error fetching project chat session:", {
          ...error,
        });
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
          logger.debug("error", "Error creating project chat session:", {
            ...createError,
          });
          return;
        }
        chatSession = newSession;
        setPrototypeChatSession(newSession);
      } else {
        setPrototypeChatSession(chatSession);
      }

      // Then fetch the messages for this session
      const { data: messagesData, error: messagesError } = await supabase
        .from("prototype_chat_messages")
        .select("*")
        .eq("chat_session_id", chatSession.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (messagesError) {
        logger.debug("error", "Error fetching chat messages:", {
          ...messagesError,
        });
        return;
      }

      // Reverse to get chronological order (oldest first)
      setPrototypeChatMessages(messagesData?.reverse() || []);
    }

    if (prototypeId && userId) {
      fetchPrototypeChatSessionAndMessages();
    }
  }, [prototypeId, userId, logger]);

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
          logger.debug("error", "Error fetching message count:", {
            ...error,
          });
          setMessageCount(0);
        } else {
          setMessageCount(count || 0);
        }
      } catch (error) {
        logger.debug("error", "Error fetching message count:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        setMessageCount(0);
      } finally {
        setLoadingCount(false);
      }
    }

    fetchMessageCount();
  }, [
    userId,
    currentPeriodStart,
    currentPeriodEnd,
    loadingSubscriptionData,
    logger,
  ]);

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
      if (!response.body) {
        throw new Error("No response body for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let planningMessageId: string | null = null;
      let operations: Array<{
        id: string;
        type: "create" | "modify" | "delete" | "move";
        title: string;
        description: string;
        filePath: string;
        newFilePath?: string;
      }> = [];
      let buffer = ""; // accumulates text across chunks

      const processBuffer = async () => {
        let sepIndex;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);

          const lines = rawEvent.split("\n");
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith("data:"))
              dataLines.push(line.slice(5).trimStart());
          }
          if (dataLines.length === 0) continue;

          const dataText = dataLines.join("\n");
          if (dataText === "[DONE]") continue;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let data: any;
          try {
            data = JSON.parse(dataText);
          } catch {
            // put it back and wait for more bytes (likely partial)
            buffer = dataText + "\n\n" + buffer;
            break;
          }

          switch (data.type) {
            case "planning": {
              // Add planning message to UI
              planningMessageId = data.messageId || uuidv4();
              setPrototypeChatMessages((prev) => [
                ...prev,
                {
                  id: planningMessageId!,
                  chat_session_id: prototypeChatSession?.id || "",
                  role: "assistant",
                  phase: "planning",
                  content: data.content,
                  created_at: new Date().toISOString(),
                },
              ]);

              // Save updated files from planning
              if (data.updatedFiles) {
                await onFilesUpdate(data.updatedFiles);
              }
              break;
            }

            case "dispatch_start": {
              // Clear chat intent when build dispatch starts to prevent autoStartDevServer race condition
              // DO NOT MOVE THIS LINE TO AN EARLIER STEP. YOU **WILL** CAUSE A SEV.
              clearChatIntent();
              break;
            }

            case "dispatch_complete": {
              break;
            }

            case "execution_start": {
              operations = data.operations;
              setIsExecutingOperations(true);

              // Update the planning message to show execution starting
              if (planningMessageId) {
                const executionContent = `🔄 Executing ${operations.length} operations...\n\n${operations
                  .map((op, index) => `${index + 1}. ${op.title} (${op.type})`)
                  .join("\n")}`;

                setPrototypeChatMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === planningMessageId
                      ? { ...msg, content: executionContent, phase: "execution" }
                      : msg,
                  ),
                );
              }
              break;
            }

            case "step_start":
              if (planningMessageId) {
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
                    msg.id === planningMessageId
                      ? { ...msg, content: loadingContent }
                      : msg,
                  ),
                );
              }
              break;

            case "step_complete": {
              const { stepIndex, result, success } = data;

              if (success && result.updatedFiles) {
                await onFilesUpdate(result.updatedFiles);
              }

              // Update the planning message to show completion
              if (planningMessageId) {
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
                    msg.id === planningMessageId
                      ? { ...msg, content: updatedContent }
                      : msg,
                  ),
                );
              }
              break;
            }

            case "step_error":
              logger.debug("error", `Step ${data.stepIndex + 1} failed:`, {
                ...data.error,
              });

              // Update the planning message to show error
              if (planningMessageId) {
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
                    msg.id === planningMessageId
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
                await onFilesUpdate(data.updatedFiles);
              }

              // Update final planning message
              if (planningMessageId) {
                const completedCount = operations.length; // All operations assumed completed

                const finalContent = `🎉 Execution completed!\n\n${operations
                  .map((op) => `✅ ${op.title} (${op.type})`)
                  .join("\n")}\n\n${completedCount} completed`;

                setPrototypeChatMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === planningMessageId
                      ? { ...msg, content: finalContent }
                      : msg,
                  ),
                );
              }
              break;

            case "usage_update": {
              // Update the local message count with the value returned from the API
              setMessageCount(data.messageCount);
              break;
            }

            case "viewing_url": {
              // Handle viewing URL update from dispatcher
              if (onViewingUrlUpdate && data.viewing_url) {
                onViewingUrlUpdate(data.viewing_url);
              }
              break;
            }

            case "error": {
              logger.debug("error", "Streaming error:", {
                ...data.error,
              });
              setIsExecutingOperations(false);
              setIsChatLoading(false);

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

          // In step_complete:
          // if (success && result?.updatedFiles) await onFilesUpdate(result.updatedFiles);
        }
      };

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Append decoded text; { stream:true } preserves partial UTF-8 sequences
          const text = decoder
            .decode(value, { stream: true })
            .replace(/\r\n/g, "\n");
          buffer += text;
          await processBuffer();
        }
        // Final flush: drain any remaining decoder bytes and process once more
        buffer += decoder.decode(); // no args -> flush
        buffer = buffer.replace(/\r\n/g, "\n");
        await processBuffer();
      } finally {
        reader.releaseLock();
      }
    },
    [
      prototypeChatSession,
      onFilesUpdate,
      setPrototypeChatMessages,
      setIsExecutingOperations,
      setIsChatLoading,
      loadingDots,
      onViewingUrlUpdate,
      logger,
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
      if (isChatLoading) {
        return;
      }
      setIsChatLoading(true);

      if (!prototypeChatSession?.id) {
        logger.debug("error", "Sending message failed: no chat session found");
        setIsChatLoading(false);
        return;
      }

      // Check if user is at limit before sending
      if (isAtLimit) {
        setIsChatLoading(false);
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
        logger.debug("error", "Error inserting user message:", {
          ...insertError,
        });
        setIsChatLoading(false);
        return;
      }
      setPrototypeChatMessages((prev) => [...prev, userMessage]);

      // 2. SEND MESSAGE TO CHAT API
      try {
        // Get access token for authentication
        const { data: session } = await supabase.auth.getSession();
        if (!session.session?.access_token) {
          throw new Error("No access token available");
        }

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
          inputFiles: files,
          inputAssets: assets,
          chat_session_id: prototypeChatSession.id,
          prototype_id: prototypeId || "",
        };

        // Make a single streaming request that handles both planning and execution
        const streamingResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream", // Signal that we want streaming
              Authorization: `Bearer ${session.session.access_token}`,
              "Cache-Control": "no-cache",
            },
            body: JSON.stringify(requestBody),
          },
        );

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
        logger.debug("error", "❌ [CLIENT] Error sending message:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        logger.debug("error", "❌ [CLIENT] Error details:", {
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
        setIsChatLoading(false);
      }
    },
    [
      prototypeChatSession,
      prototypeChatMessages,
      setPrototypeChatMessages,
      setIsChatLoading,
      files,
      assets,
      prototypeId,
      processStreamingResponse,
      isAtLimit,
      isChatLoading,
      logger,
    ],
  );

  // Handle clear chat
  const handleClearChat = useCallback(async () => {
    if (prototypeChatSession?.id) {
      try {
        // Delete all messages for this chat session
        const { error } = await supabase
          .from("prototype_chat_messages")
          .delete()
          .eq("chat_session_id", prototypeChatSession.id);

        if (error) {
          logger.debug("error", "Error clearing chat messages:", {
            ...error,
          });
          return;
        }

        // Clear the local state
        setPrototypeChatMessages([]);
      } catch (error) {
        logger.debug("error", "Error clearing chat:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  }, [prototypeChatSession, setPrototypeChatMessages, logger]);

  // IF USER CLICKS ON PRE_DEFINED PROMPT, we must send that message when the page loads
  useEffect(() => {
    if (!prototypeId || !prototypeChatSession?.id) return;

    // Send chat intent if present in localStorage
    const intent = getChatIntent(prototypeId);
    if (intent && !isChatLoading && files && assets) {
      handleSendMessage(intent.message);
    }
  }, [
    prototypeId,
    prototypeChatSession,
    handleSendMessage,
    isChatLoading,
    files,
    assets,
  ]);

  return (
    <>
      <ChatMessagesUI
        messages={prototypeChatMessages}
        onSendMessage={handleSendMessage}
        isLoading={isChatLoading}
        onClearChat={handleClearChat}
        messageCount={messageCount}
        messageLimit={messageLimit}
        isAtLimit={isAtLimit}
        loadingUsageCount={loadingUsageCount}
        currentRenderStatus={currentRenderStatus}
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
