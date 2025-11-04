"use client";

import { supabase } from "@/ClientConstants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

interface ClaudeCodePanelProps {
  prototypeId: string;
  baseTunnelUrl: string | null;
}

interface Message {
  id: string;
  type: "user" | "assistant" | "system" | "error";
  content: string;
  timestamp: number;
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
  };
  subtype?: string;
}

export default function ClaudeCodePanel({ prototypeId, baseTunnelUrl }: ClaudeCodePanelProps) {
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

      const wsUrl = `${baseTunnelUrl}/code/ws/`;
      logger.debug("log", "WebSocket URL", { wsUrl, baseTunnelUrl, prototypeId });

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
        addMessage("system", "Connected to Claude Code");
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
        // Server acknowledged receipt of our message
        setIsProcessing(false);
        if (message.timestamp) {
          addMessage(
            "system",
            `Message received at ${new Date(message.timestamp).toLocaleTimeString()}`,
          );
        }
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
          addMessage(
            "system",
            `Connection ID: ${message.data?.connectionId || "unknown"}`,
          );
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

      default:
        logger.debug("log", "Unknown message type", {
          messageType: message.type,
        });
    }
  };

  // Handle agent messages (streaming responses from Claude)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleAgentMessage = (data: any) => {
    // Handle system init message
    if (data.type === "system" && data.subtype === "init") {
      const isNewSession = sessionIdRef.current !== data.session_id;
      sessionIdRef.current = data.session_id;
      setSessionId(data.session_id);
      if (isNewSession) {
        addMessage("system", `Session initialized: ${data.session_id}`);
      }
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

      // Handle content block start (for tool use)
      else if (event.type === "content_block_start") {
        if (event.content_block?.type === "tool_use") {
          addMessage("system", `Tool: ${event.content_block.name || "unknown"}`);
        }
      }

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
          } else if (content.type === "tool_use") {
            addMessage("system", `Tool: ${content.name || "unknown"}`);
          }
        }
      }
      return;
    }

    // Handle result messages
    if (data.type === "result") {
      if (data.subtype === "success") {
        addMessage("system", `Query completed (${data.num_turns} turns, $${data.total_cost_usd?.toFixed(4) || "0.0000"})`);
      } else if (data.subtype === "error_max_turns") {
        addMessage("error", "Maximum turns reached");
      } else if (data.subtype === "error_during_execution") {
        addMessage("error", "Error during execution");
      }
      return;
    }

    // Handle legacy formats for backward compatibility
    if (data.type === "text_delta" || data.type === "text") {
      const content = data.content || data.text || "";
      if (content) {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.type === "assistant") {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: lastMessage.content + content,
              },
            ];
          } else {
            return [
              ...prev,
              {
                id: Date.now().toString(),
                type: "assistant",
                content,
                timestamp: Date.now(),
              },
            ];
          }
        });
      }
      return;
    }

    if (data.type === "tool_use") {
      addMessage("system", `Tool: ${data.tool_name || "unknown"}`);
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

  // Send a query to Claude
  const sendQuery = () => {
    if (!ws || !isConnected) {
      addMessage("error", "Not connected to Claude Code");
      return;
    }

    const trimmedInput = inputValue.trim();
    if (!trimmedInput) {
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

    const userMessage = trimmedInput;
    addMessage("user", userMessage);
    setInputValue("");
    setIsProcessing(true);

    // Send message in the format expected by CodeService
    ws.send(
      JSON.stringify({
        type: "query",
        data: {
          prompt: userMessage,
        },
      }),
    );
  };

  // Interrupt current query
  const interruptQuery = () => {
    if (!ws || !isConnected) {
      addMessage("error", "Not connected to Claude Code");
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
      addMessage("error", "Not connected to Claude Code");
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
          <span className="text-sm font-medium">Claude Code</span>
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
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              Connect to start chatting with Claude Code
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === "user" ? "justify-end" : "justify-start"
                  }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${message.type === "user"
                    ? "bg-primary text-primary-foreground"
                    : message.type === "error"
                      ? "bg-destructive/10 text-destructive"
                      : message.type === "system"
                        ? "bg-muted text-muted-foreground text-xs"
                        : "bg-muted"
                    }`}
                >
                  {message.type === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        components={{
                          // Customize code blocks
                          code: ({ node, inline, className, children, ...props }) => (
                            <code
                              className={`${inline ? "bg-muted px-1 py-0.5 rounded text-xs" : "block bg-muted p-2 rounded my-2 overflow-x-auto"} ${className || ""}`}
                              {...props}
                            >
                              {children}
                            </code>
                          ),
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
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm font-sans">
                      {message.content}
                    </pre>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
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
            disabled={!isConnected || !inputValue.trim() || isProcessing}
          >
            {isProcessing ? "..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
