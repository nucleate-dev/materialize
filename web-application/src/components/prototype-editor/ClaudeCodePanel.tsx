"use client";

import { supabase } from "@/ClientConstants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type { ChatServerMessage } from "@/lib/types/ChatTypes";
import { ChatEvent, ChatSystemEventSubtype } from "@/lib/types/ChatTypes";
import { Database } from "@/lib/types/supabase";
import { clearChatIntent, getChatIntent } from "@/lib/utils/chatIntentUtils";
import {
  CheckIcon,
  ChevronDownIcon,
  InformationCircleIcon,
  PencilIcon,
  PhotoIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type PrototypeChatSession = Database["public"]["Tables"]["prototype_chat_sessions"]["Row"];

type RenderStatus =
  | "Static build"
  | "Connecting.."
  | "Updating.."
  | "Starting Dev Server.."
  | "Disconnected"
  | "Connected";

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
  onFileSyncComplete?: () => void;
  currentRenderStatus?: RenderStatus;
  // External WebSocket management (optional)
  externalWS?: WebSocket | null;
  externalWSConnected?: boolean;
  onConnect?: () => Promise<void>;
  onDisconnect?: () => void;
  onRegisterMessageHandler?: (
    id: string,
    handler: (msg: ChatServerMessage) => void,
  ) => void;
  onUnregisterMessageHandler?: (id: string) => void;
}

interface Message {
  id: string;
  type: "user" | "assistant" | "system" | "error" | "tool" | "thinking";
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
}

interface UploadedImage {
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
  onFileSyncComplete,
  currentRenderStatus,
  externalWS,
  externalWSConnected,
  onConnect,
  onDisconnect,
  onRegisterMessageHandler,
  onUnregisterMessageHandler,
}: ClaudeCodePanelProps) {
  const logger = useProductLogger();

  // Determine if using external WebSocket management
  const usingExternalWS = !!externalWS;

  // Internal WebSocket state (only used if no external WS provided)
  const [internalWS, setInternalWS] = useState<WebSocket | null>(null);
  const [internalConnected, setInternalConnected] = useState(false);

  // Use external or internal WebSocket
  const ws = usingExternalWS ? externalWS : internalWS;
  const isConnected = usingExternalWS
    ? externalWSConnected ?? false
    : internalConnected;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null); // prototype_chat_sessions.id
  const [allChatSessions, setAllChatSessions] = useState<Array<PrototypeChatSession>>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const authTokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [hasReceivedResponse, setHasReceivedResponse] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const hasProcessedChatIntent = useRef(false);
  const queueTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);

  // Reset confirmation modal state
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);

  const prototypeTitle = prototype?.name?.trim() || "Project";
  const visibility = prototype?.visibility?.toLowerCase();
  const visibilityLabel =
    visibility === "public"
      ? "Public"
      : visibility === "team"
        ? "Team"
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
    const prefix = '/tmp/materialize-dev-server/';
    // Replace all occurrences of the prefix, not just at the start
    return path.replace(new RegExp(prefix, 'g'), '');
  };

  // Helper function to sanitize any value that might contain file paths
  // Currently unused but kept for potential future use
  // const sanitizeValue = (value: unknown): unknown => {
  //   if (typeof value === 'string') {
  //     return sanitizeFilePath(value);
  //   }
  //   if (typeof value === 'object' && value !== null) {
  //     if (Array.isArray(value)) {
  //       return value.map(sanitizeValue);
  //     }
  //     const sanitized: Record<string, unknown> = {};
  //     for (const [key, val] of Object.entries(value)) {
  //       sanitized[key] = sanitizeValue(val);
  //     }
  //     return sanitized;
  //   }
  //   return value;
  // };

  // Helper function to determine if a tool is read-only (search/inspection)
  const isReadOnlyTool = (toolName: string): boolean => {
    const normalized = toolName.toLowerCase();
    const readOnlyTools = ['read', 'glob', 'grep', 'list', 'search'];
    return readOnlyTools.some(tool => normalized.includes(tool));
  };

  // Helper function to determine if a tool is a "thinking" tool (Task, etc.)
  const isThinkingTool = (toolName: string): boolean => {
    const normalized = toolName.toLowerCase();
    return normalized === 'task';
  };

  // Helper function to get friendly tool display name
  const getToolDisplayName = (toolName: string, toolInput?: ToolInput): string => {
    const normalized = toolName.toLowerCase();

    // For Bash commands, use the description if available
    if (normalized.includes('bash') && toolInput?.description) {
      return toolInput.description;
    }

    // For Task tool, use the description if available
    if (normalized === 'task' && toolInput?.description) {
      return toolInput.description;
    }

    // More descriptive tool names with parameters
    if (normalized.includes('read') && toolInput?.file_path) {
      const fileName = sanitizeFilePath(toolInput.file_path).split('/').pop() || toolInput.file_path;
      return `Reading ${fileName}`;
    }
    if (normalized.includes('glob') && toolInput?.pattern) {
      return `Searching files matching ${toolInput.pattern}`;
    }
    if (normalized.includes('grep') && toolInput?.pattern) {
      return `Searching code for "${toolInput.pattern}"`;
    }
    if (normalized.includes('list') && toolInput?.path) {
      const pathName = sanitizeFilePath(toolInput.path).split('/').pop() || toolInput.path;
      return `Listing ${pathName}`;
    }
    if (normalized.includes('write') && toolInput?.file_path) {
      const fileName = sanitizeFilePath(toolInput.file_path).split('/').pop() || toolInput.file_path;
      return `Writing ${fileName}`;
    }
    if (normalized.includes('edit') && toolInput?.file_path) {
      const fileName = sanitizeFilePath(toolInput.file_path).split('/').pop() || toolInput.file_path;
      return `Editing ${fileName}`;
    }
    if (normalized.includes('delete') && toolInput?.file_path) {
      const fileName = sanitizeFilePath(toolInput.file_path).split('/').pop() || toolInput.file_path;
      return `Deleting ${fileName}`;
    }

    // Default friendly names
    if (normalized.includes('read')) return 'Reading files';
    if (normalized.includes('glob')) return 'Searching files';
    if (normalized.includes('grep')) return 'Searching code';
    if (normalized.includes('list')) return 'Listing files';
    if (normalized.includes('write')) return 'Writing';
    if (normalized.includes('edit')) return 'Editing';
    if (normalized.includes('bash')) return 'Running command';
    if (normalized.includes('delete')) return 'Deleting';
    return toolName;
  };

  // Toggle expanded state for thinking
  const toggleThinkingExpanded = (toolCallId: string) => {
    setExpandedThinking(prev => {
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
  const loadHistoricalMessages = useCallback(async (chatSessionId: string) => {
    try {
      const { data: historicalMessages, error: messagesError } = await supabase
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
                const eventData = typeof dbMessage.event_data === 'string'
                  ? JSON.parse(dbMessage.event_data)
                  : dbMessage.event_data;

                if (eventData.images && Array.isArray(eventData.images)) {
                  // Fetch signed URLs for each image
                  const imageUrls: string[] = [];
                  for (const imageMetadata of eventData.images) {
                    try {
                      const { data: signedUrlData } = await supabase.storage
                        .from("prototype-assets")
                        .createSignedUrl(imageMetadata.storage_path, 3600); // 1 hour expiry

                      if (signedUrlData?.signedUrl) {
                        imageUrls.push(signedUrlData.signedUrl);
                      }
                    } catch (error) {
                      logger.debug("error", "Failed to get signed URL for image", {
                        storagePath: imageMetadata.storage_path,
                        error: error instanceof Error ? error.message : String(error),
                      });
                    }
                  }

                  if (imageUrls.length > 0) {
                    message.imageUrls = imageUrls;
                  }
                }
              } catch (error) {
                logger.debug("error", "Failed to parse event_data for images", {
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }

            uiMessages.push(message);
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

        setMessages(uiMessages);
        logger.debug("log", "Loaded historical messages", {
          count: uiMessages.length,
        });
      }
    } catch (error) {
      logger.debug("error", "Error loading historical messages", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [logger]);

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
          setChatSessionId(mostRecentSession.id);
          setSessionId(mostRecentSession.session_id);
          sessionIdRef.current = mostRecentSession.session_id;

          logger.debug("log", "Using most recent chat session", {
            chatSessionId: mostRecentSession.id,
            sessionId: mostRecentSession.session_id,
          });

          // Load historical messages for this session
          await loadHistoricalMessages(mostRecentSession.id);
        } else {
          // Get current user for RLS policy
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            logger.debug("error", "Not authenticated - cannot create chat session");
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

          setChatSessionId(newSession.id);
          setSessionId(null);
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
        logger.debug("error", "Queued message timeout - dev server took too long", {
          message: chatIntent.message,
        });

        // Update queued message to show error
        setMessages((prev) =>
          prev.map((msg) =>
            msg.isQueued
              ? { ...msg, isQueued: false }
              : msg
          )
        );

        addMessage(
          "error",
          "Dev server took too long to start. Please try sending your message again."
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
        prev.map((msg) =>
          msg.isQueued
            ? { ...msg, isQueued: false }
            : msg
        )
      );

      // Send the message
      const content = queuedMessage;
      setQueuedMessage(null);
      setIsProcessing(true);
      setHasReceivedResponse(false);

      // Clear chat intent from localStorage
      clearChatIntent();

      // Send message via WebSocket
      if (ws) {
        const messageContent = [{ type: "text", text: content }];
        ws.send(
          JSON.stringify({
            type: "query",
            data: {
              content: messageContent,
              token: authTokenRef.current,
              session_id: sessionIdRef.current,
              chat_session_id: chatSessionId,
              custom_design_system_id: prototype?.custom_design_system,
            },
          })
        );
      }
    }
  }, [queuedMessage, currentRenderStatus, isConnected, isProcessing, ws, logger, chatSessionId, prototype]);

  // Auto-connect when component mounts (only if using internal WebSocket)
  useEffect(() => {
    if (!usingExternalWS && !isConnected && prototypeId) {
      connect();
    }
  }, [prototypeId, usingExternalWS]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Register message handler with parent if using external WS
  useEffect(() => {
    if (usingExternalWS && onRegisterMessageHandler && onUnregisterMessageHandler) {
      const handlerId = `claude-code-panel-${Date.now()}`;
      onRegisterMessageHandler(handlerId, handleServerMessage);

      return () => {
        onUnregisterMessageHandler(handlerId);
      };
    }
  }, [usingExternalWS, onRegisterMessageHandler, onUnregisterMessageHandler]); // eslint-disable-line react-hooks/exhaustive-deps

  // Connect to WebSocket
  // Internal WebSocket connection (only used if no external WS provided)
  const connectInternal = async () => {
    try {
      authTokenRef.current = null;

      // Get authentication token
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        addMessage("error", "Not authenticated. Please log in.");
        return;
      }

      const token = session.session.access_token;

      // Get server endpoint
      const serverEndpoint = process.env.NEXT_PUBLIC_SERVER_ENDPOINT;
      if (!serverEndpoint) {
        addMessage("error", "Server endpoint not configured");
        return;
      }

      authTokenRef.current = token;
      const finalTunnelUrlBase = (process.env.NEXT_PUBLIC_FARGATE_DEV_MODE === 'true' ? process.env.NEXT_PUBLIC_INTERNAL_BUILD_WORKERS_SERVER_ENDPOINT : null) || baseTunnelUrl;
      const wsUrl = `${finalTunnelUrlBase}/code/ws/${prototypeId}`;
      logger.debug("log", "WebSocket URL", { wsUrl, finalTunnelUrlBase, prototypeId });

      logger.debug("log", "Attempting WebSocket connection", {
        serverEndpoint,
        prototypeId,
        hasToken: !!token,
        tokenLength: token?.length,
      });

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        setInternalConnected(true);
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ChatServerMessage;
          handleServerMessage(message);
        } catch (error) {
          logger.debug("error", "Failed to parse WebSocket message", { error });
        }
      };

      websocket.onclose = (event) => {
        authTokenRef.current = null;
        setInternalConnected(false);
        const closeReason = event.reason || "No reason provided";
        logger.debug("error", "WebSocket closed", {
          code: event.code,
          reason: closeReason,
          wasClean: event.wasClean,
        });
        addMessage(
          "system",
          `Disconnected from Claude Code (code: ${event.code})`,
        );
        if (event.code === 1006) {
          addMessage(
            "error",
            "Connection failed. Check server logs or authentication.",
          );
        }
      };

      websocket.onerror = (error) => {
        logger.debug("error", "WebSocket connection error", { error });
        addMessage("error", "WebSocket connection error");
      };

      setInternalWS(websocket);
    } catch (error) {
      authTokenRef.current = null;
      addMessage(
        "error",
        `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Internal disconnect (only used if no external WS provided)
  const disconnectInternal = () => {
    if (internalWS) {
      internalWS.close();
      setInternalWS(null);
      setInternalConnected(false);
      authTokenRef.current = null;
      sessionIdRef.current = null;
    }
  };

  // Use external or internal connect/disconnect
  const connect = usingExternalWS && onConnect ? onConnect : connectInternal;
  // Disconnect function available but currently unused - kept for potential future use
  const _disconnect = usingExternalWS && onDisconnect ? onDisconnect : disconnectInternal;
  // Suppress unused var warning
  void _disconnect;

  // Handle messages from server
  const handleServerMessage = (message: ChatServerMessage) => {
    logger.debug("log", "Server message received", { message });

    switch (message.type) {
      case ChatEvent.AUTHENTICATED: {
        const userId = message.userId;
        if (userId) {
          setSessionId(userId);
          addMessage(
            "system",
            `Authenticated as user: ${userId.slice(0, 8)}...`,
          );
        }
        break;
      }

      case ChatEvent.MESSAGE_RECEIVED:
      case ChatEvent.READY:
        break;

      case ChatEvent.ERROR: {
        setIsProcessing(false);
        const { message: errorMessage, details } = message.error;
        const formattedDetails = details ? `${errorMessage}: ${details}` : errorMessage;
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
        break;

      case ChatEvent.INTERRUPTED:
        setIsProcessing(false);
        addMessage("system", message.data.message || "Query interrupted");
        break;

      case ChatEvent.SESSION_RESET:
        setMessages([]);
        sessionIdRef.current = null;
        setSessionId(null);
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

          if (isThinkingTool(toolName)) {
            setMessages((prev) =>
              prev.filter(msg =>
                !(msg.type === "tool" && !msg.isComplete && msg.toolName && isReadOnlyTool(msg.toolName))
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
                const updatedHistory = [...(lastMessage.toolHistory || []), toolInput];
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMessage,
                    toolInput,
                    toolHistory: updatedHistory,
                  },
                ];
              }

              const filtered = prev.filter(msg =>
                !(msg.type === "tool" && !msg.isComplete && msg.toolName && isReadOnlyTool(msg.toolName))
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
              prev.filter(msg =>
                !(msg.type === "tool" && !msg.isComplete && msg.toolName && isReadOnlyTool(msg.toolName))
              ),
            );
            addToolMessage(toolName, toolCallId, toolInput, "running");
          }
        }
        break;
      }

      case ChatEvent.TOOL_COMPLETE: {
        const {
          tool_name: toolName,
          tool_call_id: toolCallId = "",
        } = message.data;

        if (toolName) {
          if (isThinkingTool(toolName)) {
            updateThinkingMessage(toolCallId, "success");
          } else {
            updateToolMessage(toolCallId, "success");
          }
        }
        break;
      }

      case ChatEvent.FILE_SYNC_COMPLETE: {
        logger.debug("log", "File sync completed", {
          data: message.data,
        });

        const {
          filesUpdated,
          filesDeleted,
          assetsUpdated,
          assetsDeleted,
          errorCount,
        } = message.data;

        const updates: string[] = [];
        if (filesUpdated > 0) {
          updates.push(`${filesUpdated} file${filesUpdated > 1 ? "s" : ""} updated`);
        }
        if (filesDeleted > 0) {
          updates.push(`${filesDeleted} file${filesDeleted > 1 ? "s" : ""} deleted`);
        }
        if (assetsUpdated > 0) {
          updates.push(`${assetsUpdated} asset${assetsUpdated > 1 ? "s" : ""} updated`);
        }
        if (assetsDeleted > 0) {
          updates.push(`${assetsDeleted} asset${assetsDeleted > 1 ? "s" : ""} deleted`);
        }

        if (updates.length > 0) {
          addMessage("system", `Files synced: ${updates.join(", ")}`);
        }

        if (errorCount > 0) {
          addMessage(
            "system",
            `⚠️ ${errorCount} sync error${errorCount > 1 ? "s" : ""} occurred`,
          );
        }

        if (onFileSyncComplete) {
          onFileSyncComplete();
        }
        break;
      }

      case ChatEvent.SYNC_COMPLETE: {
        const { success, filesCount, assetsCount } = message.data;
        if (success) {
          const parts: string[] = [];
          if (filesCount > 0) {
            parts.push(`${filesCount} file${filesCount > 1 ? "s" : ""}`);
          }
          if (assetsCount > 0) {
            parts.push(`${assetsCount} asset${assetsCount > 1 ? "s" : ""}`);
          }
          if (parts.length > 0) {
            addMessage("system", `Sync complete: ${parts.join(", ")}`);
          }
        }

        if (onFileSyncComplete) {
          onFileSyncComplete();
        }
        break;
      }

      case ChatEvent.USAGE_UPDATE:
        // Usage updates are handled elsewhere (e.g., billing UI)
        break;

      case ChatEvent.INFO:
        addMessage("system", message.message);
        break;

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
      setSessionId(newSessionId);

      // If we have a chat session without a session_id, upsert it
      if (chatSessionId && !sessionId) {
        supabase
          .from("prototype_chat_sessions")
          .update({ session_id: newSessionId })
          .eq("id", chatSessionId)
          .then(({ error }) => {
            if (error) {
              logger.debug("error", "Failed to update session_id in database", {
                error,
                chatSessionId,
                newSessionId,
              });
            } else {
              logger.debug("log", "Updated session_id in database", {
                chatSessionId,
                newSessionId,
              });
            }
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
                    content: lastMessage.content + (needsLineBreak ? '\n\n' : '') + textDelta,
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
                    content: lastMessage.content + (needsLineBreak ? '\n\n' : '') + content.text,
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
  const addMessage = (type: Message["type"], content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString() + Math.random(),
        type,
        content,
        timestamp: Date.now(),
      },
    ]);
  };

  // Add a tool message when a tool starts
  const addToolMessage = (toolName: string, toolCallId: string, toolInput: ToolInput, status: "running" | "success" | "error") => {
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
  const addThinkingMessage = (toolName: string, toolCallId: string, toolInput: ToolInput, status: "running" | "success" | "error") => {
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
  const updateThinkingMessage = (toolCallId: string, status: "running" | "success" | "error") => {
    setMessages((prev) => {
      const index = prev.findIndex(
        (msg) => msg.type === "thinking" && msg.toolCallId === toolCallId && !msg.isComplete
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
  const updateToolMessage = (toolCallId: string, status: "running" | "success" | "error") => {
    setMessages((prev) => {
      // Find the tool message with this toolCallId
      const index = prev.findIndex(
        (msg) => msg.type === "tool" && msg.toolCallId === toolCallId && !msg.isComplete
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

    Array.from(files).forEach((file) => {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        addMessage("error", `Invalid file type: ${file.name}. Only images are supported.`);
        return;
      }

      // Validate file size (5MB limit per Anthropic API)
      if (file.size > 5 * 1024 * 1024) {
        addMessage("error", `Image too large: ${file.name}. Maximum size is 5MB.`);
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

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Remove an uploaded image
  const removeImage = (imageId: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== imageId));
  };

  // Send a query to Claude
  const sendQuery = async () => {
    if (!ws || !isConnected) {
      addMessage("error", "Not connected");
      return;
    }

    const trimmedInput = inputValue.trim();
    if (!trimmedInput && uploadedImages.length === 0) {
      return;
    }

    // Check if dev server is ready
    const isDevServerReady = currentRenderStatus === "Connected";

    // If dev server isn't ready and we already have a queued message, prevent queueing another
    if (!isDevServerReady && queuedMessage) {
      addMessage("system", "Please wait for the current message to be sent");
      return;
    }

    // If dev server isn't ready, queue the message
    if (!isDevServerReady) {
      logger.debug("log", "Dev server not ready, queueing message", {
        currentRenderStatus,
        message: trimmedInput,
      });

      setQueuedMessage(trimmedInput);

      // Add message to chat as queued
      const imageCount = uploadedImages.length;
      const displayMessage = trimmedInput + (imageCount > 0 ? ` [${imageCount} image${imageCount > 1 ? 's' : ''}]` : "");
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
        logger.debug("error", "Queued message timeout - dev server took too long", {
          message: trimmedInput,
        });

        // Update queued message to show error
        setMessages((prev) =>
          prev.map((msg) =>
            msg.isQueued
              ? { ...msg, isQueued: false }
              : msg
          )
        );

        addMessage(
          "error",
          "Dev server took too long to start. Please try sending your message again."
        );

        setQueuedMessage(null);
      }, 120000); // 2 minutes

      // Show system message about queuing
      addMessage("system", `Message queued - waiting for dev server to start (status: ${currentRenderStatus})`);
      return;
    }

    // Refresh the JWT token on each query to ensure it's not expired
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        addMessage(
          "error",
          "Authentication session expired. Please reconnect.",
        );
        return;
      }
      authTokenRef.current = session.session.access_token;
    } catch (error) {
      logger.debug("error", "Failed to refresh authentication token", { error });
      addMessage(
        "error",
        "Failed to refresh authentication token. Please reconnect.",
      );
      return;
    }

    const token = authTokenRef.current;
    if (!token) {
      addMessage(
        "error",
        "Missing authentication token. Please reconnect and try again.",
      );
      return;
    }

    // Construct content array with text and images
    const content: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string; }; }> = [];

    // Add text if present
    if (trimmedInput) {
      content.push({
        type: "text",
        text: trimmedInput,
      });
    }

    // Add images if present
    const imageCount = uploadedImages.length;
    uploadedImages.forEach((image) => {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mediaType,
          data: image.base64,
        },
      });
    });

    // Debug log
    logger.debug("log", "Sending query with content", {
      contentLength: content.length,
      hasText: !!trimmedInput,
      imageCount,
      content: content.map(c => ({ type: c.type, hasText: !!c.text, hasSource: !!c.source }))
    });

    // Add message to chat (show text and image count)
    const displayMessage = trimmedInput + (imageCount > 0 ? ` [${imageCount} image${imageCount > 1 ? 's' : ''}]` : "");
    addMessage("user", displayMessage);

    setInputValue("");
    setUploadedImages([]); // Clear images after sending
    setIsProcessing(true);
    setHasReceivedResponse(false); // Reset for new query

    // Send message in the format expected by CodeService
    ws.send(
      JSON.stringify({
        type: "query",
        data: {
          content,
          token, // Include JWT token for Supabase authentication
          session_id: sessionIdRef.current, // Pass Claude SDK session_id for resumption
          chat_session_id: chatSessionId, // Pass database chat session ID for message persistence
          custom_design_system_id: prototype?.custom_design_system,
        },
      }),
    );
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
    if (!chatSessionId) {
      addMessage("error", "No active chat session");
      return;
    }

    try {
      // Get current user for RLS policy
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        addMessage("error", "Not authenticated. Please log in.");
        return;
      }

      // Delete chat images from storage before deleting session
      try {
        // List all images in the chat session folder
        const chatImagePrefix = `${prototypeId}/chat/${chatSessionId}/`;
        const { data: imageList, error: listError } = await supabase.storage
          .from("prototype-assets")
          .list(chatImagePrefix);

        if (listError) {
          logger.debug("error", "Failed to list chat images for deletion", {
            error: listError,
          });
        } else if (imageList && imageList.length > 0) {
          // Delete all images in the folder
          const filePaths = imageList.map(file => `${chatImagePrefix}${file.name}`);
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
        .eq("id", chatSessionId);

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
      setChatSessionId(newSession.id);
      setSessionId(null);
      sessionIdRef.current = null;
      setMessages([]);

      // Update the sessions list
      setAllChatSessions((prev) => [newSession, ...prev.filter((s) => s.id !== chatSessionId)]);

      logger.debug("log", "Reset session - created new chat session", {
        oldChatSessionId: chatSessionId,
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
      setChatSessionId(selectedSession.id);
      setSessionId(selectedSession.session_id);
      sessionIdRef.current = selectedSession.session_id;

      // Clear current messages and load historical messages for this session
      setMessages([]);
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
      const { data: { user } } = await supabase.auth.getUser();
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
      setChatSessionId(newSession.id);
      setSessionId(null);
      sessionIdRef.current = null;
      setMessages([]);

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

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2 flex-1">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-400"
              }`}
          />
          <span className="text-sm font-medium truncate max-w-[150px]">{prototypeTitle}</span>

          {/* Session Selector */}
          {allChatSessions.length > 0 && (
            <Select
              value={chatSessionId ? String(chatSessionId) : undefined}
              onValueChange={(value) => switchChatSession(value)}
            >
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent>
                {allChatSessions.map((session) => {
                  const date = new Date(session.created_at ?? new Date());
                  const dateStr = date.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                  });
                  const timeStr = date.toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  });
                  const label = `${dateStr} at ${timeStr}`;

                  return (
                    <SelectItem key={session.id} value={String(session.id)}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}

          {/* New Chat Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={createNewChatSession}
                  disabled={!isConnected}
                  className="h-8 px-2"
                >
                  <PlusIcon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New chat</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex gap-2">
          {isProcessing && (
            <Button
              size="sm"
              variant="outline"
              onClick={interruptQuery}
            >
              Stop
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowResetConfirmation(true)}
            disabled={!chatSessionId || isProcessing}
          >
            Reset
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setShowSettingsModal(true)}
                  variant="outline"
                  size="sm"
                  aria-label="Project settings"
                >
                  <InformationCircleIcon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Project info</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 relative" ref={scrollAreaRef}>
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">

            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div key={message.id}>
                  {/* User messages - keep bubble style */}
                  {message.type === "user" && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex justify-end">
                            <div className={`max-w-[80%] rounded-lg p-3 ${message.isQueued ? 'bg-primary/50 text-primary-foreground border-2 border-primary border-dashed' : 'bg-primary text-primary-foreground'}`}>
                              {message.isQueued && (
                                <div className="flex items-center gap-2 mb-2 text-xs opacity-90">
                                  <div className="w-2 h-2 bg-current rounded-full animate-pulse" />
                                  <span>Queued - waiting for dev server...</span>
                                </div>
                              )}
                              <pre className="whitespace-pre-wrap text-sm font-sans">
                                {message.content}
                              </pre>
                              {/* Display historical images if available */}
                              {message.imageUrls && message.imageUrls.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {message.imageUrls.map((imageUrl, idx) => (
                                    <div
                                      key={idx}
                                      className="relative group rounded-lg overflow-hidden border border-primary-foreground/20"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={imageUrl}
                                        alt={`Uploaded image ${idx + 1}`}
                                        className="max-h-40 max-w-full object-contain cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={() => window.open(imageUrl, '_blank')}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {getRelativeTime(message.timestamp)}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Assistant messages - no bubble, just content */}
                  {message.type === "assistant" && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="max-w-none cursor-default">
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown
                                components={{
                                  // Customize code blocks - inline vs block
                                  code: ({ className, children, ...props }) => {
                                    // Check if it's inline code by looking at the node structure
                                    const isInline = !className?.includes('language-');

                                    // Clean up children to remove any extra backticks
                                    let content = children;
                                    if (typeof content === 'string') {
                                      // Remove leading/trailing backticks that might be in the content
                                      content = content.replace(/^`+|`+$/g, '');
                                    }

                                    if (isInline) {
                                      return (
                                        <code
                                          className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono before:content-none after:content-none"
                                          {...props}
                                        >
                                          {content}
                                        </code>
                                      );
                                    }
                                    // Block code
                                    return (
                                      <code
                                        className={`block bg-muted p-3 rounded my-2 overflow-x-auto font-mono text-sm ${className || ""}`}
                                        {...props}
                                      >
                                        {content}
                                      </code>
                                    );
                                  },
                                  // Customize paragraphs
                                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                  // Customize lists
                                  ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                                  ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                                }}
                              >
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {getRelativeTime(message.timestamp)}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Tool messages - sleek inline style, always blue */}
                  {message.type === "tool" && (
                    <div className="py-1">
                      <div
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${message.status === "error"
                            ? "bg-red-500/10 text-red-700 dark:text-red-400"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                          }`}
                      >
                        {message.status === "running" && (
                          <span
                            className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-pulse"
                            style={{
                              filter: "drop-shadow(0 0 2px currentColor) drop-shadow(0 0 4px currentColor)",
                            }}
                          />
                        )}
                        {message.status === "error" && (
                          <span className="inline-block">✗</span>
                        )}
                        <span>{message.content}</span>
                      </div>
                    </div>
                  )}

                  {/* Thinking messages - collapsible low-opacity thoughts */}
                  {message.type === "thinking" && (
                    <div className="py-2 opacity-60">
                      <div
                        className="flex items-start gap-2 cursor-pointer"
                        onClick={() => message.toolCallId && toggleThinkingExpanded(message.toolCallId)}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {message.toolCallId && expandedThinking.has(message.toolCallId) ? (
                            <span className="text-xs">▼</span>
                          ) : (
                            <span className="text-xs">▶</span>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium italic text-muted-foreground">
                              {message.status === "running" ? "Thinking: " : "Thought: "}
                              {message.content}
                            </span>
                            {message.status === "running" && (
                              <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
                            )}
                          </div>

                          {/* Expandable thinking details */}
                          {message.toolCallId && expandedThinking.has(message.toolCallId) && message.toolInput && (
                            <div className="mt-2 p-3 bg-muted/30 rounded text-xs">
                              {message.toolInput.prompt && (
                                <div className="whitespace-pre-wrap font-mono text-muted-foreground">
                                  {sanitizeFilePath(message.toolInput.prompt)}
                                </div>
                              )}
                              {message.toolInput.subagent_type && (
                                <div className="mt-2 text-xs">
                                  <span className="font-semibold">Agent: </span>
                                  <span className="text-muted-foreground">{message.toolInput.subagent_type}</span>
                                </div>
                              )}
                              {message.toolInput.model && (
                                <div className="text-xs">
                                  <span className="font-semibold">Model: </span>
                                  <span className="text-muted-foreground">{message.toolInput.model}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* System messages - subtle */}
                  {message.type === "system" && (
                    <div className="text-xs text-muted-foreground py-1">
                      {message.content}
                    </div>
                  )}

                  {/* Error messages */}
                  {message.type === "error" && (
                    <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                      {message.content}
                    </div>
                  )}
                </div>
              ))}

              {/* Show "Thinking..." indicator when processing but no response received yet */}
              {isProcessing && isConnected && !hasReceivedResponse && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className="relative flex items-center justify-center">
                      <div
                        className="w-2 h-2 bg-primary rounded-full animate-pulse"
                        style={{
                          filter:
                            "drop-shadow(0 0 4px hsl(var(--primary) / 0.8)) drop-shadow(0 0 8px hsl(var(--primary) / 0.5))",
                        }}
                      ></div>
                      <div
                        className="absolute inset-0 w-2 h-2 bg-primary rounded-full animate-ping opacity-50"
                        style={{
                          filter:
                            "drop-shadow(0 0 6px hsl(var(--primary) / 0.9))",
                        }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium shimmer-text">
                      Thinking...
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Jump to bottom button */}
        {showScrollToBottom && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
            <Button
              size="sm"
              variant="secondary"
              onClick={scrollToBottom}
              className="shadow-lg border"
            >
              <ChevronDownIcon className="w-4 h-4 mr-1" />
              Jump to bottom
            </Button>
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t">
        {/* Image previews */}
        {uploadedImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {uploadedImages.map((image) => (
              <div
                key={image.id}
                className="relative group rounded-lg overflow-hidden border border-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${image.mediaType};base64,${image.base64}`}
                  alt={image.name}
                  className="h-20 w-20 object-cover"
                />
                <button
                  onClick={() => removeImage(image.id)}
                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 truncate">
                  {image.name}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* Image upload button */}
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected || isProcessing}
            title="Add images"
          >
            <PhotoIcon className="w-5 h-5" />
          </Button>

          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              isConnected
                ? "Ask Claude Code anything..."
                : "Connect to start chatting"
            }
            disabled={!isConnected || isProcessing}
            className="flex-1"
          />
          <Button
            onClick={sendQuery}
            disabled={!isConnected || (!inputValue.trim() && uploadedImages.length === 0) || isProcessing}
          >
            {isProcessing ? "..." : "Send"}
          </Button>
        </div>
      </div>

      {/* Prototype Settings Modal */}
      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Project Info</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Name Editing */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedTitle}
                    onChange={(event) => setEditedTitle(event.target.value)}
                    className="flex-1"
                    autoFocus
                    disabled={isUpdatingTitle}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSaveTitle();
                      } else if (event.key === "Escape") {
                        handleCancelTitleEdit();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={handleSaveTitle}
                    disabled={isUpdatingTitle || !editedTitle.trim()}
                    className="h-9 w-9"
                  >
                    {isUpdatingTitle ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckIcon className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCancelTitleEdit}
                    disabled={isUpdatingTitle}
                    className="h-9 w-9"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center">
                  <p className="text-sm flex-1">{prototypeTitle}</p>
                  {canEditName && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleStartTitleEdit}
                      className="h-8 w-8"
                      title="Edit prototype name"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Visibility Status */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Visibility</label>
              <div>
                <Badge variant="outline" className="uppercase tracking-wide">
                  {visibilityLabel}
                </Badge>
              </div>
            </div>

            {/* Created Date */}
            {createdAtLabel && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Created</label>
                <p className="text-sm text-muted-foreground">
                  {createdAtLabel}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Modal */}
      <Dialog open={showResetConfirmation} onOpenChange={setShowResetConfirmation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Session?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will permanently delete all messages in the current conversation and start a fresh session. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowResetConfirmation(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowResetConfirmation(false);
                  resetSession();
                }}
              >
                Reset Session
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
