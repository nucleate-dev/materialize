export interface ChatIntent {
  prototype_id: string;
  message: string;
  is_sending: boolean;
}

/**
 * Gets and validates chat_intent from localStorage for a specific prototype
 * @param prototypeId - The prototype ID to check against
 * @returns Parsed ChatIntent if valid, null otherwise
 */
export function getChatIntent(
  prototypeId: string | undefined,
): ChatIntent | null {
  if (typeof window === "undefined" || !prototypeId) {
    return null;
  }

  const stored = localStorage.getItem("chat_intent");
  if (!stored) {
    return null;
  }

  try {
    const intent = JSON.parse(stored) as ChatIntent;
    if (intent.prototype_id === prototypeId && intent.message) {
      return intent;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Removes chat_intent from localStorage
 */
export function clearChatIntent(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem("chat_intent");
}

export function setChatIntent(
  prototypeId: string | undefined,
  message: string,
  is_sending: boolean,
): void {
  if (typeof window === "undefined" || !message) {
    return;
  }
  localStorage.setItem(
    "chat_intent",
    JSON.stringify({
      prototype_id: prototypeId,
      message: message,
      is_sending,
    }),
  );
}

/**
 * Checks if there's a valid chat_intent for the given prototype
 * @param prototypeId - The prototype ID to check against
 * @returns True if a valid chat_intent exists
 */
export function hasChatIntent(prototypeId: string | undefined): boolean {
  return getChatIntent(prototypeId) !== null;
}
