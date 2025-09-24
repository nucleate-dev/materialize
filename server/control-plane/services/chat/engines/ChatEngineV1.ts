import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { stepCountIs, streamText, tool, Tool } from 'ai';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import type {
  APIResponse,
  DispatchRequestBody,
  DispatchSuccessResponse,
  PrototypeAssetInput,
  PrototypeFileInput,
  StandardErrorResponse,
} from '../../../types/PublicAPITypes.js';
import { SYSTEM_PROMPT } from '../prompts/PROMPTS.js';
import {
  FileManagerInterface,
  VirtualFileManager,
} from '../utils/file-manager.js';

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
  inputFiles: Record<string, PrototypeFileInput> | null;
  inputAssets: Record<string, PrototypeAssetInput> | null;
  prototype_id: string;
  token: string;
  chat_session_id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  log2: SystemLogger;
}

export interface ChatEngineResult {
  assistantResponse: string;
  executionPlan?: string[];
  completedSteps?: number[];
  fileChanges?: Record<string, PrototypeFileInput>;
  toolCalls?: Array<{ toolName: string; input: unknown; output: unknown }>;
}

export class ChatEngineV1 {
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

  // NEW: A dedicated method for orchestration tools
  private createOrchestrationTools(
    params: ChatEngineParams,
  ): Record<string, Tool> {
    const { log2 } = params;
    return {
      create_execution_plan: tool({
        description:
          "Creates a detailed, step-by-step execution plan to fulfill the user's coding request. This MUST be the first tool called for any task that involves creating or modifying files.",
        inputSchema: z.object({
          steps: z
            .array(z.string())
            .describe(
              'A list of concise, actionable steps the assistant will take to complete the request.',
            ),
        }),
        execute: async ({ steps }: { steps: string[] }) => {
          log2.info(`[ChatEngine] Execution Plan Created`, { steps });
          return {
            success: true,
            plan: steps,
            message: 'Execution plan has been created. Proceeding with Step 1.',
          };
        },
      }),
      confirm_step_completion: tool({
        description:
          'Confirms the completion of a specific step in the execution plan. MUST be called after all actions for a single step are finished and before starting the next one.',
        inputSchema: z.object({
          step_number: z
            .number()
            .describe('The number of the plan step that was just completed.'),
          summary: z
            .string()
            .describe(
              'A brief, one-sentence summary of what was accomplished in this step.',
            ),
        }),
        execute: async ({ step_number, summary }) => {
          log2.info(`[ChatEngine] Step ${step_number} confirmed as complete.`, {
            summary,
          });
          return {
            success: true,
            step: step_number,
            summary,
            message: `Step ${step_number} has been successfully completed.`,
          };
        },
      }),
    };
  }

  private createFileManagerTools(
    params: ChatEngineParams,
  ): Record<string, Tool> {
    const { fileManager, log2 } = params;

    return {
      read_file: tool({
        description: 'Read the contents of a file from the virtual file system',
        inputSchema: z.object({
          filePath: z.string().describe('The path to the file to read'),
        }),
        execute: async ({ filePath }: { filePath: string }) => {
          const result = fileManager.handleToolCall({
            function: {
              name: 'read_file',
              arguments: { filePath },
            },
          });

          return {
            success: result.success ?? false,
            contents: result.contents ?? '',
            error: result.error ?? '',
            exists: result.exists ?? false,
            message: result.message ?? '',
          };
        },
      }),

      write_file: tool({
        description: 'Write or update a file in the virtual file system',
        inputSchema: z.object({
          filePath: z.string().describe('The path to the file to write'),
          contents: z.string().describe('The contents to write to the file'),
        }),
        execute: async ({
          filePath,
          contents,
        }: {
          filePath: string;
          contents: string;
        }) => {
          log2.info(`[ChatEngine] Tool call: write_file`, {
            filePath,
            contentLength: contents.length,
          });
          const result = fileManager.handleToolCall({
            function: {
              name: 'write_file',
              arguments: { filePath, contents },
            },
          });

          return {
            success: result.success ?? false,
            error: result.error ?? '',
            message: result.message ?? '',
            filePath: result.filePath ?? filePath,
          };
        },
      }),

      create_file: tool({
        description:
          'Create a new file in the virtual file system (fails if file already exists)',
        inputSchema: z.object({
          filePath: z.string().describe('The path to the new file to create'),
          contents: z
            .string()
            .optional()
            .describe('The initial contents of the file (optional)'),
        }),
        execute: async ({
          filePath,
          contents = '',
        }: {
          filePath: string;
          contents?: string;
        }) => {
          log2.info(`[ChatEngine] Tool call: create_file`, {
            filePath,
            contentLength: contents.length,
          });
          const result = fileManager.handleToolCall({
            function: {
              name: 'create_file',
              arguments: { filePath, contents },
            },
          });

          return {
            success: result.success ?? false,
            error: result.error ?? '',
            message: result.message ?? '',
            filePath: result.filePath ?? filePath,
          };
        },
      }),

      delete_file: tool({
        description: 'Delete a file from the virtual file system',
        inputSchema: z.object({
          filePath: z.string().describe('The path to the file to delete'),
        }),
        execute: async ({ filePath }: { filePath: string }) => {
          log2.info(`[ChatEngine] Tool call: delete_file`, { filePath });
          const result = fileManager.handleToolCall({
            function: {
              name: 'delete_file',
              arguments: { filePath },
            },
          });

          return {
            success: result.success ?? false,
            error: result.error ?? '',
            message: result.message ?? '',
            filePath: result.filePath ?? filePath,
          };
        },
      }),

      list_files: tool({
        description:
          'List all files in a directory or the entire virtual file system',
        inputSchema: z.object({
          directory: z
            .string()
            .optional()
            .describe('The directory to list files from (default: root)'),
        }),
        execute: async ({ directory = '/' }: { directory?: string }) => {
          log2.info(`[ChatEngine] Tool call: list_files`, { directory });
          const result = fileManager.handleToolCall({
            function: {
              name: 'list_files',
              arguments: { directory },
            },
          });

          return {
            success: result.success ?? false,
            files: result.files ?? [],
            error: result.error ?? '',
            message: result.message ?? '',
          };
        },
      }),

      file_exists: tool({
        description: 'Check if a file exists in the virtual file system',
        inputSchema: z.object({
          filePath: z.string().describe('The path to check for existence'),
        }),
        execute: async ({ filePath }: { filePath: string }) => {
          log2.info(`[ChatEngine] Tool call: file_exists`, { filePath });
          const result = fileManager.handleToolCall({
            function: {
              name: 'file_exists',
              arguments: { filePath },
            },
          });

          return {
            success: result.success ?? false,
            exists: result.exists ?? false,
            error: result.error ?? '',
            message: result.message ?? '',
            filePath: result.filePath ?? filePath,
          };
        },
      }),

      search_files: tool({
        description:
          'Search for text content across files in the virtual file system',
        inputSchema: z.object({
          query: z.string().describe('The text to search for'),
          directory: z
            .string()
            .optional()
            .describe('The directory to search within (default: root)'),
        }),
        execute: async ({
          query,
          directory = '/',
        }: {
          query: string;
          directory?: string;
        }) => {
          log2.info(`[ChatEngine] Tool call: search_files`, {
            query,
            directory,
          });
          const result = fileManager.handleToolCall({
            function: {
              name: 'search_files',
              arguments: { query, directory },
            },
          });

          return {
            success: result.success ?? false,
            results: result.results ?? [],
            error: result.error ?? '',
            message: result.message ?? '',
          };
        },
      }),

      get_dependencies: tool({
        description: 'Parse and retrieve dependencies from a package.json file',
        inputSchema: z.object({
          filePath: z.string().describe('The path to the package.json file'),
        }),
        execute: async ({ filePath }: { filePath: string }) => {
          log2.info(`[ChatEngine] Tool call: get_dependencies`, { filePath });
          const result = fileManager.handleToolCall({
            function: {
              name: 'get_dependencies',
              arguments: { filePath },
            },
          });

          return {
            success: result.success ?? false,
            dependencies: result.dependencies ?? {
              dependencies: {},
              devDependencies: {},
            },
            error: result.error ?? '',
            message: result.message ?? '',
          };
        },
      }),
    };
  }

  private async persistAndDispatchFiles(
    fileManager: VirtualFileManager,
    params: ChatEngineParams,
  ): Promise<void> {
    const { prototype_id, token, controller, encoder } = params;
    const log2 = params.log2.child({
      function: 'persistAndDispatchFiles',
    });

    try {
      if (!fileManager.hasChanges()) {
        log2.info('[ChatEngine] No file changes to persist and dispatch');
        return;
      }

      log2.info('[ChatEngine] Starting file persistence and dispatch...');
      // Get all files for dispatch (complete file set needed for dispatch)
      // TODO @priyam: stream the updated files back to the client
      // TODO: if there is already an active dev-server (from precheck), then we should only send updated files
      const allFiles = fileManager.getAllFilesForDispatch();
      const filesArray = Object.entries(allFiles).map(([, file]) => file);
      const requestBody: DispatchRequestBody = {
        jwt: token,
        prototype_id: prototype_id,
        framework: 'expo_react_native',
        files: filesArray,
        assets: [], // The AI chat never updates or creates assets
        file_scope: 'updates', // TODO @priyam: this is a BUG -- if the user chats when a dev-server is not already started, we need COMPLETE file scope
        hot_reload: true, // Enable hot reload for live updates
      };
      // Call the dispatch endpoint via internal Fastify inject
      const response = await this.config.fastifyApp.inject({
        method: 'POST',
        url: '/dispatch',
        headers: {
          'Content-Type': 'application/json',
          'x-trace-id': log2.getTraceId(),
        },
        payload: requestBody,
      });

      const result: APIResponse<
        DispatchSuccessResponse,
        StandardErrorResponse
      > = JSON.parse(response.payload);
      if (response.statusCode === 200 && result.data) {
        // Send viewing URL update to client
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'viewing_url',
              viewing_url: result.data.viewing_url,
            })}\\n\\n`,
          ),
        );
        log2.info('[ChatEngine] File dispatch successful, viewing URL updated');
      } else {
        log2.error(
          new Error('File dispatch failed.'),
          '[ChatEngine] ' +
            `File dispatch failed with status: ${response.statusCode}`,
          result,
        );

        // PROPAGATE ERROR TO CLIENT
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'dispatch_error',
              error: 'Failed to update the live preview.',
              details: `Dispatch service responded with status ${response.statusCode}.`,
            })}\\n\\n`,
          ),
        );
      }

      // Clear change tracking after successful dispatch
      fileManager.clearChangeTracking();
    } catch (error) {
      log2.error(error, '[ChatEngine] Error in persistAndDispatchFiles');
      // Don't throw - this shouldn't break the chat flow
    }
  }

  async executeChat(params: ChatEngineParams): Promise<ChatEngineResult> {
    const { messages, userMessage, controller, encoder, log2, fileManager } =
      params;

    // Track execution data for persistence
    let executionPlan: string[] | undefined;
    const completedSteps: number[] = [];
    let assistantResponse = '';
    const toolCalls: Array<{
      toolName: string;
      input: unknown;
      output: unknown;
    }> = [];

    try {
      log2.consoleLogDevOnly(
        'info',
        '[ChatEngine] Generating response with plan-and-execute strategy...',
      );

      const result = streamText({
        model: this.getCurrentModel(),
        system: SYSTEM_PROMPT,
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
        // UPDATED: Combine all tools
        tools: {
          ...this.createOrchestrationTools(params),
          ...this.createFileManagerTools(params),
        },
        toolChoice: 'auto',
        stopWhen: stepCountIs(25), // Increased step count for complex plans
      });

      // 2. Process the full stream for tool calls and results, and the text stream for the final answer.
      // We can do this in parallel to correctly handle the entire multi-step process.
      let finalBuffer = '';

      // This async function will handle streaming all parts of the multi-step call
      const processStream = async (): Promise<void> => {
        for await (const part of result.fullStream) {
          log2.info('Stream Part', { part });

          switch (part.type) {
            case 'text-delta':
              // Accumulate and stream the final text response
              finalBuffer += part.text;
              assistantResponse += part.text; // Capture for persistence
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'chat_response_delta',
                    content: part.text,
                  })}\n\n`,
                ),
              );
              break;

            case 'tool-call':
              // Capture tool call for persistence
              toolCalls.push({
                toolName: part.toolName,
                input: part.input,
                output: null, // Will be filled in tool-result
              });

              // Inform the client that a tool is being called
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'tool_call',
                    tool: part.toolName,
                    toolCallId: part.toolCallId,
                    args: part.input, // It's useful to show the client what the tool is doing
                  })}\n\n`,
                ),
              );
              break;

            case 'tool-result':
              // Update tool call output for persistence
              const toolCall = toolCalls.find(
                (tc) => tc.toolName === part.toolName && tc.output === null,
              );
              if (toolCall) {
                toolCall.output = part.output;
              }

              // UPDATED: Handle our custom orchestration events
              if (part.toolName === 'create_execution_plan') {
                // Capture execution plan for persistence
                if (
                  part.output &&
                  typeof part.output === 'object' &&
                  'plan' in part.output
                ) {
                  executionPlan = (part.output as { plan: string[] }).plan;
                }
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'execution_plan_created',
                      toolCallId: part.toolCallId,
                      result: part.output,
                    })}\n\n`,
                  ),
                );
              } else if (part.toolName === 'confirm_step_completion') {
                // Capture completed step for persistence
                if (
                  part.output &&
                  typeof part.output === 'object' &&
                  'step' in part.output
                ) {
                  const stepNum = (part.output as { step: number }).step;
                  if (typeof stepNum === 'number') {
                    completedSteps.push(stepNum);
                  }
                }

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'step_completed',
                      toolCallId: part.toolCallId,
                      result: part.output,
                    })}\n\n`,
                  ),
                );
              } else {
                // Default handling for all other tools (e.g., file manager)
                let toolResult = {
                  type: 'tool_result',
                  tool: part.toolName,
                  toolCallId: part.toolCallId,
                  result: part.output,
                };

                // For file modification tools, include updated files for client sync
                if (
                  ['write_file', 'create_file', 'delete_file'].includes(
                    part.toolName,
                  )
                ) {
                  toolResult = {
                    ...toolResult,
                    result: {
                      ...(typeof part.output === 'object' ? part.output : {}),
                      updatedFiles:
                        fileManager instanceof VirtualFileManager
                          ? fileManager.getAllFilesForDispatch()
                          : {},
                    },
                  };
                }

                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(toolResult)}\n\n`),
                );
              }
              break;
          }
        }
      };

      // 3. Execute the stream processing and wait for it to complete
      await processStream();

      if (finalBuffer.length > 0) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'chat_response',
              content: finalBuffer,
            })}\n\n`,
          ),
        );
      }

      // Dispatch files to Fargate before completing chat
      if (
        fileManager instanceof VirtualFileManager &&
        fileManager.hasChanges()
      ) {
        await this.persistAndDispatchFiles(fileManager, params);
      }

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'chat_complete' })}\n\n`,
        ),
      );

      // Return captured data for persistence
      return {
        assistantResponse: assistantResponse || finalBuffer,
        executionPlan,
        completedSteps,
        fileChanges:
          fileManager instanceof VirtualFileManager
            ? fileManager.getAllFilesForDispatch()
            : undefined,
        toolCalls,
      };
    } catch (error) {
      log2.error(error, '[ChatEngine] Error during chat execution');
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'error',
            error:
              error instanceof Error ? error.message : 'Internal server error',
          })}\n\n`,
        ),
      );

      // Return partial data even on error
      return {
        assistantResponse: assistantResponse || '',
        executionPlan,
        completedSteps,
        fileChanges:
          fileManager instanceof VirtualFileManager
            ? fileManager.getAllFilesForDispatch()
            : undefined,
        toolCalls,
      };
    } finally {
      try {
        controller.close();
      } catch {
        /* Already closed */
      }
    }
  }
}
