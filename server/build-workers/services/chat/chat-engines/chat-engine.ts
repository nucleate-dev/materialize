import WebSocket from "ws";
import { SystemLogger } from "../../../loggers/SystemLogger.js";
import {
  ChatQueryData,
  ChatServerMessage,
} from "../../../types/ChatTypes.js";

export interface CliAuthEnvironment {
  env: NodeJS.ProcessEnv;
  authMethod: "user_token";
}

export interface ChatEngineSessionState {
  sessionId: string | null;
  prototypeChatSessionId: string | null;
  isActive: boolean;
  createdAt: number;
  lastActiveAt: number;
  abortController: AbortController | null;
  modifiedFilesThisQuery: Set<string>;
  designSystemId: string | null;
  designSystemRules: string | null;
  firstMessageStatus: { sessionId: string; isFirst: boolean } | null;
}

export interface DesignContextInfo {
  systemPrompt: string;
  designSystemId: string | null;
  designSystemRules: string | null;
}

export interface ChatEngineContext {
  prototypeId: string;
  socket: WebSocket;
  data: ChatQueryData;
  sessionState: ChatEngineSessionState;
  validAiChatSessionIds: Set<string>;
  logger: SystemLogger;
  userId?: string | null;
  cliAuthEnv?: CliAuthEnvironment | null;
  designContext?: DesignContextInfo;
  isFirstMessage?: boolean;
}

export interface ChatEngineMessageHandlers {
  sendMessage: (socket: WebSocket, message: ChatServerMessage) => void;
  persistMessage: (
    role: "user" | "assistant" | "system",
    content: string,
    messageType: "text" | "tool_use" | "tool_result" | "error" | "system",
    eventType?: string | null,
    eventData?: unknown,
    creditsUsed?: number | null,
    costFunction?: string | null,
    provider?: string | null,
    model?: string | null,
  ) => Promise<void>;
  uploadChatImages: (
    prototypeId: string,
    chatSessionId: string,
    images: Array<{ base64: string; mediaType: string }>,
  ) => Promise<
    Array<{ storage_path: string; media_type: string; file_size: number }>
  >;
  updatePersistenceClient?: (client: unknown) => void;
}

export interface ChatEngine {
  handleQuery(
    context: ChatEngineContext,
    handlers: ChatEngineMessageHandlers,
  ): Promise<void>;
}
