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
    const normalizedPath = this.normalizeExpoRouterPath(target.file);
    const file = this.getFile(normalizedPath);
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

    this.files[normalizedPath] = file;
  }

  private handleInsert(target: EditTarget, content: string): void {
    const normalizedPath = this.normalizeExpoRouterPath(target.file);
    const file = this.getFile(normalizedPath);
    
    // Handle new file creation
    if (file.contents.trim() === "") {
      file.contents = content;
      this.files[normalizedPath] = file;
      return;
    }

    const lines = file.contents.split("\n");

    if (target.startLine !== undefined) {
      const insertIdx = Math.max(0, target.startLine - 1);
      lines.splice(insertIdx, 0, content);
      file.contents = lines.join("\n");
    } else {
      // Append to end of file
      file.contents += "\n" + content;
    }

    this.files[normalizedPath] = file;
  }

  private handleDelete(target: EditTarget): void {
    const normalizedPath = this.normalizeExpoRouterPath(target.file);
    
    if (target.startLine !== undefined && target.endLine !== undefined) {
      // Delete specific lines
      const file = this.getFile(normalizedPath);
      const lines = file.contents.split("\n");
      const startIdx = Math.max(0, target.startLine - 1);
      const endIdx = Math.min(lines.length, target.endLine);

      lines.splice(startIdx, endIdx - startIdx);
      file.contents = lines.join("\n");
      this.files[normalizedPath] = file;
    } else {
      // Delete entire file
      delete this.files[normalizedPath];
    }
  }

  private handleMove(target: EditTarget, newFileName: string): void {
    if (!newFileName) {
      throw new Error("New filename required for move operation");
    }

    const oldNormalizedPath = this.normalizeExpoRouterPath(target.file);
    const newNormalizedPath = this.normalizeExpoRouterPath(newFileName);
    
    const file = this.getFile(oldNormalizedPath);
    this.files[newNormalizedPath] = { ...file };
    delete this.files[oldNormalizedPath];
  }

  private getFile(fileName: string): SnackFile {
    if (!this.files[fileName]) {
      // Create new file if it doesn't exist
      this.files[fileName] = { 
        contents: "", 
        type: this.getFileType(fileName) 
      };
    }
    return this.files[fileName];
  }

  private getFileType(fileName: string): "CODE" | "ASSET" {
    const assetExtensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".json"];
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf("."));
    return assetExtensions.includes(extension) ? "ASSET" : "CODE";
  }

  /**
   * Normalize file paths for expo-router structure
   * Ensures proper directory structure is represented in Snack
   */
  private normalizeExpoRouterPath(filePath: string): string {
    // If it's already a full path or starts with known folders, keep as is
    if (filePath.includes("/") && (
      filePath.startsWith("app/") || 
      filePath.startsWith("components/") || 
      filePath.startsWith("utils/") || 
      filePath.startsWith("screens/")
    )) {
      return filePath;
    }

    // For app directory files (screens/routes)
    if (filePath.endsWith(".js") || filePath.endsWith(".tsx") || filePath.endsWith(".ts")) {
      // If it looks like a route file, put it in app/
      if (filePath.match(/^[a-zA-Z0-9_-]+\.(js|tsx|ts)$/) && !filePath.includes("component")) {
        return `app/${filePath}`;
      }
      
      // If it looks like a component, put it in components/
      if (filePath.toLowerCase().includes("component") || filePath.match(/^[A-Z]/)) {
        return `components/${filePath}`;
      }
    }

    // Default: return as-is
    return filePath;
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
