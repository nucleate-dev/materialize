import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

interface FileAutocompleteState {
  isOpen: boolean;
  searchTerm: string;
  searchStartIndex: number;
  filteredFiles: string[];
}

interface UseFileAutocompleteProps {
  files: Record<string, unknown>;
  currentMessage: string;
  onMessageChange: (message: string) => void;
}

interface UseFileAutocompleteReturn {
  autocompleteState: FileAutocompleteState;
  handleTextareaChange: (value: string, cursorPosition?: number) => void;
  handleFileSelect: (filePath: string) => void;
  closeAutocomplete: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

const FILE_MENTION_PATTERN = /@\[([^\]]+)\]/g;

export function useFileAutocomplete({
  files,
  currentMessage,
  onMessageChange,
}: UseFileAutocompleteProps): UseFileAutocompleteReturn {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [autocompleteState, setAutocompleteState] = useState<FileAutocompleteState>({
    isOpen: false,
    searchTerm: '',
    searchStartIndex: -1,
    filteredFiles: [],
  });

  // Get all file paths from the files object
  const allFilePaths = useMemo(() => {
    return Object.keys(files || {}).sort();
  }, [files]);

  // Filter files based on search term
  const filteredFiles = useMemo(() => {
    if (!autocompleteState.searchTerm) {
      return allFilePaths.slice(0, 10); // Limit to 10 items when no search
    }

    const searchLower = autocompleteState.searchTerm.toLowerCase();
    return allFilePaths
      .filter(path => {
        const fileName = path.split('/').pop() || '';
        const pathLower = path.toLowerCase();
        const fileNameLower = fileName.toLowerCase();

        // Prioritize matches in filename, then full path
        return fileNameLower.includes(searchLower) || pathLower.includes(searchLower);
      })
      .sort((a, b) => {
        const aFileName = a.split('/').pop() || '';
        const bFileName = b.split('/').pop() || '';
        const searchLower = autocompleteState.searchTerm.toLowerCase();

        // Prioritize filename matches over path matches
        const aFileNameMatch = aFileName.toLowerCase().includes(searchLower);
        const bFileNameMatch = bFileName.toLowerCase().includes(searchLower);

        if (aFileNameMatch && !bFileNameMatch) return -1;
        if (!aFileNameMatch && bFileNameMatch) return 1;

        // Secondary sort by path length (shorter paths first)
        return a.length - b.length;
      })
      .slice(0, 10); // Limit to 10 results
  }, [allFilePaths, autocompleteState.searchTerm]);

  // Update filtered files in state
  useEffect(() => {
    setAutocompleteState(prev => ({
      ...prev,
      filteredFiles,
    }));
  }, [filteredFiles]);

  const closeAutocomplete = useCallback(() => {
    setAutocompleteState({
      isOpen: false,
      searchTerm: '',
      searchStartIndex: -1,
      filteredFiles: [],
    });
  }, []);

  const detectAtMention = useCallback((text: string, cursorPosition: number) => {
    // Look for @ symbol before cursor position
    let searchStart = -1;

    // Find the last @ symbol before the cursor that's not inside a file mention
    for (let i = cursorPosition - 1; i >= 0; i--) {
      const char = text[i];

      if (char === '@') {
        // Check if this @ is already part of a complete file mention
        const afterAt = text.substring(i);
        const nextClosingBracket = afterAt.indexOf(']');
        const nextOpeningBracket = afterAt.indexOf('[', 1);

        // If we find [file] pattern after @, this is already a complete mention
        if (afterAt.startsWith('@[') && nextClosingBracket > 0 &&
            (nextOpeningBracket === -1 || nextClosingBracket < nextOpeningBracket)) {
          continue; // Skip this @, it's already a complete mention
        }

        searchStart = i;
        break;
      } else if (char === ' ' || char === '\n') {
        // Stop searching if we hit whitespace
        break;
      }
    }

    if (searchStart === -1) {
      return null;
    }

    // Extract the search term (everything after @ until cursor)
    const searchTerm = text.substring(searchStart + 1, cursorPosition);

    // Don't show autocomplete if there's already a closing bracket
    if (searchTerm.includes(']')) {
      return null;
    }

    return {
      searchStart: searchStart + 1, // Position after the @
      searchTerm,
    };
  }, []);

  const handleTextareaChange = useCallback((value: string, cursorPosition?: number) => {
    onMessageChange(value);

    const textarea = textareaRef.current;
    const cursor = cursorPosition ?? textarea?.selectionStart ?? value.length;

    const atMention = detectAtMention(value, cursor);

    if (atMention) {
      setAutocompleteState(prev => ({
        ...prev,
        isOpen: true,
        searchTerm: atMention.searchTerm,
        searchStartIndex: atMention.searchStart,
      }));
    } else {
      closeAutocomplete();
    }
  }, [onMessageChange, detectAtMention, closeAutocomplete]);

  const handleFileSelect = useCallback((filePath: string) => {
    if (autocompleteState.searchStartIndex === -1) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    // Calculate the replacement positions
    const beforeAt = currentMessage.substring(0, autocompleteState.searchStartIndex - 1); // -1 to include the @
    const afterSearch = currentMessage.substring(textarea.selectionStart);

    // Create the new message with the file mention
    const newMessage = `${beforeAt}@[${filePath}]${afterSearch}`;

    // Update the message
    onMessageChange(newMessage);

    // Close autocomplete
    closeAutocomplete();

    // Set cursor position after the file mention
    setTimeout(() => {
      const newCursorPosition = beforeAt.length + `@[${filePath}]`.length;
      textarea.setSelectionRange(newCursorPosition, newCursorPosition);
      textarea.focus();
    }, 0);
  }, [currentMessage, autocompleteState.searchStartIndex, onMessageChange, closeAutocomplete]);

  return {
    autocompleteState: {
      ...autocompleteState,
      filteredFiles,
    },
    handleTextareaChange,
    handleFileSelect,
    closeAutocomplete,
    textareaRef,
  };
}

// Utility function to extract file mentions from a message
export function extractFileMentions(message: string): string[] {
  const mentions: string[] = [];
  let match;

  // Reset the regex state
  FILE_MENTION_PATTERN.lastIndex = 0;

  while ((match = FILE_MENTION_PATTERN.exec(message)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

// Utility function to check if a message has file mentions
export function hasFileMentions(message: string): boolean {
  return FILE_MENTION_PATTERN.test(message);
}