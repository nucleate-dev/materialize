// Simple at first

export function detectUserIntent(
  userMessage: string,
): 'error_fixing' | 'general_request' {
  const errorKeywords = ['is not working', 'fix this error', 'fix this'];

  const lowercasedMessage = userMessage.toLowerCase();

  // Simple keyword matching for now.
  // This can be evolved into a more sophisticated LLM call later if needed.
  if (errorKeywords.some((keyword) => lowercasedMessage.includes(keyword))) {
    return 'error_fixing';
  }

  // You could add more logic here, e.g., checking if the previous
  // assistant message contained a code block that might have failed.

  return 'general_request';
}
