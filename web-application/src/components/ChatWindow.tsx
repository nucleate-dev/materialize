"use client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Database } from "@/lib/types/database.types";
import {
  extractExecutionPlan,
  logPlanningExtraction,
  PlanningExtractionResult,
} from "@/lib/utils/code/planningExtractor";
import {
  CodeBracketIcon,
  EyeIcon,
  EyeSlashIcon,
  PaperAirplaneIcon, SparklesIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import React, { useEffect, useRef, useState } from "react";

type PrototypeChatMessage =
  Database["public"]["Tables"]["prototype_chat_messages"]["Row"];

interface ChatWindowProps {
  messages: PrototypeChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  onClearChat: () => void;
  messageCount?: number;
  messageLimit?: number;
  isAtLimit?: boolean;
  loadingUsageCount?: boolean;
}

export default function ChatWindow({
  messages,
  onSendMessage,
  isLoading,
  onClearChat,
  messageCount = 0,
  messageLimit = 15,
  isAtLimit = false,
  loadingUsageCount = false,
}: ChatWindowProps) {

  // Debug logging for messages
  useEffect(() => {
    console.log("🔍 [CHAT WINDOW COMPONENT] Received messages:", {
      count: messages.length,
      messageIds: messages.map(m => m.id),
      roles: messages.map(m => m.role),
      phases: messages.map(m => m.phase || 'no_phase')
    });
  }, [messages]);
  const [input, setInput] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px";
  };

  const [expandedCodeBlocks, setExpandedCodeBlocks] = useState<Set<string>>(
    new Set(),
  );
  const [planningData, setPlanningData] = useState<
    Map<string, PlanningExtractionResult>
  >(new Map());
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    // Use a slight delay to ensure DOM updates are complete
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
        inline: "nearest",
      });
    }, 50);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Extract planning data from messages
  useEffect(() => {
    const newPlanningData = new Map<string, PlanningExtractionResult>();

    messages.forEach((message) => {
      if (message.role === "assistant") {
        const planningResult = extractExecutionPlan(message.content);
        if (planningResult.hasPlan) {
          newPlanningData.set(message.id, planningResult);
          logPlanningExtraction(planningResult);
        }
      }
    });

    // Only update if the data has actually changed
    setPlanningData((prevData) => {
      // Compare if the data is different
      if (prevData.size !== newPlanningData.size) {
        return newPlanningData;
      }

      // Check if any values are different
      for (const [key, value] of newPlanningData) {
        const prevValue = prevData.get(key);
        if (!prevValue || JSON.stringify(prevValue) !== JSON.stringify(value)) {
          return newPlanningData;
        }
      }

      // No changes, return previous data to prevent re-render
      return prevData;
    });
  }, [messages]);

  const isDisabled = !input.trim() || isLoading || isAtLimit;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading && !isAtLimit) {
      onSendMessage(input.trim());
      setInput(""); // Clear input after sending

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "56px";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleCodeVisibility = (messageId: string) => {
    setExpandedCodeBlocks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const renderMessageContent = (message: PrototypeChatMessage) => {
    const messageContent = message.content;
    const isCodeVisible = expandedCodeBlocks.has(message.id);
    const hasCodeBlocks = messageContent.includes("```");

    // Determine message type based on phase
    const isPlanningMessage = message.phase === "planning";
    const isExecutionMessage = message.phase === "execution";

    if (messageContent.includes("EXECUTION_PLAN")) {
      return null;
    }

    // For planning messages, show the content - don't return null
    if (isPlanningMessage) {
      // Show planning content
      return (
        <div className="text-slate-700 dark:text-slate-300">
          <div className="whitespace-pre-wrap">
            {messageContent}
          </div>
        </div>
      );
    }

    // For execution messages, show a clean implementation message
    if (isExecutionMessage) {
      return (
        <div className="text-slate-700 dark:text-slate-300">
          {hasCodeBlocks && (
            <div className="mt-3 p-3 bg-muted border border-border rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <CodeBracketIcon className="w-4 h-4 text-primary" />
                <span className="font-medium text-foreground">
                  Code ready to apply
                </span>
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // For regular messages, show content as before
    if (!hasCodeBlocks) {
      return (
        <div className="whitespace-pre-wrap break-words leading-relaxed">
          {messageContent}
        </div>
      );
    }

    if (isCodeVisible) {
      return (
        <div className="whitespace-pre-wrap break-words leading-relaxed">
          {messageContent}
        </div>
      );
    }

    // Hide code blocks - show only text before first code block
    const parts = messageContent.split("```");
    const textBeforeCode = parts[0].trim();

    return (
      <div>
        <div className="whitespace-pre-wrap break-words leading-relaxed">
          {textBeforeCode}
        </div>
        {parts.length > 1 && (
          <div className="mt-3 p-3 bg-muted border border-border rounded-lg text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CodeBracketIcon className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">Code available</span>
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMessage = (message: PrototypeChatMessage) => {
    const isUser = message.role === "user";
    const planData = planningData.get(message.id);

    if (isUser) {
      console.log("🐛 [DEBUG] Rendering user message:", { id: message.id, content: message.content, contentLength: message.content?.length });
    }

    return (
      <div
        key={message.id}
        className={`mb-6 flex ${isUser ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-2 fade-in duration-500`}
      >
        <div className={`max-w-[85%] group ${isUser ? "mr-2" : "ml-2"}`}>
          {/* Message Bubble */}
          <div
            className={`p-4 rounded-lg ${isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card text-card-foreground border border-border"
              }`}
          >
            <div className="relative z-10">

              {/* Planning Summary at the top (more prominent) */}
              {!isUser && planData && planData.hasPlan && (
                <div className="mb-4">
                  <div className="p-4 rounded-lg bg-muted border border-border">

                    {/* Compact plan overview */}
                    <div className="space-y-2">
                      {planData.operations.map((operation, index) => (
                        <div
                          key={operation.id}
                          className="flex items-center gap-3 text-sm"
                        >
                          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <span className="font-medium text-foreground uppercase text-xs tracking-wide">
                              {operation.type}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              {operation.title}
                            </span>
                          </div>
                          <code className="px-2 py-1 bg-muted rounded text-xs text-muted-foreground">
                            {operation.filePath}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Message Content */}
              {isUser ? (
                <div className="whitespace-pre-wrap break-words leading-relaxed">
                  {message.content}
                </div>
              ) : (
                renderMessageContent(message)
              )}

              {/* Action Buttons Container */}
              {!isUser && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {/* Show/Hide Code Toggle */}
                  {message.content.includes("```") && (
                    <button
                      onClick={() => toggleCodeVisibility(message.id)}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors border border-border"
                    >
                      {expandedCodeBlocks.has(message.id) ? (
                        <>
                          <EyeSlashIcon className="w-4 h-4" />
                          Hide Code
                        </>
                      ) : (
                        <>
                          <EyeIcon className="w-4 h-4" />
                          Show Code
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* Timestamp */}
              <div
                className={`text-xs mt-3 font-medium ${isUser
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground"
                  }`}
              >
                {new Date(message.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleClearConfirm = () => {
    onClearChat();
    setShowClearConfirmation(false);
  };

  const handleClearCancel = () => {
    setShowClearConfirmation(false);
  };

  return (
    <div
      className="relative flex flex-col bg-background h-full w-full"
      style={{
        height: "100%",
        minHeight: "100%",
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-background">
        <div className="p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-4 rounded-lg text-primary-foreground">
                <SparklesIcon className="w-4 h-4 text-foreground" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  React Native Assistant
                </h2>
              </div>
            </div>

            {messages.length > 0 && (
              <button
                onClick={() => setShowClearConfirmation(true)}
                className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg text-sm font-medium hover:bg-destructive/20 transition-colors border border-destructive/20"
                title="Clear chat"
              >
                <TrashIcon className="w-4 h-4" />
                Clear Chat
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <div className="mb-8">
              <div className="p-6 rounded-full bg-primary text-primary-foreground mx-auto w-24 h-24 flex items-center justify-center">
                <SparklesIcon className="w-12 h-12" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-3">
              Welcome to your AI Assistant!
            </h3>
            <p className="text-lg text-muted-foreground mb-6 max-w-md mx-auto leading-relaxed">
              Ask me to create React Native components, screens, or modify
              existing code.
            </p>
            <div className="space-y-3 max-w-lg mx-auto">
              <div className="p-4 bg-muted rounded-lg border border-border">
                <p className="text-sm text-muted-foreground">
                  Try: &quot;Create a todo list component&quot; or &quot;Add a
                  red background to the view&quot;
                </p>
              </div>
            </div>
          </div>
        )}

        {messages.map(renderMessage)}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] ml-2">
              <div className="p-5 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-3">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-primary rounded-full animate-bounce"></div>
                    <div
                      className="w-3 h-3 bg-primary rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-3 h-3 bg-primary rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                  <span className="text-muted-foreground text-sm font-medium">
                    AI is crafting your code...
                  </span>
                  <SparklesIcon className="w-5 h-5 text-primary animate-spin" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Section */}
      <div
        className="flex-shrink-0 p-6 border-t border-border bg-background"
        style={{
          position: "sticky",
          bottom: 0,
          backgroundColor: "var(--background)",
          zIndex: 10,
        }}
      >
        {/* Message Count Display */}
        <div className="mb-3 text-center">
          {loadingUsageCount ? (
            <p className="text-xs font-medium text-muted-foreground">
              Loading usage...
            </p>
          ) : (
            <p
              className={`text-xs font-medium ${isAtLimit
                ? "text-red-600 dark:text-red-400"
                : "text-muted-foreground"
                }`}
            >
              Messages: {messageCount}/{messageLimit}
              {isAtLimit && " (Limit reached)"}
            </p>
          )}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-4 items-center">
          {/* Input Container */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isAtLimit
                  ? "Message limit reached for this billing period"
                  : "Ask me to create or modify React Native code..."
              }
              className={`w-full px-4 py-3 pr-12 rounded-lg text-sm bg-background text-foreground border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder-muted-foreground resize-none ${isAtLimit ? "opacity-50 cursor-not-allowed" : ""
                }`}
              rows={1}
              style={{
                minHeight: "56px",
                maxHeight: "160px",
                overflow: "hidden",
              }}
              disabled={isLoading || isAtLimit}
            />

            {/* Input decoration */}
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <SparklesIcon className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={isDisabled}
            className={`p-3 rounded-lg transition-colors ${!isDisabled
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            title={
              isAtLimit
                ? "Message limit reached for this billing period"
                : undefined
            }
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </button>
        </form>
      </div>

      {/* Confirmation Modal */}
      <Dialog
        open={showClearConfirmation}
        onOpenChange={setShowClearConfirmation}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/30">
                <TrashIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <DialogTitle>Clear Chat</DialogTitle>
            </div>
          </DialogHeader>

          <div className="py-4">
            <p className="text-muted-foreground leading-relaxed">
              Are you sure you want to clear all chat messages? This action
              cannot be undone and will permanently delete your conversation
              history.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={handleClearCancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearConfirm}>
              Clear Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
