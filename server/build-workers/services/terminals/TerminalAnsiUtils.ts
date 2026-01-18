const ANSI_REGEX =
  /[\u001B\u009B][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-TZcf-ntqry=><~])/g;

export function stripAnsiSequences(input: string): string {
  if (!input) {
    return "";
  }
  return input.replace(ANSI_REGEX, "");
}

/**
 * Removes progress bar lines from build output
 * Progress bars typically contain progress indicators (░▓), percentages, and file counts
 * These lines are meant to be overwritten in a terminal but appear as separate lines when captured
 */
export function stripProgressBars(input: string): string {
  if (!input) {
    return "";
  }

  const lines = input.split("\n");
  const filteredLines = lines.filter((line) => {
    // Skip empty lines
    if (!line.trim()) {
      return true;
    }

    // Check if line contains progress bar characters
    const hasProgressChars = /[░▓▒▒⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(line);

    // Check if line has percentage pattern
    const hasPercentage = /\d+\.\d+%/.test(line);

    // Check if line has file count pattern like (123/456)
    const hasFileCount = /\(\s*\d+\/\s*\d+\)/.test(line);

    // Check if line starts with common progress indicators
    const hasProgressPrefix = /^(Web|λ|m)\s/.test(line);

    // If it has progress characteristics, filter it out
    if (hasProgressChars && (hasPercentage || hasFileCount || hasProgressPrefix)) {
      return false;
    }

    return true;
  });

  return filteredLines.join("\n");
}

/**
 * Strips both ANSI sequences and progress bars from output
 * Use this for cleaning build output that will be stored/displayed
 */
export function cleanBuildOutput(input: string): string {
  if (!input) {
    return "";
  }

  // First strip ANSI sequences
  const withoutAnsi = stripAnsiSequences(input);

  // Split by newlines and process each line
  const lines = withoutAnsi.split("\n").map((line) => {
    // Handle carriage returns - keep only the last segment
    // This handles progress bars that use \r to update in place
    const segments = line.split("\r");
    return segments[segments.length - 1];
  });

  // Filter out progress bar lines and artifacts
  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      return true;
    }

    // Filter out spinner/progress bar lines
    if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(trimmed)) {
      return false;
    }

    // Filter out lines that are just single characters repeated (progress artifacts)
    // e.g., "m", "mm", "mmmmm" which are remnants of escape sequences
    if (/^(.)\1*$/.test(trimmed) && trimmed.length <= 5) {
      return false;
    }

    // Check if line contains progress bar characters with progress info
    const hasProgressChars = /[░▓▒]/.test(line);
    const hasPercentage = /\d+\.\d+%/.test(line);
    const hasFileCount = /\(\s*\d+\/\s*\d+\)/.test(line);

    // If it has progress characteristics, filter it out
    if (hasProgressChars && (hasPercentage || hasFileCount)) {
      return false;
    }

    return true;
  });

  // Remove excessive blank lines (more than 2 consecutive)
  return filteredLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
