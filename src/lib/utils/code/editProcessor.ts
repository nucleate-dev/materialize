import { EditOperation, SnackFile, SnackFiles } from "@/lib/types/chat";

export interface EditProcessorResult {
  success: boolean;
  updatedFiles: SnackFiles;
  errors: string[];
}

export class EditProcessor {
  private files: SnackFiles;

  constructor(files: SnackFiles) {
    // Create a deep copy of the files
    this.files = JSON.parse(JSON.stringify(files));
  }

  applyOperations(operations: EditOperation[]): EditProcessorResult {
    const errors: string[] = [];
    let success = true;

    for (const operation of operations) {
      try {
        this.applyOperation(operation);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(
          `Failed to apply operation "${operation.description}": ${errorMessage}`
        );
        success = false;
      }
    }

    return {
      success,
      updatedFiles: this.files,
      errors,
    };
  }

  private applyOperation(operation: EditOperation): void {
    const { type, target, content, newFileName } = operation;

    switch (type) {
      case "replace":
        this.handleReplace(target, content || "");
        break;
      case "insert":
        this.handleInsert(target, content || "");
        break;
      case "delete":
        this.handleDelete(target);
        break;
      case "move":
        this.handleMove(target, newFileName || "");
        break;
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }

  private handleReplace(target: EditTarget, content: string): void {
    const file = this.getFile(target.file);
    const lines = file.contents.split("\n");

    if (target.pattern) {
      // Pattern-based replacement
      const regex = new RegExp(target.pattern, "gm");
      file.contents = file.contents.replace(regex, content);
    } else if (target.functionName) {
      // Function-level replacement
      file.contents = this.replaceFunctionOrComponent(
        file.contents,
        target.functionName,
        content,
        "function"
      );
    } else if (target.componentName) {
      // Component-level replacement
      file.contents = this.replaceFunctionOrComponent(
        file.contents,
        target.componentName,
        content,
        "component"
      );
    } else if (target.startLine !== undefined && target.endLine !== undefined) {
      // Line-based replacement
      const startIdx = Math.max(0, target.startLine - 1);
      const endIdx = Math.min(lines.length, target.endLine);

      lines.splice(startIdx, endIdx - startIdx, content);
      file.contents = lines.join("\n");
    } else {
      // Replace entire file
      file.contents = content;
    }

    this.files[target.file] = file;
  }

  private handleInsert(target: EditTarget, content: string): void {
    const file = this.getFile(target.file);
    const lines = file.contents.split("\n");

    if (target.startLine !== undefined) {
      const insertIdx = Math.max(0, target.startLine - 1);
      lines.splice(insertIdx, 0, content);
      file.contents = lines.join("\n");
    } else {
      // Append to end of file
      file.contents += "\n" + content;
    }

    this.files[target.file] = file;
  }

  private handleDelete(target: EditTarget): void {
    if (target.startLine !== undefined && target.endLine !== undefined) {
      // Delete specific lines
      const file = this.getFile(target.file);
      const lines = file.contents.split("\n");
      const startIdx = Math.max(0, target.startLine - 1);
      const endIdx = Math.min(lines.length, target.endLine);

      lines.splice(startIdx, endIdx - startIdx);
      file.contents = lines.join("\n");
      this.files[target.file] = file;
    } else {
      // Delete entire file
      delete this.files[target.file];
    }
  }

  private handleMove(target: EditTarget, newFileName: string): void {
    if (!newFileName) {
      throw new Error("New filename required for move operation");
    }

    const file = this.getFile(target.file);
    this.files[newFileName] = { ...file };
    delete this.files[target.file];
  }

  private getFile(fileName: string): SnackFile {
    if (!this.files[fileName]) {
      // Create new file if it doesn't exist
      this.files[fileName] = { contents: "", type: "CODE" };
    }
    return this.files[fileName];
  }

  private replaceFunctionOrComponent(
    content: string,
    name: string,
    newContent: string,
    type: "function" | "component"
  ): string {
    // Regex patterns for function and component detection
    const patterns = {
      function: [
        new RegExp(
          `(function\\s+${name}\\s*\\([^)]*\\)\\s*\\{)([\\s\\S]*?)(\\n\\})`,
          "gm"
        ),
        new RegExp(
          `(const\\s+${name}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{)([\\s\\S]*?)(\\n\\})`,
          "gm"
        ),
        new RegExp(
          `(const\\s+${name}\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{)([\\s\\S]*?)(\\n\\})`,
          "gm"
        ),
      ],
      component: [
        new RegExp(
          `(export\\s+default\\s+function\\s+${name}\\s*\\([^)]*\\)\\s*\\{)([\\s\\S]*?)(\\n\\})`,
          "gm"
        ),
        new RegExp(
          `(const\\s+${name}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{)([\\s\\S]*?)(\\n\\})`,
          "gm"
        ),
        new RegExp(
          `(function\\s+${name}\\s*\\([^)]*\\)\\s*\\{)([\\s\\S]*?)(\\n\\})`,
          "gm"
        ),
      ],
    };

    for (const pattern of patterns[type]) {
      const match = pattern.exec(content);
      if (match) {
        // Replace the function/component body
        return content.replace(pattern, newContent);
      }
    }

    // If no match found, append the new content
    return content + "\n\n" + newContent;
  }
}

// Helper function to create edit operations
export function createEditOperation(
  type: EditOperation["type"],
  file: string,
  description: string,
  content?: string,
  options?: {
    startLine?: number;
    endLine?: number;
    pattern?: string;
    functionName?: string;
    componentName?: string;
    newFileName?: string;
  }
): EditOperation {
  return {
    type,
    target: {
      file,
      startLine: options?.startLine,
      endLine: options?.endLine,
      pattern: options?.pattern,
      functionName: options?.functionName,
      componentName: options?.componentName,
    },
    content,
    description,
    newFileName: options?.newFileName,
  };
}

interface EditTarget {
  file: string;
  startLine?: number;
  endLine?: number;
  pattern?: string;
  functionName?: string;
  componentName?: string;
}
