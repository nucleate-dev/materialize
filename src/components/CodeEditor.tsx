"use client";

import React from "react";
import Editor from "@monaco-editor/react";

interface CodeEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
  fileName?: string;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ 
  value, 
  language = "javascript", 
  onChange, 
  readOnly = false,
  fileName 
}) => {
  // Determine language from file extension if not provided
  const getLanguageFromFileName = (name: string) => {
    const ext = name?.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'css':
        return 'css';
      case 'html':
        return 'html';
      default:
        return 'javascript';
    }
  };

  const editorLanguage = fileName ? getLanguageFromFileName(fileName) : language;

  return (
    <div className="h-full flex flex-col">
      {fileName && (
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {fileName}
            </span>
            {readOnly && (
              <span className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                Read Only
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">
            {editorLanguage}
          </span>
        </div>
      )}
      <div className="flex-1">
        <Editor
          height="100%"
          language={editorLanguage}
          value={value}
          onChange={onChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: "on",
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
            readOnly,
            contextmenu: !readOnly,
            quickSuggestions: !readOnly,
            parameterHints: { enabled: !readOnly },
            suggestOnTriggerCharacters: !readOnly,
            acceptSuggestionOnEnter: readOnly ? "off" : "on",
            tabCompletion: readOnly ? "off" : "on",
            wordBasedSuggestions: readOnly ? "off" : "currentDocument",
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              useShadows: false,
              verticalHasArrows: false,
              horizontalHasArrows: false,
            },
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;