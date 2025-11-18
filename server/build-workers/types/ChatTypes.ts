export enum ChatEvent {
  AUTHENTICATED = "authenticated",
  MESSAGE_RECEIVED = "message_received",
  READY = "ready",
  SYSTEM = "system",
  ERROR = "error",
  AGENT_MESSAGE = "agent_message",
  QUERY_COMPLETE = "query_complete",
  USAGE_UPDATE = "usage_update",
  INTERRUPTED = "interrupted",
  INFO = "info",
  SESSION_RESET = "session_reset",
  TOOL_START = "tool_start",
  TOOL_COMPLETE = "tool_complete",
  FILE_SYNC_COMPLETE = "file_sync_complete",
  SYNC_COMPLETE = "sync_complete",
}

export enum ChatClientEvent {
  QUERY = "query",
  INTERRUPT = "interrupt",
  RESET_SESSION = "reset_session",
  SYNC_FILES = "sync_files",
}

export enum ChatSystemEventSubtype {
  CONNECTION = "connection",
}

export interface ChatErrorPayload {
  message: string;
  details?: string;
}

export interface ChatContentBlock {
  type: "text" | "image";
  text?: string;
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export interface ChatQueryData {
  prompt?: string;
  content?: ChatContentBlock[];
  options?: Record<string, unknown>;
  token?: string;
  session_id?: string | null; // Claude SDK session ID for resuming conversations
  chat_session_id?: string | null; // Database primary key from prototype_chat_sessions table
  custom_design_system_id?: string | null; // ID of custom design system to use
  current_viewing_path?: string; // Current route/path the user is viewing in the preview
}

export interface QueryMessage {
  type: ChatClientEvent.QUERY;
  data: ChatQueryData;
}

export interface InterruptMessage {
  type: ChatClientEvent.INTERRUPT;
}

export interface ResetSessionMessage {
  type: ChatClientEvent.RESET_SESSION;
}

export interface SyncFilesRequest {
  prototypeId?: string;
  filenames?: string[];
  assetNames?: string[];
  token?: string;
}

export interface SyncFilesMessage {
  type: ChatClientEvent.SYNC_FILES;
  data: SyncFilesRequest;
}

export type ChatClientMessage =
  | QueryMessage
  | InterruptMessage
  | ResetSessionMessage
  | SyncFilesMessage;

export interface SystemConnectionMessage {
  type: ChatEvent.SYSTEM;
  subtype: ChatSystemEventSubtype.CONNECTION;
  data: {
    connectionId: string;
    prototypeId: string;
    sessionId: string | null;
  };
}

export interface ErrorMessage {
  type: ChatEvent.ERROR;
  error: ChatErrorPayload;
}

export interface AgentMessage {
  type: ChatEvent.AGENT_MESSAGE;
  data: unknown;
}

export interface QueryCompleteMessage {
  type: ChatEvent.QUERY_COMPLETE;
  data: {
    sessionId: string | null;
  };
}

export interface UsageUpdateMessage {
  type: ChatEvent.USAGE_UPDATE;
  data: {
    creditsRemaining: number;
  };
}

export interface InterruptedMessage {
  type: ChatEvent.INTERRUPTED;
  data: {
    message: string;
    sessionId: string | null;
  };
}

export interface InfoMessage {
  type: ChatEvent.INFO;
  message: string;
}

export interface SessionResetMessage {
  type: ChatEvent.SESSION_RESET;
  data: {
    message: string;
  };
}

export interface ToolEventPayload {
  tool_name: string;
  tool_call_id?: string;
  tool_input?: Record<string, unknown>;
}

export interface ToolStartMessage {
  type: ChatEvent.TOOL_START;
  data: ToolEventPayload;
}

export interface ToolCompleteMessage {
  type: ChatEvent.TOOL_COMPLETE;
  data: ToolEventPayload & {
    tool_response?: unknown;
  };
}

export interface FileSyncResultData {
  success: boolean;
  filesUpdated: number;
  filesDeleted: number;
  assetsUpdated: number;
  assetsDeleted: number;
  errorCount: number;
  errors?: string[];
}

export interface FileSyncCompleteMessage {
  type: ChatEvent.FILE_SYNC_COMPLETE;
  data: FileSyncResultData;
}

export interface SyncCompleteMessage {
  type: ChatEvent.SYNC_COMPLETE;
  data: {
    success: boolean;
    filesCount: number;
    assetsCount: number;
  };
}

export interface AuthenticatedMessage {
  type: ChatEvent.AUTHENTICATED;
  userId: string;
}

export interface MessageReceivedMessage {
  type: ChatEvent.MESSAGE_RECEIVED;
}

export interface ReadyMessage {
  type: ChatEvent.READY;
}

export type ChatServerMessage =
  | SystemConnectionMessage
  | ErrorMessage
  | AgentMessage
  | QueryCompleteMessage
  | UsageUpdateMessage
  | InterruptedMessage
  | InfoMessage
  | SessionResetMessage
  | ToolStartMessage
  | ToolCompleteMessage
  | FileSyncCompleteMessage
  | SyncCompleteMessage
  | AuthenticatedMessage
  | MessageReceivedMessage
  | ReadyMessage;
