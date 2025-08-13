"use client";

import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Plus, Save, Trash2 } from "lucide-react";
import React, { useState } from "react";

interface CodeEditorProps {
  value: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
  fileName?: string;
  onCreateFile?: (fileName: string, initialContent?: string) => void;
  onDeleteFile?: (fileName: string) => void;
  onSaveFiles?: () => void;
  availableFiles?: string[];
  canDelete?: boolean;
  isSaving?: boolean;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  language = "javascript",
  onChange,
  readOnly = false,
  fileName,
  onCreateFile,
  onDeleteFile,
  onSaveFiles,
  availableFiles = [],
  canDelete = true,
  isSaving = false,
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

  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileError, setNewFileError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleCreateFile = () => {
    if (!newFileName.trim()) {
      setNewFileError("File name is required");
      return;
    }

    // Check if file already exists
    if (availableFiles.includes(newFileName.trim())) {
      setNewFileError("File already exists");
      return;
    }

    // Validate file name (basic validation)
    const fileName = newFileName.trim();
    if (!/^[a-zA-Z0-9._/-]+$/.test(fileName)) {
      setNewFileError("Invalid file name. Use only letters, numbers, dots, hyphens, underscores, and forward slashes.");
      return;
    }

    // Get default content based on file extension
    const getDefaultContent = (name: string) => {
      const ext = name.split('.').pop()?.toLowerCase();
      switch (ext) {
        case 'js':
        case 'jsx':
          return `import React from 'react';\nimport { View, Text } from 'react-native';\n\nexport default function ${name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '')}() {\n  return (\n    <View>\n      <Text>Hello from ${name}!</Text>\n    </View>\n  );\n}`;
        case 'ts':
        case 'tsx':
          return `import React from 'react';\nimport { View, Text } from 'react-native';\n\ninterface Props {}\n\nexport default function ${name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '')}({}: Props) {\n  return (\n    <View>\n      <Text>Hello from ${name}!</Text>\n    </View>\n  );\n}`;
        case 'json':
          return '{\n  \n}';
        case 'md':
          return `# ${name.split('.')[0]}\n\nAdd your content here.`;
        case 'css':
          return '/* Add your styles here */';
        default:
          return '';
      }
    };

    onCreateFile?.(fileName, getDefaultContent(fileName));
    setShowNewFileModal(false);
    setNewFileName("");
    setNewFileError("");
  };

  const handleDeleteFile = () => {
    if (fileName && onDeleteFile) {
      setShowDeleteConfirm(true);
    }
  };

  const confirmDeleteFile = () => {
    if (fileName && onDeleteFile) {
      onDeleteFile(fileName);
    }
    setShowDeleteConfirm(false);
  };

  const handleModalClose = () => {
    setNewFileName("");
    setNewFileError("");
  };

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
      `declare module 'tamagui' {
        export * from 'tamagui';
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
        <div className="flex items-center justify-between p-3 bg-muted/60 border-b border-border">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              {fileName}
            </span>
            {readOnly && (
              <span className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded-md font-medium">
                Read Only
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground uppercase font-medium tracking-wider">
              {editorLanguage}
            </span>
            {!readOnly && (
              <div className="flex items-center space-x-1">
                {onSaveFiles && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={onSaveFiles}
                    disabled={isSaving}
                    title="Save files"
                  >
                    <Save className={`w-3 h-3 ${isSaving ? 'animate-pulse' : ''}`} />
                  </Button>
                )}
                {onCreateFile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setShowNewFileModal(true)}
                    title="Create new file"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                )}
                {onDeleteFile && canDelete && availableFiles.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={handleDeleteFile}
                    title={`Delete ${fileName}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
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
              vertical: 'visible',
              horizontal: 'visible',
              useShadows: true,
              verticalHasArrows: true,
              horizontalHasArrows: true,
              verticalScrollbarSize: 14,
              horizontalScrollbarSize: 14,
            },
          }}
        />
      </div>
      
      {/* New File Modal */}
      <Dialog open={showNewFileModal} onOpenChange={(open) => {
        setShowNewFileModal(open);
        if (!open) {
          handleModalClose();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="fileName" className="text-sm font-medium">
                File Name
              </Label>
              <Input
                id="fileName"
                type="text"
                value={newFileName}
                onChange={(e) => {
                  setNewFileName(e.target.value);
                  setNewFileError("");
                }}
                placeholder="e.g., components/MyComponent.tsx"
                className="mt-2"
                autoFocus
              />
              {newFileError && (
                <p className="text-destructive text-sm mt-1">{newFileError}</p>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              <p className="mb-2">Supported file types:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>.js, .jsx - JavaScript/React components</li>
                <li>.ts, .tsx - TypeScript/React components</li>
                <li>.json - JSON configuration files</li>
                <li>.md - Markdown documentation</li>
                <li>.css - Stylesheets</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowNewFileModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFile}
            >
              Create File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-mono font-medium text-foreground">{fileName}</span>?
              This action cannot be undone.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteFile}
            >
              Delete File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CodeEditor;