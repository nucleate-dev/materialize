export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface CodeBlock {
  language: 'javascript' | 'typescript';
  code: string;
  fileName?: string;
}

export interface CodeExtractionResult {
  hasCode: boolean;
  codeBlocks: CodeBlock[];
  message: string;
}

export interface SnackFile {
  contents: string;
  type: 'CODE';
}

export interface SnackFiles {
  [fileName: string]: SnackFile;
}

export interface SnackState {
  files: SnackFiles;
  dependencies: Record<string, string>;
  name: string;
  description: string;
}

// New interfaces for granular edit operations
export interface EditTarget {
  file: string;
  startLine?: number;
  endLine?: number;
  pattern?: string; // regex pattern for pattern-based replacements
  functionName?: string; // for function-level replacements
  componentName?: string; // for component-level replacements
}

export interface EditOperation {
  type: 'replace' | 'insert' | 'delete' | 'move';
  target: EditTarget;
  content?: string;
  description: string;
  newFileName?: string; // for move operations or creating new files
}

export interface EditOperationResult {
  hasOperations: boolean;
  operations: EditOperation[];
  message: string;
}

// Tool use interface for AI responses
export interface ToolCall {
  type: 'edit_code';
  operation: EditOperation;
}

export interface AIResponse {
  message?: string;
  toolCalls?: ToolCall[];
}