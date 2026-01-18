import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  APIResponse,
  LLMCompletionRequestBody,
  LLMCompletionSuccessResponse,
  LLMCompletionErrorResponse,
  LLMImageGenerationRequestBody,
  LLMImageGenerationSuccessResponse,
  LLMImageGenerationErrorResponse,
} from '../../types/PublicAPITypes.js';
import { HTTP_STATUS } from '../../types/PublicAPITypes.js';
import { validateJWTToken } from '../../utils/prototypeAuth.js';
import { handleCompletionImpl } from './handlers/handleCompletion.js';
import { handleImageGenerationImpl } from './handlers/handleImageGeneration.js';
import { baseLogger } from '../../server.js';

export class LLMService {
  constructor() {
    // Validate required environment variables on startup
    // We check at registration time but warn rather than throw
    // to allow graceful degradation if keys are missing
    const envVars = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    };

    const missing = Object.entries(envVars)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      baseLogger.warn(
        `Missing environment variables: ${missing.join(', ')}. Some providers may not work.`,
        { service: 'LLMService', missingKeys: missing },
      );
    }
  }

  public registerRoutes(app: FastifyInstance): void {
    // POST /llm/completion - Text and vision completion
    app.post<{ Body: LLMCompletionRequestBody }>(
      '/llm/completion',
      {
        schema: {
          body: {
            type: 'object',
            required: ['provider', 'model', 'messages', 'team_id'],
            properties: {
              provider: {
                type: 'string',
                enum: ['anthropic', 'openai', 'google'],
              },
              model: { type: 'string' },
              messages: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  required: ['role', 'content'],
                  properties: {
                    role: {
                      type: 'string',
                      enum: ['user', 'assistant', 'system'],
                    },
                    content: {
                      oneOf: [
                        { type: 'string' },
                        {
                          type: 'array',
                          items: {
                            type: 'object',
                            required: ['type'],
                            properties: {
                              type: {
                                type: 'string',
                                enum: ['text', 'image'],
                              },
                              text: { type: 'string' },
                              source: {
                                type: 'object',
                                properties: {
                                  type: {
                                    type: 'string',
                                    enum: ['base64', 'url'],
                                  },
                                  media_type: {
                                    type: 'string',
                                    enum: [
                                      'image/jpeg',
                                      'image/png',
                                      'image/webp',
                                      'image/gif',
                                    ],
                                  },
                                  data: { type: 'string' },
                                  url: { type: 'string', format: 'uri' },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              team_id: { type: 'string' },
              max_tokens: { type: 'integer', minimum: 1, maximum: 100000 },
              temperature: { type: 'number', minimum: 0, maximum: 2 },
              system_prompt: { type: 'string' },
            },
          },
        },
      },
      this.handleCompletion.bind(this),
    );

    // POST /llm/image-generation - DALL-E image generation
    app.post<{ Body: LLMImageGenerationRequestBody }>(
      '/llm/image-generation',
      {
        schema: {
          body: {
            type: 'object',
            required: ['provider', 'model', 'prompt', 'team_id'],
            properties: {
              provider: {
                type: 'string',
                enum: ['openai'],
              },
              model: {
                type: 'string',
                enum: ['dall-e-3', 'dall-e-2'],
              },
              prompt: { type: 'string', maxLength: 4000 },
              team_id: { type: 'string' },
              size: {
                type: 'string',
                enum: [
                  '1024x1024',
                  '1792x1024',
                  '1024x1792',
                  '512x512',
                  '256x256',
                ],
              },
              quality: {
                type: 'string',
                enum: ['standard', 'hd'],
              },
              n: { type: 'integer', minimum: 1, maximum: 10 },
            },
          },
        },
      },
      this.handleImageGeneration.bind(this),
    );
  }

  private async handleCompletion(
    request: FastifyRequest<{ Body: LLMCompletionRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<LLMCompletionSuccessResponse, LLMCompletionErrorResponse>
  > {
    // JWT validation
    const token = request.headers.authorization?.split(' ')[1] ?? '';
    const { user } = await validateJWTToken(token, request.log2);

    if (!user) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'UNAUTHORIZED',
          message: 'Invalid or missing authentication token',
        },
      });
    }

    request.log2 = request.log2.child({ userId: user.id });

    return handleCompletionImpl(request, reply, user, token);
  }

  private async handleImageGeneration(
    request: FastifyRequest<{ Body: LLMImageGenerationRequestBody }>,
    reply: FastifyReply,
  ): Promise<
    APIResponse<
      LLMImageGenerationSuccessResponse,
      LLMImageGenerationErrorResponse
    >
  > {
    // JWT validation
    const token = request.headers.authorization?.split(' ')[1] ?? '';
    const { user } = await validateJWTToken(token, request.log2);

    if (!user) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        data: null,
        error: {
          error: 'UNAUTHORIZED',
          message: 'Invalid or missing authentication token',
        },
      });
    }

    request.log2 = request.log2.child({ userId: user.id });

    return handleImageGenerationImpl(request, reply, user, token);
  }
}
