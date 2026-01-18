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

  // First strip ANSI sequences, then remove progress bar lines
  const withoutAnsi = stripAnsiSequences(input);
  const withoutProgress = stripProgressBars(withoutAnsi);

  // Remove excessive blank lines (more than 2 consecutive)
  return withoutProgress.replace(/\n{3,}/g, "\n\n").trim();
}
