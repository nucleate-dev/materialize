import { createClient } from '@supabase/supabase-js';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Stripe from 'stripe';
import type { SystemLogger } from '../../loggers/SystemLogger.js';
import type {
  APIResponse,
  ChatErrorResponse,
  ChatRequestBody,
  DispatchPrecheckErrorResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckSuccessResponse,
  EnhancedChatContext,
  PrototypeFileInput,
} from '../../types/PublicAPITypes.js';
import { HTTP_STATUS } from '../../types/PublicAPITypes.js';
import {
  isDispatchInProgress,
  isEditableDevServer,
} from '../../utils/prototypeDevServerStatusUtils.js';
import { ChatEngineV1, type ChatEngineConfig } from './engines/ChatEngineV1.js';
import { validateChatAuth } from './utils/chat-auth.js';
import { parseFileContextFromMessage } from './utils/file-context.js';
import { VirtualFileManager } from './utils/file-manager.js';
import { trackChatUsage } from './utils/usage-tracking.js';

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
  private chatEngine: ChatEngineV1;

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
    this.chatEngine = new ChatEngineV1(chatEngineConfig);
  }

  private async persistChatMessages(
    chatSessionId: string,
    userMessage: string,
    assistantResponse: string,
    log2: SystemLogger,
    executionPlan?: string[],
    fileChanges?: Record<string, PrototypeFileInput>,
    completedSteps?: number[],
    toolCalls?: Array<{ toolName: string; input: unknown; output: unknown }>,
  ): Promise<void> {
    try {
      const supabase = createClient(this.supabaseUrl, this.supabaseServiceKey);

      // 1. Insert simple messages into prototype_chat_messages table
      const messagesToInsert = [
        {
          chat_session_id: chatSessionId,
          role: 'user' as const,
          content: userMessage,
        },
        {
          chat_session_id: chatSessionId,
          role: 'assistant' as const,
          content: assistantResponse,
        },
      ];

      const { error: messagesError } = await supabase
        .from('prototype_chat_messages')
        .insert(messagesToInsert);

      if (messagesError) {
        log2.error('Failed to insert chat messages:', messagesError.message);
        return;
      }

      // 2. Update enhanced chat context in chat session
      // First, fetch current context
      const { data: sessionData, error: fetchError } = await supabase
        .from('prototype_chat_sessions')
        .select('chat_context')
        .eq('id', chatSessionId)
        .single();

      if (fetchError) {
        log2.error('Failed to fetch chat session context:', fetchError.message);
        return;
      }

      // Parse existing context or create new one
      let context: EnhancedChatContext;
      try {
        context = sessionData?.chat_context
          ? (JSON.parse(
              sessionData.chat_context as string,
            ) as EnhancedChatContext)
          : { conversations: [] };
      } catch {
        log2.warn('Failed to parse existing chat context, creating new one');
        context = { conversations: [] };
      }

      // Add new conversation
      context.conversations.push({
        timestamp: new Date().toISOString(),
        userMessage,
        executionPlan,
        assistantResponse,
        fileChanges,
        completedSteps,
        toolCalls,
      });

      // Keep only last 50 conversations to prevent unlimited growth
      if (context.conversations.length > 50) {
        context.conversations = context.conversations.slice(-50);
      }

      // Update the session with new context
      const { error: updateError } = await supabase
        .from('prototype_chat_sessions')
        .update({ chat_context: JSON.stringify(context) })
        .eq('id', chatSessionId);

      if (updateError) {
        log2.error(
          'Failed to update chat session context:',
          updateError.message,
        );
        return;
      }

      log2.info(
        '[ChatService] Successfully persisted chat messages and context',
      );
    } catch (error) {
      log2.error(
        'Error in persistChatMessages:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
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
      const { user, userTier, paywallResult } = authValidation.result;
      const token = request.headers.authorization?.split(' ')[1] ?? '';
      request.log2 = request.log2.child({
        userId: user.id,
        prototypeId: prototype_id,
        function: 'handleChat',
      });

      // ------------------------------------------------------------------------------------------------
      // 3. Precheck with dispatcher service to ensure nothing is currently building for this prototype
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
      const precheckData: APIResponse<
        DispatchPrecheckSuccessResponse,
        DispatchPrecheckErrorResponse
      > = JSON.parse(precheckResponse.payload);
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

      // ------------------------------------------------------------------------------------------------
      // 4. Load/generate additional project context and parse file mentions
      // ------------------------------------------------------------------------------------------------
      // Parse file context from the user message
      const lastMessage = messages[messages.length - 1];
      const userMessage = lastMessage.content;
      const fileContext = parseFileContextFromMessage(
        userMessage,
        inputFiles,
        request.log2,
      );

      // Update the last message with enhanced content if file mentions were found
      const enhancedMessages = [...messages];
      if (
        fileContext.hasFileMentions &&
        fileContext.enhancedMessage !== userMessage
      ) {
        enhancedMessages[enhancedMessages.length - 1] = {
          ...lastMessage,
          content: fileContext.enhancedMessage,
        };
        request.log2.info(
          '[ChatService] Enhanced user message with file context',
          {
            originalLength: userMessage.length,
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
            // 6. Execute chat through ChatEngine
            // ------------------------------------------------------------------------------------------------
            const chatResult = await this.chatEngine.executeChat({
              messages: enhancedMessages,
              userMessage: fileContext.enhancedMessage,
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
            });

            // ------------------------------------------------------------------------------------------------
            // 7. Track API usage and get updated count
            // ------------------------------------------------------------------------------------------------
            // TODO: only track api usage if there are no errors
            const { updatedMessageCount } = await trackChatUsage(
              this.stripe,
              user.id,
              prototype_id,
              userTier,
              paywallResult.stripeCustomerId,
              paywallResult.currentPeriodStart,
              paywallResult.currentPeriodEnd,
              this.supabaseUrl,
              this.supabaseServiceKey,
              request.log2,
            );

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
            // 8. Persist chat messages and enhanced context
            // ------------------------------------------------------------------------------------------------
            await this.persistChatMessages(
              chat_session_id,
              fileContext.enhancedMessage,
              chatResult.assistantResponse,
              request.log2,
              chatResult.executionPlan,
              chatResult.fileChanges,
              chatResult.completedSteps,
              chatResult.toolCalls,
            );
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
              if (
                closeError instanceof Error &&
                !closeError.message.includes('Controller is already closed')
              ) {
                request.log2.error(
                  closeError,
                  '[handleChat] Failed to close controller:',
                );
              }
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
