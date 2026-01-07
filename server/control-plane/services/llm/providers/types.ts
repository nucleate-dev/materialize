import type { SystemLogger } from "../../../loggers/SystemLogger.js";

export interface LLMProviderConfig {
  apiKey: string;
  logger: SystemLogger;
}

export interface CompletionRequest {
  model: string;
  messages: ProviderMessage[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ProviderMessage {
  role: "user" | "assistant" | "system";
  content: string | ProviderMessagePart[];
}

export interface ProviderMessagePart {
  type: "text" | "image";
  text?: string;
  imageData?: {
    base64: string;
    mediaType: string;
  };
  imageUrl?: string;
}

export interface CompletionResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason?: string;
}

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
}

export interface ImageGenerationResponse {
  images: Array<{
    url?: string;
    base64?: string;
    revisedPrompt?: string;
  }>;
  model: string;
}

export type LLMProviderErrorType =
  | "rate_limit"
  | "auth"
  | "invalid_request"
  | "content_policy"
  | "server"
  | "unknown";

export interface LLMProviderError extends Error {
  type: LLMProviderErrorType;
  statusCode?: number;
  retryAfter?: number;
  originalError?: unknown;
}

export function createProviderError(
  type: LLMProviderErrorType,
  message: string,
  options?: {
    statusCode?: number;
    retryAfter?: number;
    originalError?: unknown;
  },
): LLMProviderError {
  const error = new Error(message) as LLMProviderError;
  error.type = type;
  error.statusCode = options?.statusCode;
  error.retryAfter = options?.retryAfter;
  error.originalError = options?.originalError;
  return error;
}

export interface LLMProvider {
  readonly name: string;
  readonly supportsVision: boolean;
  readonly supportsImageGeneration: boolean;

  complete(request: CompletionRequest): Promise<CompletionResponse>;
  generateImage?(
    request: ImageGenerationRequest,
  ): Promise<ImageGenerationResponse>;
}
