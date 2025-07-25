"use client";

import { APPLY_CODE_IMMEDIATELY } from "@/GlobalConstants";
import React, { useEffect, useRef, useState } from "react";
import {
  ChatMessage,
  CodeExtractionResult,
  EditOperation,
  EditOperationResult,
} from "@/lib/types/chat";
import { extractCodeFromMessage } from "@/lib/utils/code/codeExtractor";
import {
  extractEditOperationsFromMessage,
  logEditOperations,
} from "@/lib/utils/code/editExtractor";
import {
  SparklesIcon,
  PaperAirplaneIcon,
  CodeBracketIcon,
  EyeIcon,
  EyeSlashIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onApplyWithToggle: (
    result: CodeExtractionResult,
    editResult: EditOperationResult
  ) => void;
  useGranularEdits: boolean;
  onToggleGranularEdits: (value: boolean) => void;
  isLoading: boolean;
}

export default function ChatWindow({
  messages,
  onSendMessage,
  onApplyWithToggle,
  useGranularEdits,
  onToggleGranularEdits,
  isLoading,
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState("");
  const [expandedCodeBlocks, setExpandedCodeBlocks] = useState<Set<string>>(
    new Set()
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-apply code when APPLY_CODE_IMMEDIATELY is true
  useEffect(() => {
    if (!APPLY_CODE_IMMEDIATELY) return;

    // Get the last message
    const lastMessage = messages[messages.length - 1];

    // Only process assistant messages (not user messages)
    if (!lastMessage || lastMessage.role === "user") return;

    // Check if this message has applicable content
    const editResult = extractEditOperationsFromMessage(lastMessage.content);
    const codeResult = extractCodeFromMessage(lastMessage.content);
    const hasApplicableContent = editResult.hasOperations || codeResult.hasCode;

    if (hasApplicableContent) {
      // Apply the code automatically
      handleApplyCode(lastMessage.content);
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleApplyCode = (message: string) => {
    const editResult = extractEditOperationsFromMessage(message);
    const codeResult = extractCodeFromMessage(message);

    if (editResult.hasOperations) {
      logEditOperations(editResult.operations);
    }

    // Use the toggle-aware handler
    onApplyWithToggle(codeResult, editResult);
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

  const renderMessageContent = (
    message: ChatMessage,
    editResult: EditOperationResult
  ) => {
    const messageContent = editResult.hasOperations
      ? editResult.message
      : message.content;
    const isCodeVisible = expandedCodeBlocks.has(message.id);
    const hasCodeBlocks = messageContent.includes("```");

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
          <div className="mt-3 p-3 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-700/50 border border-slate-200 dark:border-slate-600/30 rounded-xl text-sm text-slate-600 dark:text-slate-300 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <CodeBracketIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span className="font-medium">Code available</span>
              <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse"></div>
              {APPLY_CODE_IMMEDIATELY && (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  (Auto-applied to preview)
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === "user";

    // Try edit operations first, then fallback to code extraction
    const editResult = extractEditOperationsFromMessage(message.content);
    const codeResult = extractCodeFromMessage(message.content);

    const hasApplicableContent = editResult.hasOperations || codeResult.hasCode;

    return (
      <div
        key={message.id}
        className={`mb-6 flex ${isUser ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-2 fade-in duration-500`}
      >
        <div className={`max-w-[85%] group ${isUser ? "mr-2" : "ml-2"}`}>
          {/* Message Bubble */}
          <div
            className={`relative p-5 rounded-3xl transition-all duration-300 hover:scale-[1.02] transform-gpu ${
              isUser
                ? "bg-gradient-to-br from-blue-500 via-purple-500 to-blue-600 dark:from-blue-600 dark:via-purple-600 dark:to-blue-700 text-white shadow-xl shadow-blue-500/25 dark:shadow-blue-600/40 ring-1 ring-white/20 dark:ring-blue-400/30"
                : "bg-white/95 dark:bg-slate-800/95 text-slate-900 dark:text-slate-100 border border-slate-200/50 dark:border-slate-600/30 backdrop-blur-xl shadow-lg dark:shadow-2xl hover:bg-white dark:hover:bg-slate-700/95 hover:shadow-xl dark:hover:shadow-slate-900/50"
            }`}
          >
            {/* Message bubble tail */}
            <div
              className={`absolute w-4 h-4 transform rotate-45 ${
                isUser
                  ? "-right-2 top-6 bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700"
                  : "-left-2 top-6 bg-white/95 dark:bg-slate-800/95 border-l border-t border-slate-200/50 dark:border-slate-600/30"
              }`}
            ></div>

            {/* Enhanced inner glow for user messages */}
            {isUser && (
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/10 to-transparent dark:from-white/5 dark:to-blue-900/20 pointer-events-none"></div>
            )}

            <div className="relative z-10">
              {renderMessageContent(message, editResult)}

              {/* Action Buttons Container */}
              {!isUser && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {/* Show/Hide Code Toggle */}
                  {message.content.includes("```") && (
                    <button
                      onClick={() => toggleCodeVisibility(message.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-600 dark:hover:to-slate-500 transition-all duration-300 hover:scale-105 shadow-sm hover:shadow-md border border-slate-300/50 dark:border-slate-500/30"
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

                  {/* Apply Code Button or Auto-Applied Indicator */}
                  {!APPLY_CODE_IMMEDIATELY && hasApplicableContent && (
                    <button
                      onClick={() => handleApplyCode(message.content)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 dark:from-emerald-600 dark:to-green-700 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-green-700 dark:hover:from-emerald-700 dark:hover:to-green-800 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl shadow-emerald-500/25 dark:shadow-emerald-600/40 ring-1 ring-white/20"
                    >
                      <PlayIcon className="w-4 h-4" />
                      {useGranularEdits && editResult.hasOperations
                        ? `Apply Changes (${editResult.operations.length})`
                        : `Apply Code (${codeResult.codeBlocks.length})`}
                    </button>
                  )}

                  {/* Auto-Applied Indicator */}
                  {APPLY_CODE_IMMEDIATELY && hasApplicableContent && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-600 dark:to-emerald-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-green-500/25 dark:shadow-green-600/40 ring-1 ring-white/20">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      Code Auto-Applied
                    </div>
                  )}
                </div>
              )}

              {/* Operation Details */}
              {!isUser && editResult.hasOperations && (
                <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-amber-50/80 to-orange-50/80 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200/50 dark:border-amber-700/30 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 dark:from-amber-600 dark:to-orange-600">
                      <SparklesIcon className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-semibold text-amber-800 dark:text-amber-200 text-sm">
                      Operations Preview
                    </span>
                  </div>
                  <div className="space-y-2">
                    {editResult.operations.map((op: EditOperation, index: number) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 text-sm text-amber-700 dark:text-amber-300"
                      >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 dark:from-amber-500 dark:to-orange-500 flex items-center justify-center text-white text-xs font-bold mt-0.5 flex-shrink-0">
                          {index + 1}
                        </div>
                        <div>
                          <span className="font-medium uppercase text-xs tracking-wide text-amber-600 dark:text-amber-400">
                            {op.type}
                          </span>
                          <p className="mt-1 leading-relaxed">{op.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Debug Info */}
              {!isUser &&
                (message.content.includes("```") ||
                  message.content.includes("[")) &&
                !hasApplicableContent && (
                  <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200/50 dark:border-red-700/30 text-red-700 dark:text-red-300 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="font-medium">
                        Debug: Content detected but not recognized as applicable code
                      </span>
                    </div>
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
                {message.timestamp.toLocaleTimeString([], {
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

  return (
    <div className="flex flex-col h-full relative">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-white to-slate-100/50 dark:from-slate-900/50 dark:via-slate-800/30 dark:to-slate-900/50">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 dark:from-blue-600/10 dark:via-purple-600/10 dark:to-pink-600/10 animate-pulse"></div>
      </div>

      {/* Header */}
      <div className="relative flex-shrink-0 p-6 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
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

          {/* Edit Mode Toggle */}
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Edit mode:
            </span>
            <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => onToggleGranularEdits(true)}
                className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  useGranularEdits
                    ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                }`}
              >
                {useGranularEdits && (
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-white/20 to-transparent pointer-events-none"></div>
                )}
                <span className="relative">Granular</span>
              </button>
              <button
                onClick={() => onToggleGranularEdits(false)}
                className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  !useGranularEdits
                    ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                }`}
              >
                {!useGranularEdits && (
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-white/20 to-transparent pointer-events-none"></div>
                )}
                <span className="relative">Full File</span>
              </button>
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Ask me to create or modify React Native code
          <span className="inline-flex items-center gap-1 ml-2 px-3 py-1 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 rounded-full text-xs font-medium">
            {useGranularEdits ? "🎯 Precise edits" : "📄 Full files"}
          </span>
        </p>
      </div>

      {/* Messages */}
      <div className="relative flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-track-slate-100 scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 dark:scrollbar-track-slate-800 dark:scrollbar-thumb-slate-600 dark:hover:scrollbar-thumb-slate-500">
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
              Ask me to create React Native components, screens, or modify existing code.
            </p>
            <div className="space-y-3 max-w-lg mx-auto">
              <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-700/50 rounded-2xl border border-slate-200/50 dark:border-slate-600/30 backdrop-blur-sm">
                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                  💡 Try: "Create a todo list component" or "Add a red background to the view"
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
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 dark:from-blue-600/20 dark:via-purple-600/20 dark:to-pink-600/20 animate-pulse"></div>
        </div>

        <form onSubmit={handleSubmit} className="relative flex gap-4 items-end">
          {/* Input Container */}
          <div className="flex-1 relative group">
            {/* Enhanced background blur effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/60 to-slate-100/60 dark:from-slate-700/40 dark:to-slate-800/60 rounded-2xl blur-sm transform scale-105 opacity-0 group-hover:opacity-100 transition-all duration-500"></div>

            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
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
            {inputValue.trim() && (
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 dark:from-blue-600 dark:via-purple-600 dark:to-pink-600 rounded-2xl blur-lg opacity-60 dark:opacity-80 animate-pulse"></div>
            )}

            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className={`relative p-4 rounded-2xl transition-all duration-500 hover:scale-110 active:scale-95 focus:scale-110 transform-gpu ${
                inputValue.trim()
                  ? "bg-gradient-to-br from-blue-500 via-purple-500 to-blue-600 dark:from-blue-600 dark:via-purple-600 dark:to-blue-700 hover:from-blue-600 hover:via-purple-600 hover:to-blue-700 dark:hover:from-blue-700 dark:hover:via-purple-700 dark:hover:to-blue-800 text-white shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60 dark:shadow-blue-600/60 dark:hover:shadow-blue-600/80 ring-2 ring-white/20 dark:ring-blue-400/30 hover:ring-white/30 dark:hover:ring-blue-400/50"
                  : "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800/50 dark:to-slate-900/50 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-inner border border-slate-200 dark:border-slate-600/30"
              }`}
            >
              {/* Button inner glow */}
              {inputValue.trim() && (
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent dark:from-white/10 dark:to-blue-900/20 pointer-events-none"></div>
              )}

              <PaperAirplaneIcon
                className={`relative w-6 h-6 transition-transform duration-300 ${
                  inputValue.trim()
                    ? "hover:translate-x-0.5 hover:-translate-y-0.5"
                    : ""
                }`}
              />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}