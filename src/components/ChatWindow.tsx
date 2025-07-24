'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, CodeExtractionResult, EditOperationResult } from '../types/chat';
import { extractCodeFromMessage } from '../utils/codeExtractor';
import { extractEditOperationsFromMessage, logEditOperations } from '../utils/editExtractor';

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onApplyCode: (result: CodeExtractionResult) => void;
  onApplyEditOperations: (result: EditOperationResult) => void;
  isLoading: boolean;
}

export default function ChatWindow({ 
  messages, 
  onSendMessage, 
  onApplyCode, 
  onApplyEditOperations,
  isLoading 
}: ChatWindowProps) {
  const [inputValue, setInputValue] = useState('');
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
    // First try to extract edit operations (new granular approach)
    const editResult = extractEditOperationsFromMessage(message);
    if (editResult.hasOperations) {
      logEditOperations(editResult.operations);
      onApplyEditOperations(editResult);
      return;
    }

    // Fallback to old code extraction method for backward compatibility
    const codeResult = extractCodeFromMessage(message);
    if (codeResult.hasCode) {
      onApplyCode(codeResult);
    }
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
          className={`inline-block max-w-[80%] rounded-lg px-4 py-2 ${
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900 border'
          }`}
        >
          <div className="whitespace-pre-wrap break-words">
            {editResult.hasOperations ? editResult.message : message.content}
          </div>
          
          {!isUser && hasApplicableContent && (
            <button
              onClick={() => handleApplyCode(message.content)}
              className="mt-2 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
            >
              {editResult.hasOperations 
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
        <h2 className="text-lg font-semibold text-gray-900">React Native Assistant</h2>
        <p className="text-sm text-gray-600">Ask me to create or modify React Native code</p>
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