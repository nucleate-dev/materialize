import { openai } from '@ai-sdk/openai';
import { generateText, type UserContent } from 'ai';
import OpenAI from 'openai';
import type {
  LLMProvider,
  LLMProviderConfig,
  CompletionRequest,
  CompletionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
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

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly supportsVision = true;
  readonly supportsImageGeneration = true;

  private openaiClient: OpenAI;
  private logger: SystemLogger;

  constructor(config: LLMProviderConfig) {
    this.openaiClient = new OpenAI({ apiKey: config.apiKey });
    this.logger = config.logger.child({ provider: 'openai' });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const model = openai(request.model);

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

  async generateImage(
    request: ImageGenerationRequest,
  ): Promise<ImageGenerationResponse> {
    try {
      const response = await this.openaiClient.images.generate({
        model: request.model,
        prompt: request.prompt,
        size: this.normalizeSize(request.size),
        quality: (request.quality as 'standard' | 'hd') ?? 'standard',
        n: request.n ?? 1,
        response_format: 'b64_json',
      });

      return {
        images: (response.data ?? []).map((img) => ({
          base64: img.b64_json,
          revisedPrompt: img.revised_prompt,
        })),
        model: request.model,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private normalizeSize(
    size?: string,
  ): '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792' {
    const validSizes = [
      '256x256',
      '512x512',
      '1024x1024',
      '1792x1024',
      '1024x1792',
    ] as const;
    if (size && validSizes.includes(size as (typeof validSizes)[number])) {
      return size as (typeof validSizes)[number];
    }
    return '1024x1024';
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
      error?: { code?: string; type?: string };
    };

    this.logger.error(err, 'OpenAI API error');

    if (err.status === 429) {
      return createProviderError('rate_limit', 'Rate limit exceeded', {
        statusCode: 429,
        originalError: error,
      });
    }

    if (err.status === 401) {
      return createProviderError('auth', 'Authentication failed', {
        statusCode: 401,
        originalError: error,
      });
    }

    if (err.status === 400) {
      const errorCode = err.error?.code;
      if (errorCode === 'content_policy_violation') {
        return createProviderError(
          'content_policy',
          'Content violates usage policy',
          {
            statusCode: 400,
            originalError: error,
          },
        );
      }
      return createProviderError('invalid_request', err.message, {
        statusCode: 400,
        originalError: error,
      });
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
