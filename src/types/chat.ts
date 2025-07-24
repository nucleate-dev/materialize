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