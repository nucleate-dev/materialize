"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  fetchChatMessages,
  fetchChatSessions,
  fetchRecentPrototypes,
  type ChatMessage,
  type ChatSession,
  type RecentPrototype,
} from "@/lib/chat-recreation-api";

type UiMessage = {
  id: string;
  type: "user" | "assistant" | "system" | "error" | "tool" | "usage";
  content: string;
  timestamp: number;
  toolName?: string;
  toolCallId?: string;
  isComplete?: boolean;
  status?: "running" | "success" | "error";
  toolInput?: unknown;
  imageUrls?: string[];
  creditsUsed?: number;
  raw: unknown;
};

type ToolEventData = {
  tool_name?: string;
  tool_call_id?: string;
  tool_input?: unknown;
};

function mapMessages(rawMessages: ChatMessage[]): UiMessage[] {
  const uiMessages: UiMessage[] = [];

  for (const dbMessage of rawMessages) {
    if (dbMessage.message_type === "text") {
      const roleType =
        dbMessage.role === "assistant"
          ? "assistant"
          : dbMessage.role === "user"
            ? "user"
            : "system";
      const message: UiMessage = {
        id: String(dbMessage.id),
        type: roleType,
        content: dbMessage.content,
        timestamp: new Date(dbMessage.created_at).getTime(),
        imageUrls: dbMessage.resolved_image_urls ?? [],
        raw: dbMessage,
      };
      uiMessages.push(message);

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
          raw: {
            credits_used: creditsUsed,
            source_message_id: dbMessage.id,
          },
        });
      }
      continue;
    }

    if (
      dbMessage.message_type === "tool_use" &&
      dbMessage.event_type === "tool_start"
    ) {
      const eventData = dbMessage.event_data as ToolEventData;
      uiMessages.push({
        id: `tool-${eventData?.tool_call_id || dbMessage.id}`,
        type: "tool",
        content: dbMessage.content,
        timestamp: new Date(dbMessage.created_at).getTime(),
        toolName: eventData?.tool_name,
        toolCallId: eventData?.tool_call_id,
        isComplete: false,
        status: "running",
        toolInput: eventData?.tool_input,
        raw: { tool_start: dbMessage },
      });
      continue;
    }

    if (
      dbMessage.message_type === "tool_result" &&
      dbMessage.event_type === "tool_complete"
    ) {
      const eventData = dbMessage.event_data as ToolEventData;
      const toolCallId = eventData?.tool_call_id;
      const toolMessageIndex = uiMessages.findIndex(
        (msg) =>
          msg.type === "tool" &&
          msg.toolCallId === toolCallId &&
          !msg.isComplete,
      );

      if (toolMessageIndex !== -1) {
        const existing = uiMessages[toolMessageIndex];
        uiMessages[toolMessageIndex] = {
          ...existing,
          isComplete: true,
          status: "success",
          raw: {
            ...(existing.raw as Record<string, unknown>),
            tool_complete: dbMessage,
          },
        };
      }
      continue;
    }

    if (dbMessage.message_type === "error") {
      uiMessages.push({
        id: String(dbMessage.id),
        type: "error",
        content: dbMessage.content,
        timestamp: new Date(dbMessage.created_at).getTime(),
        raw: dbMessage,
      });
      continue;
    }

    if (dbMessage.message_type === "system") {
      uiMessages.push({
        id: String(dbMessage.id),
        type: "system",
        content: dbMessage.content,
        timestamp: new Date(dbMessage.created_at).getTime(),
        raw: dbMessage,
      });
      continue;
    }
  }

  return uiMessages;
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function messageTypeVariant(type: UiMessage["type"]) {
  switch (type) {
    case "assistant":
      return "secondary";
    case "user":
      return "default";
    case "tool":
      return "outline";
    case "usage":
      return "secondary";
    case "error":
      return "destructive";
    case "system":
      return "outline";
    default:
      return "default";
  }
}

export default function ChatRecreationPage() {
  const [prototypeId, setPrototypeId] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentPrototypes, setRecentPrototypes] = useState<RecentPrototype[]>(
    [],
  );
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(
    new Set(),
  );

  const uiMessages = useMemo(() => mapMessages(messages), [messages]);

  const loadSessionsFor = async (value: string) => {
    if (!value.trim()) {
      setError("Enter a prototype ID first.");
      return;
    }

    try {
      setError(null);
      setLoadingSessions(true);
      const data = await fetchChatSessions(value.trim());
      setSessions(data.sessions);
      const nextSession = data.sessions[0];
      if (nextSession) {
        setSelectedSessionId(nextSession.id);
        await loadMessages(nextSession.id);
      } else {
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadSessions = async () => loadSessionsFor(prototypeId);

  const loadMessages = async (sessionId: string) => {
    try {
      setError(null);
      setLoadingMessages(true);
      const data = await fetchChatMessages(sessionId);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages.");
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadRecentPrototypes = async () => {
    try {
      setLoadingRecent(true);
      const data = await fetchRecentPrototypes();
      setRecentPrototypes(data.prototypes);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load recent prototypes.",
      );
    } finally {
      setLoadingRecent(false);
    }
  };

  const toggleDetails = (messageId: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  useEffect(() => {
    loadRecentPrototypes();
  }, []);

  return (
    <>
      <PageHeader
        title="Chat Recreation"
        breadcrumbs={[{ title: "Chat Recreation" }]}
      />

      <div className="flex-1 space-y-6 p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Lookup</CardTitle>
            <CardDescription>
              Enter a prototype ID to load its chat sessions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                placeholder="prototype_id"
                value={prototypeId}
                onChange={(event) => setPrototypeId(event.target.value)}
                className="max-w-xl"
              />
              <Button
                onClick={loadSessions}
                disabled={loadingSessions || !prototypeId.trim()}
              >
                {loadingSessions ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Load Sessions
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={
                  recentPrototypes.some(
                    (prototype) => prototype.id === prototypeId,
                  )
                    ? prototypeId
                    : ""
                }
                onValueChange={(value) => {
                  setPrototypeId(value);
                  loadSessionsFor(value);
                }}
                disabled={recentPrototypes.length === 0}
              >
                <SelectTrigger className="min-w-[360px]">
                  <SelectValue placeholder="Recent prototypes" />
                </SelectTrigger>
                <SelectContent>
                  {recentPrototypes.map((prototype) => (
                    <SelectItem key={prototype.id} value={prototype.id}>
                      {prototype.name || "Untitled"} ({prototype.id}){" "}
                      {prototype.owner_email
                        ? `- ${prototype.owner_email}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={loadRecentPrototypes}
                disabled={loadingRecent}
              >
                {loadingRecent ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Refresh List
              </Button>
              <Select
                value={selectedSessionId ?? ""}
                onValueChange={async (value) => {
                  setSelectedSessionId(value);
                  await loadMessages(value);
                }}
                disabled={sessions.length === 0}
              >
                <SelectTrigger className="min-w-[320px]">
                  <SelectValue placeholder="Select a session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.created_at
                        ? `${new Date(session.created_at).toLocaleString()}`
                        : "Unknown time"}{" "}
                      • {session.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSessionId && (
                <Button
                  variant="outline"
                  onClick={() => loadMessages(selectedSessionId)}
                  disabled={loadingMessages}
                >
                  {loadingMessages ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Refresh Messages
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
            <CardDescription>
              {selectedSessionId
                ? `${uiMessages.length} messages`
                : "Select a session to view messages"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingMessages && (
              <div className="text-sm text-muted-foreground">
                Loading messages...
              </div>
            )}
            {!loadingMessages && uiMessages.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No messages to show.
              </div>
            )}
            {uiMessages.length > 0 && (
              <div className="rounded-xl border bg-accent/20 p-4">
                <div className="space-y-3 max-w-3xl mx-auto">
                  {uiMessages.map((message, index) => {
                    const isExpanded = expandedMessageIds.has(message.id);
                    const isUser = message.type === "user";
                    return (
                      <div
                        key={`${message.id}-${index}`}
                        className={`group flex flex-col gap-1 ${
                          isUser ? "items-end" : "items-start"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={messageTypeVariant(message.type)}>
                            {message.type}
                          </Badge>
                          <span>{formatTimestamp(message.timestamp)}</span>
                          <span>&#8226; {message.id}</span>
                          {message.type === "tool" && message.toolName && (
                            <Badge variant="outline">{message.toolName}</Badge>
                          )}
                          {message.type === "tool" && message.status && (
                            <Badge variant="secondary">{message.status}</Badge>
                          )}
                        </div>

                        {message.type === "user" && (
                          <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm border bg-white dark:bg-slate-800 border-border text-foreground">
                            <pre className="whitespace-pre-wrap break-words font-sans">
                              {message.content}
                            </pre>
                            {message.imageUrls &&
                              message.imageUrls.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {message.imageUrls.map((url, imageIndex) => (
                                    <img
                                      key={`${message.id}-image-${imageIndex}`}
                                      src={url}
                                      alt="Chat attachment"
                                      className="h-20 w-auto rounded border object-cover"
                                    />
                                  ))}
                                </div>
                              )}
                          </div>
                        )}

                        {message.type === "assistant" && (
                          <div className="w-full max-w-none px-1">
                            <div className="rounded-xl border bg-background px-4 py-3 text-sm leading-relaxed">
                              <div className="prose prose-sm max-w-none dark:prose-invert">
                                <ReactMarkdown>{message.content}</ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        )}

                        {message.type === "tool" && (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent/50 border border-border w-fit max-w-full">
                            <div
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                message.status === "error"
                                  ? "bg-red-500"
                                  : message.status === "running"
                                    ? "bg-indigo-500 animate-pulse"
                                    : "bg-emerald-500"
                              }`}
                            />
                            <code className="text-xs font-mono text-muted-foreground truncate max-w-[200px] sm:max-w-md">
                              {message.content}
                            </code>
                          </div>
                        )}

                        {message.type === "error" && (
                          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                            {message.content}
                          </div>
                        )}

                        {message.type === "system" && (
                          <div className="text-xs text-muted-foreground px-1">
                            {message.content}
                          </div>
                        )}

                        {message.type === "usage" && (
                          <div className="text-xs text-muted-foreground/60 px-1">
                            {message.content}
                          </div>
                        )}

                        <div className="flex items-center justify-end w-full">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleDetails(message.id)}
                          >
                            {isExpanded ? "Hide Details" : "Show Details"}
                          </Button>
                        </div>

                        {isExpanded && (
                          <Textarea
                            readOnly
                            value={JSON.stringify(message.raw, null, 2)}
                            className="font-mono text-xs min-h-[160px]"
                          />
                        )}

                        <Separator />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
