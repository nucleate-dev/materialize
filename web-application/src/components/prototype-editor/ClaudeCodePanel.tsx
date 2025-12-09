"use client";

import { RenderStatus } from "@/app/dashboard/projects/[prototype_id]/InternalPrototypePage";
import { supabase } from "@/ClientConstants";
import { useCreditUsage } from "@/hooks/useCreditUsage";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type { ChatServerMessage } from "@/lib/types/ChatTypes";
import {
  ChatClientEvent,
  ChatEvent,
  ChatSystemEventSubtype,
} from "@/lib/types/ChatTypes";
import { Database } from "@/lib/types/supabase";
import { normalizePrototypeVisibility } from "@/lib/types/prototypes";
import { clearChatIntent, getChatIntent } from "@/lib/utils/chatIntentUtils";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ClaudeCodePanelUI from "./ClaudeCodePanelUI";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
export type PrototypeChatSession =
  Database["public"]["Tables"]["prototype_chat_sessions"]["Row"];

// Type for tool input data
// Tool inputs can contain arbitrary data structures depending on the tool invoked
// Using `any` here maintains compatibility with existing usage where fields are accessed dynamically
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolInput = Record<string, any>;

// Type for tool event data
interface ToolEventData {
  tool_name?: string;
  tool_call_id?: string;
  tool_input?: ToolInput;
}

interface ClaudeCodePanelProps {
  prototypeId: string;
  baseTunnelUrl: string | null;
  prototype?: Prototype | null;
  canEditPrototype?: boolean;
  onPrototypeUpdate?: (updatedPrototype: Prototype) => void;
  currentRenderStatus?: RenderStatus;
  currentViewingPath?: string;
  // External WebSocket management (required - InternalPrototypePage manages connection)
  externalWS: WebSocket | null;
  externalWSConnected: boolean;
  externalWSConnecting: boolean;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  onRegisterMessageHandler: (
    id: string,
    handler: (msg: ChatServerMessage) => void,
  ) => void;
  onUnregisterMessageHandler: (id: string) => void;
  onRestartDevServerComplete?: () => void;
}

export interface Message {
  id: string;
  type:
  | "user"
  | "assistant"
  | "system"
  | "error"
  | "tool"
  | "thinking"
  | "usage"
  | "design_spec";
  content: string;
  timestamp: number;
  toolName?: string;
  toolCallId?: string;
  isComplete?: boolean;
  status?: "running" | "success" | "error";
  toolInput?: ToolInput;
  description?: string;
  toolHistory?: ToolInput[]; // For ephemeral tools, track all invocations
  isQueued?: boolean; // For queued messages waiting for dev server
  imageUrls?: string[]; // Signed URLs for historical images
  creditsUsed?: number; // For usage messages
  designSpec?: string; // For design_spec messages - the full specification
  isCollapsed?: boolean; // For design_spec messages - whether it's collapsed
}

export interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

export interface UploadedImage {
  id: string;
  base64: string;
  mediaType: string;
  name: string;
}

export default function ClaudeCodePanel({
  prototypeId,
  baseTunnelUrl,
  prototype,
  canEditPrototype = false,
  onPrototypeUpdate,
  currentRenderStatus,
  currentViewingPath,
  externalWS,
  externalWSConnected,
  externalWSConnecting,
  onConnect,
  onDisconnect,
  onRegisterMessageHandler,
  onUnregisterMessageHandler,
  onRestartDevServerComplete,
}: ClaudeCodePanelProps) {
  const logger = useProductLogger();

  // Track credit usage for paywall
  const creditUsage = useCreditUsage();

  // Always use external WebSocket (InternalPrototypePage is the source of truth)
  const ws = externalWS;
  const isConnected = externalWSConnected;
  const isConnecting = externalWSConnecting;

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiChatSessionId, setAiChatSessionId] = useState<string | null>(null);
  const [prototypeChatSessionId, setPrototypeChatSessionId] = useState<
    string | null
  >(null); // prototype_chat_sessions.id
  const [allChatSessions, setAllChatSessions] = useState<
    Array<PrototypeChatSession>
  >([]);
  const [currentTodos, setCurrentTodos] = useState<Todo[]>([]); // Track current todo list
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(
    new Set(),
  );
  const [hasReceivedResponse, setHasReceivedResponse] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const hasProcessedChatIntent = useRef(false);
  const queueTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isCorruptedSession, setIsCorruptedSession] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    [key: string]: number;
  }>({});

  // Helper to check if current session is the most recent
  const isCurrentSessionMostRecent =
    allChatSessions.length === 0 ||
    Boolean(
      prototypeChatSessionId &&
      allChatSessions[0]?.id === prototypeChatSessionId,
    );

  // Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const [modelProvider, setModelProvider] = useState<"claude" | "vercel">(
    "claude",
  );
  const [model, setModel] = useState<string>("gpt-5.1-codex-mini");
  const vercelModelOptions = useMemo(
    () => [
      { value: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
      { value: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
      { value: "gemini-3-pro-preview", label: "Gemini 3 Pro (preview)" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
    [],
  );

  useEffect(() => {
    if (modelProvider === "vercel") {
      const firstModel = vercelModelOptions[0]?.value;
      const isValidModel = vercelModelOptions.some(
        (option) => option.value === model,
      );
      if (!isValidModel && firstModel) {
        setModel(firstModel);
      }
    }
  }, [modelProvider, model, vercelModelOptions]);

  // Reset confirmation modal state
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);

  const prototypeTitle = prototype?.name?.trim() || "Project";
  const normalizedVisibility = prototype
    ? normalizePrototypeVisibility(prototype.visibility)
    : null;
  const visibilityLabel =
    normalizedVisibility === "PUBLIC"
      ? "Public"
      : normalizedVisibility === "TEAM"
        ? "Team"
        : normalizedVisibility === "TEAM_SUBSET"
          ? "Unlisted"
          : "Private";
  const createdAtLabel = prototype?.created_at
    ? new Date(prototype.created_at).toLocaleDateString()
    : null;
  const canEditName = Boolean(canEditPrototype && onPrototypeUpdate);

  // Helper function to format relative timestamps
  const getRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Helper function to sanitize file paths by removing the dev server prefix
  const sanitizeFilePath = (path: string): string => {
    if (!path) return path;
    const prefix = "/tmp/materialize-dev-server/";
    // Replace all occurrences of the prefix, not just at the start
    return path.replace(new RegExp(prefix, "g"), "");
  };

  // Helper function to determine if a tool is read-only (search/inspection)
  const isReadOnlyTool = (toolName: string): boolean => {
    const normalized = toolName.toLowerCase();
    const readOnlyTools = ["read", "glob", "grep", "list", "search"];
    return readOnlyTools.some((tool) => normalized.includes(tool));
  };

  // Helper function to determine if a tool is a "thinking" tool (Task, etc.)
  const isThinkingTool = (toolName: string): boolean => {
    const normalized = toolName.toLowerCase();
    return normalized === "task";
  };

  // Helper function to get friendly tool display name
  const getToolDisplayName = (
    toolName: string,
    toolInput?: ToolInput,
  ): string => {
    const normalized = toolName.toLowerCase();

    if (normalized.includes("npm_install")) {
      return (
        "Installing new packages: " +
        ((toolInput?.packages as []) ?? []).map((p: string) => `${p} `)
      );
    }
    if (normalized.includes("git")) {
      return "Saved checkpoint";
    }
    if (normalized.includes("checkterminal")) {
      return "Checking terminal for errors";
    }
    if (normalized.includes("bash") && toolInput?.description) {
      // For Bash commands, use the description if available
      return toolInput.description as string;
    }

    // For Task tool, use the description if available
    if (normalized === "task" && toolInput?.description) {
      return toolInput.description;
    }

    // More descriptive tool names with parameters
    if (normalized.includes("read") && toolInput?.file_path) {
      const fileName =
        sanitizeFilePath(toolInput.file_path).split("/").pop() ||
        toolInput.file_path;
      return `Reading ${fileName}`;
    }
    if (normalized.includes("glob") && toolInput?.pattern) {
      return `Searching files matching ${toolInput.pattern}`;
    }
    if (normalized.includes("grep") && toolInput?.pattern) {
      return `Searching code for "${toolInput.pattern}"`;
    }
    if (normalized.includes("list") && toolInput?.path) {
      const pathName =
        sanitizeFilePath(toolInput.path).split("/").pop() || toolInput.path;
      return `Listing ${pathName}`;
    }
    if (normalized.includes("write") && toolInput?.file_path) {
      const fileName =
        sanitizeFilePath(toolInput.file_path).split("/").pop() ||
        toolInput.file_path;
      return `Writing ${fileName}`;
    }
    if (normalized.includes("edit") && toolInput?.file_path) {
      const fileName =
        sanitizeFilePath(toolInput.file_path).split("/").pop() ||
        toolInput.file_path;
      return `Editing ${fileName}`;
    }
    if (normalized.includes("delete") && toolInput?.file_path) {
      const fileName =
        sanitizeFilePath(toolInput.file_path).split("/").pop() ||
        toolInput.file_path;
      return `Deleting ${fileName}`;
    }

    // Default friendly names
    if (normalized.includes("read")) return "Reading files";
    if (normalized.includes("glob")) return "Searching files";
    if (normalized.includes("grep")) return "Searching code";
    if (normalized.includes("list")) return "Listing files";
    if (normalized.includes("write")) return "Writing";
    if (normalized.includes("edit")) return "Editing";
    if (normalized.includes("bash")) return "Running command";
    if (normalized.includes("delete")) return "Deleting";
    if (normalized.includes("restartdevserver"))
      return "Restarting development server";
    return toolName;
  };

  // Toggle expanded state for thinking
  const toggleThinkingExpanded = (toolCallId: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(toolCallId)) {
        next.delete(toolCallId);
      } else {
        next.add(toolCallId);
      }
      return next;
    });
  };

  // Handle title editing
  const handleStartTitleEdit = () => {
    if (!canEditName || !prototype) return;
    setEditedTitle(prototype.name);
    setIsEditingTitle(true);
  };

  const handleCancelTitleEdit = () => {
    setIsEditingTitle(false);
    setEditedTitle("");
  };

  const handleSaveTitle = async () => {
    if (
      !canEditName ||
      !prototype ||
      !editedTitle.trim() ||
      !onPrototypeUpdate
    ) {
      return;
    }

    try {
      setIsUpdatingTitle(true);
      const trimmedName = editedTitle.trim();
      const { error } = await supabase
        .from("prototypes")
        .update({ name: trimmedName })
        .eq("id", prototype.id);

      if (error) {
        throw error;
      }

      onPrototypeUpdate({ ...prototype, name: trimmedName });
      setIsEditingTitle(false);
      setEditedTitle("");
    } catch (error) {
      logger.debug("error", "Error updating prototype name:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsUpdatingTitle(false);
    }
  };

  // Helper function to load historical messages (extracted to be reusable)
  const loadHistoricalMessages = useCallback(
    async (chatSessionId: string) => {
      try {
        // Fetch the chat session to check if it's corrupted
        const { data: chatSession, error: sessionError } = await supabase
          .from("prototype_chat_sessions")
          .select("session_id")
          .eq("id", chatSessionId)
          .single();

        if (sessionError) {
          logger.debug("error", "Failed to fetch chat session", {
            error: sessionError,
          });
        }

        const { data: historicalMessages, error: messagesError } =
          await supabase
            .from("prototype_chat_messages")
            .select("*")
            .eq("chat_session_id", chatSessionId)
            .order("created_at", { ascending: true });

        if (messagesError) {
          logger.debug("error", "Failed to fetch historical messages", {
            error: messagesError,
          });
          return;
        }

        // Check if session is corrupted (has messages but no session_id)
        const hasMessages = historicalMessages && historicalMessages.length > 0;
        const hasNullSessionId = !chatSession?.session_id;
        const isCorrupted = hasMessages && hasNullSessionId;

        if (isCorrupted) {
          logger.debug("warn", "Detected corrupted chat session", {
            chatSessionId,
            messageCount: historicalMessages?.length,
          });
          setIsCorruptedSession(true);
        } else {
          setIsCorruptedSession(false);
        }

        if (historicalMessages && historicalMessages.length > 0) {
          // Convert database messages to UI message format
          const uiMessages: Message[] = [];

          for (const dbMessage of historicalMessages) {
            // Handle different message types
            if (dbMessage.message_type === "text") {
              // Regular text message (user or assistant)
              const message: Message = {
                id: String(dbMessage.id),
                type: dbMessage.role as "user" | "assistant",
                content: dbMessage.content,
                timestamp: new Date(dbMessage.created_at).getTime(),
              };

              // Check if this message has images in event_data
              if (dbMessage.event_data) {
                try {
                  const eventData =
                    typeof dbMessage.event_data === "string"
                      ? JSON.parse(dbMessage.event_data)
                      : dbMessage.event_data;

                  if (eventData.images && Array.isArray(eventData.images)) {
                    // Regenerate signed URLs for each image (fresh URLs for viewing)
                    const imageUrls: string[] = [];
                    for (const imageMetadata of eventData.images) {
                      try {
                        const { data: signedUrlData, error: urlError } =
                          await supabase.storage
                            .from("prototype-assets")
                            .createSignedUrl(imageMetadata.storage_path, 3600); // 1 hour expiry for viewing

                        if (urlError) {
                          logger.debug(
                            "error",
                            "Failed to create signed URL for historical image",
                            {
                              storagePath: imageMetadata.storage_path,
                              error: urlError.message,
                            },
                          );
                          continue;
                        }

                        if (signedUrlData?.signedUrl) {
                          imageUrls.push(signedUrlData.signedUrl);
                        }
                      } catch (error) {
                        logger.debug(
                          "error",
                          "Exception while getting signed URL for historical image",
                          {
                            storagePath: imageMetadata.storage_path,
                            error:
                              error instanceof Error
                                ? error.message
                                : String(error),
                          },
                        );
                      }
                    }

                    if (imageUrls.length > 0) {
                      message.imageUrls = imageUrls;
                    }
                  }
                } catch (error) {
                  logger.debug(
                    "error",
                    "Failed to parse event_data for images",
                    {
                      error:
                        error instanceof Error ? error.message : String(error),
                    },
                  );
                }
              }

              uiMessages.push(message);

              // If this is an assistant message with credits_used, add a usage message
              if (
                dbMessage.role === "assistant" &&
                dbMessage.credits_used !== null &&
                dbMessage.credits_used !== undefined
              ) {
                const creditsUsed = dbMessage.credits_used;
                const roundedCredits = Math.round(creditsUsed * 10) / 10;

                uiMessages.push({
                  id: `usage-${dbMessage.id}`,
                  type: "usage",
                  content: `${roundedCredits} credit${roundedCredits !== 1 ? "s" : ""}`,
                  timestamp: new Date(dbMessage.created_at).getTime(),
                  creditsUsed,
                });
              }
            } else if (
              dbMessage.message_type === "tool_use" &&
              dbMessage.event_type === "tool_start"
            ) {
              // Tool start event
              const eventData = dbMessage.event_data as ToolEventData;
              uiMessages.push({
                id: `tool-${eventData?.tool_call_id || dbMessage.id}`,
                type: "tool",
                content: dbMessage.content,
                timestamp: new Date(dbMessage.created_at).getTime(),
                toolName: eventData?.tool_name,
                toolCallId: eventData?.tool_call_id,
                isComplete: false, // Will be updated if we find a matching tool_complete
                status: "running",
                toolInput: eventData?.tool_input,
              });
            } else if (
              dbMessage.message_type === "tool_result" &&
              dbMessage.event_type === "tool_complete"
            ) {
              // Tool complete event - find and update the matching tool_start message
              const eventData = dbMessage.event_data as ToolEventData;
              const toolCallId = eventData?.tool_call_id;

              // Find the matching tool message and mark it as complete
              const toolMessageIndex = uiMessages.findIndex(
                (msg) =>
                  msg.type === "tool" &&
                  msg.toolCallId === toolCallId &&
                  !msg.isComplete,
              );

              if (toolMessageIndex !== -1) {
                uiMessages[toolMessageIndex] = {
                  ...uiMessages[toolMessageIndex],
                  isComplete: true,
                  status: "success",
                };
              }
            } else if (dbMessage.message_type === "error") {
              // Error message
              uiMessages.push({
                id: String(dbMessage.id),
                type: "error",
                content: dbMessage.content,
                timestamp: new Date(dbMessage.created_at).getTime(),
              });
            } else if (dbMessage.message_type === "system") {
              // System message
              uiMessages.push({
                id: String(dbMessage.id),
                type: "system",
                content: dbMessage.content,
                timestamp: new Date(dbMessage.created_at).getTime(),
              });
            }
          }

          // Add corruption warning message if session is corrupted
          if (isCorrupted) {
            uiMessages.push({
              id: `corruption-warning-${Date.now()}`,
              type: "system",
              content:
                "Chat session has been corrupted. Nucleate won't be able to see previous messages before this point.",
              timestamp: Date.now(),
            });
          }

          setMessages(uiMessages);
          logger.debug("log", "Loaded historical messages", {
            count: uiMessages.length,
            isCorrupted,
          });
        }
      } catch (error) {
        logger.debug("error", "Error loading historical messages", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [logger],
  );

  // Fetch or create prototype_chat_session on mount
  useEffect(() => {
    async function fetchOrCreateChatSession() {
      try {
        // Fetch ALL existing chat sessions for this prototype
        const { data: existingSessions, error: fetchError } = await supabase
          .from("prototype_chat_sessions")
          .select("*")
          .eq("prototype_id", prototypeId)
          .order("created_at", { ascending: false });

        if (fetchError) {
          logger.debug("error", "Failed to fetch chat sessions", {
            error: fetchError,
          });
          return;
        }

        // Store all sessions for dropdown
        setAllChatSessions(existingSessions || []);

        if (existingSessions && existingSessions.length > 0) {
          // Use most recently updated session
          const mostRecentSession = existingSessions[0] as PrototypeChatSession;
          setPrototypeChatSessionId(mostRecentSession.id);
          setAiChatSessionId(mostRecentSession.session_id);
          sessionIdRef.current = mostRecentSession.session_id;

          logger.debug("log", "Using most recent chat session", {
            chatSessionId: mostRecentSession.id,
            sessionId: mostRecentSession.session_id,
          });

          // Load historical messages for this session
          await loadHistoricalMessages(mostRecentSession.id);
        } else {
          // Get current user for RLS policy
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) {
            logger.debug(
              "error",
              "Not authenticated - cannot create chat session",
            );
            return;
          }

          // Create new chat session with null session_id
          const { data: newSession, error: createError } = await supabase
            .from("prototype_chat_sessions")
            .insert({
              prototype_id: prototypeId,
              session_id: null,
              user_id: user.id,
            })
            .select()
            .single();

          if (createError) {
            logger.debug("error", "Failed to create chat session", {
              error: createError,
            });
            return;
          }

          setPrototypeChatSessionId(newSession.id);
          setAiChatSessionId(null);
          sessionIdRef.current = null;
          setAllChatSessions([newSession]);

          logger.debug("log", "Created new chat session", {
            chatSessionId: newSession.id,
          });
        }
      } catch (error) {
        logger.debug("error", "Error managing chat session", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (prototypeId) {
      fetchOrCreateChatSession();
    }
  }, [prototypeId, logger, loadHistoricalMessages]);

  // Check for chat intent on mount and queue the message
  useEffect(() => {
    if (hasProcessedChatIntent.current) {
      return;
    }

    const chatIntent = getChatIntent(prototypeId);
    if (chatIntent && chatIntent.message) {
      logger.debug("log", "Found chat intent, queueing message", {
        message: chatIntent.message,
      });

      // Set queued message state
      setQueuedMessage(chatIntent.message);

      // Add queued message to UI
      setMessages((prev) => [
        ...prev,
        {
          id: `queued-${Date.now()}`,
          type: "user",
          content: chatIntent.message,
          timestamp: Date.now(),
          isQueued: true,
        },
      ]);

      // Set timeout for queued message (2 minutes)
      queueTimeoutRef.current = setTimeout(() => {
        logger.debug(
          "error",
          "Queued message timeout - dev server took too long",
          {
            message: chatIntent.message,
          },
        );

        // Update queued message to show error
        setMessages((prev) =>
          prev.map((msg) => (msg.isQueued ? { ...msg, isQueued: false } : msg)),
        );

        addMessage(
          "error",
          "Dev server took too long to start. Please try sending your message again.",
        );

        setQueuedMessage(null);
        clearChatIntent();
      }, 120000); // 2 minutes

      hasProcessedChatIntent.current = true;
    }

    // Cleanup timeout on unmount
    return () => {
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current);
      }
    };
  }, [prototypeId, logger]);

  // Auto-send queued message when dev server becomes connected
  useEffect(() => {
    const isDevServerReady = currentRenderStatus === "Connected";

    if (queuedMessage && isDevServerReady && isConnected && !isProcessing) {
      (async () => {
        logger.debug("log", "Dev server ready, auto-sending queued message", {
          message: queuedMessage,
          currentRenderStatus,
        });

        // Clear the timeout since we're sending the message now
        if (queueTimeoutRef.current) {
          clearTimeout(queueTimeoutRef.current);
          queueTimeoutRef.current = null;
        }

        // Update the queued message to show it's being sent
        setMessages((prev) =>
          prev.map((msg) => (msg.isQueued ? { ...msg, isQueued: false } : msg)),
        );

        // Send the message
        const content = queuedMessage;
        setQueuedMessage(null);
        setIsProcessing(true);
        setHasReceivedResponse(false);

        // Clear chat intent from localStorage
        clearChatIntent();

        // Refresh JWT token before sending queued message
        try {
          const { data: session } = await supabase.auth.getSession();
          if (session.session?.access_token) {
            authTokenRef.current = session.session.access_token;
          }
        } catch (error) {
          logger.debug("warn", "Failed to refresh token for queued message", {
            error,
          });
          // Continue with existing token if refresh fails
        }

        // Send message via WebSocket
        if (ws) {
          const messageContent = [{ type: "text", text: content }];
          ws.send(
            JSON.stringify({
              type: "query",
              data: {
                content: messageContent,
                token: authTokenRef.current,
                options: {
                  provider: modelProvider,
                  model: modelProvider === "vercel" ? model : undefined,
                },
                // Force new session if corrupted, otherwise use existing session
                ai_chat_session_id: isCorruptedSession
                  ? null
                  : sessionIdRef.current,
                prototype_chat_session_id: prototypeChatSessionId,
                custom_design_system_id: prototype?.custom_design_system,
                current_viewing_path: currentViewingPath,
                design_style: prototype?.design_style,
              },
            }),
          );
        }
      })();
    }
  }, [
    queuedMessage,
    currentRenderStatus,
    isConnected,
    isProcessing,
    ws,
    logger,
    prototypeChatSessionId,
    prototype,
    currentViewingPath,
    isCorruptedSession,
  ]);

  // WebSocket connection is managed by parent component (InternalPrototypePage)
  // via the useClaudeCodeWebSocket hook

  // Auto-scroll to bottom when new messages arrive (only if already near bottom)
  useEffect(() => {
    if (scrollAreaRef.current && isNearBottom) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, isNearBottom]);

  // Detect scroll position to show/hide "Jump to bottom" button
  useEffect(() => {
    const scrollContainer = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    );

    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const nearBottom = distanceFromBottom < 100; // Within 100px of bottom

      setIsNearBottom(nearBottom);
      setShowScrollToBottom(!nearBottom && messages.length > 0);
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [messages.length]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = "auto";
      // Set height to scrollHeight, but cap at max-height
      const maxHeight = 200; // Max height in pixels
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [inputValue]);

  // Function to scroll to bottom
  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  };

  // Register message handler with parent for external WS
  useEffect(() => {
    const handlerId = `claude-code-panel-${Date.now()}`;
    onRegisterMessageHandler(handlerId, handleServerMessage);

    return () => {
      onUnregisterMessageHandler(handlerId);
    };
  }, [onRegisterMessageHandler, onUnregisterMessageHandler]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Connection is managed by parent component via external props
  const connect = onConnect;
  const disconnect = onDisconnect;

  // Handle messages from server
  const handleServerMessage = (message: ChatServerMessage) => {
    logger.debug("log", "Server message received", { message });

    switch (message.type) {
      case ChatEvent.MESSAGE_RECEIVED:
      case ChatEvent.READY:
        break;

      case ChatEvent.ERROR: {
        setIsProcessing(false);
        const { message: errorMessage, details } = message.error;
        const formattedDetails = details
          ? `${errorMessage}: ${details}`
          : errorMessage;
        addMessage("error", `Error: ${formattedDetails}`);
        break;
      }

      case ChatEvent.SYSTEM:
        if (message.subtype === ChatSystemEventSubtype.CONNECTION) {
          // Connection established - nothing to show in chat
        }
        break;

      case ChatEvent.AGENT_MESSAGE:
        if (message.data) {
          handleAgentMessage(message.data);
        }
        break;

      case ChatEvent.QUERY_COMPLETE:
        setIsProcessing(false);
        // Mark all todos as completed
        setCurrentTodos((prev) =>
          prev.map((todo) => ({ ...todo, status: "completed" as const })),
        );
        // Mark all running tools as success
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.type === "tool" && msg.status === "running") {
              return { ...msg, status: "success" as const, isComplete: true };
            }
            if (msg.type === "thinking" && msg.status === "running") {
              return { ...msg, status: "success" as const, isComplete: true };
            }
            return msg;
          }),
        );
        break;

      case ChatEvent.INTERRUPTED:
        setIsProcessing(false);
        // Mark all todos as completed on interruption
        setCurrentTodos((prev) =>
          prev.map((todo) => ({ ...todo, status: "completed" as const })),
        );
        // Mark all running tools as success on interruption
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.type === "tool" && msg.status === "running") {
              return { ...msg, status: "success" as const, isComplete: true };
            }
            if (msg.type === "thinking" && msg.status === "running") {
              return { ...msg, status: "success" as const, isComplete: true };
            }
            return msg;
          }),
        );
        addMessage("system", message.data.message || "Query interrupted");
        break;

      case ChatEvent.SESSION_RESET:
        setMessages([]);
        sessionIdRef.current = null;
        setAiChatSessionId(null);
        addMessage("system", message.data.message);
        break;

      case ChatEvent.TOOL_START: {
        setHasReceivedResponse(true);
        const {
          tool_name: toolName,
          tool_call_id: rawToolCallId,
          tool_input,
        } = message.data;

        if (toolName) {
          const toolCallId = rawToolCallId || `tool-${Date.now()}`;
          const toolInput = (tool_input ?? {}) as ToolInput;

          // Special handling for TodoWrite - update todo list instead of adding tool message
          if (
            toolName === "TodoWrite" &&
            toolInput.todos &&
            Array.isArray(toolInput.todos)
          ) {
            setCurrentTodos(toolInput.todos as Todo[]);
            // Don't add a tool message - todos are rendered separately
          } else if (isThinkingTool(toolName)) {
            setMessages((prev) =>
              prev.filter(
                (msg) =>
                  !(
                    msg.type === "tool" &&
                    !msg.isComplete &&
                    msg.toolName &&
                    isReadOnlyTool(msg.toolName)
                  ),
              ),
            );
            addThinkingMessage(toolName, toolCallId, toolInput, "running");
          } else if (isReadOnlyTool(toolName)) {
            setMessages((prev) => {
              const lastMessage = prev[prev.length - 1];

              if (
                lastMessage &&
                lastMessage.type === "tool" &&
                !lastMessage.isComplete &&
                lastMessage.toolName &&
                isReadOnlyTool(lastMessage.toolName) &&
                lastMessage.toolName.toLowerCase() === toolName.toLowerCase()
              ) {
                const updatedHistory = [
                  ...(lastMessage.toolHistory || []),
                  toolInput,
                ];
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMessage,
                    toolInput,
                    toolHistory: updatedHistory,
                  },
                ];
              }

              const filtered = prev.filter(
                (msg) =>
                  !(
                    msg.type === "tool" &&
                    !msg.isComplete &&
                    msg.toolName &&
                    isReadOnlyTool(msg.toolName)
                  ),
              );

              return [
                ...filtered,
                {
                  id: `tool-${toolCallId}`,
                  type: "tool" as const,
                  content: getToolDisplayName(toolName, toolInput),
                  timestamp: Date.now(),
                  toolName,
                  toolCallId,
                  isComplete: false,
                  status: "running" as const,
                  toolInput,
                  toolHistory: [toolInput],
                },
              ];
            });
          } else {
            setMessages((prev) =>
              prev.filter(
                (msg) =>
                  !(
                    msg.type === "tool" &&
                    !msg.isComplete &&
                    msg.toolName &&
                    isReadOnlyTool(msg.toolName)
                  ),
              ),
            );
            addToolMessage(toolName, toolCallId, toolInput, "running");
          }
        }
        break;
      }

      case ChatEvent.TOOL_COMPLETE: {
        const { tool_name: toolName, tool_call_id: toolCallId = "" } =
          message.data;

        if (toolName) {
          if (isThinkingTool(toolName)) {
            updateThinkingMessage(toolCallId, "success");
          } else {
            updateToolMessage(toolCallId, "success");
          }
        }
        if (
          toolName.toLowerCase().includes("restartdevserver") &&
          onRestartDevServerComplete
        ) {
          onRestartDevServerComplete();
        }
        break;
      }

      case ChatEvent.MODIFIED_FILES: {
        const files = (
          Array.isArray(message.data?.files) ? message.data.files : []
        ) as string[];
        if (files.length > 0) {
          const sanitized = files.map((filePath) => sanitizeFilePath(filePath));
          addMessage("system", `Files modified: ${sanitized.join(", ")}`);
        }
        break;
      }

      case ChatEvent.USAGE_UPDATE: {
        const { creditsUsed, creditsRemaining } = message.data;

        // Round credits to 1 decimal place for display
        const roundedCredits = Math.round(creditsUsed * 10) / 10;

        // Add usage message to show credits consumed
        addMessage(
          "usage",
          `${roundedCredits} credit${roundedCredits !== 1 ? "s" : ""}`,
          creditsUsed,
        );

        // Update credit balance in real-time without refetching
        if (creditsRemaining !== undefined && creditsRemaining !== null) {
          creditUsage.updateRemainingBalance(creditsRemaining);
        }
        break;
      }

      case ChatEvent.INFO:
        addMessage("system", message.message);
        break;

      case ChatEvent.DESIGN_GENERATION: {
        const { status, message: designMessage, designSpec } = message.data;

        if (status === "started") {
          // Show design generation in progress
          addMessage("system", designMessage);
        } else if (status === "completed" && designSpec) {
          // Design generation completed - add a collapsible design spec message
          setMessages((prev) => [
            ...prev,
            {
              id: `design-spec-${Date.now()}`,
              type: "design_spec" as const,
              content: "Generated Design Spec",
              timestamp: Date.now(),
              designSpec: designSpec,
              isCollapsed: true, // Start collapsed
            },
          ]);
        }
        break;
      }

      case ChatEvent.HISTORY_REQUEST: {
        // Server is requesting historical messages
        const { requested_message_count, original_query } = message.data;

        logger.debug("log", "Server requested conversation history", {
          requestedCount: requested_message_count,
        });

        // Extract last N user/assistant text messages (no tools, no system)
        const recentMessages = messagesRef.current
          .filter(
            (msg) =>
              (msg.type === "user" || msg.type === "assistant") &&
              !msg.isQueued,
          )
          .slice(-requested_message_count)
          .map((msg) => ({
            role: msg.type,
            content: msg.content,
            timestamp: msg.timestamp,
          }));

        logger.debug("log", "Sending history response", {
          requestedCount: requested_message_count,
          foundCount: recentMessages.length,
          messages: recentMessages,
        });

        // Send history back to server
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: ChatClientEvent.HISTORY_RESPONSE,
              data: {
                historical_messages: recentMessages,
                original_query: original_query,
              },
            }),
          );
        }
        break;
      }

      default: {
        const unknownMessage = message as { type: string; };
        logger.debug("log", "Unknown message type", {
          messageType: unknownMessage.type,
        });
        break;
      }
    }
  };

  // Handle agent messages (streaming responses from Claude)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAgentMessage = (data: any) => {
    // Handle system init message - update session ID but don't show in chat
    if (data.type === "system" && data.subtype === "init") {
      const newSessionId = data.session_id;
      sessionIdRef.current = newSessionId;
      setAiChatSessionId(newSessionId);

      // Clear corruption flag after receiving a fresh session
      if (isCorruptedSession) {
        setIsCorruptedSession(false);
        logger.debug("log", "Cleared corruption flag after session recovery", {
          newSessionId,
        });
      }

      // Don't add system message to chat - it's just internal state
      return;
    }

    // Handle stream_event (SDKPartialAssistantMessage)
    if (data.type === "stream_event") {
      const event = data.event;

      // Handle content block delta events (streaming text)
      if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta") {
          const textDelta = event.delta.text || "";
          if (textDelta) {
            setHasReceivedResponse(true); // We've received some response
            // Append to last assistant message or create new one
            setMessages((prev) => {
              const lastMessage = prev[prev.length - 1];
              if (lastMessage && lastMessage.type === "assistant") {
                // Add line breaks if we're appending to existing content after a tool call
                const needsLineBreak = lastMessage.content.trim().length > 0;
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMessage,
                    content:
                      lastMessage.content +
                      (needsLineBreak ? "\n\n" : "") +
                      textDelta,
                  },
                ];
              } else {
                return [
                  ...prev,
                  {
                    id: Date.now().toString(),
                    type: "assistant",
                    content: textDelta,
                    timestamp: Date.now(),
                  },
                ];
              }
            });
          }
        }
      }

      // Don't show tool_use in stream events - we handle them via hooks
      return;
    }

    // Handle assistant message (complete messages)
    if (data.type === "assistant") {
      const message = data.message;
      if (message?.content) {
        for (const content of message.content) {
          if (content.type === "text" && content.text) {
            // Append or create assistant message
            setMessages((prev) => {
              const lastMessage = prev[prev.length - 1];
              if (lastMessage && lastMessage.type === "assistant") {
                // Add line breaks if we're appending to existing content
                const needsLineBreak = lastMessage.content.trim().length > 0;
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMessage,
                    content:
                      lastMessage.content +
                      (needsLineBreak ? "\n\n" : "") +
                      content.text,
                  },
                ];
              } else {
                return [
                  ...prev,
                  {
                    id: Date.now().toString(),
                    type: "assistant",
                    content: content.text,
                    timestamp: Date.now(),
                  },
                ];
              }
            });
          }
          // Don't show tool_use here - we handle them via hooks
        }
      }
      return;
    }

    // Handle result messages - don't show completion in chat
    if (data.type === "result") {
      // Just log errors, don't show success completion
      if (data.subtype === "error_max_turns") {
        addMessage("error", "Maximum turns reached");
      } else if (data.subtype === "error_during_execution") {
        addMessage("error", "Error during execution");
      }
      // Don't show "Query completed" for success
      return;
    }

    // Log other message types for debugging
    logger.debug("log", "Agent message", { data });
  };

  // Add a message to the chat
  const addMessage = (
    type: Message["type"],
    content: string,
    creditsUsed?: number,
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString() + Math.random(),
        type,
        content,
        timestamp: Date.now(),
        ...(creditsUsed !== undefined && { creditsUsed }),
      },
    ]);
  };

  // Add a tool message when a tool starts
  const addToolMessage = (
    toolName: string,
    toolCallId: string,
    toolInput: ToolInput,
    status: "running" | "success" | "error",
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `tool-${toolCallId}`,
        type: "tool",
        content: getToolDisplayName(toolName, toolInput),
        timestamp: Date.now(),
        toolName,
        toolCallId,
        isComplete: false,
        status,
        toolInput,
      },
    ]);
  };

  // Add a thinking message when a thinking tool starts (Task, etc.)
  const addThinkingMessage = (
    toolName: string,
    toolCallId: string,
    toolInput: ToolInput,
    status: "running" | "success" | "error",
  ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `thinking-${toolCallId}`,
        type: "thinking",
        content: getToolDisplayName(toolName, toolInput),
        timestamp: Date.now(),
        toolName,
        toolCallId,
        isComplete: false,
        status,
        toolInput,
      },
    ]);
  };

  // Update a thinking message when it completes
  const updateThinkingMessage = (
    toolCallId: string,
    status: "running" | "success" | "error",
  ) => {
    setMessages((prev) => {
      const index = prev.findIndex(
        (msg) =>
          msg.type === "thinking" &&
          msg.toolCallId === toolCallId &&
          !msg.isComplete,
      );

      if (index === -1) return prev;

      const updatedMessages = [...prev];
      updatedMessages[index] = {
        ...updatedMessages[index],
        isComplete: true,
        status,
      };

      return updatedMessages;
    });
  };

  // Update a tool message when it completes
  const updateToolMessage = (
    toolCallId: string,
    status: "running" | "success" | "error",
  ) => {
    setMessages((prev) => {
      // Find the tool message with this toolCallId
      const index = prev.findIndex(
        (msg) =>
          msg.type === "tool" &&
          msg.toolCallId === toolCallId &&
          !msg.isComplete,
      );

      if (index === -1) return prev;

      const updatedMessages = [...prev];
      updatedMessages[index] = {
        ...updatedMessages[index],
        isComplete: true,
        status,
      };

      return updatedMessages;
    });
  };

  // Handle image file selection
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    processImageFiles(Array.from(files));

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Process image files (shared between file input and drag-and-drop)
  const processImageFiles = (files: File[]) => {
    files.forEach((file) => {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        addMessage(
          "error",
          `Invalid file type: ${file.name}. Only images are supported.`,
        );
        return;
      }

      // Validate file size (3MB limit to stay well under Anthropic's 5MB limit)
      if (file.size > 3 * 1024 * 1024) {
        addMessage(
          "error",
          `Image too large: ${file.name}. Maximum size is 3MB.`,
        );
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64Data = base64String.split(",")[1];

        setUploadedImages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            base64: base64Data,
            mediaType: file.type,
            name: file.name,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle drag-and-drop events
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the main container
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processImageFiles(files);
    }
  };

  // Handle paste events (for pasting images from clipboard)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];

    // Check all clipboard items for images
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // If the item is an image file
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    // If we found image files, process them and prevent default paste behavior
    if (imageFiles.length > 0) {
      e.preventDefault();
      processImageFiles(imageFiles);
    }
  };

  // Remove an uploaded image
  const removeImage = (imageId: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== imageId));
  };

  // Upload images to Supabase storage and return metadata with signed URLs
  const uploadImagesToStorage = async (
    images: UploadedImage[],
  ): Promise<
    Array<{
      storage_path: string;
      signed_url: string;
      media_type: string;
      name: string;
    }>
  > => {
    const uploadedMetadata: Array<{
      storage_path: string;
      signed_url: string;
      media_type: string;
      name: string;
    }> = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        // Initialize progress for this image
        setUploadProgress((prev) => ({ ...prev, [image.id]: 0 }));

        // Generate unique filename
        const timestamp = Date.now();
        const uuid = crypto.randomUUID();
        const ext = image.mediaType.split("/")[1];
        const fileName = `${timestamp}-${uuid}.${ext}`;
        const storagePath = `${prototypeId}/chat/${prototypeChatSessionId}/${fileName}`;

        // Decode base64 to Uint8Array for upload
        const binaryString = atob(image.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Update progress to show upload starting
        setUploadProgress((prev) => ({ ...prev, [image.id]: 50 }));

        // Upload to Supabase storage
        const { error: uploadError } = await supabase.storage
          .from("prototype-assets")
          .upload(storagePath, bytes, {
            contentType: image.mediaType,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Update progress to show upload complete
        setUploadProgress((prev) => ({ ...prev, [image.id]: 75 }));

        // Get signed URL (24 hour expiry for Claude processing)
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from("prototype-assets")
          .createSignedUrl(storagePath, 86400); // 24 hours

        if (urlError) throw urlError;

        // Update progress to 100%
        setUploadProgress((prev) => ({ ...prev, [image.id]: 100 }));

        uploadedMetadata.push({
          storage_path: storagePath,
          signed_url: signedUrlData.signedUrl,
          media_type: image.mediaType,
          name: image.name,
        });

        logger.debug("log", "Uploaded image to storage", {
          storagePath,
          mediaType: image.mediaType,
        });
      } catch (error) {
        logger.debug("error", "Failed to upload image", {
          imageName: image.name,
          error: error instanceof Error ? error.message : String(error),
        });
        addMessage("error", `Failed to upload image: ${image.name}`);
      }
    }

    return uploadedMetadata;
  };

  // Send a query to Claude
  const sendQuery = async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput && uploadedImages.length === 0) {
      return;
    }

    // If not connected, auto-reconnect
    if (!ws || !isConnected) {
      logger.debug("log", "Not connected, attempting to reconnect", {
        hasWs: !!ws,
        isConnected,
      });

      connect(); // Initiate reconnection (async, will complete in background)
    }

    // Check if dev server is ready
    const isDevServerReady = currentRenderStatus === "Connected";

    // If already have a queued message, prevent queueing another
    if (queuedMessage) {
      addMessage("system", "Please wait for the current message to be sent");
      return;
    }

    // If not connected or dev server isn't ready, queue the message
    if (!isConnected || !isDevServerReady) {
      logger.debug("log", "Queueing message", {
        isConnected,
        isDevServerReady,
        currentRenderStatus,
        message: trimmedInput,
      });

      setQueuedMessage(trimmedInput);

      // Add message to chat as queued
      const imageCount = uploadedImages.length;
      const displayMessage =
        trimmedInput +
        (imageCount > 0
          ? ` [${imageCount} image${imageCount > 1 ? "s" : ""}]`
          : "");
      setMessages((prev) => [
        ...prev,
        {
          id: `queued-${Date.now()}`,
          type: "user",
          content: displayMessage,
          timestamp: Date.now(),
          isQueued: true,
        },
      ]);

      setInputValue("");
      setUploadedImages([]);

      // Set timeout for queued message (2 minutes)
      if (queueTimeoutRef.current) {
        clearTimeout(queueTimeoutRef.current);
      }
      queueTimeoutRef.current = setTimeout(() => {
        logger.debug("error", "Queued message timeout", {
          message: trimmedInput,
        });

        // Update queued message to show error
        setMessages((prev) =>
          prev.map((msg) => (msg.isQueued ? { ...msg, isQueued: false } : msg)),
        );

        addMessage(
          "error",
          "Connection or dev server took too long. Please try sending your message again.",
        );

        setQueuedMessage(null);
      }, 120000); // 2 minutes

      // Show system message about queuing
      const waitingFor = [];
      if (!isConnected) waitingFor.push("connection");
      if (!isDevServerReady) waitingFor.push("dev server");
      addMessage(
        "system",
        `Message queued - waiting for ${waitingFor.join(" and ")}`,
      );
      return;
    }

    // Upload images to storage first if there are any
    try {
      setUploadingImages(true);
      setUploadProgress({});

      // Upload images to storage
      const uploadedImageMetadata =
        uploadedImages.length > 0
          ? await uploadImagesToStorage(uploadedImages)
          : [];

      if (uploadedImages.length > 0 && uploadedImageMetadata.length === 0) {
        addMessage("error", "All image uploads failed. Please try again.");
        setUploadingImages(false);
        return;
      }

      setUploadingImages(false);

      // Refresh the JWT token on each query to ensure it's not expired
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        addMessage(
          "error",
          "Authentication session expired. Please reconnect.",
        );
        return;
      }
      authTokenRef.current = session.session.access_token;

      const token = authTokenRef.current;
      if (!token) {
        addMessage(
          "error",
          "Missing authentication token. Please reconnect and try again.",
        );
        return;
      }

      // Construct content array with text and image URLs
      const content: Array<{
        type: string;
        text?: string;
        source?: { type: string; url: string; };
      }> = [];

      // Add text if present
      if (trimmedInput) {
        content.push({
          type: "text",
          text: trimmedInput,
        });
      }

      // Add images with URLs (for Claude API)
      uploadedImageMetadata.forEach((img) => {
        content.push({
          type: "image",
          source: {
            type: "url",
            url: img.signed_url,
          },
        });
      });

      // Debug log
      const imageCount = uploadedImageMetadata.length;
      logger.debug("log", "Sending query with content", {
        contentLength: content.length,
        hasText: !!trimmedInput,
        imageCount,
        content: content.map((c) => ({
          type: c.type,
          hasText: !!c.text,
          hasSource: !!c.source,
        })),
      });

      // Add message to chat with imageUrls for immediate display
      const displayMessage =
        trimmedInput +
        (imageCount > 0
          ? ` [${imageCount} image${imageCount > 1 ? "s" : ""}]`
          : "");

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + Math.random(),
          type: "user",
          content: displayMessage,
          timestamp: Date.now(),
          imageUrls: uploadedImageMetadata.map((img) => img.signed_url),
        },
      ]);

      setInputValue("");
      setUploadedImages([]);
      setUploadProgress({});
      setIsProcessing(true);
      setHasReceivedResponse(false);

      // Send message in the format expected by CodeService
      if (ws) {
        ws.send(
          JSON.stringify({
            type: "query",
            data: {
              content,
              token,
              options: {
                provider: modelProvider,
                model: modelProvider === "vercel" ? model : undefined,
              },
              ai_chat_session_id: isCorruptedSession
                ? null
                : sessionIdRef.current,
              prototype_chat_session_id: prototypeChatSessionId,
              custom_design_system_id: prototype?.custom_design_system,
              design_style: prototype?.design_style,
              current_viewing_path: currentViewingPath,
              image_metadata: uploadedImageMetadata.map((img) => ({
                storage_path: img.storage_path,
                media_type: img.media_type,
                name: img.name,
              })),
            },
          }),
        );
      }
    } catch (error) {
      logger.debug("error", "Failed to send query with images", {
        error: error instanceof Error ? error.message : String(error),
      });
      addMessage("error", "Failed to send message. Please try again.");
      setUploadingImages(false);
      setUploadProgress({});
      setIsProcessing(false);
    }
  };

  // Interrupt current query
  const interruptQuery = () => {
    if (!ws || !isConnected) {
      addMessage("error", "Not connected");
      return;
    }

    ws.send(
      JSON.stringify({
        type: "interrupt",
      }),
    );
  };

  // Reset session - delete current chat session and create a new one
  const resetSession = async () => {
    if (!prototypeChatSessionId) {
      addMessage("error", "No active chat session");
      return;
    }

    try {
      // Get current user for RLS policy
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        addMessage("error", "Not authenticated. Please log in.");
        return;
      }

      // Delete chat images from storage before deleting session
      try {
        // List all images in the chat session folder
        const chatImagePrefix = `${prototypeId}/chat/${prototypeChatSessionId}/`;
        const { data: imageList, error: listError } = await supabase.storage
          .from("prototype-assets")
          .list(chatImagePrefix);

        if (listError) {
          logger.debug("error", "Failed to list chat images for deletion", {
            error: listError,
          });
        } else if (imageList && imageList.length > 0) {
          // Delete all images in the folder
          const filePaths = imageList.map(
            (file) => `${chatImagePrefix}${file.name}`,
          );
          const { error: deleteImagesError } = await supabase.storage
            .from("prototype-assets")
            .remove(filePaths);

          if (deleteImagesError) {
            logger.debug("error", "Failed to delete chat images", {
              error: deleteImagesError,
            });
          } else {
            logger.debug("log", "Deleted chat images", {
              count: imageList.length,
            });
          }
        }
      } catch (error) {
        logger.debug("error", "Error cleaning up chat images", {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with session deletion even if image cleanup fails
      }

      // Delete the current chat session (cascade will delete messages)
      const { error: deleteError } = await supabase
        .from("prototype_chat_sessions")
        .delete()
        .eq("id", prototypeChatSessionId);

      if (deleteError) {
        logger.debug("error", "Failed to delete chat session", {
          error: deleteError,
        });
        addMessage("error", "Failed to reset session");
        return;
      }

      // Create new chat session with null session_id
      const { data: newSession, error: createError } = await supabase
        .from("prototype_chat_sessions")
        .insert({
          prototype_id: prototypeId,
          session_id: null,
          user_id: user.id,
        })
        .select()
        .single();

      if (createError) {
        logger.debug("error", "Failed to create new chat session", {
          error: createError,
        });
        addMessage("error", "Failed to create new session");
        return;
      }

      // Update state with new session
      setPrototypeChatSessionId(newSession.id);
      setAiChatSessionId(null);
      sessionIdRef.current = null;
      setMessages([]);
      setCurrentTodos([]); // Clear todos when resetting session
      setIsCorruptedSession(false); // Clear corruption flag when resetting

      // Update the sessions list
      setAllChatSessions((prev) => [
        newSession,
        ...prev.filter((s) => s.id !== prototypeChatSessionId),
      ]);

      logger.debug("log", "Reset session - created new chat session", {
        oldChatSessionId: prototypeChatSessionId,
        newChatSessionId: newSession.id,
      });

      addMessage("system", "Session reset - starting fresh conversation");
    } catch (error) {
      logger.debug("error", "Error resetting session", {
        error: error instanceof Error ? error.message : String(error),
      });
      addMessage("error", "Failed to reset session");
    }
  };

  // Switch to a different chat session
  const switchChatSession = async (targetChatSessionId: string) => {
    try {
      // Find the selected session
      const selectedSession = allChatSessions.find(
        (session) => session.id === targetChatSessionId,
      );

      if (!selectedSession) {
        logger.debug("error", "Selected session not found", {
          targetChatSessionId,
        });
        return;
      }

      // Update current session state
      setPrototypeChatSessionId(selectedSession.id);
      setAiChatSessionId(selectedSession.session_id);
      sessionIdRef.current = selectedSession.session_id;

      // Clear current messages and todos, then load historical messages for this session
      setMessages([]);
      setCurrentTodos([]); // Clear todos when switching sessions
      await loadHistoricalMessages(selectedSession.id);

      logger.debug("log", "Switched to chat session", {
        chatSessionId: selectedSession.id,
        sessionId: selectedSession.session_id,
      });
    } catch (error) {
      logger.debug("error", "Error switching chat session", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Create a new chat session
  const createNewChatSession = async () => {
    try {
      // Get current user for RLS policy
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        addMessage("error", "Not authenticated. Please log in.");
        return;
      }

      // Create new chat session with null session_id
      const { data: newSession, error: createError } = await supabase
        .from("prototype_chat_sessions")
        .insert({
          prototype_id: prototypeId,
          session_id: null,
          user_id: user.id,
        })
        .select()
        .single();

      if (createError) {
        logger.debug("error", "Failed to create new chat session", {
          error: createError,
        });
        addMessage("error", "Failed to create new chat session");
        return;
      }

      // Update state with new session
      setPrototypeChatSessionId(newSession.id);
      setAiChatSessionId(null);
      sessionIdRef.current = null;
      setMessages([]);
      setCurrentTodos([]); // Clear todos when creating new session
      setIsCorruptedSession(false); // Clear corruption flag for new session

      // Add new session to the list
      setAllChatSessions((prev) => [newSession, ...prev]);

      logger.debug("log", "Created new chat session", {
        chatSessionId: newSession.id,
      });

      addMessage("system", "New chat session created");
    } catch (error) {
      logger.debug("error", "Error creating new chat session", {
        error: error instanceof Error ? error.message : String(error),
      });
      addMessage("error", "Failed to create new chat session");
    }
  };

  // Changing models/providers should always start a fresh chat session
  const handleModelProviderChange = (value: "claude" | "vercel") => {
    if (value === modelProvider) return;
    setModelProvider(value);
    void createNewChatSession();
  };

  const handleModelChange = (value: string) => {
    if (value === model) return;
    setModel(value);
    void createNewChatSession();
  };

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery();
    }
  };

  return (
    <ClaudeCodePanelUI
      prototypeTitle={prototypeTitle}
      visibilityLabel={visibilityLabel}
      createdAtLabel={createdAtLabel}
      canEditName={canEditName}
      isEditingTitle={isEditingTitle}
      editedTitle={editedTitle}
      isUpdatingTitle={isUpdatingTitle}
      showSettingsModal={showSettingsModal}
      setShowSettingsModal={setShowSettingsModal}
      showResetConfirmation={showResetConfirmation}
      setShowResetConfirmation={setShowResetConfirmation}
      allChatSessions={allChatSessions}
      prototypeChatSessionId={prototypeChatSessionId}
      isConnected={isConnected}
      isProcessing={isProcessing}
      baseTunnelUrl={baseTunnelUrl}
      currentRenderStatus={currentRenderStatus}
      modelProvider={modelProvider}
      model={model}
      vercelModels={vercelModelOptions}
      onModelProviderChange={handleModelProviderChange}
      onModelChange={handleModelChange}
      messages={messages}
      expandedThinking={expandedThinking}
      currentTodos={currentTodos}
      uploadedImages={uploadedImages}
      inputValue={inputValue}
      hasReceivedResponse={hasReceivedResponse}
      showScrollToBottom={showScrollToBottom}
      isCurrentSessionMostRecent={isCurrentSessionMostRecent}
      isDragOver={isDragOver}
      uploadingImages={uploadingImages}
      uploadProgress={uploadProgress}
      scrollAreaRef={scrollAreaRef}
      fileInputRef={fileInputRef}
      textareaRef={textareaRef}
      handleStartTitleEdit={handleStartTitleEdit}
      handleCancelTitleEdit={handleCancelTitleEdit}
      handleSaveTitle={handleSaveTitle}
      setEditedTitle={setEditedTitle}
      switchChatSession={switchChatSession}
      createNewChatSession={createNewChatSession}
      connect={connect}
      interruptQuery={interruptQuery}
      toggleThinkingExpanded={toggleThinkingExpanded}
      getRelativeTime={getRelativeTime}
      sanitizeFilePath={sanitizeFilePath}
      removeImage={removeImage}
      handleImageSelect={handleImageSelect}
      setInputValue={setInputValue}
      handleKeyPress={handleKeyPress}
      sendQuery={sendQuery}
      resetSession={resetSession}
      scrollToBottom={scrollToBottom}
      handleDragEnter={handleDragEnter}
      handleDragLeave={handleDragLeave}
      handleDragOver={handleDragOver}
      handleDrop={handleDrop}
      handlePaste={handlePaste}
      hasReachedCreditLimit={creditUsage.hasReachedLimit}
      creditsUsed={creditUsage.creditsUsed}
      totalAvailableCredits={creditUsage.totalAvailableCredits}
      onMessageUpdate={(updatedMessage) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === updatedMessage.id ? updatedMessage : msg,
          ),
        );
      }}
    />
  );
}
