'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, CodeExtractionResult, EditOperationResult } from '../types/chat';
import { extractCodeFromMessage } from '../utils/codeExtractor';
import { extractEditOperationsFromMessage, logEditOperations } from '../utils/editExtractor';

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onApplyWithToggle: (result: CodeExtractionResult, editResult: EditOperationResult) => void;
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
  isLoading
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState('');
  const [expandedCodeBlocks, setExpandedCodeBlocks] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
    setExpandedCodeBlocks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const renderMessageContent = (message: ChatMessage, editResult: EditOperationResult) => {
    const messageContent = editResult.hasOperations ? editResult.message : message.content;
    const isCodeVisible = expandedCodeBlocks.has(message.id);
    const hasCodeBlocks = messageContent.includes('```');

    if (!hasCodeBlocks) {
      return <div className="whitespace-pre-wrap break-words">{messageContent}</div>;
    }

    if (isCodeVisible) {
      return <div className="whitespace-pre-wrap break-words">{messageContent}</div>;
    }

    // Hide code blocks - show only text before first code block
    const parts = messageContent.split('```');
    const textBeforeCode = parts[0].trim();
    const codeBlockCount = Math.floor((parts.length - 1) / 2);

    return (
      <div>
        <div className="whitespace-pre-wrap break-words">{textBeforeCode}</div>
        {codeBlockCount > 0 && (
          <div className="mt-2 p-2 bg-gray-50 border rounded text-sm text-gray-600">
            📝 {codeBlockCount} code block{codeBlockCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    );
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';

    // Try edit operations first, then fallback to code extraction
    const editResult = extractEditOperationsFromMessage(message.content);
    const codeResult = extractCodeFromMessage(message.content);

    const hasApplicableContent = editResult.hasOperations || codeResult.hasCode;

    // Debug logging to help identify issues
    if (!isUser && (message.content.includes('```') || message.content.includes('['))) {
      console.log('Message analysis:', {
        hasEditOps: editResult.hasOperations,
        editOpsCount: editResult.operations.length,
        hasCode: codeResult.hasCode,
        codeBlocksCount: codeResult.codeBlocks.length,
        messageContent: message.content.substring(0, 200) + '...'
      });
    }

    return (
      <div key={message.id} className={`mb-4 ${isUser ? 'text-right' : 'text-left'}`}>
        <div
          className={`inline-block max-w-[80%] rounded-lg px-4 py-2 ${isUser
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900 border'
            }`}
        >
          {renderMessageContent(message, editResult)}

          {/* Show/Hide Code Toggle */}
          {!isUser && message.content.includes('```') && (
            <button
              onClick={() => toggleCodeVisibility(message.id)}
              className="mt-2 mr-2 bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 transition-colors"
            >
              {expandedCodeBlocks.has(message.id) ? 'Hide Code' : 'Show Code'}
            </button>
          )}

          {!isUser && hasApplicableContent && (
            <button
              onClick={() => handleApplyCode(message.content)}
              className="mt-2 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
            >
              {useGranularEdits && editResult.hasOperations
                ? `Apply Changes (${editResult.operations.length} operation${editResult.operations.length !== 1 ? 's' : ''})`
                : `Apply Code (${codeResult.codeBlocks.length} file${codeResult.codeBlocks.length !== 1 ? 's' : ''})`
              }
            </button>
          )}

          {/* Show operation details for edit operations */}
          {!isUser && editResult.hasOperations && (
            <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
              <div className="font-medium mb-1">Operations:</div>
              {editResult.operations.map((op, index) => (
                <div key={index} className="mb-1">
                  • {op.type.toUpperCase()}: {op.description}
                </div>
              ))}
            </div>
          )}

          {/* Debug info for messages with code blocks */}
          {!isUser && (message.content.includes('```') || message.content.includes('[')) && !hasApplicableContent && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
              Debug: Content detected but not recognized as React Native code or edit operations
            </div>
          )}
        </div>

        <div className={`text-xs text-gray-500 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white border-r">
      {/* Header */}
      <div className="border-b p-4 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">React Native Assistant</h2>

          {/* Edit Mode Toggle */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Edit mode:</span>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => onToggleGranularEdits(true)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${useGranularEdits
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
              >
                Granular
              </button>
              <button
                onClick={() => onToggleGranularEdits(false)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${!useGranularEdits
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
              >
                Full File
              </button>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          Ask me to create or modify React Native code
          {useGranularEdits
            ? ' (using precise edits)'
            : ' (returning full updated files)'}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg mb-2">👋 Welcome!</p>
            <p>Ask me to create React Native components, screens, or modify the existing code.</p>
            <p className="text-sm mt-4 text-gray-400">
              Try: "Create a todo list app" or "Add a red background to the view"
            </p>
          </div>
        )}

        {messages.map(renderMessage)}

        {isLoading && (
          <div className="text-left">
            <div className="inline-block bg-gray-100 rounded-lg px-4 py-2 border">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-gray-600 text-sm">AI is typing...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4 bg-gray-50">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to create or modify React Native code..."
            className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={1}
            style={{ minHeight: '40px', maxHeight: '120px' }}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}