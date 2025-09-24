// @ts-nocheck
"use client";

import { supabase } from "@/ClientConstants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useFileSystem } from "@/hooks/useFileSystem";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useProductLogger } from "@/lib/loggers/ClientProductLogger";
import type {
  APIResponse,
  ChatMessage,
  ChatRequestBody,
  ChatStreamEvent,
  CreatePrototypeRequestBody,
  CreatePrototypeSuccessResponse,
  CreatePrototypeErrorResponse,
} from "@/lib/types/serverAPITypes";
import { Database } from "@/lib/types/supabase";
import {
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  PlayIcon,
  SparklesIcon,
  StopIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

type Prototype = Database["public"]["Tables"]["prototypes"]["Row"];
type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];
type PrototypeAsset = Database["public"]["Tables"]["prototype_assets"]["Row"];

interface SSEEvent {
  id: string;
  timestamp: Date;
  type: string;
  data: unknown;
  raw: string;
}

interface RequestLog {
  id: string;
  timestamp: Date;
  type: "request" | "response" | "error";
  data: unknown;
}

export default function ChatTestPage() {
  const user = useRequireAuth();
  const logger = useProductLogger();

  // Prototype state
  const [prototype, setPrototype] = useState<Prototype | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [prototypeName, setPrototypeName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // File system integration
  const fileSystem = useFileSystem(prototype?.id, "App.js");

  // Chat state
  const [chatSession, setChatSession] = useState<string>(uuidv4());
  const [serverEndpoint, setServerEndpoint] = useState(
    process.env.NEXT_PUBLIC_SERVER_ENDPOINT || "http://localhost:3000"
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  // Debug state
  const [sseEvents, setSseEvents] = useState<SSEEvent[]>([]);
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [showEvents, setShowEvents] = useState(false);
  const [showLogs, setShowLogs] = useState(true); // Show logs by default for debugging
  const [showFileTree, setShowFileTree] = useState(true); // Show files by default
  const [showClearChatDialog, setShowClearChatDialog] = useState(false);

  const addRequestLog = (type: "request" | "response" | "error", data: unknown) => {
    const log: RequestLog = {
      id: uuidv4(),
      timestamp: new Date(),
      type,
      data,
    };
    setRequestLogs((prev) => [log, ...prev].slice(0, 100)); // Keep last 100 logs
  };

  const addSSEEvent = (type: string, data: unknown, raw: string) => {
    const event: SSEEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      type,
      data,
      raw,
    };
    setSseEvents((prev) => [event, ...prev].slice(0, 200)); // Keep last 200 events
  };

  const handleCreatePrototype = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prototypeName.trim() || !user) return;

    setIsCreating(true);
    addRequestLog("request", {
      endpoint: "/prototype/create",
      body: { name: prototypeName.trim() },
      serverEndpoint,
    });

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error("No authentication token available");
      }

      addRequestLog("request", {
        message: "Making request to create prototype",
        url: `${serverEndpoint}/prototype/create`,
        hasToken: !!token,
      });

      const response = await fetch(`${serverEndpoint}/prototype/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: prototypeName.trim(),
          visibility: "PUBLIC",
        } as CreatePrototypeRequestBody),
      });

      const result: APIResponse<
        CreatePrototypeSuccessResponse,
        CreatePrototypeErrorResponse
      > = await response.json();

      addRequestLog("response", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        result,
      });

      if (result.data) {
        addRequestLog("request", {
          message: "Fetching created prototype from database",
          prototypeId: result.data.prototype_id,
        });

        // Fetch the created prototype
        const { data: prototypeData, error } = await supabase
          .from("prototypes")
          .select("*")
          .eq("id", result.data.prototype_id)
          .single();

        if (error) {
          addRequestLog("error", {
            message: "Failed to fetch prototype from database",
            error,
          });
          throw new Error(`Database error: ${error.message}`);
        }

        if (prototypeData) {
          addRequestLog("response", {
            message: "Successfully fetched prototype",
            prototype: prototypeData,
          });

          setPrototype(prototypeData);
          setPrototypeName("");
          setShowCreateModal(false);
          // Reset chat session for new prototype
          setChatSession(uuidv4());
          setMessages([]);
          setSseEvents([]);
          // Don't clear request logs so we can see the creation process
        } else {
          throw new Error("No prototype data returned");
        }
      } else {
        addRequestLog("error", {
          message: "Prototype creation failed",
          error: result.error,
        });
        throw new Error(result.error?.error || "Failed to create prototype");
      }
    } catch (error) {
      logger.debug("error", "Error creating prototype:", { error });
      addRequestLog("error", {
        message: "Prototype creation failed",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || !prototype || !fileSystem.state.files) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: currentMessage.trim(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setCurrentMessage("");

    // Disconnect existing connection
    if (eventSource) {
      eventSource.close();
    }

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error("No authentication token available");
      }

      // Prepare request body
      const requestBody: ChatRequestBody = {
        messages: newMessages,
        inputFiles: fileSystem.state.files,
        inputAssets: fileSystem.state.assets,
        chat_session_id: chatSession,
        prototype_id: prototype.id,
      };

      addRequestLog("request", {
        endpoint: "/chat",
        body: requestBody,
        headers: { Authorization: "Bearer ***" },
      });

      // Create EventSource for streaming
      const url = new URL(`${serverEndpoint}/chat`);
      const es = new EventSource(url.toString(), {
        // Note: EventSource doesn't support custom headers, so we'll use fetch instead
      });

      // Use fetch for the actual request since EventSource doesn't support POST with custom headers
      const response = await fetch(`${serverEndpoint}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      setIsConnected(true);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Read the stream
      const readStream = async () => {
        let assistantBuffer = ''; // Buffer for streaming deltas

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                addSSEEvent("data", data, line);

                try {
                  const event: ChatStreamEvent = JSON.parse(data);

                  // Handle different event types
                  switch (event.type) {
                    case "chat_response_delta":
                      // Handle streaming text deltas
                      const delta = (event as any).content || '';
                      assistantBuffer += delta;

                      // Render progressively: append to last assistant message or create new one
                      setMessages(prev => {
                        const last = prev[prev.length - 1];
                        if (last?.role === 'assistant') {
                          const copy = [...prev];
                          copy[copy.length - 1] = { ...last, content: (last.content || '') + delta };
                          return copy;
                        }
                        return [...prev, { role: 'assistant', content: delta }];
                      });
                      break;

                    case "chat_response":
                      // Handle final response (use buffer if content is empty)
                      const finalContent = (event as any).content || assistantBuffer;
                      if (finalContent) {
                        setMessages(prev => {
                          const last = prev[prev.length - 1];
                          if (last?.role === 'assistant') {
                            const copy = [...prev];
                            copy[copy.length - 1] = { ...last, content: finalContent };
                            return copy;
                          }
                          return [...prev, { role: 'assistant', content: finalContent }];
                        });
                      }
                      assistantBuffer = ''; // Reset buffer
                      break;

                    case "tool_call":
                      // Show that a tool is being called as a chat message
                      const toolName = (event as any).tool || (event as any).toolName || 'Unknown tool';
                      setMessages(prev => {
                        const last = prev[prev.length - 1];
                        if (last?.role === 'assistant') {
                          const copy = [...prev];
                          copy[copy.length - 1] = { ...last, content: `🔧 **Using ${toolName}**...` };
                          return copy;
                        }
                        return [...prev, { role: 'assistant', content: `🔧 **Using ${toolName}**...` }];
                      });
                      break;

                    case "tool_result":
                      // Show tool completion in chat
                      const toolName2 = (event as any).tool || (event as any).toolName || 'Tool';
                      setMessages(prev => {
                        const last = prev[prev.length - 1];
                        if (last?.role === 'assistant' && last.content.includes('🔧')) {
                          const copy = [...prev];
                          copy[copy.length - 1] = { ...last, content: `✅ **${toolName2}** completed` };
                          return copy;
                        }
                        return prev;
                      });
                      break;

                    case "chat_complete":
                      // Chat is finished
                      assistantBuffer = ''; // Reset buffer
                      break;

                    case "usage_update":
                      // Handle usage update if needed
                      console.log("Usage update:", event);
                      break;

                    case "execution_plan_created":
                      // Show execution plan in chat
                      const plan = (event as any).result?.plan;
                      if (plan && Array.isArray(plan)) {
                        setMessages(prev => [
                          ...prev,
                          {
                            role: 'assistant',
                            content: `📋 **Execution Plan Created:**\n${plan.map((step, i) => `${i + 1}. ${step}`).join('\n')}`,
                          },
                        ]);
                      }
                      break;

                    case "step_completed":
                      // Show step completion in chat
                      const stepNum = (event as any).result?.step;
                      const summary = (event as any).result?.summary;
                      if (stepNum && summary) {
                        setMessages(prev => [
                          ...prev,
                          {
                            role: 'assistant',
                            content: `✅ **Step ${stepNum} Complete:** ${summary}`,
                          },
                        ]);
                      }
                      break;

                    case "error":
                      setMessages((prev) => [
                        ...prev,
                        {
                          role: "assistant",
                          content: `❌ **Error:** ${(event as any).error}`,
                        },
                      ]);
                      break;

                    // Legacy events for backward compatibility
                    case "planning":
                      setMessages((prev) => [
                        ...prev,
                        {
                          role: "assistant",
                          content: `**Planning Phase:**\n${(event as any).content}`,
                        },
                      ]);
                      break;

                    case "execution_complete":
                      if ((event as any).updatedFiles) {
                        fileSystem.applyAndPersistFileUpdates({
                          updatedFiles: (event as any).updatedFiles,
                        });
                      }
                      setMessages((prev) => [
                        ...prev,
                        {
                          role: "assistant",
                          content: "🎉 **Execution Complete!** All operations finished successfully.",
                        },
                      ]);
                      break;

                    case "dispatch_complete":
                      setMessages((prev) => [
                        ...prev,
                        {
                          role: "assistant",
                          content: (event as any).success
                            ? "✅ **Build Complete:** Files updated successfully"
                            : `❌ **Build Failed:** ${(event as any).error}`,
                        },
                      ]);
                      break;

                    case "viewing_url":
                      setMessages((prev) => [
                        ...prev,
                        {
                          role: "assistant",
                          content: `🔗 **Viewing URL:** ${(event as any).viewing_url}`,
                        },
                      ]);
                      break;
                  }
                } catch (parseError) {
                  addSSEEvent("parse_error", parseError, line);
                }
              }
            }
          }
        } catch (streamError) {
          addRequestLog("error", {
            error: streamError instanceof Error ? streamError.message : String(streamError),
          });
        } finally {
          setIsConnected(false);
        }
      };

      readStream();
    } catch (error) {
      logger.debug("error", "Error sending message:", { error });
      addRequestLog("error", {
        error: error instanceof Error ? error.message : String(error),
      });
      setIsConnected(false);
    }
  };

  const handleDisconnect = () => {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    setIsConnected(false);
  };

  const clearLogs = () => {
    setRequestLogs([]);
    setSseEvents([]);
  };

  const clearChat = () => {
    setMessages([]);
    setChatSession(uuidv4());
    setCurrentMessage("");
    // Disconnect any active connection
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
    setIsConnected(false);
  };

  // Debug file system state changes (with dependency tracking to avoid infinite loops)
  useEffect(() => {
    const logData = {
      message: "File system state changed",
      prototypeId: prototype?.id,
      filesLoaded: !!fileSystem.state.files,
      filesCount: fileSystem.state.files ? Object.keys(fileSystem.state.files).length : 0,
      assetsLoaded: !!fileSystem.state.assets,
      assetsCount: fileSystem.state.assets ? Object.keys(fileSystem.state.assets).length : 0,
      selectedFile: fileSystem.state.selectedFile,
      isLoading: fileSystem.state.isLoading,
    };

    // Only log if there's actually a meaningful change
    if (prototype?.id || fileSystem.state.files || fileSystem.state.assets) {
      console.log("File system state:", logData);
    }
  }, [
    prototype?.id,
    !!fileSystem.state.files,
    fileSystem.state.files ? Object.keys(fileSystem.state.files).length : 0,
    !!fileSystem.state.assets,
    fileSystem.state.assets ? Object.keys(fileSystem.state.assets).length : 0,
    fileSystem.state.isLoading,
  ]);

  const exportSession = () => {
    const sessionData = {
      prototype,
      messages,
      sseEvents,
      requestLogs,
      chatSession,
      fileSystemState: fileSystem.state,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-test-session-${chatSession}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">ChatEngine Test</h1>
            <p className="text-muted-foreground">Test the chat API with real prototypes</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={exportSession} variant="outline" size="sm">
              <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
              Export Session
            </Button>
            <Button onClick={() => setShowClearChatDialog(true)} variant="outline" size="sm">
              <TrashIcon className="w-4 h-4 mr-2" />
              Clear Chat
            </Button>
            <Button onClick={clearLogs} variant="outline" size="sm">
              <TrashIcon className="w-4 h-4 mr-2" />
              Clear Logs
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Prototype & Configuration */}
          <div className="space-y-6">
            {/* Prototype Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SparklesIcon className="w-5 h-5" />
                  Test Prototype
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {prototype ? (
                  <div className="space-y-2">
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="font-medium">{prototype.name}</div>
                      <div className="text-sm text-muted-foreground">
                        ID: {prototype.id}
                      </div>
                    </div>
                    <Button
                      onClick={() => setShowCreateModal(true)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      Create New Test Prototype
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setShowCreateModal(true)}
                    className="w-full"
                  >
                    <SparklesIcon className="w-4 h-4 mr-2" />
                    Create Test Prototype
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="server-endpoint">Server Endpoint</Label>
                  <Input
                    id="server-endpoint"
                    value={serverEndpoint}
                    onChange={(e) => setServerEndpoint(e.target.value)}
                    placeholder="http://localhost:3000"
                  />
                </div>
                <div>
                  <Label htmlFor="chat-session">Chat Session ID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="chat-session"
                      value={chatSession}
                      onChange={(e) => setChatSession(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => setChatSession(uuidv4())}
                      variant="outline"
                      size="sm"
                    >
                      New
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-sm text-muted-foreground">
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* File System Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DocumentTextIcon className="w-5 h-5" />
                  File System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {prototype ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${fileSystem.state.files ? 'bg-green-500' : 'bg-yellow-500'
                        }`} />
                      <span className="text-sm">
                        Files: {fileSystem.state.files ? Object.keys(fileSystem.state.files).length : 'Loading...'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${fileSystem.state.assets ? 'bg-green-500' : 'bg-yellow-500'
                        }`} />
                      <span className="text-sm">
                        Assets: {fileSystem.state.assets ? Object.keys(fileSystem.state.assets).length : 'Loading...'}
                      </span>
                    </div>

                    {/* Chat readiness indicator */}
                    <div className="p-2 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${(fileSystem.state.files && fileSystem.state.assets && Object.keys(fileSystem.state.files).length > 0)
                          ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                        <span className="text-sm font-medium">
                          {(fileSystem.state.files && fileSystem.state.assets && Object.keys(fileSystem.state.files).length > 0)
                            ? 'Ready for Chat' : 'Not Ready'}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {!fileSystem.state.files && 'Files not loaded'}
                        {!fileSystem.state.assets && !fileSystem.state.files && ' | '}
                        {!fileSystem.state.assets && 'Assets not loaded'}
                        {fileSystem.state.files && fileSystem.state.assets && Object.keys(fileSystem.state.files).length === 0 && 'No files found'}
                        {(fileSystem.state.files && fileSystem.state.assets && Object.keys(fileSystem.state.files).length > 0) && 'All systems ready'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Create a prototype to see file system status
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detailed File List */}
            {prototype && fileSystem.state.files && Object.keys(fileSystem.state.files).length > 0 && (
              <Collapsible open={showFileTree} onOpenChange={setShowFileTree}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CodeBracketIcon className="w-5 h-5" />
                          File Contents ({Object.keys(fileSystem.state.files).length})
                        </div>
                        <ChevronDownIcon className="w-4 h-4" />
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>
                      <ScrollArea className="h-80">
                        <div className="space-y-3">
                          {Object.entries(fileSystem.state.files).map(([path, file]) => (
                            <div key={path} className="border rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-mono text-sm font-medium">{path}</div>
                                <Badge variant="outline" className="text-xs">
                                  {file.contents ? `${file.contents.length} chars` : 'No content'}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <div>ID: {file.id || 'No ID'}</div>
                                <div>Prototype: {file.prototype_id || 'No prototype ID'}</div>
                                {file.created_at && (
                                  <div>Created: {new Date(file.created_at).toLocaleString()}</div>
                                )}
                              </div>
                              {file.contents && (
                                <details className="mt-2">
                                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                    Show content preview
                                  </summary>
                                  <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto max-h-32 overflow-y-auto">
                                    {file.contents.slice(0, 500)}{file.contents.length > 500 && '...'}
                                  </pre>
                                </details>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}
          </div>

          {/* Middle Column - Chat */}
          <div className="lg:col-span-1">
            <Card className="h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ChatBubbleLeftRightIcon className="w-5 h-5" />
                  Chat Interface
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {/* Messages */}
                <ScrollArea className="flex-1 mb-4">
                  <div className="space-y-4">
                    {messages.map((message, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg ${message.role === "user"
                          ? "bg-primary text-primary-foreground ml-4"
                          : "bg-muted mr-4"
                          }`}
                      >
                        <div className="text-sm font-medium mb-1">
                          {message.role === "user" ? "You" : "Assistant"}
                        </div>
                        <div className="text-sm whitespace-pre-wrap">
                          {message.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Input */}
                <div className="space-y-2">
                  <Textarea
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="min-h-[80px]"
                    disabled={!prototype || !fileSystem.state.files}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSendMessage}
                      disabled={!currentMessage.trim() || !prototype || !fileSystem.state.files || isConnected}
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
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Debug */}
          <div className="space-y-6">
            {/* SSE Events */}
            <Collapsible open={showEvents} onOpenChange={setShowEvents}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CodeBracketIcon className="w-5 h-5" />
                        SSE Events ({sseEvents.length})
                      </div>
                      <ChevronDownIcon className="w-4 h-4" />
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <div className="space-y-2">
                        {sseEvents.map((event) => (
                          <div key={event.id} className="text-xs">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {event.type}
                              </Badge>
                              <span className="text-muted-foreground">
                                {event.timestamp.toLocaleTimeString()}
                              </span>
                            </div>
                            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                              {event.raw}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Request Logs */}
            <Collapsible open={showLogs} onOpenChange={setShowLogs}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DocumentTextIcon className="w-5 h-5" />
                        Request Logs ({requestLogs.length})
                      </div>
                      <ChevronDownIcon className="w-4 h-4" />
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <div className="space-y-2">
                        {requestLogs.map((log) => (
                          <div key={log.id} className="text-xs">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge
                                variant={log.type === "error" ? "destructive" : "outline"}
                                className="text-xs"
                              >
                                {log.type}
                              </Badge>
                              <span className="text-muted-foreground">
                                {log.timestamp.toLocaleTimeString()}
                              </span>
                            </div>
                            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        </div>
      </div>

      {/* Create Prototype Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Test Prototype</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreatePrototype} className="space-y-4">
            <div>
              <Label htmlFor="prototype-name">Prototype Name</Label>
              <Input
                id="prototype-name"
                value={prototypeName}
                onChange={(e) => setPrototypeName(e.target.value)}
                placeholder="e.g. Chat Test Prototype"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={!prototypeName.trim() || isCreating}
                className="flex-1"
              >
                {isCreating ? "Creating..." : "Create Prototype"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Clear Chat Confirmation Dialog */}
      <Dialog open={showClearChatDialog} onOpenChange={setShowClearChatDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to clear the chat? This will remove all messages and start a new chat session. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  clearChat();
                  setShowClearChatDialog(false);
                }}
                variant="destructive"
                className="flex-1"
              >
                Clear Chat
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowClearChatDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}