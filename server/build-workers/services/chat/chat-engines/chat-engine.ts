import WebSocket from "ws";
import { ChatQueryData } from "../../../types/ChatTypes.js";
import { SystemLogger } from "../../../loggers/SystemLogger.js";

export interface ChatConnection {
  socket: WebSocket;
  heartbeat?: NodeJS.Timeout;
  logger: SystemLogger;
}

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
  activeConnections: Map<string, ChatConnection>;
  data: ChatQueryData;
  sessionState: ChatEngineSessionState;
  validAiChatSessionIds: Set<string>;
  cliAuthEnv?: CliAuthEnvironment | null;
  getRelativePath: (absolutePath: string) => string;
  systemPrompt: string;
}

export interface ChatEngineResult {
  totalCostUsd?: number;
}

export interface ChatEngine {
  handleQuery(context: ChatEngineContext): Promise<ChatEngineResult | void>;
}
