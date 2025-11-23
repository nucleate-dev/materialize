/**
 * Utility functions for handling and formatting chat messages
 */

type ToolInput = Record<string, unknown>;

/**
 * Helper function to sanitize file paths by removing the dev server prefix
 */
export function sanitizeFilePath(path: string): string {
  if (!path) return path;
  const prefix = '/tmp/materialize-dev-server/';
  // Replace all occurrences of the prefix, not just at the start
  return path.replace(new RegExp(prefix, 'g'), '');
}

/**
 * Helper function to get friendly tool display name
 * Mirrors the frontend logic in ClaudeCodePanel.tsx
 */
export function getToolDisplayName(toolName: string, toolInput?: ToolInput): string {
  const normalized = toolName.toLowerCase();

  // For Bash commands, use the description if available
  if (normalized.includes('bash') && toolInput?.description) {
    return toolInput.description as string;
  }

  // For Task tool, use the description if available
  if (normalized === 'task' && toolInput?.description) {
    return toolInput.description as string;
  }

  // More descriptive tool names with parameters
  if (normalized.includes('read') && toolInput?.file_path) {
    const fileName = sanitizeFilePath(toolInput.file_path as string).split('/').pop() || toolInput.file_path;
    return `Reading ${fileName}`;
  }
  if (normalized.includes('glob') && toolInput?.pattern) {
    return `Searching files matching ${toolInput.pattern}`;
  }
  if (normalized.includes('grep') && toolInput?.pattern) {
    return `Searching code for "${toolInput.pattern}"`;
  }
  if (normalized.includes('list') && toolInput?.path) {
    const pathName = sanitizeFilePath(toolInput.path as string).split('/').pop() || toolInput.path;
    return `Listing ${pathName}`;
  }
  if (normalized.includes('write') && toolInput?.file_path) {
    const fileName = sanitizeFilePath(toolInput.file_path as string).split('/').pop() || toolInput.file_path;
    return `Writing ${fileName}`;
  }
  if (normalized.includes('edit') && toolInput?.file_path) {
    const fileName = sanitizeFilePath(toolInput.file_path as string).split('/').pop() || toolInput.file_path;
    return `Editing ${fileName}`;
  }
  if (normalized.includes('delete') && toolInput?.file_path) {
    const fileName = sanitizeFilePath(toolInput.file_path as string).split('/').pop() || toolInput.file_path;
    return `Deleting ${fileName}`;
  }

  // Default friendly names
  if (normalized.includes('read')) return 'Reading files';
  if (normalized.includes('glob')) return 'Searching files';
  if (normalized.includes('grep')) return 'Searching code';
  if (normalized.includes('list')) return 'Listing files';
  if (normalized.includes('write')) return 'Writing';
  if (normalized.includes('edit')) return 'Editing';
  if (normalized.includes('bash')) return 'Running command';
  if (normalized.includes('delete')) return 'Deleting';
  return toolName;
}
