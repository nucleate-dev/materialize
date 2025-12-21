export type ChatSession = {
  id: string;
  prototype_id: string;
  session_id: string | null;
  session_type: string | null;
  created_at: string | null;
  chat_context: unknown;
  user_id: string;
};

export type ChatMessage = {
  id: string;
  chat_session_id: string | null;
  content: string;
  created_at: string;
  message_type: string;
  event_type: string | null;
  event_data: unknown;
  event_data_raw?: string | null;
  role: string;
  credits_used: number | null;
  image_url: string | null;
  resolved_image_urls?: string[];
};

type SessionsResponse = {
  sessions: ChatSession[];
};

type MessagesResponse = {
  messages: ChatMessage[];
};

export type RecentPrototype = {
  id: string;
  name: string | null;
  created_at: string | null;
  owner_id: string | null;
  owner_email: string | null;
};

type RecentPrototypesResponse = {
  prototypes: RecentPrototype[];
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
    }));
    throw new Error(errorData.error || "Request failed");
  }
  return response.json();
}

export function fetchChatSessions(prototypeId: string) {
  return fetchJson<SessionsResponse>(
    `/api/chat-recreation/sessions?prototype_id=${encodeURIComponent(
      prototypeId,
    )}`,
  );
}

export function fetchChatMessages(sessionId: string) {
  return fetchJson<MessagesResponse>(
    `/api/chat-recreation/messages?session_id=${encodeURIComponent(sessionId)}`,
  );
}

export function fetchRecentPrototypes() {
  return fetchJson<RecentPrototypesResponse>(
    "/api/chat-recreation/prototypes",
  );
}
