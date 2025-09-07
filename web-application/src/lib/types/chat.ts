// New interfaces for granular edit operations
interface EditTarget {
  file: string;
  startLine?: number;
  endLine?: number;
  pattern?: string; // regex pattern for pattern-based replacements
  functionName?: string; // for function-level replacements
  componentName?: string; // for component-level replacements
}

export interface EditOperation {
  type: "replace" | "insert" | "delete" | "move";
  target: EditTarget;
  content?: string;
  description: string;
  newFileName?: string; // for move operations or creating new files
}

export interface SnackFiles {
  [fileName: string]: {
    contents: string;
    type: "CODE" | "ASSET";
  };
}
