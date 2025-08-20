import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { HTTP_STATUS } from '../types/PublicAPITypes.js';
import type {
  ChatRequestBody,
  ChatErrorResponse,
  DispatchRequestBody,
  DispatchResponse,
  DispatchPrecheckRequestBody,
  DispatchPrecheckResponse,
} from '../types/PublicAPITypes.js';
import type { Database } from '../types/supabase.js';
import { saveFilesToDatabaseWithAuth } from '../utils/fileOperations.js';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { z } from 'zod';

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
              snackFiles: {
                type: ['object', 'null'],
                additionalProperties: {
                  type: 'object',
                  required: ['contents', 'name', 'file_type', 'prototype_id'],
                  properties: {
                    contents: { type: 'string' },
                    name: { type: 'string' },
                    file_type: { type: 'string', enum: ['text', 'asset'] },
                    prototype_id: { type: 'string' },
                    id: { type: 'string' },
                    storage_path: { type: ['string', 'null'] },
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
      const { messages, snackFiles, chat_session_id, prototype_id } =
        request.body;
      if (!messages || !Array.isArray(messages)) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error: 'Messages array is required',
        } as ChatErrorResponse);
      }

      // Convert snackFiles to compatible format
      const convertedFiles: PrototypeFiles | null = snackFiles
        ? Object.fromEntries(
          Object.entries(snackFiles).map(([path, file]) => [
            path,
              {
                ...file,
                created_at: file.created_at || null,
                updated_at: file.updated_at || null,
              } as PrototypeFile,
          ]),
        )
        : null;

      const fileManager = new this.FileManager(convertedFiles, prototype_id);

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

      if ('success' in precheckData && precheckData.status === 'updating') {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          error:
            'Cannot chat while a build is currently in progress. Materialize agents won\'t be able to build your files.',
        } as ChatErrorResponse);
      }

      // ------------------------------------------------------------------------------------------------
      // 5. Load/generate additional project context
      // ------------------------------------------------------------------------------------------------
      const lastMessage = messages[messages.length - 1];
      let userMessage = lastMessage.content;

      // Always inject project context if available (prevents LLM hallucination)
      console.log('<� Injecting Expo Snack project context for development...');
      const projectContext = this.getProjectContext(convertedFiles);
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
            const finalResponse = await this.handlePlanningPhase(
              messages,
              userMessage,
              fileManager,
              convertedFiles,
              chat_session_id,
              controller,
              encoder,
            );

            // ------------------------------------------------------------------------------------------------
            // 8. EXECUTE EXECUTION PHASE
            // ------------------------------------------------------------------------------------------------
            console.log('⚙️ [SERVER] Starting execution phase...');
            console.log('⚙️ [SERVER] Final planning response length:', finalResponse.length);
            await this.handleExecutionPhase(
              finalResponse,
              fileManager,
              messages,
              convertedFiles,
              prototype_id,
              controller,
              encoder,
              chat_session_id,
            );

            // ------------------------------------------------------------------------------------------------
            // 9. Save updated files to database before dispatch
            // ------------------------------------------------------------------------------------------------
            const finalFiles = fileManager.getFinalState();

            try {
              console.log(
                '=� Saving updated files to database before dispatch...',
              );
              // Convert PrototypeFiles to the format expected by the shared utility
              const fileUpdatesForDatabase = Object.fromEntries(
                Object.entries(finalFiles).map(([filePath, file]) => [
                  filePath,
                  {
                    prototype_id: prototype_id,
                    name: filePath,
                    contents: file.contents || '',
                    file_type: 'text' as const,
                    storage_path: null,
                  },
                ]),
              );

              await saveFilesToDatabaseWithAuth(
                token,
                prototype_id,
                fileUpdatesForDatabase,
              );
              console.log(' Files successfully saved to database');
            } catch (saveError) {
              console.error('L Error saving files to database:', saveError);
              // Continue with dispatch even if save fails - don't block user
            }

            // ------------------------------------------------------------------------------------------------
            // 10. Pre-build and dispatch requests
            // ------------------------------------------------------------------------------------------------
            console.log(
              '=� Dispatching build request regardless of precheck response',
            );

            // Convert PrototypeFiles to FileInput[] format for dispatch
            const filesForDispatch: Array<{
              path: string;
              content: string;
              isBase64?: boolean;
            }> = [];
            Object.entries(finalFiles).forEach(([filePath, file]) => {
              if (file.contents) {
                filesForDispatch.push({
                  path: filePath,
                  content: file.contents,
                  isBase64: false, // Text files, not base64 encoded
                });
              }
            });

            // Stream dispatch start event to show loading indicator
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'dispatch_start',
                  message: 'Starting build process...',
                })}\n\n`,
              ),
            );

            try {
              const dispatchResponse = await this.fastifyApp.inject({
                method: 'POST',
                url: '/dispatch',
                payload: {
                  jwt: token,
                  prototype_id: prototype_id,
                  framework: 'expo_react_native',
                  files: filesForDispatch,
                  file_scope: 'complete',
                  hot_reload: false,
                } as DispatchRequestBody,
              });

              const dispatchData: DispatchResponse = JSON.parse(
                dispatchResponse.payload,
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
              console.error('💥 [SERVER] Failed to enqueue error message:', enqueueError);
            }
            try {
              controller.close();
            } catch (closeError) {
              console.error('💥 [SERVER] Failed to close controller:', closeError);
            }
          }
        },
      });

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true',
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
            console.log('📤 [SERVER] Writing stream chunk:', new TextDecoder().decode(value).substring(0, 100) + '...');
            reply.raw.write(value);
          }
        } catch (err) {
          console.error('💥 [SERVER] Stream error:', err);
          // Send error event before closing
          const errorEvent = `data: ${JSON.stringify({
            type: 'error',
            error: err instanceof Error ? err.message : 'Stream processing error',
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
      system: this.PLANNING_PROMPT,
      tools: {
        list_files: {
          description: 'List all files in the project to understand structure',
          inputSchema: z.object({}),
          execute: async () => {
            throw new Error('Tool execution should be handled by file manager');
          },
        },
        read_file: {
          description: 'Read the contents of a specific file in the project',
          inputSchema: z.object({
            filePath: z
              .string()
              .describe(
                'The file path to read (e.g., \'screens/PaywallScreen.js\')',
              ),
          }),
          execute: async () => {
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
                'REQUIRED: Use \'create\' for new files, \'modify\' for existing files (defaults to \'create\')',
              ),
          }),
          execute: async () => {
            throw new Error('Tool execution should be handled by file manager');
          },
        },
      },
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

      // Check if we already have a valid plan
      const hasValidPlan =
        finalResponse.includes('EXECUTION_PLAN') &&
        finalResponse.includes('[') &&
        finalResponse.includes(']');

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

            const reflectionMessage = `= REFLECTION NEEDED: You just made a duplicate tool call (${currentCall.name} with the same arguments). This suggests you may be stuck in a loop or not processing the previous results effectively.

WHAT HAPPENED: You called "${currentCall.name}" with arguments: ${currentCall.args}
This is the exact same call you made previously.

PLEASE REFLECT AND CHANGE YOUR APPROACH:
1. Review what information you've already gathered from previous tool calls
2. Consider if you have enough information to proceed with planning
3. Try a different approach - perhaps use a different tool or create the plan with what you know
4. If you keep calling the same tool, you're likely not making progress

Based on the information you've gathered so far, please either:
- Create your EXECUTION_PLAN now if you have sufficient information
- Use a DIFFERENT tool or approach to gather missing information
- Explain what specific information you still need and why

Do NOT repeat the same tool call again.`;

            response = await generateText({
              model: this.google('gemini-2.5-flash'),
              system: this.PLANNING_PROMPT,
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
        const projectContextContinuation =
          this.getProjectContext(convertedFiles);
        if (projectContextContinuation) {
          continuationMessage += projectContextContinuation;
        }
      }

      response = await generateText({
        model: this.google('gemini-2.5-flash'),
        system: this.PLANNING_PROMPT,
        tools: {
          list_files: {
            description:
              'List all files in the project to understand structure',
            inputSchema: z.object({}),
            execute: async () => {
              throw new Error(
                'Tool execution should be handled by file manager',
              );
            },
          },
          read_file: {
            description: 'Read the contents of a specific file in the project',
            inputSchema: z.object({
              filePath: z.string().describe('The file path to read'),
            }),
            execute: async () => {
              throw new Error(
                'Tool execution should be handled by file manager',
              );
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
                  'REQUIRED: Use \'create\' for new files, \'modify\' for existing files (defaults to \'create\')',
                ),
            }),
            execute: async () => {
              throw new Error(
                'Tool execution should be handled by file manager',
              );
            },
          },
        },
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
      console.log('� No valid execution plan found, generating fallback plan');

      const fallbackResponse = await generateText({
        model: this.google('gemini-2.5-flash'),
        system:
          this.PLANNING_PROMPT +
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
              'You must now create a detailed EXECUTION_PLAN based on the user\'s request. Format it exactly as specified in your instructions.',
          },
        ],
      });

      finalResponse += '\n\n' + fallbackResponse.text;
    }

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
    console.log('🧠 [SERVER] Sending planning event to client...');
    const planningEvent = {
      type: 'planning',
      content: finalResponse,
      messageId: planningMessage?.id,
    };
    console.log('🧠 [SERVER] Planning event:', {
      type: planningEvent.type,
      contentLength: planningEvent.content.length,
      messageId: planningEvent.messageId,
    });
    
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify(planningEvent)}\n\n`,
      ),
    );

    return finalResponse;
  }

  private async handleExecutionPhase(
    finalResponse: string,
    fileManager: FileManagerInterface,
    messages: ChatMessage[],
    convertedFiles: PrototypeFiles | null,
    prototype_id: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    chat_session_id: string,
  ): Promise<void> {
    const supabase = createClient<Database>(
      this.supabaseUrl,
      this.supabaseServiceKey,
    );

    // Check if the response contains an execution plan
    console.log('⚙️ [SERVER] Checking for execution plan in response...');
    console.log('⚙️ [SERVER] Response includes EXECUTION_PLAN:', finalResponse.includes('EXECUTION_PLAN'));
    
    if (finalResponse.includes('EXECUTION_PLAN')) {
      const planningResult = this.extractExecutionPlan(finalResponse);
      console.log('⚙️ [SERVER] Planning result:', {
        hasPlan: planningResult.hasPlan,
        operationsCount: planningResult.operations.length,
      });

      if (planningResult.hasPlan && planningResult.operations.length > 0) {
        // Send execution start
        console.log('⚙️ [SERVER] Sending execution_start event with', planningResult.operations.length, 'operations');
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
              convertedFiles,
            );

            // Send step completion
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'step_complete',
                  stepIndex: i,
                  operation: operation,
                  result: {
                    content: stepResult.content,
                    hasResult: stepResult.hasResult,
                  },
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
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'execution_complete',
            })}\n\n`,
          ),
        );

        // Save execution summary message to database
        const executionSummary = `<� Execution completed! Successfully processed ${
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
    messages: ChatMessage[],
    convertedFiles: PrototypeFiles | null,
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
    const projectContext = this.getProjectContext(convertedFiles);
    if (projectContext) {
      userMessage += projectContext;
    }

    // Use AI SDK with tool support
    let response = await generateText({
      model: this.google('gemini-2.5-flash'),
      system: this.EXECUTION_PROMPT,
      tools: {
        list_files: {
          description: 'List all files in the project to understand structure',
          inputSchema: z.object({}),
          execute: async () => {
            throw new Error('Tool execution should be handled by file manager');
          },
        },
        read_file: {
          description: 'Read the contents of a specific file in the project',
          inputSchema: z.object({
            filePath: z.string().describe('The file path to read'),
          }),
          execute: async () => {
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
                'REQUIRED: Use \'create\' for new files, \'modify\' for existing files (defaults to \'create\')',
              ),
          }),
          execute: async () => {
            throw new Error('Tool execution should be handled by file manager');
          },
        },
      },
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

    // Handle tool calls iteratively
    while (response.toolCalls && response.toolCalls.length > 0) {
      toolCallsMade += response.toolCalls.length;
      console.log(
        `= Processing ${response.toolCalls.length} tool calls for step ${operation.id}`,
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
            '=� Detected duplicate tool call in execution, asking for reflection',
          );

          const reflectionMessage = `= EXECUTION REFLECTION: You just made a duplicate tool call during step execution (${currentCall.name} with the same arguments). This indicates you may be stuck or not processing previous results.

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
            system: this.EXECUTION_PROMPT,
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
                content: reflectionMessage,
              },
            ],
          });

          finalResponse = response.text;

          // If it still tries to make tool calls after reflection, force completion
          if (response.toolCalls && response.toolCalls.length > 0) {
            console.log(
              '� Model still making tool calls after execution reflection, stopping',
            );
            finalResponse +=
              '\n\n� Step execution completed with available information.';
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
          console.error(`L Tool call failed: ${toolCall.toolName}`, error);
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
        console.log(` Step completed: ${operation.id} - ${operation.title}`);
        finalResponse += `\n\n Step completed: ${operation.title}`;
        break;
      }

      // Prevent infinite loops
      if (toolCallsMade >= 50) {
        console.log('� Step execution taking too long, forcing completion');
        finalResponse += `\n\n� Step execution reached maximum attempts (50). Current progress saved.`;
        break;
      }

      // Continue the conversation with tool results
      const toolResultsText = toolResults
        .map((tr) => `Tool ${tr.toolCallId}: ${tr.result}`)
        .join('\n');

      let continuationMessage = `Tool results:\n${toolResultsText}\n\nBased on the tool results, complete your assigned step. If the step is complete, provide a summary and stop.`;
      // Only inject context every 3 tool calls to avoid confusion in execution
      if (toolCallsMade % 3 === 0) {
        const projectContextContinuation =
          this.getProjectContext(convertedFiles);
        if (projectContextContinuation) {
          continuationMessage += projectContextContinuation;
        }
      }

      response = await generateText({
        model: this.google('gemini-2.5-flash'),
        system: this.EXECUTION_PROMPT,
        tools: {
          list_files: {
            description:
              'List all files in the project to understand structure',
            inputSchema: z.object({}),
            execute: async () => {
              throw new Error(
                'Tool execution should be handled by file manager',
              );
            },
          },
          read_file: {
            description: 'Read the contents of a specific file in the project',
            inputSchema: z.object({
              filePath: z.string().describe('The file path to read'),
            }),
            execute: async () => {
              throw new Error(
                'Tool execution should be handled by file manager',
              );
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
                  'REQUIRED: Use \'create\' for new files, \'modify\' for existing files (defaults to \'create\')',
                ),
            }),
            execute: async () => {
              throw new Error(
                'Tool execution should be handled by file manager',
              );
            },
          },
        },
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
    }

    return {
      content: finalResponse,
      updatedFiles: fileManager.getFinalState(),
      hasResult:
        finalResponse.includes(' Step completed') ||
        finalResponse.includes('Successfully'),
    };
  }

  // Get project context from the Expo Snack files instead of scanning filesystem
  private getProjectContext(snackFiles: PrototypeFiles | null): string {
    try {
      console.log('🔍 Building context from Expo Snack files...');

      if (!snackFiles || Object.keys(snackFiles).length === 0) {
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
      Object.entries(snackFiles).forEach(([filePath, file]) => {
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

  // Extract execution plan from planning response
  private extractExecutionPlan(text: string): {
    hasPlan: boolean;
    operations: Array<{
      id: string;
      type: 'create' | 'modify' | 'delete' | 'move';
      title: string;
      description: string;
      filePath: string;
      newFilePath?: string;
    }>;
  } {
    try {
      // Look for EXECUTION_PLAN followed by JSON array
      const planMatch = text.match(/EXECUTION_PLAN.*?(\[[\s\S]*?\])/);
      if (!planMatch) {
        return { hasPlan: false, operations: [] };
      }

      const jsonStr = planMatch[1];
      const operations = JSON.parse(jsonStr);

      if (!Array.isArray(operations)) {
        return { hasPlan: false, operations: [] };
      }

      return {
        hasPlan: true,
        operations: operations.map((op: Record<string, unknown>) => ({
          id:
            (op.id as string) ||
            `step_${Math.random().toString(36).substr(2, 9)}`,
          type:
            (op.type as 'create' | 'modify' | 'delete' | 'move') || 'modify',
          title: (op.title as string) || 'Untitled operation',
          description: (op.description as string) || '',
          filePath: (op.filePath as string) || '',
          newFilePath: op.newFilePath as string | undefined,
        })),
      };
    } catch (error) {
      console.error('Error parsing execution plan:', error);
      return { hasPlan: false, operations: [] };
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

      console.log(`🔧 TOOL CALL: ${name}`, { arguments: args });

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

  // AI prompts for planning and execution phases
  private readonly PLANNING_PROMPT = `You are a React Native development assistant in PLANNING mode. Your job is to create detailed execution plans and use tools to understand the current project structure.
  AVAILABLE TOOLS:
- list_files: See all files in the project
- read_file: Read content of specific files
- write_file: Write or modify files (use sparingly in planning, mostly for execution)

IMPORTANT: You have access to the following packages without needing to install them:
- expo-linear-gradient
- @expo/vector-icons
- @react-navigation/native
- @react-navigation/native-stack
- @react-navigation/bottom-tabs
- react-native-reanimated
- zustand

CRITICAL IMPORT RULES:
- NEVER import components that don't exist
- Use list_files and read_file to discover available components before planning
- Only import from files that actually exist in the project
- When creating screens, first check what components are available
- Always provide the available imports context in your plan
- Zustand persistence is NOT SUPPORTED. The USER will DIE if you add a 'zustand/middleware' import. DO NOT IMPORT IT BY ANY MEANS!

PROJECT STRUCTURE RULES:
- screens/ - individual screen components (HomeScreen.js, PaywallScreen.js, etc.)
- components/ - reusable UI components (Button.js, Card.js, etc.)
- App.js - main app with navigation (ONLY touch when absolutely necessary)

GENERAL GUIDELINES:
- If the user asks you to do something that is not related to the project, you should politely decline and say that you are only a React Native development assistant.
- If the user says to create a new screen without mentioning if you should show it in the app, you should assume you must show it in the app.
- If there's a navigation stack in App.js and if you are asked to add a new screen to App.js as part of the navigation stack, make sure that App.js DOES NOT have placeholder screens or components in the file that interfere with showing the REAL screen.

PLANNING WORKFLOW:
1. Use list_files to understand current project structure and see what files are available in the project
2. Use read_file to examine relevant existing files
3. Create a detailed execution plan with specific steps
4. Each step should specify exact file paths and operations
5. Always verify available components before planning imports

Create execution plans in this format:
**EXECUTION_PLAN:**
[
  {
    "id": "step_1",
    "type": "create|modify", 
    "title": "Brief description",
    "filePath": "exact/path/to/file.js",
    "description": "Detailed description of what will be done"
  }
]

ALWAYS use tools first to understand the project before planning!`;

  private readonly EXECUTION_PROMPT = `You are a React Native development assistant in EXECUTION mode. You will execute ONE specific step from a plan.

AVAILABLE TOOLS:
- read_file: Read current file content before modifying
- write_file: Write or update files
- list_files: Check project structure if needed

CRITICAL EXECUTION RULES:
- Execute ONLY the assigned step - do not go beyond it
- Always read files before modifying them to understand current state
- After writing a file, your step is COMPLETE - do not make additional changes
- Provide a clear completion summary when done
- We are writing JAVASCRIPT code, so you should use the correct syntax for the language.

IMPORT SAFETY RULES:
- Before writing any file, use read_file to check existing similar files for import patterns
- Only import components/files that you've verified exist
- If you need a component that doesn't exist, note it as a dependency for future steps
- Use the project context to see what's actually available. You can use the list_files tool to verify that a file exists before using it in an import.
- NEVER import a component that doesn't exist.
- NEVER import a file that does not ALREADY exist in the project.
- Do NOT make any assumptions about the project structure or the future state of the project structure or files.

DESIGN RULES:
- When creating a new screen, you should create a new file for the screen.
- When creating a screen, you should keep in mind information hierarchy and how the user will take in the information on the screen.
- You should keep in the importance of beautiful UI design and creating a great user experience.
- When creating cards, you should keep in mind that card widths on the screen should be consistent and should be about 90% of the screen width, so that there's a nice margin between the screen edges and the cards.

PROJECT STRUCTURE RULES:
- screens/ - individual screen components (screens/PaywallScreen.js)
- components/ - reusable UI components (components/Button.js)  
- App.js - main app with navigation (modify ONLY when absolutely necessary).

EXECUTION WORKFLOW:
1. Read the assigned step details carefully
2. Use read_file to get current content of files you're modifying (if needed)
3. Use write_file to make the specific change for this step
4. Provide complete, working code that follows React Native best practices
5. Confirm step completion with a summary

STEP COMPLETION CRITERIA:
- For "create" steps: Successfully create the new file with required content
- For "modify" steps: Successfully update the existing file with required changes
- Once you write a file, your step is complete - do not continue with additional operations

You will receive a specific step to execute. Complete it fully and stop.`;
}
