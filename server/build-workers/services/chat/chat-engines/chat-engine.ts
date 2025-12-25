import WebSocket from "ws";
import { ChatQueryData, ChatServerMessage } from "../../../types/ChatTypes.js";

export interface CliAuthEnvironment {
  env: NodeJS.ProcessEnv;
  authMethod: "user_token";
}

export interface ChatEngineSessionState {
  sessionId: string | null;
  prototypeChatSessionId: string | null;
  abortController: AbortController | null;
  designSystemId: string | null;
  designSystemRules: string | null;
  firstMessageStatus: { sessionId: string; isFirst: boolean } | null;
}

export interface DesignAgentMetadata {
  scope: "app" | "screen" | "component" | "other" | "unknown";
}

export interface ChatEngineContext {
  socket: WebSocket;
  data: ChatQueryData;
  sessionState: ChatEngineSessionState;
  validAiChatSessionIds: Set<string>;
  cliAuthEnv?: CliAuthEnvironment | null;
  getRelativePath: (absolutePath: string) => string;
  designSpec: string | null;
  designMetadata: DesignAgentMetadata | null;
  systemPrompt: string;
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
}

export interface ChatEngineResult {
  totalCostUsd?: number;
}

export interface ChatEngine {
  handleQuery(
    context: ChatEngineContext,
    handlers: ChatEngineMessageHandlers,
  ): Promise<ChatEngineResult | void>;
}
