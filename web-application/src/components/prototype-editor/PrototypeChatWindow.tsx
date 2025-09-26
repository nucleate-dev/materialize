"use client";

import { RenderStatus } from "@/app/dashboard/prototypes/[prototype_id]/InternalPrototypePage";
import { supabase } from "@/ClientConstants";
import ProPlanUpsellModal from "@/components/prototype-editor/ProPlanUpsellModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { DEBUG_MODE } from "@/GlobalConstants";
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
import {
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import { useFileAutocomplete } from "@/hooks/useFileAutocomplete";
import { FileAutocomplete } from "./FileAutocomplete";

type PrototypeChatSession =
  Database["public"]["Tables"]["prototype_chat_sessions"]["Row"];
type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];
type PrototypeAsset = Database["public"]["Tables"]["prototype_assets"]["Row"];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PrototypeChatWindowProps {
  prototypeId: string | undefined;

  // File system integration
  files: Record<string, PrototypeFile>;
  assets: Record<string, PrototypeAsset>;
  onFilesUpdate: (params: {
    updatedFiles: Record<string, PrototypeFile>;
    deletedFiles?: string[];
    applyUpdatesToServer: boolean;
  }) => void;

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

  // Chat state
  const [prototypeChatSession, setPrototypeChatSession] =
    useState<PrototypeChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  // Usage and subscription
  const [messageCount, setMessageCount] = useState<number>(0);
  const [loadingUsageCount, setLoadingCount] = useState<boolean>(true);
  const [showUpsellModal, setShowUpsellModal] = useState<boolean>(false);

  // UI state
  const [showClearChatDialog, setShowClearChatDialog] = useState(false);

  // Thoughts and execution plan state
  const [currentThought, setCurrentThought] = useState<string>("");
  const [isThoughtsExpanded, setIsThoughtsExpanded] = useState(false);
  const [executionPlan, setExecutionPlan] = useState<string[]>([]);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [explicitlyCompletedSteps, setExplicitlyCompletedSteps] = useState<
    Set<number>
  >(new Set());

  // Use ref to avoid stale closure issues in streaming
  const prototypeChatSessionRef = useRef<PrototypeChatSession | null>(null);

  // File autocomplete functionality
  const {
    autocompleteState,
    handleTextareaChange,
    handleFileSelect,
    closeAutocomplete,
    textareaRef,
  } = useFileAutocomplete({
    files,
    currentMessage,
    onMessageChange: setCurrentMessage,
  });

  // Keep ref in sync with state
  useEffect(() => {
    prototypeChatSessionRef.current = prototypeChatSession;
  }, [prototypeChatSession]);

  // Function to sanitize tool names for display
  const sanitizeToolName = (toolName: string): string => {
    const toolNameMap: Record<string, string> = {
      create_execution_plan: "Creating execution plan",
      edit_file: "Editing file",
      create_file: "Creating file",
      read_file: "Reading file",
      search_files: "Searching files",
      run_command: "Running command",
      deploy_preview: "Deploying preview",
      analyze_code: "Analyzing code",
      install_package: "Installing package",
      test_code: "Testing code",
      confirm_step_completion: "Completed step",
    };

    return (
      toolNameMap[toolName] || `Working with ${toolName.replace(/_/g, " ")}`
    );
  };

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

      // Then fetch the messages for this session and convert to ChatMessage format
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

      // Convert to ChatMessage format and reverse to get chronological order
      const chatMessages: ChatMessage[] = (messagesData?.reverse() || []).map(
        (msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }),
      );
      setMessages(chatMessages);
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

  // Handle streaming chat response - processes events from ChatEngine
  // Current events: chat_response_delta, chat_response, tool_call, tool_result,
  // execution_plan_created, step_completed, chat_complete, error, usage_update, viewing_url
  const processStreamingResponse = useCallback(
    async (response: Response) => {
      if (!response.body) {
        throw new Error("No response body for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ""; // accumulates text across chunks
      let chatResponseBuffer = ""; // Buffer for streaming deltas

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

          let event: {
            type: string;
            content?: string;
            tool?: string;
            toolName?: string;
            result?: {
              plan?: string[];
              step?: number;
              summary?: string;
              updatedFiles?: Record<string, PrototypeFile>;
            };
            updatedFiles?: string[] | Record<string, PrototypeFile>;
            updatedFilesObject?: Record<string, PrototypeFile>;
            deletedFiles?: string[];
            error?: string;
            messageCount?: number;
            viewing_url?: string;
          };
          try {
            event = JSON.parse(dataText);
          } catch {
            // put it back and wait for more bytes (likely partial)
            buffer = rawEvent + "\n\n" + buffer;
            break;
          }

          // Handle different event types
          switch (event.type) {
            case "dispatch_start": {
              // Clear chat intent when build dispatch starts to prevent autoStartDevServer race condition
              // DO NOT MOVE THIS LINE TO AN EARLIER STEP. YOU **WILL** CAUSE A SEV.
              clearChatIntent();
              break;
            }
            case "chat_response_delta":
              // Handle streaming text deltas
              const delta = String(event.content || "");
              chatResponseBuffer += delta;

              // Render progressively: append to last assistant message or create new one
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  const copy = [...prev];
                  copy[copy.length - 1] = {
                    ...last,
                    content: (last.content || "") + delta,
                  };
                  return copy;
                }
                return [...prev, { role: "assistant", content: delta }];
              });
              break;

            case "chat_response":
              // Handle final response (use chatResponseBuffer if content is empty)
              const finalContent = String(event.content || chatResponseBuffer);
              if (finalContent) {
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    const copy = [...prev];
                    copy[copy.length - 1] = {
                      ...last,
                      content: finalContent,
                    };
                    return copy;
                  }
                  return [
                    ...prev,
                    { role: "assistant", content: finalContent },
                  ];
                });
              }
              chatResponseBuffer = ""; // Reset buffer
              break;

            case "tool_call":
              // Update current thought instead of showing in chat
              const toolName = String(
                event.tool || event.toolName || "Unknown tool",
              );
              setCurrentThought(sanitizeToolName(toolName));
              setIsThoughtsExpanded(true);
              break;

            case "tool_result":
              // Update files if the tool result contains updated files
              // TODO (Priyam): This breaks because of streaming. Skip for now.
              // if (event.result?.updatedFiles) {
              //   onFilesUpdate({
              //     updatedFiles: event.result.updatedFiles,
              //     applyUpdatesToServer: true,
              //   });
              // }
              // Clear current thought when tool completes
              setCurrentThought("");
              break;

            case "execution_plan_created":
              // Set execution plan state instead of showing in chat
              const plan = event.result?.plan;
              if (plan && Array.isArray(plan)) {
                setExecutionPlan(plan);
                setCompletedSteps(new Set());
                setExplicitlyCompletedSteps(new Set());
                setIsThoughtsExpanded(true);
              }
              break;

            case "step_completed":
              // Mark step as completed instead of showing in chat
              const stepNum = event.result?.step;
              if (typeof stepNum === "number") {
                setCompletedSteps((prev) => {
                  const newCompleted = new Set(prev);
                  // Mark this step and all previous steps as completed
                  for (let i = 0; i < stepNum; i++) {
                    newCompleted.add(i); // 0-based indexing
                  }
                  return newCompleted;
                });
                // Track which step was explicitly completed
                setExplicitlyCompletedSteps((prev) => {
                  const newExplicit = new Set(prev);
                  newExplicit.add(stepNum - 1); // Convert to 0-based index
                  return newExplicit;
                });
              }
              break;

            case "chat_complete":
              // Chat is finished - clear thoughts and close execution plan
              chatResponseBuffer = ""; // Reset buffer
              setCurrentThought("");
              setIsThoughtsExpanded(false);
              setIsChatLoading(false);
              break;

            case "usage_update":
              // Update the local message count with the value returned from the API
              if (typeof event.messageCount === "number") {
                setMessageCount(event.messageCount);
              }
              break;
            case "stream_complete":
              // Stream is finished
              chatResponseBuffer = "";
              setIsChatLoading(false);
              setIsThoughtsExpanded(false);
              setExecutionPlan([]);
              setCompletedSteps(new Set());
              setExplicitlyCompletedSteps(new Set());
              setCurrentThought("");
              break;
            case "viewing_url":
              // Handle viewing URL update
              if (onViewingUrlUpdate && typeof event.viewing_url === "string") {
                onViewingUrlUpdate(event.viewing_url);
              }
              break;

            case "files_synced":
              // Handle final file sync after dispatch
              logger.debug("log", "received files_synced event");
              const updatedFilesObject =
                (event.updatedFilesObject as Record<string, PrototypeFile>) ||
                {};
              const deletedFileNames = (event.deletedFiles as string[]) || [];
              logger.debug("log", "updated file names: ", {
                updatedFileNames: Object.keys(updatedFilesObject),
              });
              logger.debug("log", "deleted file names: ", {
                deletedFileNames: Object.keys(deletedFileNames),
              });
              onFilesUpdate({
                updatedFiles: updatedFilesObject,
                deletedFiles: deletedFileNames,
                applyUpdatesToServer: true,
              });
              setIsChatLoading(false);
              break;

            case "dispatch_error":
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `⚠️ **Preview Update Failed:** There was a problem updating the live preview.`,
                },
              ]);
              logger.debug("error", "Dispatch error from server:", {
                event,
              });
              setIsChatLoading(false);
              break;

            case "error":
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `❌ **Error:** ${String(event.error || "Unknown error")}`,
                },
              ]);
              break;
          }
        }
      };

      try {
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
      } catch (streamError) {
        logger.debug("error", "Stream processing error:", {
          error:
            streamError instanceof Error
              ? streamError.message
              : String(streamError),
        });
      } finally {
        setIsConnected(false);
        reader.releaseLock();
      }
    },
    [onFilesUpdate, onViewingUrlUpdate, logger, setIsChatLoading],
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
  const isDevServerNotReady = currentRenderStatus === "Starting Dev Server..";
  const inputDisabledReasons = {
    noPrototypeChatSession: !prototypeChatSession,
    noFiles: !files,
    isChatLoading,
    isAtLimit,
    isDevServerNotReady,
  } as const;
  const isInputDisabled = Object.values(inputDisabledReasons).some(Boolean);
  const isSendDisabled = !currentMessage.trim() || isInputDisabled;

  // Show upsell modal when free user reaches limit
  useEffect(() => {
    if (userPlan === "free" && messageCount >= 15 && !loadingUsageCount) {
      setShowUpsellModal(true);
    }
  }, [userPlan, messageCount, loadingUsageCount]);

  // Handle sending messages
  const handleSendMessage = useCallback(async () => {
    if (
      !currentMessage.trim() ||
      !prototypeChatSession ||
      !files ||
      isChatLoading ||
      isDevServerNotReady
    )
      return;

    // Check if user is at limit before sending
    if (isAtLimit) {
      setShowUpsellModal(true);
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: currentMessage.trim(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setCurrentMessage("");
    setIsChatLoading(true);
    setIsConnected(true);

    // Reset thoughts and execution plan state for new conversation
    setCurrentThought("");
    setExecutionPlan([]);
    setCompletedSteps(new Set());
    setExplicitlyCompletedSteps(new Set());
    setIsThoughtsExpanded(false);

    try {
      // Get access token for authentication
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        throw new Error("No access token available");
      }

      // Convert messages to the expected ServerChatMessage format
      const serverMessages: ServerChatMessage[] = newMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const requestBody: ChatRequestBody = {
        messages: serverMessages,
        inputFiles: files,
        inputAssets: assets,
        chat_session_id: prototypeChatSession.id,
        prototype_id: prototypeId || "",
      };

      // Make streaming request
      const streamingResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SERVER_ENDPOINT!}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${session.session.access_token}`,
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
          throw new Error(`HTTP error! status: ${streamingResponse.status}`);
        }
      }

      // Process the streaming response
      await processStreamingResponse(streamingResponse);
    } catch (error) {
      logger.debug("error", "Error sending message:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error.",
        },
      ]);
    } finally {
      setIsChatLoading(false);
      setIsConnected(false);
    }
  }, [
    currentMessage,
    messages,
    prototypeChatSession,
    files,
    assets,
    prototypeId,
    isChatLoading,
    isAtLimit,
    isDevServerNotReady,
    processStreamingResponse,
    logger,
    setIsChatLoading,
  ]);

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
        setMessages([]);
        setShowClearChatDialog(false);

        // Clear execution plan and thoughts state
        setCurrentThought("");
        setExecutionPlan([]);
        setCompletedSteps(new Set());
        setExplicitlyCompletedSteps(new Set());
        setIsThoughtsExpanded(false);
      } catch (error) {
        logger.debug("error", "Error clearing chat:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  }, [prototypeChatSession, logger]);

  // Export session data
  const exportSession = () => {
    const sessionData = {
      prototype: { id: prototypeId },
      messages,
      chatSession: prototypeChatSession?.id,
      fileSystemState: { files, assets },
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-session-${prototypeChatSession?.id || "unknown"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle disconnection
  const handleDisconnect = () => {
    setIsConnected(false);
  };

  // Handle chat intent from localStorage
  useEffect(() => {
    if (!prototypeId || !prototypeChatSession?.id) return;

    // Send chat intent if present in localStorage
    const intent = getChatIntent(prototypeId);
    if (intent && !isChatLoading && files && assets) {
      setCurrentMessage(intent.message);
      // Auto-send the intent message
      setTimeout(() => {
        handleSendMessage();
      }, 100);
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
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <ChatBubbleLeftRightIcon className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Chat Assistant</h2>
            {isConnected && (
              <Badge variant="outline" className="text-xs">
                Streaming...
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={exportSession} variant="outline" size="sm">
              <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button
              onClick={() => setShowClearChatDialog(true)}
              variant="outline"
              size="sm"
            >
              <TrashIcon className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>

        {/* Usage indicator */}
        {!loadingUsageCount && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-b">
            {userPlan === "free" ? (
              <span
                className={
                  messageCount >= messageLimit
                    ? "text-destructive font-medium"
                    : ""
                }
              >
                {messageCount}/{messageLimit} messages used this billing period
              </span>
            ) : (
              <span>{messageCount} messages used this billing period</span>
            )}
          </div>
        )}

        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
                  }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                    }`}
                >
                  {message.role === "user" && (
                    <div className="text-sm font-medium mb-1">You</div>
                  )}
                  <div className="text-sm prose prose-sm max-w-none prose-slate dark:prose-invert [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:mb-2 [&>h2]:mb-2 [&>h3]:mb-2 [&>blockquote]:mb-2 [&>pre]:mb-2 [&>strong]:text-current [&>em]:text-current [&>code]:text-current">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isChatLoading && isConnected && !currentThought && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg p-3 bg-muted">
                  <div className="text-sm text-muted-foreground">
                    Thinking...
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Thoughts and Execution Plan Section */}
        {(currentThought || executionPlan.length > 0) && (
          <div className="border-t border-b bg-muted/30">
            <div className="p-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsThoughtsExpanded(!isThoughtsExpanded)}
                className="w-full justify-between text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                  {currentThought || "Waiting..."}
                </span>
                {isThoughtsExpanded ? (
                  <ChevronUpIcon className="w-4 h-4" />
                ) : (
                  <ChevronDownIcon className="w-4 h-4" />
                )}
              </Button>

              {isThoughtsExpanded && (
                <div className="mt-3 space-y-3">
                  {executionPlan.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Execution Plan:</div>
                      <div className="space-y-1">
                        {executionPlan.map((step, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 text-sm"
                          >
                            <div
                              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${completedSteps.has(index)
                                ? "border-green-500 bg-green-500"
                                : "border-gray-300"
                                }`}
                            >
                              {completedSteps.has(index) && (
                                <div className="relative">
                                  <CheckIcon className="w-3 h-3 text-white" />
                                  {!explicitlyCompletedSteps.has(index) && (
                                    <span className="absolute -top-1 -right-1 text-white text-xs font-bold">
                                      *
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <span
                              className={`${completedSteps.has(index)
                                ? "text-muted-foreground line-through"
                                : "text-foreground"
                                }`}
                            >
                              {step}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {/* Input Area */}
        <div className="p-4 border-t">
          <div className="space-y-2">
            <div className="relative overflow-visible">
              <Textarea
                ref={textareaRef}
                value={currentMessage}
                onChange={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  handleTextareaChange(e.target.value, target.selectionStart);
                }}
                placeholder="Type your message... Use @filename to reference files"
                className="min-h-[80px] resize-none"
                disabled={isInputDisabled}
                onKeyDown={(e) => {
                  // Handle autocomplete navigation
                  if (
                    autocompleteState.isOpen &&
                    (e.key === "ArrowDown" ||
                      e.key === "ArrowUp" ||
                      e.key === "Enter" ||
                      e.key === "Escape")
                  ) {
                    // Let the FileAutocomplete component handle these keys
                    return;
                  }

                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !autocompleteState.isOpen
                  ) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                onBlur={() => {
                  // Close autocomplete when clicking outside, but with a small delay
                  // to allow for clicking on autocomplete items
                  setTimeout(() => {
                    closeAutocomplete();
                  }, 200);
                }}
              />

              {/* File Autocomplete - positioned absolutely above textarea */}
              {autocompleteState.isOpen && (
                <div className="absolute bottom-full left-0 right-0 z-50 mb-1">
                  <FileAutocomplete
                    isOpen={autocompleteState.isOpen}
                    files={autocompleteState.filteredFiles}
                    searchTerm={autocompleteState.searchTerm}
                    onFileSelect={handleFileSelect}
                    onClose={closeAutocomplete}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSendMessage}
                disabled={isSendDisabled}
                className="flex-1"
              >
                <PlayIcon className="w-4 h-4 mr-2" />
                Send Message
              </Button>
              <Button
                onClick={handleDisconnect}
                disabled={!isConnected}
                variant="outline"
              >
                <StopIcon className="w-4 h-4" />
              </Button>
            </div>
            {isAtLimit && (
              <p className="text-sm text-destructive">
                You&apos;ve reached your message limit. Please upgrade to
                continue.
              </p>
            )}
            {isDevServerNotReady && !isAtLimit && (
              <p className="text-sm text-muted-foreground">
                Waiting for dev server to connect... ({currentRenderStatus})
              </p>
            )}
            {DEBUG_MODE && (
              <div className="rounded border border-dashed border-muted p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">Debug state</div>
                <ul className="list-disc pl-4">
                  {Object.entries(inputDisabledReasons).map(([key, value]) => (
                    <li key={key}>
                      <span className="font-mono">{key}</span>: {String(value)}
                    </li>
                  ))}
                  <li>
                    <span className="font-mono">isSendDisabled</span>:{" "}
                    {String(isSendDisabled)}
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Clear Chat Confirmation Dialog */}
      <Dialog open={showClearChatDialog} onOpenChange={setShowClearChatDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to clear the chat? This will remove all
              messages and cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleClearChat}
                variant="destructive"
                className="flex-1"
              >
                Clear Chat
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowClearChatDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
