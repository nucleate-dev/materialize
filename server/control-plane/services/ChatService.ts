import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { z } from 'zod';
import type {
  ChatErrorResponse,
  ChatRequestBody,
  DispatchPrecheckRequestBody,
  DispatchPrecheckResponse,
  DispatchRequestBody,
  DispatchResponse,
  PrototypeFileInput,
} from '../types/PublicAPITypes.js';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import type { Database } from '../types/supabase.js';
import {
  EXECUTION_PROMPT,
  genToolUsageReflectionPrompt,
  PLANNING_PROMPT,
} from '../utils/chat-utils/PROMPTS.js';
import { extractExecutionPlan } from '../utils/chat-utils/planningExtractor.js';

type PrototypeFile = Database['public']['Tables']['prototype_files']['Row'];

interface PrototypeFiles {
  [filePath: string]: PrototypeFile;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
  };
  getFinalState(): PrototypeFiles;
}

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
  private stripeSecretKey: string;
  private jwtSecret: string;
  private serverEndpoint: string;

  private google: ReturnType<typeof createGoogleGenerativeAI>;
  private stripe: Stripe;

  constructor(fastifyApp: FastifyInstance) {
    this.fastifyApp = fastifyApp;

    // Environment validation
    this.supabaseUrl = process.env.SUPABASE_URL!;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    this.googleAiApiKey = process.env.GOOGLE_AI_API_KEY!;
    this.stripeSecretKey = process.env.STRIPE_SECRET_KEY!;
    this.jwtSecret = process.env.JWT_SECRET!;
    this.serverEndpoint = process.env.SERVER_ENDPOINT!;

    if (
      !this.supabaseUrl ||
      !this.supabaseServiceKey ||
      !this.googleAiApiKey ||
      !this.stripeSecretKey ||
      !this.jwtSecret ||
      !this.serverEndpoint
    ) {
      throw new Error('Missing required environment variables for ChatService');
    }

    // Initialize Google AI and Stripe
    this.google = createGoogleGenerativeAI({
      apiKey: this.googleAiApiKey,
    });

    this.stripe = new Stripe(this.stripeSecretKey);
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
      // 1. JWT Token validation -- must be an AUTHORIZED user
      // ------------------------------------------------------------------------------------------------
      const token = request.headers.authorization?.split(' ')[1];
      if (!token || !request.headers.authorization?.startsWith('Bearer')) {
        console.error('No JWT token provided');
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'Unauthorized: No token provided',
        } as ChatErrorResponse);
      }

      let userID: string;
      try {
        const decoded = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
        userID = decoded.sub as string;
      } catch (error) {
        console.error('Invalid JWT token: ', error);
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'Unauthorized: Invalid token',
        } as ChatErrorResponse);
      }

      if (!userID) {
        console.error('User ID is null or undefined from JWT token');
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error: 'Unauthorized: Invalid user ID',
        } as ChatErrorResponse);
      }

      // ------------------------------------------------------------------------------------------------
      // 2. Fetch user subscription and paywall the user if needed
      // ------------------------------------------------------------------------------------------------
      const supabase = createClient<Database>(
        this.supabaseUrl,
        this.supabaseServiceKey,
      );

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const startOfMonthISO = startOfMonth.toISOString();

      const [subscriptionResult, apiUsageResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select(
            'id, plan_id, price_id, status, stripe_customer_id, current_period_start, current_period_end',
          )
          .eq('user_id', userID)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .maybeSingle(),
        supabase
          .from('api_usage')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userID)
          .gte('created_at', startOfMonthISO),
      ]);

      const { data: userSubscription, error: subscriptionError } =
        subscriptionResult;
      const { count: monthlyApiUsageCount, error: apiUsageError } =
        apiUsageResult;

      let userTier: string = ProductKeys.FREE_SUBSCRIPTION; // Default to free tier

      if (subscriptionError) {
        console.error('Error fetching user subscription:', subscriptionError);
        // Continue with free tier rather than failing the request
      } else if (userSubscription) {
        // User has an active subscription, determine their tier from plan_id
        userTier = userSubscription.plan_id;
        console.log(
          `User ${userID} is on ${userTier} tier with subscription:`,
          userSubscription.id,
        );
      } else {
        // No active subscription found, user is on free tier
        console.log(
          `User ${userID} has no active subscription, defaulting to free tier`,
        );
      }

      if (apiUsageError) {
        console.error('Error fetching monthly API usage:', apiUsageError);
      }

      console.log(`User tier determined: ${userTier}`);
      console.log(`Monthly API usage count: ${monthlyApiUsageCount || 0}`);

      // If user is on free tier, check their usage limits and paywall them if they exceed the limit
      if (
        userTier === ProductKeys.FREE_SUBSCRIPTION &&
        (monthlyApiUsageCount || 0) >= 15
      ) {
        console.log(
          `User ${userID} has reached free tier monthly limit: ${monthlyApiUsageCount}/15`,
        );
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          error:
            'You have reached your free monthly messaging limit of 15 messages. Please upgrade your subscription to continue using the service.',
          usage: {
            current: monthlyApiUsageCount,
            limit: 15,
            tier: ProductKeys.FREE_SUBSCRIPTION,
          },
        } as ChatErrorResponse);
      }

      // ------------------------------------------------------------------------------------------------
      // 3. Parse request body
      // ------------------------------------------------------------------------------------------------
      const {
        messages,
        inputFiles,
        inputAssets,
        chat_session_id,
        prototype_id,
      } = request.body;
      if (!messages || !Array.isArray(messages)) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Messages array is required',
        } as ChatErrorResponse);
      }

      const fileManager = new this.FileManager(inputFiles, prototype_id);

      // ------------------------------------------------------------------------------------------------
      // 4. Precheck with dispatcher service to ensure nothing is currently building for this prototype
      // ------------------------------------------------------------------------------------------------
      const precheckResponse = await this.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch-precheck',
        payload: {
          jwt: token,
          prototype_id: prototype_id,
        } as DispatchPrecheckRequestBody,
      });

      const precheckData: DispatchPrecheckResponse = JSON.parse(
        precheckResponse.payload,
      );
      console.log('Dispatch precheck response:', precheckData);

      if (
        'success' in precheckData &&
        (precheckData.status === 'updating' ||
          precheckData.status === 'creating')
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
      let userMessage = lastMessage.content;

      // Always inject project context if available (prevents LLM hallucination)
      console.log('<� Injecting Expo Snack project context for development...');
      const projectContext = this.getProjectContext(inputFiles);
      if (projectContext) {
        userMessage += projectContext;
        console.log(' Expo Snack project context successfully injected');
      } else {
        console.log('� No relevant Expo Snack files found to inject');
      }

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
            // 7. Execute planning phase
            // ------------------------------------------------------------------------------------------------
            console.log('🧠 [SERVER] Starting planning phase...');
            const planningResult = await this.handlePlanningPhase(
              messages,
              userMessage,
              fileManager,
              inputFiles,
              chat_session_id,
              controller,
              encoder,
            );

            console.log(
              '🧠 [ChatService] Planning result:',
              JSON.stringify(planningResult, null, 2),
            );

            // ------------------------------------------------------------------------------------------------
            // 8. EXECUTE EXECUTION PHASE
            // ------------------------------------------------------------------------------------------------
            console.log('⚙️ [ChatService] Starting execution phase...');
            await this.handleExecutionPhase(
              supabase,
              planningResult,
              fileManager,
              messages,
              inputFiles,
              prototype_id,
              controller,
              encoder,
              chat_session_id,
            );

            // ------------------------------------------------------------------------------------------------
            // 10. Fetch assets from database and merge with text files for dispatch
            // ------------------------------------------------------------------------------------------------
            // Stream dispatch start event to show loading indicator
            const finalFiles = fileManager.getFinalState();
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'dispatch_start',
                  message: 'Starting build process...',
                })}\n\n`,
              ),
            );

            // Convert inputFiles to the expected PrototypeFileInput format
            const finalFilesForDispatch: PrototypeFileInput[] = [];
            Object.entries(finalFiles).forEach(([, file]) => {
              finalFilesForDispatch.push({
                ...file,
              });
            });

            try {
              let tempDispatchResponse;
              if (
                'state' in precheckData &&
                precheckData.state === 'active_dev_server'
              ) {
                tempDispatchResponse = await this.fastifyApp.inject({
                  method: 'POST',
                  url: '/dispatch',
                  payload: {
                    jwt: token,
                    prototype_id: prototype_id,
                    framework: 'expo_react_native',
                    files: finalFilesForDispatch,
                    assets: [],
                    file_scope: 'updates',
                    hot_reload: true,
                  } as DispatchRequestBody,
                });
              } else {
                // If there is no active dev server, we need to dispatch the complete set of files and assets
                tempDispatchResponse = await this.fastifyApp.inject({
                  method: 'POST',
                  url: '/dispatch',
                  payload: {
                    jwt: token,
                    prototype_id: prototype_id,
                    framework: 'expo_react_native',
                    files: finalFilesForDispatch,
                    assets: Object.entries(inputAssets || {})
                      .map(([, asset]) => {
                        return asset;
                      })
                      .filter((asset) => asset !== null),
                    file_scope: 'complete',
                    hot_reload: true,
                  } as DispatchRequestBody,
                });
              }

              const dispatchData: DispatchResponse = JSON.parse(
                tempDispatchResponse.payload,
              );
              console.log('=� Dispatch endpoint response:', dispatchData);

              // Stream the viewing URL to the client
              if ('viewing_url' in dispatchData && dispatchData.viewing_url) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'viewing_url',
                      viewing_url: dispatchData.viewing_url,
                    })}\n\n`,
                  ),
                );
              }

              // Stream dispatch completion event
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'dispatch_complete',
                    success: true,
                    message: 'Build process completed successfully',
                  })}\n\n`,
                ),
              );
            } catch (error) {
              console.error('L Error calling dispatch endpoint:', error);

              // Stream dispatch completion event for error case
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'dispatch_complete',
                    success: false,
                    message: 'Build process failed',
                    error:
                      error instanceof Error ? error.message : 'Unknown error',
                  })}\n\n`,
                ),
              );
            }

            // ------------------------------------------------------------------------------------------------
            // 11. Track API usage and get updated count
            // ------------------------------------------------------------------------------------------------
            await supabase.from('api_usage').insert({
              user_id: userID,
              prototype_id: prototype_id || null,
            });

            // Get the updated message count for the current billing period
            let updatedMessageCount = 0;
            // For users with subscription, use their billing period
            let periodStart = startOfMonthISO;
            let periodEnd = new Date().toISOString();

            if (
              userSubscription &&
              userSubscription.current_period_start &&
              userSubscription.current_period_end
            ) {
              periodStart = new Date(
                userSubscription.current_period_start * 1000,
              ).toISOString();
              periodEnd = new Date(
                userSubscription.current_period_end * 1000,
              ).toISOString();
            }

            const { count: newCount, error: countError } = await supabase
              .from('api_usage')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userID)
              .gte('created_at', periodStart)
              .lte('created_at', periodEnd);
            if (countError) {
              console.error(
                'Error fetching updated message count:',
                countError,
              );
            }
            updatedMessageCount = newCount || 0;
            console.log(
              `Updated message count for user ${userID}: ${updatedMessageCount}`,
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
            // 12. If the user has an active subscription, send the usage data to Stripe
            // ------------------------------------------------------------------------------------------------
            if (
              userTier === ProductKeys.PRO_SUBSCRIPTION &&
              userSubscription?.stripe_customer_id
            ) {
              try {
                await this.stripe.billing.meterEvents.create({
                  event_name: 'materialize_assistant_messages',
                  payload: {
                    stripe_customer_id: userSubscription.stripe_customer_id,
                    value: '1',
                  },
                });
                console.log(
                  `Stripe meter event successfully sent for pro user ${userID}`,
                );
              } catch (stripeError) {
                console.error('Error sending Stripe meter event:', stripeError);
                // Don't fail the request if Stripe meter event fails
              }
            }

            console.log('🔚 [SERVER] Stream controller closing normally');
            controller.close();
          } catch (error) {
            console.error('💥 [SERVER] Streaming error in controller:', error);
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
              console.error(
                '💥 [SERVER] Failed to enqueue error message:',
                enqueueError,
              );
            }
            try {
              controller.close();
            } catch (closeError) {
              console.error(
                '💥 [SERVER] Failed to close controller:',
                closeError,
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
        // 'Access-Control-Allow-Credentials': 'true',
      });

      const reader = stream.getReader();
      const pump = async (): Promise<void> => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log('🔚 [SERVER] Stream completed successfully');
              break;
            }
            console.log(
              '📤 [SERVER] Writing stream chunk:',
              new TextDecoder().decode(value).substring(0, 100) + '...',
            );
            reply.raw.write(value);
          }
        } catch (err) {
          console.error('💥 [SERVER] Stream error:', err);
          // Send error event before closing
          const errorEvent = `data: ${JSON.stringify({
            type: 'error',
            error:
              err instanceof Error ? err.message : 'Stream processing error',
          })}\n\n`;
          reply.raw.write(errorEvent);
        } finally {
          console.log('🔚 [SERVER] Ending response stream');
          reply.raw.end();
        }
      };

      await pump();
    } catch (error) {
      console.error('Chat API error:', error);
      return reply.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
        error: error instanceof Error ? error.message : 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      } as ChatErrorResponse);
    }
  }

  // Private utility methods migrated from the original implementation

  private async handlePlanningPhase(
    messages: ChatMessage[],
    userMessage: string,
    fileManager: FileManagerInterface,
    convertedFiles: PrototypeFiles | null,
    chat_session_id: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
  ): Promise<string> {
    const supabase = createClient<Database>(
      this.supabaseUrl,
      this.supabaseServiceKey,
    );

    // Phase 1: Get the planning response
    let response = await generateText({
      model: this.google('gemini-2.5-flash'),
      system: PLANNING_PROMPT,
      tools: MODEL_TOOLS,
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

    let finalResponse = response.text;
    let toolCallsMade = 0;
    let lastToolCall: { name: string; args: unknown } | null = null;

    // Handle tool calls iteratively for planning
    while (response.toolCalls && response.toolCalls.length > 0) {
      toolCallsMade += response.toolCalls.length;
      console.log(
        `= Processing ${response.toolCalls.length} tool calls (total: ${toolCallsMade})`,
      );

      // Check for duplicate tool calls
      if (response.toolCalls.length === 1) {
        const currentToolCall = response.toolCalls[0];
        const currentCall = {
          name: currentToolCall.toolName,
          args: JSON.stringify(currentToolCall.input),
        };

        if (
          lastToolCall &&
          lastToolCall.name === currentCall.name &&
          lastToolCall.args === currentCall.args
        ) {
          console.log('=� Detected duplicate tool call');

          // If we have a valid plan, break the loop
          const hasValidPlan =
            finalResponse.includes('EXECUTION_PLAN') &&
            finalResponse.includes('[') &&
            finalResponse.includes(']');
          if (hasValidPlan) {
            console.log(' Valid plan detected, proceeding');
            finalResponse +=
              '\n\n Planning complete. Proceeding with execution.';
            break;
          } else {
            // Give the model feedback about duplicate tool calls and ask it to reflect
            console.log(
              '� No valid plan yet, asking model to reflect on duplicate calls',
            );

            const reflectionMessage = genToolUsageReflectionPrompt(
              currentCall.name,
              currentCall.args,
            );

            response = await generateText({
              model: this.google('gemini-2.5-flash'),
              system: PLANNING_PROMPT,
              messages: [
                ...messages.slice(0, -1).map((msg: ChatMessage) => ({
                  role: msg.role,
                  content: msg.content,
                })),
                {
                  role: 'user' as const,
                  content: userMessage,
                },
                {
                  role: 'assistant' as const,
                  content: finalResponse,
                },
                {
                  role: 'user' as const,
                  content: reflectionMessage,
                },
              ],
            });

            finalResponse = response.text;

            // If it still tries to make tool calls after reflection, force completion
            if (response.toolCalls && response.toolCalls.length > 0) {
              console.log(
                '� Model still trying to make tool calls after reflection, forcing plan creation',
              );
              finalResponse +=
                '\n\n� Creating execution plan with available information...';
              break;
            }
          }
        }

        lastToolCall = currentCall;
      }

      const toolResults = [];

      // Execute each tool call
      for (const toolCall of response.toolCalls) {
        try {
          const result = fileManager.handleToolCall({
            function: {
              name: toolCall.toolName,
              arguments: toolCall.input as Record<string, unknown>,
            },
          });

          toolResults.push({
            toolCallId: toolCall.toolCallId,
            result: JSON.stringify(result),
          });
        } catch (error) {
          console.error(`L Tool call failed: ${toolCall.toolName}`, error);
          toolResults.push({
            toolCallId: toolCall.toolCallId,
            result: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          });
        }
      }

      // Continue the conversation with tool results
      const toolResultsText = toolResults
        .map((tr) => `Tool ${tr.toolCallId}: ${tr.result}`)
        .join('\n');

      let continuationMessage = `Tool results:\n${toolResultsText}\n\nContinue with your task.`;
      // Only inject context every 5 tool calls to avoid confusion
      if (toolCallsMade % 5 === 0) {
        // Sourish: "toolCallsMade" is being incremented based on the # of tool calls per response. Is that always 1? If not,
        // this condition may never be true actually
        const projectContextContinuation =
          this.getProjectContext(convertedFiles);
        if (projectContextContinuation) {
          continuationMessage += projectContextContinuation;
        }
      }

      response = await generateText({
        model: this.google('gemini-2.5-flash'),
        system: PLANNING_PROMPT,
        tools: MODEL_TOOLS,
        messages: [
          ...messages.slice(0, -1).map((msg: ChatMessage) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          {
            role: 'user' as const,
            content: userMessage,
          },
          {
            role: 'assistant' as const,
            content: finalResponse,
          },
          {
            role: 'user' as const,
            content: continuationMessage,
          },
        ],
      });

      finalResponse = response.text;

      // Prevent infinite loops
      if (toolCallsMade > 50) {
        finalResponse += `\n\n� Maximum tool calls reached (50).`;
        break;
      }
    }

    // Ensure we have a valid plan before proceeding
    const hasValidPlan =
      finalResponse.includes('EXECUTION_PLAN') &&
      finalResponse.includes('[') &&
      finalResponse.includes(']');

    if (!hasValidPlan) {
      console.log(
        '�[ChatService] No valid execution plan found, generating fallback plan',
      );

      const fallbackResponse = await generateText({
        model: this.google('gemini-2.5-flash'),
        system:
          PLANNING_PROMPT +
          '\n\nCRITICAL: You MUST create an EXECUTION_PLAN in the exact format specified. Do not use any tools.',
        messages: [
          ...messages.slice(0, -1).map((msg: ChatMessage) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          {
            role: 'user' as const,
            content: userMessage,
          },
          {
            role: 'assistant' as const,
            content: finalResponse,
          },
          {
            role: 'user' as const,
            content:
              "You must now create a detailed EXECUTION_PLAN based on the user's request. Format it exactly as specified in your instructions.",
          },
        ],
      });

      finalResponse += '\n\n' + fallbackResponse.text;
    }

    console.log(
      '🧠 [ChatService] Planning phase final response:',
      finalResponse,
    );

    // Save planning message to database
    const { data: planningMessage } = await supabase
      .from('prototype_chat_messages')
      .insert({
        chat_session_id: chat_session_id,
        content: finalResponse,
        role: 'assistant',
        phase: 'planning',
      })
      .select()
      .single();

    // Send planning response
    console.log(
      '🧠 [SERVER] Sending planning phase response to client...',
      JSON.stringify({
        type: 'planning',
        content: finalResponse,
        updatedFiles: fileManager.getFinalState(),
        messageId: planningMessage?.id,
      }),
    );
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({
          type: 'planning',
          content: finalResponse,
          updatedFiles: fileManager.getFinalState(),
          messageId: planningMessage?.id,
        })}\n\n`,
      ),
    );

    return finalResponse;
  }

  private async handleExecutionPhase(
    supabase: SupabaseClient<Database>,
    finalResponse: string,
    fileManager: FileManagerInterface,
    messages: { role: string; content: string }[],
    inputFiles: PrototypeFiles | null,
    prototype_id: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    chat_session_id: string,
  ): Promise<void> {
    // Check if the response contains an execution plan
    if (finalResponse.includes('EXECUTION_PLAN')) {
      const planningResult = extractExecutionPlan(finalResponse);

      if (planningResult.hasPlan && planningResult.operations.length > 0) {
        // Send execution start
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'execution_start',
              operations: planningResult.operations,
            })}\n\n`,
          ),
        );

        // Execute each operation step by step
        for (let i = 0; i < planningResult.operations.length; i++) {
          const operation = planningResult.operations[i];

          // Send step start
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'step_start',
                stepIndex: i,
                operation: operation,
              })}\n\n`,
            ),
          );

          try {
            const stepResult = await this.executeStep(
              operation,
              fileManager,
              messages,
              inputFiles,
              prototype_id,
            );

            console.log('🔄 [ChatService] streaming step result: ');
            // Send step completion
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'step_complete',
                  stepIndex: i,
                  operation: operation,
                  result: stepResult,
                  success: stepResult.hasResult,
                })}\n\n`,
              ),
            );
          } catch (error) {
            console.error(`Error executing step ${i + 1}:`, error);

            // Send step error
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'step_error',
                  stepIndex: i,
                  operation: operation,
                  error:
                    error instanceof Error ? error.message : 'Unknown error',
                })}\n\n`,
              ),
            );
          }
        }

        // Send execution complete
        console.log('🔄 [ChatService] streaming execution complete result: ');
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'execution_complete',
              updatedFiles: fileManager.getFinalState(),
            })}\n\n`,
          ),
        );

        // Save execution summary message to database
        console.log('🔄 [ChatService] saving execution summary to database: ');
        const executionSummary = `🎉 Execution completed! Successfully processed ${
          planningResult.operations.length
        } operations:\n\n${planningResult.operations
          .map((op, index) => `${index + 1}. ${op.title} (${op.type})`)
          .join('\n')}`;

        await supabase.from('prototype_chat_messages').insert({
          chat_session_id: chat_session_id,
          content: executionSummary,
          role: 'assistant' as const,
          phase: 'execution',
        });
      }
    }
  }

  // Helper function to execute a single step
  private async executeStep(
    operation: {
      id: string;
      type: 'create' | 'modify' | 'delete' | 'move';
      title: string;
      description: string;
      filePath: string;
      newFilePath?: string;
    },
    fileManager: FileManagerInterface,
    messages: { role: string; content: string }[],
    inputFiles: PrototypeFiles | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _prototype_id: string,
  ): Promise<{
    content: string;
    updatedFiles: PrototypeFiles;
    hasResult: boolean;
  }> {
    const executionContext = `
EXECUTING STEP: ${operation.id}
Type: ${operation.type}
File: ${operation.filePath}
Task: ${operation.title}
Description: ${operation.description}

Execute this step using the available tools.`;

    // Force discovery before creation for screens
    let context = executionContext;
    if (operation.type === 'create' && operation.filePath.includes('Screen')) {
      context += `

MANDATORY: Before creating this screen, you MUST:
1. Use list_files to see all existing components
2. Use read_file to examine similar existing screens for import patterns
3. Only use imports that you've verified exist
4. If needed components don't exist, create a basic implementation or note the dependency`;
    }

    const lastMessage = messages[messages.length - 1];
    let userMessage = `${context}\n\nOriginal request: ${lastMessage.content}`;

    // Always inject project context
    const projectContext = this.getProjectContext(inputFiles);
    if (projectContext) {
      userMessage += projectContext;
    }

    // Use AI SDK with tool support
    let response = await generateText({
      model: this.google('gemini-2.5-flash'),
      system: EXECUTION_PROMPT,
      tools: MODEL_TOOLS,
      messages: [
        ...messages
          .slice(0, -1)
          .map((msg: { role: string; content: string }) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
        {
          role: 'user' as const,
          content: userMessage,
        },
      ],
    });

    let finalResponse = response.text;
    let toolCallsMade = 0;
    let lastToolCall: { name: string; args: unknown } | null = null;

    // Handle tool calls iteratively
    while (response.toolCalls && response.toolCalls.length > 0) {
      toolCallsMade += response.toolCalls.length;
      console.log(
        `🔄 Processing ${response.toolCalls.length} tool calls for step ${operation.id}`,
      );

      // Check for duplicate tool calls
      if (response.toolCalls.length === 1) {
        const currentToolCall = response.toolCalls[0];
        const currentCall = {
          name: currentToolCall.toolName,
          args: JSON.stringify(currentToolCall.input),
        };

        if (
          lastToolCall &&
          lastToolCall.name === currentCall.name &&
          lastToolCall.args === currentCall.args
        ) {
          console.log(
            '🚫 Detected duplicate tool call in execution, asking for reflection',
          );

          const reflectionMessage = `🔄 EXECUTION REFLECTION: You just made a duplicate tool call during step execution (${currentCall.name} with the same arguments). This indicates you may be stuck or not processing previous results.

CURRENT STEP: ${operation.title} (${operation.type})
TARGET FILE: ${operation.filePath}

WHAT HAPPENED: You called "${currentCall.name}" with arguments: ${currentCall.args}
This is the exact same call you made in the previous iteration.

PLEASE REFLECT AND ADJUST YOUR APPROACH:
1. Review the results from your previous tool calls - what did you learn?
2. Consider if you have enough information to complete this specific step
3. If you keep reading the same file, perhaps you should now write/modify it
4. If you keep listing files, perhaps you should read a specific file instead
5. Focus ONLY on completing this one step: ${operation.description}

Either:
- Complete the assigned step with a write_file operation if you have sufficient information
- Use a DIFFERENT tool to gather specific missing information
- Explain exactly what information you still need and why

Do NOT repeat the same tool call. Focus on completing this single step.`;

          response = await generateText({
            model: this.google('gemini-2.5-flash'),
            system: EXECUTION_PROMPT,
            messages: [
              ...messages
                .slice(0, -1)
                .map((msg: { role: string; content: string }) => ({
                  role: msg.role as 'user' | 'assistant',
                  content: msg.content,
                })),
              {
                role: 'user' as const,
                content: userMessage,
              },
              {
                role: 'assistant' as const,
                content: finalResponse,
              },
              {
                role: 'user' as const,
                content: reflectionMessage,
              },
            ],
          });

          finalResponse = response.text;

          // If it still tries to make tool calls after reflection, force completion
          if (response.toolCalls && response.toolCalls.length > 0) {
            console.log(
              '⚠️ Model still making tool calls after execution reflection, stopping',
            );
            finalResponse +=
              '\n\n⚠️ Step execution completed with available information.';
            break;
          }

          break;
        }

        lastToolCall = currentCall;
      }

      const toolResults = [];

      // Execute each tool call
      for (const toolCall of response.toolCalls) {
        try {
          const result = fileManager.handleToolCall({
            function: {
              name: toolCall.toolName,
              arguments: toolCall.input as Record<string, unknown>,
            },
          });

          toolResults.push({
            toolCallId: toolCall.toolCallId,
            result: JSON.stringify(result),
          });
        } catch (error) {
          console.error(`❌ Tool call failed: ${toolCall.toolName}`, error);
          toolResults.push({
            toolCallId: toolCall.toolCallId,
            result: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          });
        }
      }

      // Check if step is complete based on successful file write operations
      let hasSuccessfulWriteOperation = false;

      // Check if any write operations were successful
      for (const toolResult of toolResults) {
        try {
          const result = JSON.parse(toolResult.result);
          if (
            result.success &&
            result.operation &&
            (result.operation === 'create' || result.operation === 'modify')
          ) {
            hasSuccessfulWriteOperation = true;
            break;
          }
        } catch {
          // Ignore parse errors
        }
      }

      const isStepComplete = hasSuccessfulWriteOperation;

      if (isStepComplete) {
        console.log(`✅ Step completed: ${operation.id} - ${operation.title}`);
        finalResponse += `\n\n✅ Step completed: ${operation.title}`;
        break;
      }

      // Prevent infinite loops
      if (toolCallsMade >= 50) {
        console.log('⚠️ Step execution taking too long, forcing completion');
        finalResponse += `\n\n⚠️ Step execution reached maximum attempts (50). Current progress saved.`;
        break;
      }

      // Continue the conversation with tool results
      const toolResultsText = toolResults
        .map((tr) => `Tool ${tr.toolCallId}: ${tr.result}`)
        .join('\n');

      let continuationMessage = `Tool results:\n${toolResultsText}\n\nBased on the tool results, complete your assigned step. If the step is complete, provide a summary and stop.`;
      // Only inject context every 3 tool calls to avoid confusion in execution
      if (toolCallsMade % 3 === 0) {
        const projectContextContinuation = this.getProjectContext(inputFiles);
        if (projectContextContinuation) {
          continuationMessage += projectContextContinuation;
        }
      }

      response = await generateText({
        model: this.google('gemini-2.5-flash'),
        system: EXECUTION_PROMPT,
        tools: MODEL_TOOLS,
        messages: [
          ...messages
            .slice(0, -1)
            .map((msg: { role: string; content: string }) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            })),
          {
            role: 'user' as const,
            content: userMessage,
          },
          {
            role: 'assistant' as const,
            content: finalResponse,
          },
          {
            role: 'user' as const,
            content: continuationMessage,
          },
        ],
      });

      finalResponse = response.text;
    }

    return {
      content: finalResponse,
      updatedFiles: fileManager.getFinalState(),
      hasResult:
        finalResponse.includes('✅ Step completed') ||
        finalResponse.includes('Successfully'),
    };
  }

  // Get project context from the Expo Snack files instead of scanning filesystem
  private getProjectContext(inputFiles: PrototypeFiles | null): string {
    try {
      console.log('🔍 Building context from Expo Snack files...');

      if (!inputFiles || Object.keys(inputFiles).length === 0) {
        console.log('� No snack files provided for context');
        return '';
      }

      const relevantFiles: {
        path: string;
        content: string;
        category: string;
      }[] = [];

      // Look for theme-related files
      const themePatterns = [
        /theme/i,
        /style/i,
        /design/i,
        /color/i,
        /ui\/.*component/i,
      ];

      // Look for component and screen files
      const componentPatterns = [
        /components\//i,
        /screens\//i,
        /hooks\//i,
        /utils\//i,
        /constants\//i,
      ];

      // Analyze each snack file
      Object.entries(inputFiles).forEach(([filePath, file]) => {
        if (!file.contents) {
          return;
        }

        // Check if file matches theme patterns
        const isThemeRelated = themePatterns.some(
          (pattern) => pattern.test(filePath) || pattern.test(file.name || ''),
        );

        // Check if file matches component patterns
        const isComponentRelated = componentPatterns.some(
          (pattern) => pattern.test(filePath) || pattern.test(file.name || ''),
        );

        // Include relevant files
        if (
          (isThemeRelated || isComponentRelated) &&
          (filePath.endsWith('.ts') ||
            filePath.endsWith('.tsx') ||
            filePath.endsWith('.js') ||
            filePath.endsWith('.jsx'))
        ) {
          const category = isThemeRelated ? 'theme' : 'component';
          relevantFiles.push({
            path: filePath,
            content: file.contents,
            category,
          });
          console.log(` Found ${category} file in snack: ${filePath}`);
        }

        // Include config files
        if (
          filePath.includes('package.json') ||
          filePath.includes('app.json') ||
          filePath.includes('expo.json')
        ) {
          relevantFiles.push({
            path: filePath,
            content: file.contents,
            category: 'config',
          });
          console.log(` Found config file in snack: ${filePath}`);
        }
      });

      // Build context string
      let projectContext = '';

      if (relevantFiles.length > 0) {
        projectContext = `\n\n<� EXPO SNACK PROJECT CONTEXT: The following files are available in this React Native project:\n`;

        const themeFiles = relevantFiles.filter((f) => f.category === 'theme');
        const componentFiles = relevantFiles.filter(
          (f) => f.category === 'component',
        );
        const configFiles = relevantFiles.filter(
          (f) => f.category === 'config',
        );

        if (themeFiles.length > 0) {
          projectContext += `\n=== THEME/UI FILES ===\n`;
          themeFiles.forEach((file) => {
            projectContext += `\n--- ${file.path} ---\n${file.content}\n`;
          });
        }

        if (componentFiles.length > 0) {
          projectContext += `\n=== COMPONENTS & SCREENS ===\n`;
          componentFiles.forEach((file) => {
            projectContext += `\n--- ${file.path} ---\n${file.content}\n`;
          });
        }

        if (configFiles.length > 0) {
          projectContext += `\n=== CONFIG FILES ===\n`;
          configFiles.forEach((file) => {
            projectContext += `\n--- ${file.path} ---\n${file.content}\n`;
          });
        }
      }

      console.log(
        ` Expo Snack context built with ${relevantFiles.length} files`,
      );
      return projectContext;
    } catch (error) {
      console.warn('Could not build Expo Snack context:', error);
      return '';
    }
  }

  // NOTE: saveFilesToDatabaseWithAuth method removed - now using shared utility from fileOperations.ts

  // File Manager class for handling file operations during chat
  private FileManager = class {
    private files: Map<string, PrototypeFile>;
    private prototypeId: string | null;

    constructor(convertedFiles: PrototypeFiles | null, prototypeId?: string) {
      this.files = new Map(Object.entries(convertedFiles || {}));
      this.prototypeId = prototypeId || null;
    }

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
    } {
      const { name, arguments: args } = toolCall.function;

      console.log(`🔧 TOOL CALL: ${name}`, { filePath: args?.filePath ?? '' });

      switch (name) {
        case 'read_file':
          return this.readFile(args.filePath as string);

        case 'write_file':
          return this.writeFile(
            args.filePath as string,
            args.contents as string,
            args.operation as string | undefined,
          );

        case 'list_files':
          return this.listFiles();

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    }

    readFile(filePath: string): {
      error?: string;
      success?: boolean;
      filePath?: string;
      contents?: string;
      exists?: boolean;
    } {
      const file = this.files.get(filePath);
      if (!file) {
        return { error: `File not found: ${filePath}` };
      }
      return {
        success: true,
        filePath,
        contents: file.contents || '',
        exists: true,
      };
    }

    writeFile(
      filePath: string,
      contents: string,
      operation?: string,
    ): {
      error?: string;
      success?: boolean;
      filePath?: string;
      operation?: string;
      message?: string;
    } {
      // Default to "create" if operation is not provided
      const op = operation || 'create';
      const existingFile = this.files.get(filePath);

      if (op === 'modify' && !existingFile) {
        console.error(`❌ Cannot modify non-existent file: ${filePath}`);
        return { error: `Cannot modify non-existent file: ${filePath}` };
      }

      if (op === 'create' && existingFile) {
        console.error(
          `❌ File already exists: ${filePath}. Use 'modify' operation.`,
        );
        return {
          error: `File already exists: ${filePath}. Use 'modify' operation.`,
        };
      }

      // Update in-memory state
      const updatedFile = {
        ...existingFile,
        name: filePath,
        contents,
        id: existingFile?.id || `file-${Date.now()}`,
        prototype_id: existingFile?.prototype_id || this.prototypeId,
        created_at: existingFile?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as PrototypeFile;

      this.files.set(filePath, updatedFile);

      console.log(`✅ Successfully ${op}d file ${filePath} in function memory`);

      // Database updates are handled by the client filesystem
      // The client will receive the updated files through the getFinalState() method
      // and handle database persistence through the file system manager

      return {
        success: true,
        filePath,
        operation: op,
        message: `Successfully ${op}d ${filePath}`,
      };
    }

    listFiles(): {
      success: boolean;
      files: Array<{ filePath: string; name: string; exists: boolean }>;
    } {
      const fileList = Array.from(this.files.keys()).map((filePath) => ({
        filePath,
        name: this.files.get(filePath)?.name || filePath,
        exists: true,
      }));

      return { success: true, files: fileList };
    }

    // Get final state for updating database/snack
    getFinalState(): PrototypeFiles {
      const result: PrototypeFiles = {};
      for (const [filePath, file] of this.files) {
        result[filePath] = file;
      }
      return result;
    }
  };
}

const MODEL_TOOLS = {
  list_files: {
    description: 'List all files in the project to understand structure',
    inputSchema: z.object({}),
    execute: async (): Promise<void> => {
      throw new Error('Tool execution should be handled by file manager');
    },
  },
  read_file: {
    description: 'Read the contents of a specific file in the project',
    inputSchema: z.object({
      filePath: z.string().describe('The file path to read'),
    }),
    execute: async (): Promise<void> => {
      throw new Error('Tool execution should be handled by file manager');
    },
  },
  write_file: {
    description: 'Write or update a file in the project',
    inputSchema: z.object({
      filePath: z.string().describe('The file path to write to'),
      contents: z.string().describe('The complete file contents'),
      operation: z
        .enum(['create', 'modify'])
        .default('create')
        .describe(
          "REQUIRED: Use 'create' for new files, 'modify' for existing files (defaults to 'create')",
        ),
    }),
    execute: async (): Promise<void> => {
      throw new Error('Tool execution should be handled by file manager');
    },
  },
};
