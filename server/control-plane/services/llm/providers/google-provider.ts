import { google } from '@ai-sdk/google';
import { generateText, type UserContent } from 'ai';
import type {
  LLMProvider,
  LLMProviderConfig,
  CompletionRequest,
  CompletionResponse,
  ProviderMessage,
  ProviderMessagePart,
} from './types.js';
import { createProviderError } from './types.js';
import type { SystemLogger } from '../../../loggers/SystemLogger.js';

interface UsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export class GoogleProvider implements LLMProvider {
  readonly name = 'google';
  readonly supportsVision = true;
  readonly supportsImageGeneration = false;

  private logger: SystemLogger;

  constructor(config: LLMProviderConfig) {
    this.logger = config.logger.child({ provider: 'google' });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const model = google(request.model);

      const messages = this.convertMessages(request.messages);

      const result = await generateText({
        model,
        system: request.systemPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: messages as any,
        temperature: request.temperature,
        // Note: maxTokens is not directly supported in AI SDK v5 generateText
        // The model will use its default max output
      });

      // Cast usage through unknown to access the properties
      const usage = result.usage as unknown as UsageInfo | undefined;

      return {
        content: result.text,
        usage: {
          inputTokens: usage?.promptTokens ?? 0,
          outputTokens: usage?.completionTokens ?? 0,
          totalTokens:
            (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0),
        },
        model: request.model,
        finishReason: result.finishReason,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private convertMessages(
    messages: ProviderMessage[],
  ): Array<{ role: 'user' | 'assistant'; content: string | UserContent }> {
    return messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => {
        const role = msg.role as 'user' | 'assistant';

        if (typeof msg.content === 'string') {
          return { role, content: msg.content };
        }

        const parts: UserContent = msg.content.map((part) =>
          this.convertMessagePart(part),
        );

        return { role, content: parts };
      });
  }

  private convertMessagePart(
    part: ProviderMessagePart,
  ): { type: 'text'; text: string } | { type: 'image'; image: string | URL } {
    if (part.type === 'text') {
      return { type: 'text', text: part.text ?? '' };
    }

    if (part.imageData) {
      // Use data URI format for base64 images
      const dataUri = `data:${part.imageData.mediaType};base64,${part.imageData.base64}`;
      return {
        type: 'image',
        image: dataUri,
      };
    }

    if (part.imageUrl) {
      return {
        type: 'image',
        image: new URL(part.imageUrl),
      };
    }

    return { type: 'text', text: '' };
  }

  private mapError(error: unknown): Error {
    const err = error as Error & {
      status?: number;
      code?: string;
      error?: { code?: string; status?: string };
    };

    this.logger.error(err, 'Google AI API error');

    if (err.status === 429 || err.error?.status === 'RESOURCE_EXHAUSTED') {
      return createProviderError('rate_limit', 'Rate limit exceeded', {
        statusCode: 429,
        originalError: error,
      });
    }

    if (err.status === 401 || err.error?.status === 'UNAUTHENTICATED') {
      return createProviderError('auth', 'Authentication failed', {
        statusCode: 401,
        originalError: error,
      });
    }

    if (err.status === 400 || err.error?.status === 'INVALID_ARGUMENT') {
      return createProviderError('invalid_request', err.message, {
        statusCode: 400,
        originalError: error,
      });
    }

    if (err.error?.status === 'PERMISSION_DENIED') {
      return createProviderError(
        'content_policy',
        'Content blocked by safety settings',
        {
          statusCode: 400,
          originalError: error,
        },
      );
    }

    if (err.status && err.status >= 500) {
      return createProviderError('server', 'Provider server error', {
        statusCode: err.status,
        originalError: error,
      });
    }

    return createProviderError('unknown', err.message ?? 'Unknown error', {
      originalError: error,
    });
  }
}
