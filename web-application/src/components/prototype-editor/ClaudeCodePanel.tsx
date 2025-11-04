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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { Database } from "@/lib/types/supabase";
import {
  CheckIcon,
  InformationCircleIcon,
  PencilIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];

interface ClaudeCodePanelProps {
  prototypeId: string;
  baseTunnelUrl: string | null;
  prototype?: Prototype | null;
  canEditPrototype?: boolean;
  onPrototypeUpdate?: (updatedPrototype: Prototype) => void;
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
  toolInput?: any;
  description?: string;
  toolHistory?: any[]; // For ephemeral tools, track all invocations
}

interface ServerMessage {
  type: string;
  error?: string;
  userId?: string;
  prototype_id?: string;
  timestamp?: string;
  data?: {
    connectionId?: string;
    sessionId?: string;
    message?: string;
    tool_name?: string;
    tool_call_id?: string;
    tool_input?: unknown;
    tool_response?: unknown;
  };
  subtype?: string;
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
}: ClaudeCodePanelProps) {
  const logger = useProductLogger();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const authTokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [hasReceivedResponse, setHasReceivedResponse] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);

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

  // Helper function to sanitize file paths by removing the dev server prefix
  const sanitizeFilePath = (path: string): string => {
    if (!path) return path;
    const prefix = '/tmp/materialize-dev-server/';
    // Replace all occurrences of the prefix, not just at the start
    return path.replace(new RegExp(prefix, 'g'), '');
  };

  // Helper function to sanitize any value that might contain file paths
  const sanitizeValue = (value: any): any => {
    if (typeof value === 'string') {
      return sanitizeFilePath(value);
    }
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.map(sanitizeValue);
      }
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = sanitizeValue(val);
      }
      return sanitized;
    }
    return value;
  };

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
  const getToolDisplayName = (toolName: string, toolInput?: any): string => {
    const normalized = toolName.toLowerCase();

    // For Bash commands, use the description if available
    if (normalized.includes('bash') && toolInput?.description) {
      return toolInput.description;
    }

    // For Task tool, use the description if available
    if (normalized === 'task' && toolInput?.description) {
      return toolInput.description;
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

  // Toggle expanded state for a tool
  const toggleToolExpanded = (toolCallId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolCallId)) {
        next.delete(toolCallId);
      } else {
        next.add(toolCallId);
      }
      return next;
    });
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Connect to WebSocket
  const connect = async () => {
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
      const finalTunnelUrlBase = process.env.NEXT_PUBLIC_INTERNAL_BUILD_WORKERS_SERVER_ENDPOINT || baseTunnelUrl;
      const wsUrl = `${finalTunnelUrlBase}/code/ws/`;
      logger.debug("log", "WebSocket URL", { wsUrl, finalTunnelUrlBase, prototypeId });

      logger.debug("log", "Attempting WebSocket connection", {
        serverEndpoint,
        prototypeId,
        hasToken: !!token,
        tokenLength: token?.length,
        wsPath: `/chat/v2/ws`,
      });

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        setIsConnected(true);
        addMessage("system", "Connected");
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          handleServerMessage(message);
        } catch (error) {
          logger.debug("error", "Failed to parse WebSocket message", { error });
        }
      };

      websocket.onclose = (event) => {
        authTokenRef.current = null;
        setIsConnected(false);
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

      setWs(websocket);
    } catch (error) {
      authTokenRef.current = null;
      addMessage(
        "error",
        `Failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Disconnect from WebSocket
  const disconnect = () => {
    if (ws) {
      ws.close();
      setWs(null);
      setIsConnected(false);
      authTokenRef.current = null;
      sessionIdRef.current = null;
    }
  };

  // Handle messages from server
  const handleServerMessage = (message: ServerMessage) => {
    logger.debug("log", "Server message received", { message });

    switch (message.type) {
      case "authenticated":
        // Server confirmed authentication
        if (message.userId) {
          setSessionId(message.userId);
          addMessage(
            "system",
            `Authenticated as user: ${message.userId.slice(0, 8)}...`,
          );
        }
        break;

      case "message_received":
        // Server acknowledged receipt of our message - don't show in chat
        // Keep isProcessing true, but note we've started
        break;

      case "ready":
        // Server acknowledged the connection establishment
        break;

      case "error":
        setIsProcessing(false);
        addMessage("error", `Error: ${JSON.stringify(message.error) || "Unknown error"}`);
        break;

      // Keep old handlers for backward compatibility during transition
      case "system":
        if (message.subtype === "connection") {
        }
        break;

      case "agent_message":
        if (message.data) {
          handleAgentMessage(message.data);
        }
        break;

      case "query_complete":
        setIsProcessing(false);
        break;

      case "interrupted":
        setIsProcessing(false);
        addMessage("system", message.data?.message || "Query interrupted");
        break;

      case "session_reset":
        setMessages([]);
        sessionIdRef.current = null;
        setSessionId(null);
        addMessage("system", "Session has been reset");
        break;

      case "tool_start":
        // Handle tool start
        setHasReceivedResponse(true); // We've received some response
        if (message.data?.tool_name) {
          const toolName = message.data.tool_name;
          const toolCallId = message.data?.tool_call_id || `tool-${Date.now()}`;
          const toolInput = message.data?.tool_input;

          // Handle "thinking" tools (Task) separately
          if (isThinkingTool(toolName)) {
            // Clean up any incomplete read-only tools
            setMessages((prev) =>
              prev.filter(msg =>
                !(msg.type === "tool" && !msg.isComplete && msg.toolName && isReadOnlyTool(msg.toolName))
              )
            );
            addThinkingMessage(toolName, toolCallId, toolInput, "running");
          } else if (isReadOnlyTool(toolName)) {
            // For read-only tools, check if we can consolidate with the last message
            setMessages((prev) => {
              const lastMessage = prev[prev.length - 1];

              // If the last message is an incomplete read-only tool of the same type, update it with history
              if (
                lastMessage &&
                lastMessage.type === "tool" &&
                !lastMessage.isComplete &&
                lastMessage.toolName &&
                isReadOnlyTool(lastMessage.toolName) &&
                lastMessage.toolName.toLowerCase() === toolName.toLowerCase()
              ) {
                // Consolidate - update the existing message with new tool input in history
                const updatedHistory = [...(lastMessage.toolHistory || []), toolInput];
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMessage,
                    toolInput, // Update to show most recent
                    toolHistory: updatedHistory,
                  },
                ];
              }

              // Otherwise, remove any incomplete read-only tools and add this one
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
                  toolHistory: [toolInput], // Start history with first invocation
                },
              ];
            });
          } else {
            // For action tools, add them to the chat as persistent badges
            // First, clean up any incomplete read-only tools
            setMessages((prev) =>
              prev.filter(msg =>
                !(msg.type === "tool" && !msg.isComplete && msg.toolName && isReadOnlyTool(msg.toolName))
              )
            );
            addToolMessage(toolName, toolCallId, toolInput, "running");
          }
        }
        break;

      case "tool_complete":
        // Handle tool completion
        if (message.data?.tool_name) {
          const toolName = message.data.tool_name;
          const toolCallId = message.data?.tool_call_id || "";

          if (isThinkingTool(toolName)) {
            // For thinking tools, mark as complete
            updateThinkingMessage(toolCallId, "success");
          } else if (isReadOnlyTool(toolName)) {
            // For read-only tools, remove them from the chat when complete
            setMessages((prev) =>
              prev.filter(msg =>
                !(msg.type === "tool" && msg.toolCallId === toolCallId)
              )
            );
          } else {
            // For action tools, update their status to success
            updateToolMessage(toolCallId, "success");
          }
        }
        break;

      default:
        logger.debug("log", "Unknown message type", {
          messageType: message.type,
        });
    }
  };

  // Handle agent messages (streaming responses from Claude)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAgentMessage = (data: any) => {
    // Handle system init message - update session ID but don't show in chat
    if (data.type === "system" && data.subtype === "init") {
      sessionIdRef.current = data.session_id;
      setSessionId(data.session_id);
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
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMessage,
                    content: lastMessage.content + textDelta,
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
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMessage,
                    content: lastMessage.content + content.text,
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
  const addToolMessage = (toolName: string, toolCallId: string, toolInput: any, status: "running" | "success" | "error") => {
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
  const addThinkingMessage = (toolName: string, toolCallId: string, toolInput: any, status: "running" | "success" | "error") => {
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
  const sendQuery = () => {
    if (!ws || !isConnected) {
      addMessage("error", "Not connected");
      return;
    }

    const trimmedInput = inputValue.trim();
    if (!trimmedInput && uploadedImages.length === 0) {
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

  // Reset session
  const resetSession = () => {
    if (!ws || !isConnected) {
      addMessage("error", "Not connected");
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

    ws.send(
      JSON.stringify({
        type: "reset_session",
        message: "Reset session requested.",
        prototype_id: prototypeId,
        token,
      }),
    );
    setMessages([]);
    sessionIdRef.current = null;
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
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-400"
              }`}
          />
          <span className="text-sm font-medium truncate max-w-xs">{prototypeTitle}</span>
          {sessionId && (
            <span className="text-xs text-muted-foreground">
              Session: {sessionId.slice(0, 8)}...
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {isConnected ? (
            <>
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
                onClick={resetSession}
                disabled={!sessionId || isProcessing}
              >
                Reset
              </Button>
              <Button size="sm" variant="destructive" onClick={disconnect}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={connect}>
              Connect
            </Button>
          )}
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
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
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
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-lg p-3 bg-primary text-primary-foreground">
                        <pre className="whitespace-pre-wrap text-sm font-sans">
                          {message.content}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Assistant messages - no bubble, just content */}
                  {message.type === "assistant" && (
                    <div className="max-w-none">
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
                  )}

                  {/* Tool messages - sleek inline style with expandable details */}
                  {message.type === "tool" && (
                    <div className="py-1">
                      <div
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${message.status === "success"
                          ? "bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20"
                          : message.status === "error"
                            ? "bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20"
                          }`}
                        onClick={() => message.toolCallId && toggleToolExpanded(message.toolCallId)}
                      >
                        {message.status === "running" && (
                          <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
                        )}
                        {message.status === "success" && (
                          <span className="inline-block w-1.5 h-1.5 bg-current rounded-full" />
                        )}
                        {message.status === "error" && (
                          <span className="inline-block">✗</span>
                        )}
                        <span>{message.content}</span>
                        {message.toolInput && (
                          <span className="inline-block ml-0.5">
                            {message.toolCallId && expandedTools.has(message.toolCallId) ? "▼" : "▶"}
                          </span>
                        )}
                      </div>

                      {/* Expandable tool details */}
                      {message.toolCallId && expandedTools.has(message.toolCallId) && message.toolInput && (
                        <div className="mt-1 ml-4 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                          {/* Show history for ephemeral tools (read-only) */}
                          {message.toolHistory && message.toolHistory.length > 1 && (
                            <div className="mb-2">
                              <div className="font-semibold mb-1">History ({message.toolHistory.length} invocations):</div>
                              <div className="space-y-1 max-h-40 overflow-y-auto">
                                {message.toolHistory.map((historyItem, idx) => {
                                  const sanitized = sanitizeValue(historyItem);
                                  return (
                                    <div key={idx} className="pl-2 border-l-2 border-muted-foreground/20 font-mono">
                                      {sanitized.pattern && (
                                        <div><span className="font-semibold">pattern:</span> {sanitized.pattern}</div>
                                      )}
                                      {sanitized.file_path && (
                                        <div><span className="font-semibold">file:</span> {sanitized.file_path}</div>
                                      )}
                                      {sanitized.command && (
                                        <div><span className="font-semibold">command:</span> {sanitized.command}</div>
                                      )}
                                      {/* Show any other parameters */}
                                      {Object.entries(sanitized).map(([key, value]) => {
                                        if (['pattern', 'file_path', 'command', 'description'].includes(key)) return null;
                                        return (
                                          <div key={key}>
                                            <span className="font-semibold">{key}:</span> {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Show most recent invocation details */}
                          {!message.toolHistory || message.toolHistory.length === 1 ? (
                            <div className="font-mono">
                              {message.toolInput.command && (
                                <div className="mb-1">
                                  <span className="font-semibold">Command: </span>
                                  <span>{sanitizeFilePath(message.toolInput.command)}</span>
                                </div>
                              )}
                              {Object.entries(message.toolInput).map(([key, value]) => {
                                if (key === 'command' || key === 'description') return null;
                                const sanitizedValue = sanitizeValue(value);
                                return (
                                  <div key={key} className="mb-1">
                                    <span className="font-semibold">{key}: </span>
                                    <span>{typeof sanitizedValue === 'object' ? JSON.stringify(sanitizedValue, null, 2) : String(sanitizedValue)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs opacity-75 mt-1">Most recent shown in history above</div>
                          )}
                        </div>
                      )}
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
    </div>
  );
}
