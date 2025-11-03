"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useRef, useState } from "react";

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

export default function ClaudeCodePanel({
  prototypeId,
  baseTunnelUrl,
}: ClaudeCodePanelProps) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Connect to WebSocket
  const connect = () => {
    if (!baseTunnelUrl) {
      addMessage("error", "No tunnel URL available. Please start the dev server first.");
      return;
    }

    try {
      // Convert https://abc.terminals.materializeui.com to wss://abc.terminals.materializeui.com/code/ws/:prototypeId
      const wsUrl = baseTunnelUrl
        .replace("https://", "wss://")
        .replace("http://", "ws://") + `/code/ws/${prototypeId}`;

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        setIsConnected(true);
        addMessage("system", "Connected to Claude Code");
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleServerMessage(message);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      websocket.onclose = (event) => {
        setIsConnected(false);
        addMessage("system", `Disconnected from Claude Code (code: ${event.code})`);
      };

      websocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        addMessage("error", "WebSocket connection error");
      };

      setWs(websocket);
    } catch (error) {
      addMessage("error", `Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Disconnect from WebSocket
  const disconnect = () => {
    if (ws) {
      ws.close();
      setWs(null);
      setIsConnected(false);
    }
  };

  // Handle messages from server
  const handleServerMessage = (message: any) => {
    switch (message.type) {
      case "system":
        if (message.subtype === "connection") {
          addMessage("system", `Connection ID: ${message.data.connectionId}`);
          if (message.data.sessionId) {
            setSessionId(message.data.sessionId);
            addMessage("system", `Existing session: ${message.data.sessionId}`);
          }
        }
        break;

      case "agent_message":
        handleAgentMessage(message.data);
        break;

      case "query_complete":
        setIsProcessing(false);
        addMessage("system", "Query complete");
        if (message.data.sessionId) {
          setSessionId(message.data.sessionId);
        }
        break;

      case "error":
        setIsProcessing(false);
        addMessage("error", `Error: ${message.error.message}`);
        if (message.error.details) {
          addMessage("error", `Details: ${message.error.details}`);
        }
        break;

      case "session_reset":
        setSessionId(null);
        addMessage("system", "Session has been reset");
        break;

      default:
        console.log("Unknown message type:", message);
    }
  };

  // Handle agent messages (streaming responses from Claude)
  const handleAgentMessage = (data: any) => {
    if (data.type === "system" && data.subtype === "init") {
      setSessionId(data.session_id);
      addMessage("system", `Session initialized: ${data.session_id}`);
    } else if (data.type === "text_delta" || data.type === "text") {
      // Stream text response
      const content = data.content || data.text || "";
      if (content) {
        // Append to last assistant message or create new one
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
    } else if (data.type === "tool_use") {
      addMessage("system", `Tool: ${data.tool_name || "unknown"}`);
    } else if (data.type === "result") {
      addMessage("assistant", JSON.stringify(data.result, null, 2));
    } else {
      // Log other message types for debugging
      console.log("Agent message:", data);
    }
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

    if (!inputValue.trim()) {
      return;
    }

    const userMessage = inputValue.trim();
    addMessage("user", userMessage);
    setInputValue("");
    setIsProcessing(true);

    ws.send(
      JSON.stringify({
        type: "query",
        data: {
          prompt: userMessage,
          options: {
            maxTurns: 10,
            model: "claude-sonnet-4-5",
            allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
          },
        },
      })
    );
  };

  // Reset session
  const resetSession = () => {
    if (!ws || !isConnected) {
      addMessage("error", "Not connected to Claude Code");
      return;
    }

    ws.send(JSON.stringify({ type: "reset_session" }));
    setMessages([]);
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
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-gray-400"
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
              <Button
                size="sm"
                variant="outline"
                onClick={resetSession}
                disabled={!sessionId}
              >
                Reset
              </Button>
              <Button size="sm" variant="destructive" onClick={disconnect}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={connect}
              disabled={!baseTunnelUrl}
            >
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
              {baseTunnelUrl
                ? "Connect to start chatting with Claude Code"
                : "Start dev server to enable Claude Code"}
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.type === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.type === "user"
                      ? "bg-primary text-primary-foreground"
                      : message.type === "error"
                        ? "bg-destructive/10 text-destructive"
                        : message.type === "system"
                          ? "bg-muted text-muted-foreground text-xs"
                          : "bg-muted"
                  }`}
                >
                  <pre className="whitespace-pre-wrap text-sm font-sans">
                    {message.content}
                  </pre>
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
            onKeyPress={handleKeyPress}
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
