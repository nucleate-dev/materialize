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
    replacementCount?: number;
    context?: string;
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
        case 'append_file_content':
          return this.appendFileContent(
            args.filePath as string,
            args.content as string,
          );
        case 'replace_file_content':
          return this.replaceFileContent(
            args.filePath as string,
            args.searchText as string,
            args.replaceWith as string,
            args.expectOneMatch as boolean,
          );
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

    const fileName = normalizedPath;
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

  private appendFileContent(
    filePath: string,
    content: string,
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

    if (content === undefined || content === null) {
      return { error: 'Content is required', success: false };
    }

    const normalizedPath = this.normalizePath(filePath);
    const existingFile = this.files.get(normalizedPath);

    if (existingFile) {
      // Add newline before appending if file doesn't end with one
      let contentToAppend = content;
      if (
        existingFile.contents.length > 0 &&
        !existingFile.contents.endsWith('\n')
      ) {
        contentToAppend = '\n' + content;
      }

      existingFile.contents += contentToAppend;
      existingFile.updated_at = new Date().toISOString();
      this.changedFiles.add(normalizedPath);

      return {
        success: true,
        filePath: normalizedPath,
        operation: 'append_file_content',
        message: `Successfully appended ${content.length} characters to file`,
      };
    } else {
      // Create new file with the content
      return this.createFile(filePath, content);
    }
  }

  private replaceFileContent(
    filePath: string,
    searchText: string,
    replaceWith: string,
    expectOneMatch: boolean = true,
  ): {
    error?: string;
    success?: boolean;
    filePath?: string;
    operation?: string;
    message?: string;
    replacementCount?: number;
    context?: string;
  } {
    if (!filePath) {
      return { error: 'File path is required', success: false };
    }

    if (!searchText) {
      return { error: 'Search text is required', success: false };
    }

    if (replaceWith === undefined || replaceWith === null) {
      return { error: 'Replacement text is required', success: false };
    }

    const normalizedPath = this.normalizePath(filePath);
    const file = this.files.get(normalizedPath);

    if (!file) {
      return {
        success: false,
        error: 'File not found',
        filePath: normalizedPath,
        operation: 'replace_file_content',
        message:
          'Cannot replace content in non-existent file. Use create_file or write_file instead.',
      };
    }

    // Count occurrences
    const occurrences = file.contents.split(searchText).length - 1;

    if (occurrences === 0) {
      // Show first few lines for context
      const lines = file.contents.split('\n');
      const contextLines = lines.slice(0, 3).join('\n');
      return {
        success: false,
        error: 'Search text not found',
        filePath: normalizedPath,
        operation: 'replace_file_content',
        message:
          'The specified text was not found in the file. Use read_file to check current content.',
        context: `File starts with:\n${contextLines}${lines.length > 3 ? '\n...' : ''}`,
      };
    }

    if (expectOneMatch && occurrences > 1) {
      // Find and show contexts around matches
      const lines = file.contents.split('\n');
      const matchContexts: string[] = [];

      for (let i = 0; i < lines.length && matchContexts.length < 3; i++) {
        if (lines[i].includes(searchText)) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length - 1, i + 1);
          const context = lines
            .slice(start, end + 1)
            .map((line, idx) => (idx === i - start ? `> ${line}` : `  ${line}`))
            .join('\n');
          matchContexts.push(`Lines ${start + 1}-${end + 1}:\n${context}`);
        }
      }

      return {
        success: false,
        error: 'Multiple matches found',
        filePath: normalizedPath,
        operation: 'replace_file_content',
        message: `Found ${occurrences} occurrences but expected only one. Set expectOneMatch to false to replace all, or make search text more specific.`,
        context: matchContexts.join('\n\n'),
      };
    }

    // Perform replacement
    const newContents = file.contents.replaceAll(searchText, replaceWith);
    file.contents = newContents;
    file.updated_at = new Date().toISOString();
    this.changedFiles.add(normalizedPath);

    return {
      success: true,
      filePath: normalizedPath,
      operation: 'replace_file_content',
      message: `Successfully replaced ${occurrences} occurrence${occurrences === 1 ? '' : 's'}`,
      replacementCount: occurrences,
    };
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
