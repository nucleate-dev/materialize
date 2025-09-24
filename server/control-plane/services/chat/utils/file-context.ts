import type { PrototypeFileInput } from '../../../types/PublicAPITypes.js';
import type { SystemLogger } from '../../../loggers/SystemLogger.js';

// Pattern to match file mentions in the format @[filepath]
const FILE_MENTION_PATTERN = /@\[([^\]]+)\]/g;

interface FileContextResult {
  originalMessage: string;
  enhancedMessage: string;
  mentionedFiles: string[];
  hasFileMentions: boolean;
}

/**
 * Extracts file mentions from a message and returns file paths
 */
export function extractFileMentions(message: string): string[] {
  const mentions: string[] = [];
  let match;

  // Reset regex state to ensure clean matching
  FILE_MENTION_PATTERN.lastIndex = 0;

  while ((match = FILE_MENTION_PATTERN.exec(message)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Checks if a message contains file mentions
 */
export function hasFileMentions(message: string): boolean {
  FILE_MENTION_PATTERN.lastIndex = 0;
  return FILE_MENTION_PATTERN.test(message);
}

/**
 * Parses file context from a user message and enhances it with file contents
 */
export function parseFileContextFromMessage(
  userMessage: string,
  inputFiles: Record<string, PrototypeFileInput> | null,
  log2: SystemLogger,
): FileContextResult {
  const mentionedFiles = extractFileMentions(userMessage);

  if (mentionedFiles.length === 0) {
    return {
      originalMessage: userMessage,
      enhancedMessage: userMessage,
      mentionedFiles: [],
      hasFileMentions: false,
    };
  }

  log2.info('[FileContext] Processing file mentions', {
    mentionedFiles,
    messageLength: userMessage.length,
  });

  if (!inputFiles) {
    log2.warn(
      '[FileContext] No input files provided but message has file mentions',
      {
        mentionedFiles,
      },
    );
    return {
      originalMessage: userMessage,
      enhancedMessage: userMessage,
      mentionedFiles,
      hasFileMentions: true,
    };
  }

  let enhancedMessage = userMessage;
  const foundFiles: string[] = [];
  const missingFiles: string[] = [];

  // Build file context sections
  const fileContextSections: string[] = [];

  for (const filePath of mentionedFiles) {
    const file = inputFiles[filePath];

    if (file) {
      foundFiles.push(filePath);

      // Add file context section
      const fileExtension = filePath.split('.').pop() || '';
      const languageHint = getLanguageHint(fileExtension);

      fileContextSections.push(`--- FILE CONTEXT: ${filePath} ---
\`\`\`${languageHint}
${file.contents}
\`\`\`
--- END FILE CONTEXT ---`);
    } else {
      missingFiles.push(filePath);
      log2.warn('[FileContext] Mentioned file not found in input files', {
        filePath,
        availableFiles: Object.keys(inputFiles),
      });
    }
  }

  // If we have file contexts, enhance the message
  if (fileContextSections.length > 0) {
    const contextHeader =
      fileContextSections.length === 1
        ? "The user has provided the following file context. Use this file's content to fulfill their request."
        : "The user has provided the following file contexts. Use these files' contents to fulfill their request.";

    enhancedMessage = `${contextHeader}

${fileContextSections.join('\n\n')}

User Request: "${userMessage}"`;

    log2.info('[FileContext] Enhanced message with file context', {
      foundFiles,
      missingFiles,
      contextSections: fileContextSections.length,
      originalMessageLength: userMessage.length,
      enhancedMessageLength: enhancedMessage.length,
    });
  }

  // Log any missing files
  if (missingFiles.length > 0) {
    log2.warn('[FileContext] Some mentioned files were not found', {
      missingFiles,
      foundFiles,
    });
  }

  return {
    originalMessage: userMessage,
    enhancedMessage,
    mentionedFiles,
    hasFileMentions: true,
  };
}

/**
 * Gets appropriate language hint for syntax highlighting based on file extension
 */
function getLanguageHint(extension: string): string {
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    html: 'html',
    md: 'markdown',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    sh: 'bash',
    sql: 'sql',
  };

  return languageMap[extension.toLowerCase()] || extension;
}

/**
 * Removes file mention syntax from a message, leaving clean text
 * Useful for displaying the message without the @[filepath] syntax
 */
export function stripFileMentions(message: string): string {
  FILE_MENTION_PATTERN.lastIndex = 0;
  return message.replace(FILE_MENTION_PATTERN, (match, filePath) => {
    // Replace @[filepath] with just the filename for display
    const fileName = filePath.split('/').pop() || filePath;
    return `"${fileName}"`;
  });
}
