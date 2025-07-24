'use client';

import Editor from '@monaco-editor/react';
import { useState } from 'react';
import ChatWindow from '../../components/ChatWindow';
import ExpoSnackViewer from '../../components/ExpoSnackViewer';
import { getDefaultSnackFiles } from '../../templates/defaultApp';
import { ChatMessage, CodeExtractionResult, SnackFiles } from '../../types/chat';
import { updateSnackFiles } from '../../utils/codeExtractor';

export default function CreatePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [snackFiles, setSnackFiles] = useState<SnackFiles>(getDefaultSnackFiles());
  const [isChatView, setIsChatView] = useState(true);
  const [mainAppCode, setMainAppCode] = useState(snackFiles['App.js']?.contents || '');

  const handleSendMessage = async (content: string) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          currentCode: mainAppCode,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);

      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please make sure your Google AI API key is configured and try again.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyCode = (result: CodeExtractionResult) => {
    if (result.hasCode) {
      const newFiles = updateSnackFiles(snackFiles, result.codeBlocks);
      setSnackFiles(newFiles);

      // Update the main app code if it was modified
      if (newFiles['App.js']) {
        setMainAppCode(newFiles['App.js'].contents);
      }
    }
  };

  const handleFilesChange = (files: SnackFiles) => {
    setSnackFiles(files);
    if (files['App.js']) {
      setMainAppCode(files['App.js'].contents);
    }
  };

  const handleCodeChange = (value: string | undefined) => {
    if (value !== undefined) {
      setMainAppCode(value);

      // Update the snack files with the new code
      const updatedFiles = {
        ...snackFiles,
        'App.js': {
          ...snackFiles['App.js'],
          contents: value,
        },
      };
      setSnackFiles(updatedFiles);
    }
  };

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Left Panel - 40% width */}
      <div className="w-2/5 min-w-[400px] flex flex-col">
        {/* Toggle Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              {isChatView ? 'AI Assistant' : 'Code Editor'}
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsChatView(true)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${isChatView
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
              >
                Chat
              </button>
              <button
                onClick={() => setIsChatView(false)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${!isChatView
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
              >
                Code
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {isChatView ? (
            <ChatWindow
              messages={messages}
              onSendMessage={handleSendMessage}
              onApplyCode={handleApplyCode}
              isLoading={isLoading}
            />
          ) : (
            <div className="h-full">
              <Editor
                height="100%"
                defaultLanguage="javascript"
                value={mainAppCode}
                onChange={handleCodeChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                  folding: true,
                  lineDecorationsWidth: 10,
                  lineNumbersMinChars: 3,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Expo Snack Viewer - 60% width */}
      <div className="w-3/5 min-w-[500px]">
        <ExpoSnackViewer
          files={snackFiles}
          onFilesChange={handleFilesChange}
        />
      </div>
    </div>
  );
}