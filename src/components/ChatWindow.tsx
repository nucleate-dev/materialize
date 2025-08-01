"use client";
import {
  extractExecutionPlan,
  logPlanningExtraction,
  PlanningExtractionResult,
} from "@/lib/utils/code/planningExtractor";
import {
  CodeBracketIcon,
  EyeIcon,
  EyeSlashIcon,
  PaperAirplaneIcon,
  PlayIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import React, { useEffect, useRef, useState } from "react";
import PlanningView from "./PlanningView";
import { Database } from "@/lib/types/database.types";

type PrototypeChatMessage =
  Database["public"]["Tables"]["prototype_chat_messages"]["Row"];

interface ChatWindowProps {
  // Legacy props for backward compatibility - will be removed after full migration
  messages?: PrototypeChatMessage[];
  onSendMessage?: (message: string) => void;
  isLoading?: boolean;

  // New props for AI SDK integration
  currentCode?: string;
  phase?: "planning" | "execution" | "step_execution";
  snackFiles?: Record<string, { contents: string; type: "CODE" | "ASSET" }>;
  stepOperation?: {
    id: string;
    type: "create" | "modify" | "delete" | "move";
    title: string;
    description: string;
    filePath: string;
    newFilePath?: string;
  };
  chatSessionId?: string;
  onClearChat: () => void;
}

export default function ChatWindow({
  // Legacy props
  messages: legacyMessages = [],
  onSendMessage,
  isLoading: legacyIsLoading = false,
  onClearChat,
}: ChatWindowProps) {
  // Legacy input state for custom message handling
  const [input, setInput] = useState("");

  // Use legacy messages
  const messages = legacyMessages;
  const isLoading = legacyIsLoading;

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const [expandedCodeBlocks, setExpandedCodeBlocks] = useState<Set<string>>(
    new Set(),
  );
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [planningData, setPlanningData] = useState<
    Map<string, PlanningExtractionResult>
  >(new Map());
  const [currentExecutingOperation, setCurrentExecutingOperation] = useState<
    string | null
  >(null);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      // Always use the legacy implementation for now since it has the custom phase logic
      if (onSendMessage) {
        onSendMessage(input.trim());
        setInput(""); // Clear input after sending
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

  const togglePlanVisibility = (messageId: string) => {
    setExpandedPlans((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const handleExecutePlannedStep = async (operationId: string) => {
    const message = messages.find((msg) => {
      const planData = planningData.get(msg.id);
      return planData?.operations.some((op) => op.id === operationId);
    });

    if (!message) return;

    const planData = planningData.get(message.id);
    if (!planData) return;

    // Find the operation
    const operation = planData.operations.find((op) => op.id === operationId);
    if (!operation) return;

    // Get execution steps for this operation
    const stepOperations = planData.executionSteps[operationId];
    if (!stepOperations) {
      console.warn(`No execution steps found for operation ${operationId}`);
      return;
    }

    setCurrentExecutingOperation(operationId);

    try {
      // Update operation status to in_progress
      setPlanningData((prev) => {
        const newMap = new Map(prev);
        const messageData = newMap.get(message.id);
        if (messageData) {
          const updatedOperations = messageData.operations.map((op) =>
            op.id === operationId
              ? { ...op, status: "in_progress" as const }
              : op,
          );
          newMap.set(message.id, {
            ...messageData,
            operations: updatedOperations,
          });
        }
        return newMap;
      });

      // Update operation status to completed
      setPlanningData((prev) => {
        const newMap = new Map(prev);
        const messageData = newMap.get(message.id);
        if (messageData) {
          const updatedOperations = messageData.operations.map((op) =>
            op.id === operationId
              ? { ...op, status: "completed" as const }
              : op,
          );
          newMap.set(message.id, {
            ...messageData,
            operations: updatedOperations,
          });
        }
        return newMap;
      });

      // Show a success message based on operation type
      console.log(
        `✅ ${operation.type === "create" ? "Created" : operation.type === "modify" ? "Updated" : operation.type === "delete" ? "Deleted" : "Moved"} ${operation.filePath}`,
      );
    } catch (error) {
      console.error(`Error executing operation ${operationId}:`, error);

      // Update operation status to error
      setPlanningData((prev) => {
        const newMap = new Map(prev);
        const messageData = newMap.get(message.id);
        if (messageData) {
          const updatedOperations = messageData.operations.map((op) =>
            op.id === operationId
              ? {
                  ...op,
                  status: "error" as const,
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                }
              : op,
          );
          newMap.set(message.id, {
            ...messageData,
            operations: updatedOperations,
          });
        }
        return newMap;
      });
    } finally {
      setCurrentExecutingOperation(null);
    }
  };

  const renderMessageContent = (message: PrototypeChatMessage) => {
    const messageContent = message.content;
    const isCodeVisible = expandedCodeBlocks.has(message.id);
    const hasCodeBlocks = messageContent.includes("```");

    // Determine message type
    const isPlanningMessage = message.content.includes("EXECUTION_PLAN");
    const isExecutionMessage = message.content.includes("EXECUTION_STEP");

    // For planning messages, don't show any content - the plan UI handles everything
    if (isPlanningMessage) {
      return null;
    }

    // For execution messages, show a clean implementation message
    if (isExecutionMessage) {
      return (
        <div className="text-slate-700 dark:text-slate-300">
          {hasCodeBlocks && (
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-sm">
              <div className="flex items-center gap-2">
                <CodeBracketIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="font-medium text-green-800 dark:text-green-200">
                  Code ready to apply
                </span>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
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
          <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <CodeBracketIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span className="font-medium">Code available</span>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMessage = (message: PrototypeChatMessage) => {
    const isUser = message.role === "user";
    const planData = planningData.get(message.id);

    // Determine message type
    const isPlanningMessage =
      !isUser && message.content.includes("EXECUTION_PLAN");
    const isExecutionMessage =
      !isUser && message.content.includes("EXECUTION_STEP");

    return (
      <div
        key={message.id}
        className={`mb-6 flex ${isUser ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-2 fade-in duration-500`}
      >
        <div className={`max-w-[85%] group ${isUser ? "mr-2" : "ml-2"}`}>
          {/* Message Bubble */}
          <div
            className={`relative p-5 rounded-2xl transition-all duration-200 ${
              isUser
                ? "bg-blue-600 dark:bg-blue-700 text-white shadow-sm"
                : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-sm"
            }`}
          >
            {/* Message bubble tail */}
            <div
              className={`absolute w-4 h-4 transform rotate-45 ${
                isUser
                  ? "-right-2 top-6 bg-blue-600 dark:bg-blue-700"
                  : "-left-2 top-6 bg-white dark:bg-slate-800 border-l border-t border-slate-200 dark:border-slate-700"
              }`}
            ></div>

            <div className="relative z-10">
              {/* Message Type Badge */}
              {!isUser && (isPlanningMessage || isExecutionMessage) && (
                <div className="mb-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                      isPlanningMessage
                        ? "bg-blue-100 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-700"
                        : "bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-700"
                    }`}
                  >
                    {isPlanningMessage
                      ? "📋 Planning Phase"
                      : "⚡ Code Implementation"}
                  </span>
                </div>
              )}

              {/* Planning Summary at the top (more prominent) */}
              {!isUser && planData && planData.hasPlan && (
                <div className="mb-4">
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-blue-600 dark:bg-blue-700">
                        <PlayIcon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-bold text-blue-900 dark:text-blue-100 text-base">
                          📋 This is the plan:
                        </h4>
                        <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                          {planData.operations.length} step
                          {planData.operations.length !== 1 ? "s" : ""} planned
                          for execution
                        </p>
                      </div>
                    </div>

                    {/* Compact plan overview */}
                    <div className="space-y-2">
                      {planData.operations.map((operation, index) => (
                        <div
                          key={operation.id}
                          className="flex items-center gap-3 text-sm"
                        >
                          <div className="w-6 h-6 rounded-full bg-blue-600 dark:bg-blue-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <span className="font-medium text-blue-800 dark:text-blue-200 uppercase text-xs tracking-wide">
                              {operation.type}
                            </span>
                            <span className="text-blue-700 dark:text-blue-300 ml-2">
                              {operation.title}
                            </span>
                          </div>
                          <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800/50 rounded text-xs text-blue-700 dark:text-blue-300">
                            {operation.filePath}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {renderMessageContent(message)}

              {/* Detailed Planning View */}
              {!isUser && planData && planData.hasPlan && (
                <PlanningView
                  operations={planData.operations}
                  isExpanded={expandedPlans.has(message.id)}
                  onToggleExpanded={() => togglePlanVisibility(message.id)}
                  onExecuteStep={handleExecutePlannedStep}
                  currentExecutingId={currentExecutingOperation}
                />
              )}

              {/* Action Buttons Container */}
              {!isUser && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {/* Show/Hide Code Toggle */}
                  {message.content.includes("```") && (
                    <button
                      onClick={() => toggleCodeVisibility(message.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-slate-300 dark:border-slate-600"
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
                className={`text-xs mt-3 font-medium ${
                  isUser
                    ? "text-white/70 dark:text-white/60"
                    : "text-slate-500 dark:text-slate-400"
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
    // Call legacy clear function
    onClearChat();
    setShowClearConfirmation(false);
  };

  const handleClearCancel = () => {
    setShowClearConfirmation(false);
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-2/20 via-whiter/30 to-gray-3/20 dark:from-boxdark-2/20 dark:via-boxdark/30 dark:to-meta-4/20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/2 via-secondary/2 to-meta-3/2 dark:from-primary/3 dark:via-secondary/3 dark:to-meta-3/3"></div>
      </div>

      {/* Header */}
      <div className="relative flex-shrink-0 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
        {/* Header gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-meta-3/5 via-meta-5/5 to-meta-6/5 dark:from-meta-3/10 dark:via-meta-5/10 dark:to-meta-6/10"></div>

        <div className="relative p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 shadow-lg shadow-blue-500/25 dark:shadow-blue-600/40 ring-1 ring-white/20 dark:ring-blue-400/30">
                <SparklesIcon className="w-6 h-6 text-white drop-shadow-sm" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 drop-shadow-sm">
                  React Native Assistant
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  AI-powered code companion ✨
                </p>
              </div>
            </div>

            {messages.length > 0 && (
              <button
                onClick={() => setShowClearConfirmation(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-200 dark:border-red-800/50 group"
                title="Clear chat"
              >
                <TrashIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                Clear Chat
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="relative flex-1 min-h-0 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-track-slate-100 scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 dark:scrollbar-track-slate-800 dark:scrollbar-thumb-slate-600 dark:hover:scrollbar-thumb-slate-500">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 dark:from-blue-600/30 dark:via-purple-600/30 dark:to-pink-600/30 rounded-full blur-2xl animate-pulse"></div>
              <div className="relative p-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 shadow-2xl shadow-blue-500/40 dark:shadow-blue-600/60 ring-1 ring-white/20 dark:ring-blue-400/30 mx-auto w-24 h-24 flex items-center justify-center">
                <SparklesIcon className="w-12 h-12 text-white animate-pulse" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">
              👋 Welcome to your AI Assistant!
            </h3>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto leading-relaxed">
              Ask me to create React Native components, screens, or modify
              existing code.
            </p>
            <div className="space-y-3 max-w-lg mx-auto">
              <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-700/50 rounded-2xl border border-slate-200/50 dark:border-slate-600/30 backdrop-blur-sm">
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  💡 Try: "Create a todo list component" or "Add a red
                  background to the view"
                </p>
              </div>
            </div>
          </div>
        )}

        {messages.map(renderMessage)}

        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] ml-2">
              <div className="p-5 rounded-3xl bg-white/95 dark:bg-slate-800/95 border border-slate-200/50 dark:border-slate-600/30 backdrop-blur-xl shadow-lg dark:shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-bounce"></div>
                    <div
                      className="w-3 h-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-3 h-3 bg-gradient-to-r from-pink-500 to-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                  <span className="text-slate-600 dark:text-slate-400 text-sm font-medium">
                    AI is crafting your code...
                  </span>
                  <SparklesIcon className="w-5 h-5 text-blue-500 dark:text-blue-400 animate-spin" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Section */}
      <div className="relative flex-shrink-0 p-6 border-t border-slate-200/50 dark:border-slate-700/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
        {/* Animated background */}
        <div className="absolute inset-0 opacity-30 dark:opacity-50 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-meta-3/10 dark:from-primary/20 dark:via-secondary/20 dark:to-meta-3/20"></div>
        </div>

        <form onSubmit={handleSubmit} className="relative flex gap-4 items-end">
          {/* Input Container */}
          <div className="flex-1 relative group">
            {/* Enhanced background blur effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/60 to-slate-100/60 dark:from-slate-700/40 dark:to-slate-800/60 rounded-2xl blur-sm transform scale-105 opacity-0 group-hover:opacity-100 transition-all duration-500"></div>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to create or modify React Native code... ✨"
              className="relative w-full px-6 py-4 pr-16 rounded-2xl text-sm font-medium transition-all duration-500 focus:scale-[1.02] transform-gpu bg-white/95 dark:bg-slate-800/95 text-slate-900 dark:text-slate-100 border-2 border-slate-200/50 dark:border-slate-600/60 focus:border-blue-500/70 dark:focus:border-blue-400/70 focus:bg-white dark:focus:bg-slate-700/95 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-blue-400/50 shadow-lg dark:shadow-2xl hover:shadow-xl dark:hover:shadow-slate-900/50 backdrop-blur-xl hover:border-blue-500/30 dark:hover:border-blue-400/50 resize-none"
              rows={1}
              style={{ minHeight: "56px", maxHeight: "160px" }}
              disabled={isLoading}
            />

            {/* Input decoration */}
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 transition-all duration-300 group-hover:scale-110 pointer-events-none">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-400 dark:to-purple-400 rounded-full blur-sm opacity-0 group-hover:opacity-50 dark:group-hover:opacity-70 transition-opacity duration-300"></div>
                <SparklesIcon className="relative w-6 h-6 text-slate-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors duration-300" />
              </div>
            </div>
          </div>

          {/* Send Button */}
          <div className="relative">
            {input.trim() && (
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 dark:from-blue-600 dark:via-purple-600 dark:to-pink-600 rounded-2xl blur-lg opacity-60 dark:opacity-80 animate-pulse"></div>
            )}

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`relative p-4 rounded-2xl transition-all duration-500 hover:scale-110 active:scale-95 focus:scale-110 transform-gpu ${
                input.trim()
                  ? "bg-gradient-to-br from-blue-500 via-purple-500 to-blue-600 dark:from-blue-600 dark:via-purple-600 dark:to-blue-700 hover:from-blue-600 hover:via-purple-600 hover:to-blue-700 dark:hover:from-blue-700 dark:hover:via-purple-700 dark:hover:to-blue-800 text-white shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60 dark:shadow-blue-600/60 dark:hover:shadow-blue-600/80 ring-2 ring-white/20 dark:ring-blue-400/30 hover:ring-white/30 dark:hover:ring-blue-400/50"
                  : "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800/50 dark:to-slate-900/50 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-inner border border-slate-200 dark:border-slate-600/30"
              }`}
            >
              {/* Button inner glow */}
              {input.trim() && (
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent dark:from-white/10 dark:to-blue-900/20 pointer-events-none"></div>
              )}

              <PaperAirplaneIcon
                className={`relative w-6 h-6 transition-transform duration-300 ${
                  input.trim()
                    ? "hover:translate-x-0.5 hover:-translate-y-0.5"
                    : ""
                }`}
              />
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Modal */}
      {showClearConfirmation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full mx-4 animate-in zoom-in-95 fade-in duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/30">
                    <TrashIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Clear Chat
                  </h3>
                </div>
                <button
                  onClick={handleClearCancel}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-5 h-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                Are you sure you want to clear all chat messages? This action
                cannot be undone and will permanently delete your conversation
                history.
              </p>

              {/* Modal Actions */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleClearCancel}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearConfirm}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white font-medium rounded-lg transition-colors shadow-lg hover:shadow-red-500/25"
                >
                  Clear Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
