export interface AcceptInviteIntent {
  invite_id: string;
}

/**
 * Gets and validates accept_invite_intent from localStorage
 * @returns Parsed AcceptInviteIntent if valid, null otherwise
 */
export function getAcceptInviteIntent(): AcceptInviteIntent | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = localStorage.getItem("accept_invite_intent");
  if (!stored) {
    return null;
  }

  try {
    const intent = JSON.parse(stored) as AcceptInviteIntent;
    if (intent.invite_id) {
      return intent;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Removes accept_invite_intent from localStorage
 */
export function clearAcceptInviteIntent(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem("accept_invite_intent");
}

/**
 * Sets accept_invite_intent in localStorage
 * @param inviteId - The invite ID to store
 */
export function setAcceptInviteIntent(inviteId: string): void {
  if (typeof window === "undefined" || !inviteId) {
    return;
  }
  localStorage.setItem(
    "accept_invite_intent",
    JSON.stringify({
      invite_id: inviteId,
    }),
  );
}

/**
 * Checks if there's a valid accept_invite_intent
 * @returns True if a valid accept_invite_intent exists
 */
export function hasAcceptInviteIntent(): boolean {
  return getAcceptInviteIntent() !== null;
}
