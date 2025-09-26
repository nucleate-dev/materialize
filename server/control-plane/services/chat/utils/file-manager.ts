import { v4 as uuidv4 } from 'uuid';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import { PrototypeFileInput } from '../../../types/PublicAPITypes.js';
export interface FileManagerInterface {
  handleToolCall(toolCall: {
    function: { name: string; arguments: Record<string, unknown> };
  }): {
    error?: string;
    success?: boolean;
    filePath?: string;
    contents?: string;
    exists?: boolean;
    operation?: string;
    message?: string;
    files?: Array<{ filePath: string; name: string; exists: boolean }>;
    results?: Array<{
      filePath: string;
      lineNumber: number;
      context: string;
      matchedLine: string;
    }>;
    dependencies?: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  };
  getFinalState(): Record<string, unknown>;
}

export class VirtualFileManager implements FileManagerInterface {
  public files: Map<string, PrototypeFileInput>;
  private log2: SystemLogger;
  private prototypeId?: string;
  private changedFiles: Set<string> = new Set();
  private deletedFiles: Set<string> = new Set();
  private fileScope: 'complete' | 'updates' = 'updates';

  constructor(
    convertedFiles: Record<string, PrototypeFileInput> | null,
    log2: SystemLogger,
    prototypeId?: string,
    fileScope: 'complete' | 'updates' = 'updates',
  ) {
    this.files = new Map(Object.entries(convertedFiles || {}));
    this.log2 = log2;
    this.prototypeId = prototypeId;
    this.fileScope = fileScope;
  }

  setFileScope(mode: 'complete' | 'updates'): void {
    this.fileScope = mode;
  }

  getFileScope(): 'complete' | 'updates' {
    return this.fileScope;
  }

  getDeletedFiles(): Set<string> {
    return this.deletedFiles;
  }

  clearDeletedFiles(): void {
    this.deletedFiles.clear();
  }

  handleToolCall(toolCall: {
    function: { name: string; arguments: Record<string, unknown> };
  }): {
    error?: string;
    success?: boolean;
    filePath?: string;
    contents?: string;
    exists?: boolean;
    operation?: string;
    message?: string;
    files?: Array<{ filePath: string; name: string; exists: boolean }>;
    results?: Array<{
      filePath: string;
      lineNumber: number;
      context: string;
      matchedLine: string;
    }>;
    dependencies?: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  } {
    const { name, arguments: args } = toolCall.function;

    try {
      switch (name) {
        case 'read_file':
          return this.readFile(args.filePath as string);
        case 'write_file':
          return this.writeFile(
            args.filePath as string,
            args.contents as string,
          );
        case 'create_file':
          return this.createFile(
            args.filePath as string,
            args.contents as string,
          );
        case 'delete_file':
          return this.deleteFile(args.filePath as string);
        case 'list_files':
          return this.listFiles(args.directory as string);
        case 'file_exists':
          return this.fileExists(args.filePath as string);
        case 'search_files':
          return this.searchFiles(
            args.query as string,
            args.directory as string,
          );
        case 'get_dependencies':
          return this.getDependencies(args.filePath as string);
        default:
          return {
            error: `Unknown tool: ${name}`,
            success: false,
          };
      }
    } catch (error) {
      this.log2.error(error, `[VirtualFileManager] Tool call failed: ${name}`);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      };
    }
  }

  private normalizePath(filePath: string): string {
    // Normalize path separators and remove redundant slashes
    return filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  private readFile(filePath: string): {
    error?: string;
    success?: boolean;
    filePath?: string;
    contents?: string;
    exists?: boolean;
    operation?: string;
    message?: string;
  } {
    if (!filePath) {
      return { error: 'File path is required', success: false };
    }

    const normalizedPath = this.normalizePath(filePath);
    const file = this.files.get(normalizedPath);

    if (!file) {
      return {
        success: true,
        exists: false,
        filePath: normalizedPath,
        operation: 'read_file',
        message: 'File does not exist in virtual file system',
      };
    }

    return {
      success: true,
      exists: true,
      filePath: normalizedPath,
      contents: file.contents,
      operation: 'read_file',
      message: `Successfully read file (${file.contents.length} characters)`,
    };
  }

  private writeFile(
    filePath: string,
    contents: string,
  ): {
    error?: string;
    success?: boolean;
    filePath?: string;
    operation?: string;
    message?: string;
  } {
    if (!filePath) {
      return { error: 'File path is required', success: false };
    }

    if (contents === undefined || contents === null) {
      return { error: 'Contents are required', success: false };
    }

    const normalizedPath = this.normalizePath(filePath);
    const existingFile = this.files.get(normalizedPath);

    if (existingFile) {
      // Update existing file
      existingFile.contents = contents;
      existingFile.updated_at = new Date().toISOString();
      this.changedFiles.add(normalizedPath);

      return {
        success: true,
        filePath: normalizedPath,
        operation: 'write_file',
        message: `Successfully updated file (${contents.length} characters)`,
      };
    } else {
      // Create new file
      return this.createFile(filePath, contents);
    }
  }

  private createFile(
    filePath: string,
    contents: string = '',
  ): {
    error?: string;
    success?: boolean;
    filePath?: string;
    operation?: string;
    message?: string;
  } {
    if (!filePath) {
      return { error: 'File path is required', success: false };
    }

    const normalizedPath = this.normalizePath(filePath);

    if (this.files.has(normalizedPath)) {
      return {
        error: 'File already exists',
        success: false,
        filePath: normalizedPath,
        operation: 'create_file',
      };
    }

    const fileName = normalizedPath.split('/').pop() || normalizedPath;
    const now = new Date().toISOString();

    const newFile: PrototypeFileInput = {
      id: uuidv4(),
      name: fileName,
      contents: contents || '',
      prototype_id: this.prototypeId || null,
      created_at: now,
      updated_at: now,
    };

    this.files.set(normalizedPath, newFile);
    this.changedFiles.add(normalizedPath);

    return {
      success: true,
      filePath: normalizedPath,
      operation: 'create_file',
      message: `Successfully created file (${contents.length} characters)`,
    };
  }

  private deleteFile(filePath: string): {
    error?: string;
    success?: boolean;
    filePath?: string;
    operation?: string;
    message?: string;
  } {
    if (!filePath) {
      return { error: 'File path is required', success: false };
    }

    const normalizedPath = this.normalizePath(filePath);

    if (!this.files.has(normalizedPath)) {
      return {
        error: 'File does not exist',
        success: false,
        filePath: normalizedPath,
        operation: 'delete_file',
      };
    }

    this.files.delete(normalizedPath);
    this.deletedFiles.add(normalizedPath);

    return {
      success: true,
      filePath: normalizedPath,
      operation: 'delete_file',
      message: 'Successfully deleted file',
    };
  }

  private listFiles(directory: string = '/'): {
    success: boolean;
    files: Array<{ filePath: string; name: string; exists: boolean }>;
    operation: string;
    message: string;
  } {
    const normalizedDir = this.normalizePath(directory);
    const files: Array<{ filePath: string; name: string; exists: boolean }> =
      [];

    for (const [filePath, file] of this.files) {
      if (normalizedDir === '/' || filePath.startsWith(normalizedDir)) {
        files.push({
          filePath,
          name: file.name,
          exists: true,
        });
      }
    }

    return {
      success: true,
      files,
      operation: 'list_files',
      message: `Found ${files.length} files`,
    };
  }

  private fileExists(filePath: string): {
    success: boolean;
    exists: boolean;
    filePath: string;
    operation: string;
    message: string;
  } {
    const normalizedPath = this.normalizePath(filePath);
    const exists = this.files.has(normalizedPath);

    return {
      success: true,
      exists,
      filePath: normalizedPath,
      operation: 'file_exists',
      message: exists ? 'File exists' : 'File does not exist',
    };
  }

  private searchFiles(
    query: string,
    directory: string = '/',
  ): {
    success: boolean;
    results: Array<{
      filePath: string;
      lineNumber: number;
      context: string;
      matchedLine: string;
    }>;
    operation: string;
    message: string;
  } {
    const normalizedDir = this.normalizePath(directory);
    const results: Array<{
      filePath: string;
      lineNumber: number;
      context: string;
      matchedLine: string;
    }> = [];

    for (const [filePath, file] of this.files) {
      if (normalizedDir === '/' || filePath.startsWith(normalizedDir)) {
        const lines = file.contents.split('\n');

        lines.forEach((line, index) => {
          if (line.toLowerCase().includes(query.toLowerCase())) {
            const startLine = Math.max(0, index - 1);
            const endLine = Math.min(lines.length - 1, index + 1);
            const context = lines.slice(startLine, endLine + 1).join('\n');

            results.push({
              filePath,
              lineNumber: index + 1,
              context,
              matchedLine: line,
            });
          }
        });
      }
    }

    return {
      success: true,
      results,
      operation: 'search_files',
      message: `Found ${results.length} matches`,
    };
  }

  private getDependencies(filePath: string): {
    success: boolean;
    dependencies?: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    operation: string;
    message: string;
    error?: string;
  } {
    const normalizedPath = this.normalizePath(filePath);
    const file = this.files.get(normalizedPath);

    if (!file) {
      return {
        success: false,
        error: 'File not found',
        operation: 'get_dependencies',
        message: 'Cannot read dependencies from non-existent file',
      };
    }

    // Check if it's a package.json file
    if (!normalizedPath.endsWith('package.json')) {
      return {
        success: false,
        error: 'Not a package.json file',
        operation: 'get_dependencies',
        message: 'Dependencies can only be read from package.json files',
      };
    }

    try {
      const packageData = JSON.parse(file.contents);

      return {
        success: true,
        dependencies: {
          dependencies: packageData.dependencies || {},
          devDependencies: packageData.devDependencies || {},
        },
        operation: 'get_dependencies',
        message: 'Successfully parsed dependencies',
      };
    } catch {
      return {
        success: false,
        error: 'Invalid JSON in package.json',
        operation: 'get_dependencies',
        message: 'Failed to parse package.json file',
      };
    }
  }

  getFinalState(): Record<string, PrototypeFileInput> {
    const result: Record<string, PrototypeFileInput> = {};
    for (const [filePath, file] of this.files) {
      result[filePath] = file;
    }
    return result;
  }

  // Additional utility methods for virtual file system management

  public getFileCount(): number {
    return this.files.size;
  }

  public getTotalSize(): number {
    let totalSize = 0;
    for (const [, file] of this.files) {
      totalSize += file.contents.length;
    }
    return totalSize;
  }

  public clear(): void {
    this.files.clear();
  }

  public getAllFilePaths(): string[] {
    return Array.from(this.files.keys());
  }

  // New methods for change tracking and dispatch
  public hasChanges(): boolean {
    return this.changedFiles.size > 0 || this.deletedFiles.size > 0;
  }

  public getChangedFiles(): Record<string, PrototypeFileInput> {
    const changedFilesObj: Record<string, PrototypeFileInput> = {};
    for (const filePath of this.changedFiles) {
      const file = this.files.get(filePath);
      if (file) {
        changedFilesObj[filePath] = file;
      }
    }
    return changedFilesObj;
  }

  public getAllFilesForDispatch(): Record<string, PrototypeFileInput> {
    return this.getFinalState();
  }

  public clearChangeTracking(): void {
    this.changedFiles.clear();
    this.deletedFiles.clear();
  }
}
