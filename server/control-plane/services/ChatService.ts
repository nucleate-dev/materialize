import { createClient } from '@supabase/supabase-js';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Stripe from 'stripe';
import type {
  ChatErrorResponse,
  ChatRequestBody,
  DispatchPrecheckRequestBody,
  DispatchPrecheckResponse,
} from '../types/PublicAPITypes.js';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import type { Database } from '../types/supabase.js';
import { checkUserHasPrototypeEditAccess } from '../utils/prototypeAuth.js';
import { isDispatchInProgress } from '../utils/prototypeDevServerStatusUtils.js';
import { hasExceededChatUsageLimit } from '../utils/subscriptionChecks.js';
import {
  ChatEngine,
  FileManager,
  type ChatEngineConfig,
} from './ChatEngine.js';

const ProductKeys = Object.freeze({
  FREE_SUBSCRIPTION: 'free',
  TEAM_SUBSCRIPTION: 'team',
  PRO_SUBSCRIPTION: 'pro',
});

export class ChatService {
  private fastifyApp: FastifyInstance;
  private supabaseUrl: string;
  private supabaseServiceKey: string;
  private googleAiApiKey: string;
  private anthropicApiKey: string;
  private stripeSecretKey: string;
  private jwtSecret: string;
  private serverEndpoint: string;

  private stripe: Stripe;
  private chatEngine: ChatEngine;

  constructor(fastifyApp: FastifyInstance) {
    this.fastifyApp = fastifyApp;

    // Environment validation
    this.supabaseUrl = process.env.SUPABASE_URL!;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    this.googleAiApiKey = process.env.GOOGLE_AI_API_KEY!;
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY!;
    this.stripeSecretKey = process.env.STRIPE_SECRET_KEY!;
    this.jwtSecret = process.env.JWT_SECRET!;
    this.serverEndpoint = process.env.SERVER_ENDPOINT!;

    if (
      !this.supabaseUrl ||
      !this.supabaseServiceKey ||
      !this.googleAiApiKey ||
      !this.anthropicApiKey ||
      !this.stripeSecretKey ||
      !this.jwtSecret ||
      !this.serverEndpoint
    ) {
      throw new Error('Missing required environment variables for ChatService');
    }

    // Initialize Stripe and ChatEngine
    this.stripe = new Stripe(this.stripeSecretKey);

    // Initialize ChatEngine with required configuration
    const chatEngineConfig: ChatEngineConfig = {
      supabaseUrl: this.supabaseUrl,
      supabaseServiceKey: this.supabaseServiceKey,
      googleAiApiKey: this.googleAiApiKey,
      anthropicApiKey: this.anthropicApiKey,
      fastifyApp: this.fastifyApp,
    };

    this.chatEngine = new ChatEngine(chatEngineConfig);
  }

  public registerRoutes(app: FastifyInstance): void {
    // OPTIONS /chat - Handle preflight requests
    app.options('/chat', async (request, reply) => {
      reply.headers({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '3600',
      });
      reply.status(200).send();
    });

    // POST /chat
    app.post<{
      Body: ChatRequestBody;
    }>(
      '/chat',
      {
        schema: {
          body: {
            type: 'object',
            required: ['messages', 'chat_session_id', 'prototype_id'],
            properties: {
              messages: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['role', 'content'],
                  properties: {
                    role: { type: 'string', enum: ['user', 'assistant'] },
                    content: { type: 'string' },
                  },
                },
              },
              inputFiles: {
                type: ['object', 'null'],
                additionalProperties: {
                  type: 'object',
                  required: ['contents', 'name', 'prototype_id'],
                  properties: {
                    contents: { type: 'string' },
                    name: { type: 'string' },
                    prototype_id: { type: 'string' },
                    id: { type: 'string' },
                    created_at: { type: 'string' },
                    updated_at: { type: 'string' },
                  },
                },
              },
              inputAssets: {
                type: ['object', 'null'],
                additionalProperties: {
                  type: 'object',
                  required: ['storage_url', 'name', 'prototype_id'],
                  properties: {
                    storage_url: { type: 'string' },
                    name: { type: 'string' },
                    prototype_id: { type: 'string' },
                    id: { type: 'string' },
                    created_at: { type: 'string' },
                    updated_at: { type: 'string' },
                  },
                },
              },
              chat_session_id: { type: 'string' },
              prototype_id: { type: 'string' },
            },
          },
        },
      },
      this.handleChat.bind(this),
    );
  }

  private async handleChat(
    request: FastifyRequest<{ Body: ChatRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      // ------------------------------------------------------------------------------------------------
      // 1. Parse request body
      // ------------------------------------------------------------------------------------------------
      const {
        messages,
        inputFiles,
        inputAssets,
        chat_session_id,
        prototype_id,
      } = request.body;
      const fileManager = new FileManager(
        inputFiles,
        request.log2,
        prototype_id,
      );

      // ------------------------------------------------------------------------------------------------
      // 2. must be an AUTHORIZED user with prototype edit access
      // ------------------------------------------------------------------------------------------------
      const token = request.headers.authorization?.split(' ')[1] ?? '';
      const authResult = await checkUserHasPrototypeEditAccess(
        prototype_id,
        token,
        request.log2,
      );
      if (authResult === null) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'Unauthorized: Invalid token',
        } as ChatErrorResponse);
      } else if (authResult.canEdit === false) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error:
            'Unauthorized: User does not have permissions to edit this prototype',
        } as ChatErrorResponse);
      }
      const user = authResult.user;
      // update logger context
      request.log2 = request.log2.child({
        userId: user.id,
      });

      // ------------------------------------------------------------------------------------------------
      // 3. Fetch user subscription and paywall the user if needed
      // ------------------------------------------------------------------------------------------------
      const paywallResult = await hasExceededChatUsageLimit(
        token,
        user.id,
        request.log2,
      );
      if (paywallResult.exceeded) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'Unauthorized: User has exceeded their monthly usage limit',
          usage: {
            current: paywallResult.current,
            limit: 15,
            tier: ProductKeys.FREE_SUBSCRIPTION,
          },
        } as ChatErrorResponse);
      }
      const userTier = paywallResult.plan;

      // ------------------------------------------------------------------------------------------------
      // 4. Precheck with dispatcher service to ensure nothing is currently building for this prototype
      // ------------------------------------------------------------------------------------------------
      const precheckResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch-edit-intent',
        headers: {
          'x-trace-id': request.log2.getTraceId(),
        },
        payload: {
          jwt: token,
          prototype_id: prototype_id,
        } as DispatchPrecheckRequestBody,
      });

      const precheckData: DispatchPrecheckResponse = JSON.parse(
        precheckResponse.payload,
      );

      if (
        'success' in precheckData &&
        isDispatchInProgress(precheckData.status)
      ) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error:
            "Cannot chat while a build is currently in progress. Materialize agents won't be able to build your files.",
        } as ChatErrorResponse);
      }

      // ------------------------------------------------------------------------------------------------
      // 5. Load/generate additional project context
      // ------------------------------------------------------------------------------------------------
      const lastMessage = messages[messages.length - 1];
      const userMessage = lastMessage.content;

      // Check if this request expects streaming (new flow)
      const expectsStreaming = request.headers.accept === 'text/event-stream';
      if (!expectsStreaming) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Streaming is required for this endpoint.',
        } as ChatErrorResponse);
      }

      // ------------------------------------------------------------------------------------------------
      // 6. Start streamed response to the client
      // ------------------------------------------------------------------------------------------------
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start: async (controller): Promise<void> => {
          try {
            // ------------------------------------------------------------------------------------------------
            // 7. Execute chat through ChatEngine
            // ------------------------------------------------------------------------------------------------
            await this.chatEngine.executeChat({
              messages,
              userMessage,
              fileManager,
              inputFiles,
              inputAssets,
              prototype_id,
              token,
              chat_session_id,
              controller,
              encoder,
              log2: request.log2,
              precheckData,
            });

            // ------------------------------------------------------------------------------------------------
            // 8. Track API usage and get updated count
            // ------------------------------------------------------------------------------------------------
            const supabase = createClient<Database>(
              this.supabaseUrl,
              this.supabaseServiceKey,
            );
            await supabase.from('api_usage').insert({
              user_id: user.id,
              prototype_id: prototype_id || null,
            });

            // Get the updated message count for the current billing period
            let updatedMessageCount = 0;
            // For users with subscription, use their billing period
            const periodStart = paywallResult.currentPeriodStart.toISOString();
            const periodEnd = paywallResult.currentPeriodEnd.toISOString();

            const { count: newCount, error: countError } = await supabase
              .from('api_usage')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .gte('created_at', periodStart)
              .lte('created_at', periodEnd);
            if (countError) {
              request.log2.consoleLogDevOnly(
                'error',
                '[handleChat] Error fetching updated message count:',
                { countError },
              );
            }
            updatedMessageCount = newCount || 0;

            // Send updated message count to client
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'usage_update',
                  messageCount: updatedMessageCount,
                })}\n\n`,
              ),
            );

            // ------------------------------------------------------------------------------------------------
            // 9. If the user has an active subscription, send the usage data to Stripe
            // ------------------------------------------------------------------------------------------------
            if (
              userTier === ProductKeys.PRO_SUBSCRIPTION &&
              paywallResult.stripeCustomerId
            ) {
              try {
                await this.stripe.billing.meterEvents.create({
                  event_name: 'materialize_assistant_messages',
                  payload: {
                    stripe_customer_id: paywallResult.stripeCustomerId,
                    value: '1',
                  },
                });
              } catch (stripeError) {
                request.log2.error(
                  stripeError,
                  '[handleChat] Error sending Stripe meter event:',
                  {
                    userId: user.id,
                    stripeCustomerId: paywallResult.stripeCustomerId,
                  },
                );
              }
            }

            controller.close();
          } catch (error) {
            request.log2.error(
              error,
              '[handleChat] Streaming error in controller:',
              {
                userId: user.id,
              },
            );
            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'error',
                    error:
                      error instanceof Error
                        ? error.message
                        : 'Internal server error',
                  })}\n\n`,
                ),
              );
            } catch (enqueueError) {
              request.log2.consoleLogDevOnly(
                'error',
                '[handleChat] Failed to enqueue error message:',
                { enqueueError },
              );
            }
            try {
              controller.close();
            } catch (closeError) {
              request.log2.error(
                closeError,
                '[handleChat] Failed to close controller:',
              );
            }
          }
        },
      });

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      });

      const reader = stream.getReader();
      const pump = async (): Promise<void> => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            reply.raw.write(value);
          }
        } catch (err) {
          request.log2.error(err, '[handleChat] Stream error:');
          // Send error event before closing
          const errorEvent = `data: ${JSON.stringify({
            type: 'error',
            error:
              err instanceof Error ? err.message : 'Stream processing error',
          })}\n\n`;
          reply.raw.write(errorEvent);
        } finally {
          reply.raw.end();
        }
      };

      await pump();
    } catch (error) {
      request.log2.error(error, '[handleChat] Chat API error:');
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: error instanceof Error ? error.message : 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      } as ChatErrorResponse);
    }
  }
}
