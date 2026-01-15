// Chat WebSocket message types
// Synchronized from server types

export enum ChatEvent {
  AUTHENTICATED = 'authenticated',
  MESSAGE_RECEIVED = 'message_received',
  READY = 'ready',
  SYSTEM = 'system',
  ERROR = 'error',
  AGENT_MESSAGE = 'agent_message',
  QUERY_COMPLETE = 'query_complete',
  USAGE_UPDATE = 'usage_update',
  INTERRUPTED = 'interrupted',
  INFO = 'info',
  TOOL_START = 'tool_start',
  TOOL_COMPLETE = 'tool_complete',
  HISTORY_REQUEST = 'history_request',
  DESIGN_GENERATION = 'design_generation',
  COLLABORATOR_MESSAGE = 'collaborator_message',
  SCREEN_UPDATE = 'screen_update',
}

export enum ChatClientEvent {
  QUERY = 'query',
  INTERRUPT = 'interrupt',
  HISTORY_RESPONSE = 'history_response',
}

export enum ChatSystemEventSubtype {
  CONNECTION = 'connection',
}

export interface ChatErrorPayload {
  message: string;
  details?: string;
}

export interface ChatContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64' | 'url';
    media_type?: string;
    data?: string;
    url?: string;
  };
}

export interface ChatQueryData {
  prompt?: string;
  content?: ChatContentBlock[];
  options?: Record<string, unknown>;
  token?: string;
  ai_chat_session_id?: string | null;
  prototype_chat_session_id?: string | null;
  custom_design_system_id?: string | null;
  current_viewing_path?: string;
  design_style?: string;
  image_metadata?: Array<{
    storage_path: string;
    media_type: string;
    name?: string;
  }>;
  visible_screens?: Array<{ id: number; path: string }>;
  preview_mode?: 'mobile' | 'web';
  use_oauth_token?: boolean;
}

export interface QueryMessage {
  type: ChatClientEvent.QUERY;
  data: ChatQueryData;
}

export interface InterruptMessage {
  type: ChatClientEvent.INTERRUPT;
}

export interface HistoricalMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface HistoryResponseData {
  historical_messages: HistoricalMessage[];
  original_query: ChatQueryData;
}

export interface HistoryResponseMessage {
  type: ChatClientEvent.HISTORY_RESPONSE;
  data: HistoryResponseData;
}

export type ChatClientMessage = QueryMessage | InterruptMessage | HistoryResponseMessage;

export interface SystemConnectionMessage {
  type: ChatEvent.SYSTEM;
  subtype: ChatSystemEventSubtype.CONNECTION;
  data: {
    connectionId: string;
    prototypeId: string;
    sessionId: string | null;
    isUsingOAuthToken: boolean;
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
    creditsUsed: number;
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

export interface HistoryRequestMessage {
  type: ChatEvent.HISTORY_REQUEST;
  data: {
    message: string;
    requested_message_count: number;
    original_query: ChatQueryData;
  };
}

export interface DesignGenerationMessage {
  type: ChatEvent.DESIGN_GENERATION;
  data: {
    status: 'started' | 'completed';
    message: string;
    designSpec?: string;
    runDesignAgent?: boolean;
    isAppLevel?: boolean;
    isNarrowBuild?: boolean;
    persistToProjectContext?: boolean;
    scope?: 'app' | 'screen' | 'component' | 'other' | 'unknown';
  };
}

export interface CollaboratorMessagePayload {
  type: ChatEvent.COLLABORATOR_MESSAGE;
  data: {
    userId: string;
    content: ChatContentBlock[];
    timestamp: number;
    imageCount?: number;
  };
}

export interface ScreenUpdateData {
  action: 'add' | 'remove' | 'set';
  screens?: Array<{ path: string }>;
  path?: string;
  screenId?: number;
}

export interface ScreenUpdateMessage {
  type: ChatEvent.SCREEN_UPDATE;
  data: ScreenUpdateData;
}

export type ChatServerMessage =
  | SystemConnectionMessage
  | ErrorMessage
  | AgentMessage
  | QueryCompleteMessage
  | UsageUpdateMessage
  | InterruptedMessage
  | InfoMessage
  | ToolStartMessage
  | ToolCompleteMessage
  | AuthenticatedMessage
  | MessageReceivedMessage
  | ReadyMessage
  | HistoryRequestMessage
  | DesignGenerationMessage
  | CollaboratorMessagePayload
  | ScreenUpdateMessage;
