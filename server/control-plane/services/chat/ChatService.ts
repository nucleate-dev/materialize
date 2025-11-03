import { createClient } from '@supabase/supabase-js';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Stripe from 'stripe';
import type {
  ChatErrorResponse,
  ChatRequestBody,
} from '../../types/PublicAPITypes.js';
import { HTTP_STATUS } from '../../types/PublicAPITypes.js';
import {
  isDispatchInProgress,
  isEditableDevServer,
} from '../../utils/prototypeDevServerStatusUtils.js';
import { validateChatAuth } from './utils/chat-auth.js';
import { ChatStreamEventType } from './utils/chat-types.js';
import { parseFileContextFromMessage } from './utils/file-context.js';
import { VirtualFileManager } from './utils/file-manager.js';
// import { trackChatUsage } from './utils/usage-tracking.js';
import { DispatcherService } from '../dispatcher/DispatcherService.js';
import { ChatEngineConfig } from '../../types/InternalTypes.js';
import { ChatEngineV2 } from './engines/ChatEngineV2.js';

export class ChatService {
  private fastifyApp: FastifyInstance;
  private dispatcherService: DispatcherService;
  private supabaseUrl: string;
  private supabaseServiceKey: string;
  private googleAiApiKey: string;
  private anthropicApiKey: string;
  private openAiApiKey: string | undefined;
  private stripeSecretKey: string;
  private jwtSecret: string;

  private stripe: Stripe;
  private chatEngine: ChatEngineV2;

  constructor(
    fastifyApp: FastifyInstance,
    dispatcherService: DispatcherService,
  ) {
    this.fastifyApp = fastifyApp;
    this.dispatcherService = dispatcherService;
    // Environment validation
    this.supabaseUrl = process.env.SUPABASE_URL!;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    this.googleAiApiKey = process.env.GOOGLE_AI_API_KEY!;
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY!;
    this.openAiApiKey = process.env.OPENAI_API_KEY;
    this.stripeSecretKey = process.env.STRIPE_SECRET_KEY!;
    this.jwtSecret = process.env.JWT_SECRET!;

    if (
      !this.supabaseUrl ||
      !this.supabaseServiceKey ||
      !this.googleAiApiKey ||
      !this.anthropicApiKey ||
      !this.stripeSecretKey ||
      !this.jwtSecret ||
      !this.openAiApiKey
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
      openAiApiKey: this.openAiApiKey,
      dispatcherService: this.dispatcherService,
    };
    this.chatEngine = new ChatEngineV2(chatEngineConfig);
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
              imageUrl: { type: 'string' },
              currentViewingPath: { type: 'string' },
              modelProvider: {
                type: 'string',
                enum: [
                  'google',
                  'google-pro',
                  'anthropic',
                  'openai',
                  'openai-mini',
                ],
              },
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
        imageUrl,
        currentViewingPath,
        modelProvider,
      } = request.body;

      // ------------------------------------------------------------------------------------------------
      // 2 & 3. Authorization and paywall validation && update logger context
      // ------------------------------------------------------------------------------------------------
      const authValidation = await validateChatAuth(request, prototype_id);
      if (!authValidation.success) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: authValidation.error.error,
          usage: authValidation.error.usage,
        } as ChatErrorResponse);
      }
      // const { user, userTier, paywallResult } = authValidation.result;
      const { user } = authValidation.result;
      const token = request.headers.authorization?.split(' ')[1] ?? '';
      request.log2 = request.log2.child({
        userId: user.id,
        prototypeId: prototype_id,
        function: 'handleChat',
      });

      // ------------------------------------------------------------------------------------------------
      // 3. Precheck with dispatcher service to ensure nothing is currently building for this prototype
      // ------------------------------------------------------------------------------------------------
      const precheckResult = await this.dispatcherService.dispatchEditIntent(
        { prototype_id },
        token,
        request.log2,
      );
      const precheckData = precheckResult;
      let file_scope: 'complete' | 'updates' = 'updates';
      if (precheckData.data && isDispatchInProgress(precheckData.data.status)) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error:
            "Cannot chat while a build is currently in progress. Materialize agents won't be able to build your files.",
        } as ChatErrorResponse);
      } else if (
        precheckData.data &&
        !isEditableDevServer(precheckData.data.status)
      ) {
        file_scope = 'complete';
      }

      // 3a. Start a heartbeat to keep the edit intent alive
      const EDIT_INTENT_HEARTBEAT_MS = 3 * 60_000;
      let editIntentHeartbeat: NodeJS.Timeout | null = null;
      const stopEditIntentHeartbeat = (): void => {
        if (editIntentHeartbeat) {
          clearInterval(editIntentHeartbeat);
          editIntentHeartbeat = null;
        }
      };
      const startEditIntentHeartbeat = (): void => {
        if (editIntentHeartbeat) {
          return;
        }
        editIntentHeartbeat = setInterval(() => {
          void this.dispatcherService
            .dispatchEditIntent({ prototype_id }, token, request.log2)
            .catch((error) => {
              request.log2.warn(
                '[ChatService] Failed to refresh edit intent heartbeat',
                {
                  error: error instanceof Error ? error.message : String(error),
                },
              );
            });
        }, EDIT_INTENT_HEARTBEAT_MS);
      };
      startEditIntentHeartbeat();

      // ------------------------------------------------------------------------------------------------
      // 4. Load/generate additional project context and parse file mentions
      // ------------------------------------------------------------------------------------------------
      // Parse file context from the user message
      const lastMessage = messages[messages.length - 1];
      const originalUserMessage = lastMessage.content;
      const fileContext = parseFileContextFromMessage(
        originalUserMessage,
        inputFiles,
        request.log2,
      );

      // Update the last message with enhanced content if file mentions were found
      const enhancedMessages = [...messages];
      if (
        fileContext.hasFileMentions &&
        fileContext.enhancedMessage !== originalUserMessage
      ) {
        enhancedMessages[enhancedMessages.length - 1] = {
          ...lastMessage,
          content: fileContext.enhancedMessage,
        };
        request.log2.info(
          '[ChatService] Enhanced user message with file context',
          {
            originalLength: originalUserMessage.length,
            enhancedLength: fileContext.enhancedMessage.length,
            mentionedFiles: fileContext.mentionedFiles,
          },
        );
      }

      // Check if this request expects streaming (new flow)
      const expectsStreaming = request.headers.accept === 'text/event-stream';
      if (!expectsStreaming) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Streaming is required for this endpoint.',
        } as ChatErrorResponse);
      }

      // ------------------------------------------------------------------------------------------------
      // 5. Start streamed response to the client
      // ------------------------------------------------------------------------------------------------
      const fileManager = new VirtualFileManager(
        inputFiles,
        request.log2,
        prototype_id,
        file_scope,
      );
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start: async (controller): Promise<void> => {
          try {
            const supabase = createClient(
              this.supabaseUrl,
              this.supabaseServiceKey,
            );
            // ------------------------------------------------------------------------------------------------
            // 6. Execute chat through ChatEngine (llm planning + execution, file persistence, message persistence, dispatch, & error handling)
            // ------------------------------------------------------------------------------------------------
            await this.chatEngine.executeChat({
              messages: enhancedMessages,
              userMessage: fileContext.enhancedMessage,
              originalUserMessage,
              fileManager,
              inputFiles,
              inputAssets,
              prototype_id,
              token,
              chat_session_id,
              controller,
              encoder,
              supabase,
              log2: request.log2,
              imageUrl: imageUrl ?? null,
              currentViewingPath: currentViewingPath ?? null,
              modelProvider,
            });

            // ------------------------------------------------------------------------------------------------
            // 7. Track API usage and get updated count
            // ------------------------------------------------------------------------------------------------
            // TODO: only track api usage if there are no errors
            // Temporarily disable this for the playtest. TODO we must add this back in after the playtest.
            // const { updatedMessageCount } = await trackChatUsage(
            //   this.stripe,
            //   user.id,
            //   prototype_id,
            //   userTier,
            //   paywallResult.stripeCustomerId,
            //   paywallResult.currentPeriodStart,
            //   paywallResult.currentPeriodEnd,
            //   this.supabaseUrl,
            //   this.supabaseServiceKey,
            //   request.log2,
            // );

            // Send updated message count to client
            // controller.enqueue(
            //   encoder.encode(
            //     `data: ${JSON.stringify({
            //       type: ChatStreamEventType.USAGE_UPDATE,
            //       messageCount: updatedMessageCount,
            //     })}\n\n`,
            //   ),
            // );
          } catch (error) {
            if (
              error instanceof Error &&
              !error.message.includes('Controller is already closed')
            ) {
              request.log2.error(
                error,
                '[handleChat] Streaming error in controller:',
                {
                  userId: user.id,
                },
              );
            }

            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: ChatStreamEventType.ERROR,
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
          } finally {
            stopEditIntentHeartbeat();
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: ChatStreamEventType.STREAM_COMPLETE,
                })}\n\n`,
              ),
            );
            controller.close();
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
        'Content-Encoding': 'none',
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
            type: ChatStreamEventType.ERROR,
            error:
              err instanceof Error ? err.message : 'Stream processing error',
          })}\n\n`;
          reply.raw.write(errorEvent);
        } finally {
          stopEditIntentHeartbeat();
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
