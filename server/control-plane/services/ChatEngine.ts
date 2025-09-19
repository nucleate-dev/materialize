import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { generateText } from 'ai';
import { FastifyInstance } from 'fastify';
import { SystemLogger } from '../loggers/SystemLogger.js';
import type {
  DispatchPrecheckResponse,
  PrototypeAssetInput,
} from '../types/PublicAPITypes.js';

interface FileManagerInterface {
  handleToolCall(toolCall: {
    function: { name: string; arguments: Record<string, unknown> };
  }): {
    error?: string;
    success?: boolean;
    filePath?: string;
    contents?: string;
    exists?: boolean;
    operation?: string;
    message?: string;
    files?: Array<{ filePath: string; name: string; exists: boolean }>;
    results?: Array<{
      filePath: string;
      lineNumber: number;
      context: string;
      matchedLine: string;
    }>;
    dependencies?: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  };
  getFinalState(): Record<string, unknown>;
}


interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Model Configuration
const CURRENT_MODEL: 'google' | 'anthropic' = 'google';
const MODEL_CONFIGS = {
  google: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-20250514',
} as const;

export interface ChatEngineConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  googleAiApiKey: string;
  anthropicApiKey: string;
  fastifyApp: FastifyInstance;
}

export interface ChatEngineParams {
  messages: ChatMessage[];
  userMessage: string;
  fileManager: FileManagerInterface;
  inputFiles: any;
  inputAssets: Record<string, PrototypeAssetInput> | null;
  prototype_id: string;
  token: string;
  chat_session_id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  log2: SystemLogger;
  precheckData: DispatchPrecheckResponse;
}

export class ChatEngine {
  private google: ReturnType<typeof createGoogleGenerativeAI>;
  private anthropic: ReturnType<typeof createAnthropic>;
  private config: ChatEngineConfig;

  constructor(config: ChatEngineConfig) {
    this.config = config;

    this.google = createGoogleGenerativeAI({
      apiKey: config.googleAiApiKey,
    });

    this.anthropic = createAnthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  private getCurrentModel(): LanguageModelV2 {
    switch (CURRENT_MODEL) {
      case 'google':
        return this.google(MODEL_CONFIGS.google);
      case 'anthropic':
        return this.anthropic(MODEL_CONFIGS.anthropic);
      default:
        return this.google(MODEL_CONFIGS.google);
    }
  }

  async executeChat(params: ChatEngineParams): Promise<void> {
    const {
      messages,
      userMessage,
      controller,
      encoder,
      log2,
    } = params;

    try {
      log2.consoleLogDevOnly('info', '[ChatEngine] Generating simple response...');

      // Generate a simple response using the AI model
      const response = await generateText({
        model: this.getCurrentModel(),
        system: 'You are a helpful AI assistant. Provide clear, concise responses to user questions.',
        messages: [
          ...messages.slice(0, -1).map((msg: ChatMessage) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          {
            role: 'user' as const,
            content: userMessage,
          },
        ],
      });

      // Send the response to the client
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'chat_response',
            content: response.text,
          })}\n\n`,
        ),
      );

      controller.close();
    } catch (error) {
      log2.error(error, '[ChatEngine] Error during chat execution');

      // Send error response
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Internal server error',
          })}\n\n`,
        ),
      );

      controller.close();
      throw error;
    }
  }
}
