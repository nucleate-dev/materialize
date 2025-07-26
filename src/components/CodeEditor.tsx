"use client";

import Editor from "@monaco-editor/react";
import React from "react";

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

  // Configure Monaco Editor before it loads
  const beforeMount = (monaco: typeof import('monaco-editor')) => {
    // Configure TypeScript compiler options to be less strict
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: "React",
      allowJs: true,
      typeRoots: ["node_modules/@types"],
      // Disable strict checks that cause red lines
      strict: false,
      noImplicitAny: false,
      noImplicitReturns: false,
      noImplicitThis: false,
      noUnusedLocals: false,
      noUnusedParameters: false,
      skipLibCheck: true,
    });

    // Configure JavaScript defaults
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    // Add some common React Native/Expo types to reduce red lines
    const extraLibs = [
      `declare module 'react-native' {
        export * from 'react-native';
      }`,
      `declare module 'expo-router' {
        export * from 'expo-router';
      }`,
      `declare module '@expo/vector-icons' {
        export * from '@expo/vector-icons';
      }`,
      `declare module 'expo' {
        export * from 'expo';
      }`,
      `declare module 'expo-splash-screen' {
        export * from 'expo-splash-screen';
      }`,
      `declare module 'expo-constants' {
        export * from 'expo-constants';
      }`,
      `declare module 'expo-font' {
        export * from 'expo-font';
      }`,
      `declare module 'expo-haptics' {
        export * from 'expo-haptics';
      }`,
      `declare module 'expo-image' {
        export * from 'expo-image';
      }`,
      `declare module 'expo-image-picker' {
        export * from 'expo-image-picker';
      }`,
      `declare module 'expo-linear-gradient' {
        export * from 'expo-linear-gradient';
      }`,
      `declare module 'expo-linking' {
        export * from 'expo-linking';
      }`,
      `declare module 'expo-location' {
        export * from 'expo-location';
      }`,
      `declare module 'expo-status-bar' {
        export * from 'expo-status-bar';
      }`,
      `declare module 'expo-system-ui' {
        export * from 'expo-system-ui';
      }`,
      `declare module 'expo-web-browser' {
        export * from 'expo-web-browser';
      }`,
      `declare module 'lucide-react-native' {
        export * from 'lucide-react-native';
      }`,
      `declare module 'nativewind' {
        export * from 'nativewind';
      }`,
      `declare module 'react-native-gesture-handler' {
        export * from 'react-native-gesture-handler';
      }`,
      `declare module 'react-native-safe-area-context' {
        export * from 'react-native-safe-area-context';
      }`,
      `declare module 'react-native-screens' {
        export * from 'react-native-screens';
      }`,
      `declare module 'react-native-svg' {
        export * from 'react-native-svg';
      }`,
      `declare module 'zustand' {
        export * from 'zustand';
      }`,
      `declare module '@tanstack/react-query' {
        export * from '@tanstack/react-query';
      }`,
      `declare module '@react-native-async-storage/async-storage' {
        export * from '@react-native-async-storage/async-storage';
      }`,
    ];

    extraLibs.forEach(lib => {
      monaco.languages.typescript.typescriptDefaults.addExtraLib(lib, 'react-native-types.d.ts');
      monaco.languages.typescript.javascriptDefaults.addExtraLib(lib, 'react-native-types.d.ts');
    });
  };

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
          beforeMount={beforeMount}
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
            wordBasedSuggestions: !readOnly ? "currentDocument" : "off",
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