import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateText, stepCountIs, streamText, tool, Tool } from 'ai';
import { z } from 'zod';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import type {
  CodeError,
  DispatchRequestBody,
  EnhancedChatContext,
  PrototypeAssetInput,
  PrototypeFileInput,
} from '../../../types/PublicAPITypes.js';
import {
  ERROR_FIXING_PROMPT,
  SPEC_EXPANSION_PROMPT,
  SYSTEM_PROMPT,
} from '../prompts/PROMPTS.js';
import {
  FileManagerInterface,
  VirtualFileManager,
} from '../utils/file-manager.js';
import { detectUserIntent } from '../utils/intent-classifier.js';
import { DispatcherService } from '../../dispatcher/DispatcherService.js';

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
  dispatcherService: DispatcherService;
}

export interface ChatEngineParams {
  messages: ChatMessage[];
  userMessage: string;
  originalUserMessage: string;
  fileManager: FileManagerInterface;
  inputFiles: Record<string, PrototypeFileInput> | null;
  inputAssets: Record<string, PrototypeAssetInput> | null;
  image: string | null;
  prototype_id: string;
  token: string;
  chat_session_id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  log2: SystemLogger;
  supabase: SupabaseClient;
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

      append_file_content: tool({
        description:
          'Add content to the end of an existing file (efficient for adding new functions, imports, etc.)',
        inputSchema: z.object({
          filePath: z.string().describe('The path to the file to append to'),
          content: z.string().describe('The content to append to the file'),
        }),
        execute: async ({
          filePath,
          content,
        }: {
          filePath: string;
          content: string;
        }) => {
          log2.info(`[ChatEngine] Tool call: append_file_content`, {
            filePath,
            contentLength: content.length,
          });
          const result = fileManager.handleToolCall({
            function: {
              name: 'append_file_content',
              arguments: { filePath, content },
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

      replace_file_content: tool({
        description:
          'Replace exact text content within a file (efficient for small edits)',
        inputSchema: z.object({
          filePath: z.string().describe('The path to the file to modify'),
          searchText: z.string().describe('The exact text to find and replace'),
          replaceWith: z.string().describe('The text to replace it with'),
          expectOneMatch: z
            .boolean()
            .default(true)
            .describe(
              'If true, operation fails if more than one match is found (default: true)',
            ),
        }),
        execute: async ({
          filePath,
          searchText,
          replaceWith,
          expectOneMatch = true,
        }: {
          filePath: string;
          searchText: string;
          replaceWith: string;
          expectOneMatch?: boolean;
        }) => {
          log2.info(`[ChatEngine] Tool call: replace_file_content`, {
            filePath,
            searchTextLength: searchText.length,
            replaceWithLength: replaceWith.length,
            expectOneMatch,
          });
          const result = fileManager.handleToolCall({
            function: {
              name: 'replace_file_content',
              arguments: { filePath, searchText, replaceWith, expectOneMatch },
            },
          });

          return {
            success: result.success ?? false,
            error: result.error ?? '',
            message: result.message ?? '',
            filePath: result.filePath ?? filePath,
            replacementCount: result.replacementCount,
            context: result.context,
          };
        },
      }),
    };
  }

  private async persistAndDispatchFiles(
    fileManager: VirtualFileManager,
    params: ChatEngineParams,
  ): Promise<{
    updatedFiles: string[];
    updatedFilesObject: Record<string, PrototypeFileInput>;
    deletedFiles: string[];
    build_errors?: CodeError[];
  }> {
    const { prototype_id, token, controller, encoder } = params;
    const log2 = params.log2.child({
      function: 'persistAndDispatchFiles',
    });

    try {
      if (!fileManager.hasChanges()) {
        log2.info('[ChatEngine] No file changes to persist and dispatch');
        return {
          updatedFiles: [],
          updatedFilesObject: {},
          deletedFiles: [],
        };
      }

      log2.info('[ChatEngine] Starting file persistence and dispatch...');
      // Get all files for dispatch (complete file set needed for dispatch)
      // TODO @priyam: stream the updated files back to the client
      // TODO: if there is already an active dev-server (from precheck), then we should only send updated files

      const allFiles =
        fileManager.getFileScope() === 'complete'
          ? fileManager.getAllFilesForDispatch()
          : fileManager.getChangedFiles();
      const deletedFiles = fileManager.getDeletedFiles();
      const filesArray = Object.entries(allFiles).map(([, file]) => file);
      const requestBody: DispatchRequestBody = {
        prototype_id: prototype_id,
        framework: 'expo_react_native',
        files: filesArray,
        assets: [], // The AI chat never updates or creates assets
        deleted_files: Array.from(deletedFiles),
        file_scope: fileManager.getFileScope(),
        hot_reload: true, // Enable hot reload for live updates
      };
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'dispatch_start',
          })}\n\n`,
        ),
      );
      // Call the dispatch endpoint
      const dispatchResult = await this.config.dispatcherService.dispatch(
        requestBody,
        token,
        log2,
      );

      const result = dispatchResult.response;
      if (dispatchResult.statusCode === 200 && result.data) {
        // Send viewing URL update to client
        log2.consoleLogDevOnly(
          'info',
          '[persistAndDispatchFiles] sending viewing_url event',
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'viewing_url',
              viewing_url: result.data.viewing_url,
            })}\n\n`,
          ),
        );
        fileManager.clearChangeTracking();
        const newBuildErrors: CodeError[] = result.data.build_errors;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'build_errors',
              build_errors: newBuildErrors,
            })}\n\n`,
          ),
        );
        return {
          updatedFiles: filesArray.map((file) => file.name),
          updatedFilesObject: allFiles,
          deletedFiles: Array.from(deletedFiles),
          build_errors: result.data.build_errors,
        };
      } else {
        // PROPAGATE ERROR TO CLIENT
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'dispatch_error',
              error: 'Failed to update the live preview.',
              details: `Dispatch service responded with status ${dispatchResult.statusCode}.`,
            })}\n\n`,
          ),
        );
        return {
          updatedFiles: [],
          updatedFilesObject: {},
          deletedFiles: [],
        };
      }
    } catch (error) {
      log2.error(error, '[ChatEngine] Error in persistAndDispatchFiles');
      // Don't throw - this shouldn't break the chat flow
    }
    return {
      updatedFiles: [],
      updatedFilesObject: {},
      deletedFiles: [],
    };
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
      const supabaseServiceRoleClient = createClient(
        this.config.supabaseUrl,
        this.config.supabaseServiceKey,
      );

      // 1. Insert simple messages into prototype_chat_messages table
      const messagesToInsert = [
        {
          chat_session_id: chatSessionId,
          role: 'assistant' as const,
          content: assistantResponse,
        },
        {
          chat_session_id: chatSessionId,
          role: 'user' as const,
          content: userMessage,
        },
      ];

      const { error: messagesError } = await supabaseServiceRoleClient
        .from('prototype_chat_messages')
        .insert(messagesToInsert);

      if (messagesError) {
        log2.error('Failed to insert chat messages:', messagesError.message);
        return;
      }

      // 2. Update enhanced chat context in chat session
      // First, fetch current context
      const { data: sessionData, error: fetchError } =
        await supabaseServiceRoleClient
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
      const { error: updateError } = await supabaseServiceRoleClient
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

  async executeChat(params: ChatEngineParams): Promise<void> {
    const {
      messages,
      userMessage,
      image,
      controller,
      encoder,
      log2,
      fileManager,
    } = params;

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

      const imageContext = image ? `Attached: ${image}` : null;
      const userIntent = detectUserIntent(userMessage);
      let userMessageForPrompt = userMessage;
      const isFirstUserTurn = (msgs: ChatMessage[]): boolean =>
        msgs.filter((m) => m.role === 'user').length === 1 &&
        msgs.filter((m) => m.role === 'assistant').length === 0;

      const shouldDoSpecExpansion = (
        msgs: ChatMessage[],
        intent: string,
      ): boolean => isFirstUserTurn(msgs) && intent !== 'error_fixing';

      if (shouldDoSpecExpansion(messages, userIntent)) {
        const specExpansionResult = await generateText({
          model: this.getCurrentModel(),
          system: SPEC_EXPANSION_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        });
        userMessageForPrompt = specExpansionResult.text;
      }
      const selectedSystemPrompt =
        userIntent === 'error_fixing' ? ERROR_FIXING_PROMPT : SYSTEM_PROMPT;
      const result = streamText({
        model: this.getCurrentModel(),
        system: selectedSystemPrompt,
        messages: [
          ...messages.slice(0, -1).map((msg: ChatMessage) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          {
            role: 'user' as const,
            content: imageContext
              ? `${userMessageForPrompt}\n\n${imageContext}`
              : userMessageForPrompt,
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
                  result: {},
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
        params.log2.info('Sending the files back to the client first: ', {
          updatedFiles: Object.keys(fileManager.getChangedFiles()),
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'files_synced',
              updatedFilesObject: fileManager.getChangedFiles(),
              deletedFiles: fileManager.getDeletedFiles(),
            })}\n\n`,
          ),
        );
        const dispatchResult = await this.persistAndDispatchFiles(
          fileManager,
          params,
        );
        dispatchResult.build_errors || [];
        // Clear change tracking after successful dispatch
        fileManager.clearChangeTracking();
      }

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'chat_complete' })}\n\n`,
        ),
      );
      await this.persistChatMessages(
        params.chat_session_id,
        userMessage,
        assistantResponse || finalBuffer,
        params.log2,
        executionPlan,
        fileManager instanceof VirtualFileManager
          ? fileManager.getChangedFiles()
          : undefined,
        completedSteps,
        toolCalls,
      );
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
    }
  }
}
