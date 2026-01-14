export type AuthMode = "nucleate" | "claude_sub";

const STORAGE_KEY = "chat_auth_mode";

/**
 * Gets the auth mode preference from localStorage
 * @returns The stored auth mode, or null if not set
 */
export function getAuthMode(): AuthMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    // Validate that it's a valid auth mode
    if (stored === "nucleate" || stored === "claude_sub") {
      return stored;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Sets the auth mode preference in localStorage
 * @param mode - The auth mode to store
 */
export function setAuthMode(mode: AuthMode): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, mode);
}

/**
 * Removes auth mode preference from localStorage
 */
export function clearAuthMode(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Checks if an auth mode preference has been set
 * @returns True if an auth mode preference exists
 */
export function hasAuthMode(): boolean {
  return getAuthMode() !== null;
}
