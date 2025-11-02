import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateText, stepCountIs, streamText } from 'ai';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import type {
  CodeError,
  CodeWarning,
  DispatchRequestBody,
  EnhancedChatContext,
  PrototypeAssetInput,
  PrototypeFileInput,
} from '../../../types/PublicAPITypes.js';
import { DispatcherService } from '../../dispatcher/DispatcherService.js';
import type { DesignStyleKey, PromptConfig } from '../prompts/PROMPTS.js';
import { buildPromptConfig, isDesignStyleKey } from '../prompts/PROMPTS.js';
import {
  FileManagerInterface,
  VirtualFileManager,
} from '../utils/file-manager.js';
import { detectUserIntent } from '../utils/intent-classifier.js';
import { fetchImageAsBase64 } from '../utils/image-utils.js';
import {
  createFileManagerTools,
  createOrchestrationTools,
} from '../utils/tools.js';
import {
  ChatPhase,
  ChatStreamEventType,
  ImageProcessingStatus,
} from '../utils/chat-types.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
}

// Model Configuration
const MODEL_CONFIGS = {
  google: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-5',
  'openai-mini': 'gpt-5-nano',
} as const;

type ModelProvider = keyof typeof MODEL_CONFIGS;

const DEFAULT_MODEL_PROVIDER: ModelProvider = 'google';

const CURRENT_MODEL: ModelProvider = ((): ModelProvider => {
  const envModel = process.env.CHAT_MODEL_PROVIDER;
  if (envModel && envModel in MODEL_CONFIGS) {
    return envModel as ModelProvider;
  }
  return DEFAULT_MODEL_PROVIDER;
})();

export interface ChatEngineConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  googleAiApiKey: string;
  anthropicApiKey: string;
  openAiApiKey?: string;
  dispatcherService: DispatcherService;
  modelProvider?: ModelProvider;
}

export interface ChatEngineParams {
  messages: ChatMessage[];
  userMessage: string;
  originalUserMessage: string;
  fileManager: FileManagerInterface;
  inputFiles: Record<string, PrototypeFileInput> | null;
  inputAssets: Record<string, PrototypeAssetInput> | null;
  imageUrl: string | null;
  prototype_id: string;
  token: string;
  chat_session_id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  log2: SystemLogger;
  supabase: SupabaseClient;
  currentViewingPath: string | null;
  modelProvider?: ModelProvider;
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
  private openai?: ReturnType<typeof createOpenAI>;
  private config: ChatEngineConfig;
  private modelProvider: ModelProvider;

  constructor(config: ChatEngineConfig) {
    this.config = config;
    this.modelProvider = config.modelProvider ?? CURRENT_MODEL;

    this.google = createGoogleGenerativeAI({
      apiKey: config.googleAiApiKey,
    });

    this.anthropic = createAnthropic({
      apiKey: config.anthropicApiKey,
    });

    if (
      (this.modelProvider === 'openai' ||
        this.modelProvider === 'openai-mini') &&
      !config.openAiApiKey
    ) {
      throw new Error('OpenAI API key must be configured to use OpenAI models');
    }

    if (config.openAiApiKey) {
      this.openai = createOpenAI({
        apiKey: config.openAiApiKey,
      });
    }
  }

  private getCurrentModel(): LanguageModelV2 {
    switch (this.modelProvider) {
      case 'google':
        return this.google(MODEL_CONFIGS.google);
      case 'anthropic':
        return this.anthropic(MODEL_CONFIGS.anthropic);
      case 'openai':
      case 'openai-mini':
        if (!this.openai) {
          throw new Error('OpenAI API key is not configured for ChatEngine');
        }
        return this.openai(MODEL_CONFIGS[this.modelProvider]);
      default:
        return this.google(MODEL_CONFIGS.google);
    }
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
        log2.consoleLogDevOnly(
          'info',
          '[ChatEngine] No file changes to persist and dispatch',
        );
        return {
          updatedFiles: [],
          updatedFilesObject: {},
          deletedFiles: [],
        };
      }

      log2.consoleLogDevOnly(
        'info',
        '[ChatEngine] Starting file persistence and dispatch...',
      );
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
            type: ChatStreamEventType.DISPATCH_START,
          })}\n\n`,
        ),
      );
      // Call the dispatch endpoint
      const dispatchResult = await this.config.dispatcherService.dispatch(
        requestBody,
        token,
        log2,
      );
      if (dispatchResult.data) {
        // Send viewing URL update to client
        log2.consoleLogDevOnly(
          'info',
          '[persistAndDispatchFiles] sending viewing_url event',
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: ChatStreamEventType.VIEWING_URL,
              viewing_url: dispatchResult.data.viewing_url,
            })}\n\n`,
          ),
        );
        fileManager.clearChangeTracking();
        const newBuildErrors: CodeError[] = dispatchResult.data.build_errors;
        const newBuildWarnings: CodeWarning[] =
          dispatchResult.data.build_warnings || [];
        log2.metricCount('chat_build_errors', newBuildErrors.length);
        log2.metricCount('chat_build_warnings', newBuildWarnings.length);

        // Log build errors & build_warnings contents as structured log
        if (newBuildErrors.length > 0) {
          log2.warn('[ChatEngineV1] Build errors detected', {
            error_count: newBuildErrors.length,
            errors: newBuildErrors,
          });
        }
        if (newBuildWarnings.length > 0) {
          log2.warn('[ChatEngineV1] Build warnings detected', {
            warning_count: newBuildWarnings.length,
            warnings: newBuildWarnings,
          });
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: ChatStreamEventType.BUILD_ERRORS,
              build_errors: newBuildErrors,
            })}\n\n`,
          ),
        );
        return {
          updatedFiles: filesArray.map((file) => file.name),
          updatedFilesObject: allFiles,
          deletedFiles: Array.from(deletedFiles),
          build_errors: dispatchResult.data.build_errors,
        };
      } else {
        // PROPAGATE ERROR TO CLIENT
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: ChatStreamEventType.DISPATCH_ERROR,
              error: 'Failed to update the live preview.',
              details: `${dispatchResult.error}`,
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
    imageUrl?: string,
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
      // Insert sequentially to ensure correct ordering by created_at timestamp

      // Insert user message first
      const { error: userMessageError } = await supabaseServiceRoleClient
        .from('prototype_chat_messages')
        .insert({
          chat_session_id: chatSessionId,
          role: 'user' as const,
          content: userMessage,
          image_url: imageUrl || null,
        });

      if (userMessageError) {
        log2.error('Failed to insert user message:', userMessageError.message);
        return;
      }

      // Insert assistant message second
      const { error: assistantMessageError } = await supabaseServiceRoleClient
        .from('prototype_chat_messages')
        .insert({
          chat_session_id: chatSessionId,
          role: 'assistant' as const,
          content: assistantResponse,
        });

      if (assistantMessageError) {
        log2.error(
          'Failed to insert assistant message:',
          assistantMessageError.message,
        );
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

      log2.consoleLogDevOnly(
        'info',
        '[ChatService] Successfully persisted chat messages and context',
      );
    } catch (error) {
      log2.error(
        'Error in persistChatMessages:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  private async resolvePromptConfig(params: ChatEngineParams): Promise<{
    promptConfig: PromptConfig;
    designStyle: DesignStyleKey;
    designRules: string | null;
  }> {
    const { prototype_id, supabase, log2, currentViewingPath } = params;
    let designStyle: DesignStyleKey = 'tamagui';
    let designRules: string | null = null;

    try {
      const { data: prototypeRow, error: prototypeError } = await supabase
        .from('prototypes')
        .select('design_style, custom_design_system')
        .eq('id', prototype_id)
        .single();

      if (prototypeError) {
        log2.warn(
          '[ChatEngine] Failed to fetch prototype design style; falling back to tamagui',
          {
            prototype_id,
            error: prototypeError.message,
          },
        );
      } else if (prototypeRow) {
        if (isDesignStyleKey(prototypeRow.design_style)) {
          designStyle = prototypeRow.design_style;
        } else {
          log2.warn(
            '[ChatEngine] Unknown design style on prototype; falling back to tamagui',
            {
              prototype_id,
              design_style: prototypeRow.design_style,
            },
          );
        }

        if (prototypeRow.custom_design_system) {
          const designSystemId = Number(prototypeRow.custom_design_system);
          if (Number.isNaN(designSystemId)) {
            log2.warn(
              '[ChatEngine] custom_design_system is not numeric; skipping design rules fetch',
              {
                prototype_id,
                custom_design_system: prototypeRow.custom_design_system,
              },
            );
          } else {
            const { data: designSystemRow, error: designSystemError } =
              await supabase
                .from('design_systems')
                .select('design_rules')
                .eq('id', designSystemId)
                .single();

            if (designSystemError) {
              log2.warn('[ChatEngine] Failed to fetch custom design rules', {
                prototype_id,
                design_system_id: designSystemId,
                error: designSystemError.message,
              });
            } else if (designSystemRow) {
              designRules = designSystemRow.design_rules ?? null;
            }
          }
        }
      }
    } catch (error) {
      log2.error(
        error,
        '[ChatEngine] Unexpected error while resolving design system prompts',
        { prototype_id },
      );
    }

    const promptConfig = buildPromptConfig({
      designStyle,
      designRules,
      currentViewingPath,
    });
    log2.debug('[ChatEngine] Using design system prompt configuration', {
      designStyle,
      hasCustomRules: Boolean(designRules),
      currentViewingPath,
    });

    return { promptConfig, designStyle, designRules };
  }

  async executeChat(params: ChatEngineParams): Promise<void> {
    const {
      messages,
      userMessage,
      imageUrl,
      controller,
      encoder,
      log2,
      fileManager,
      supabase,
      modelProvider,
    } = params;

    // Override instance modelProvider if provided in params
    const effectiveModelProvider = modelProvider ?? this.modelProvider;
    const previousModelProvider = this.modelProvider;
    this.modelProvider = effectiveModelProvider;

    const { promptConfig } = await this.resolvePromptConfig(params);

    // Fetch and convert image to base64 if imageUrl is provided
    let imageBase64: string | null = null;
    if (imageUrl) {
      // Stream image processing start event
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: ChatStreamEventType.IMAGE_PROCESSING,
            status: ImageProcessingStatus.FETCHING,
            imageUrl,
          })}\n\n`,
        ),
      );

      log2.consoleLogDevOnly(
        'info',
        '[ChatEngine] Fetching image from storage URL',
        {
          imageUrl,
        },
      );
      imageBase64 = await fetchImageAsBase64(imageUrl, supabase, log2);
      if (!imageBase64) {
        log2.warn('[ChatEngine] Failed to fetch image, proceeding without it', {
          imageUrl,
        });
        // Stream image processing failure event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: ChatStreamEventType.IMAGE_PROCESSING,
              status: ImageProcessingStatus.FAILED,
            })}\n\n`,
          ),
        );
      } else {
        log2.consoleLogDevOnly(
          'info',
          '[ChatEngine] Successfully fetched and converted image to base64',
        );
        // Stream image processing success event
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: ChatStreamEventType.IMAGE_PROCESSING,
              status: ImageProcessingStatus.COMPLETE,
            })}\n\n`,
          ),
        );
      }
    }

    // Track execution data for persistence
    let executionPlan: string[] | undefined;
    const completedSteps: number[] = [];
    let assistantResponse = '';
    const toolCalls: Array<{
      toolName: string;
      input: unknown;
      output: unknown;
    }> = [];

    // Track total token usage across all phases
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      log2.consoleLogDevOnly(
        'info',
        '[ChatEngine] Generating response with plan-and-execute strategy...',
      );

      const userIntent = detectUserIntent(userMessage);

      // Stream intent detection event
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: ChatStreamEventType.INTENT_DETECTED,
            intent: userIntent,
            timestamp: new Date().toISOString(),
          })}\n\n`,
        ),
      );

      let userMessageForPrompt = userMessage;
      const isFirstUserTurn = (msgs: ChatMessage[]): boolean =>
        msgs.filter((m) => m.role === 'user').length === 1 &&
        msgs.filter((m) => m.role === 'assistant').length === 0;

      const shouldDoSpecExpansion = (
        msgs: ChatMessage[],
        intent: string,
      ): boolean => isFirstUserTurn(msgs) && intent !== 'error_fixing';

      if (shouldDoSpecExpansion(messages, userIntent)) {
        // Stream phase start event for spec expansion
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: ChatStreamEventType.PHASE_STARTED,
              phase: ChatPhase.SPEC_EXPANSION,
              description: 'Understanding your request in detail...',
            })}\n\n`,
          ),
        );

        const specExpansionResult = await generateText({
          model: this.getCurrentModel(),
          system: promptConfig.specExpansion,
          messages: [{ role: 'user', content: userMessage }],
        });
        userMessageForPrompt = specExpansionResult.text;

        // Stream the expanded spec to the client
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: ChatStreamEventType.SPEC_EXPANDED,
              original_message: userMessage,
              expanded_message: userMessageForPrompt,
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        );

        // Track token usage for spec expansion
        if (specExpansionResult.usage) {
          const specInputTokens = specExpansionResult.usage.inputTokens ?? 0;
          const specOutputTokens = specExpansionResult.usage.outputTokens ?? 0;

          totalInputTokens += specInputTokens;
          totalOutputTokens += specOutputTokens;

          log2.metricTokenUsage(
            MODEL_CONFIGS[this.modelProvider],
            specInputTokens,
            specOutputTokens,
            { intent: 'spec_expansion' },
          );
        }
      }
      const selectedSystemPrompt =
        userIntent === 'error_fixing'
          ? promptConfig.errorFixing
          : promptConfig.system;

      // Build the final user message with multimodal support
      const finalUserMessage = {
        role: 'user' as const,
        content: imageBase64
          ? [
              { type: 'text' as const, text: userMessageForPrompt },
              { type: 'image' as const, image: imageBase64 },
            ]
          : userMessageForPrompt,
      };

      // Stream phase start event for main execution
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: ChatStreamEventType.PHASE_STARTED,
            phase: ChatPhase.MAIN_EXECUTION,
            description: 'Executing plan and making changes...',
          })}\n\n`,
        ),
      );

      const result = streamText({
        model: this.getCurrentModel(),
        system: selectedSystemPrompt,
        messages: [
          ...messages.slice(0, -1).map((msg: ChatMessage) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          finalUserMessage,
        ],
        // UPDATED: Combine all tools
        tools: {
          ...createOrchestrationTools(params),
          ...createFileManagerTools(params),
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
                    type: ChatStreamEventType.CHAT_RESPONSE_DELTA,
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
                    type: ChatStreamEventType.TOOL_CALL,
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
                      type: ChatStreamEventType.EXECUTION_PLAN_CREATED,
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
                      type: ChatStreamEventType.STEP_COMPLETED,
                      toolCallId: part.toolCallId,
                      result: part.output,
                    })}\n\n`,
                  ),
                );
              } else {
                // Default handling for all other tools (e.g., file manager)
                let toolResult = {
                  type: ChatStreamEventType.TOOL_RESULT,
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

      // Get final result to access usage data
      const finalResultUsage = await result.usage;

      // Track token usage for main chat
      if (finalResultUsage) {
        const chatInputTokens = finalResultUsage.inputTokens ?? 0;
        const chatOutputTokens = finalResultUsage.outputTokens ?? 0;

        totalInputTokens += chatInputTokens;
        totalOutputTokens += chatOutputTokens;

        log2.metricTokenUsage(
          MODEL_CONFIGS[this.modelProvider],
          chatInputTokens,
          chatOutputTokens,
          { intent: userIntent },
        );
      }

      if (finalBuffer.length > 0) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: ChatStreamEventType.CHAT_RESPONSE,
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
        params.log2.consoleLogDevOnly(
          'info',
          'Sending the files back to the client first: ',
          {
            updatedFiles: Object.keys(fileManager.getChangedFiles()),
          },
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: ChatStreamEventType.FILES_SYNCED,
              updatedFilesObject: fileManager.getChangedFiles(),
              deletedFiles: fileManager.getDeletedFiles(),
            })}\n\n`,
          ),
        );

        // Stream phase start event for file dispatch
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: ChatStreamEventType.PHASE_STARTED,
              phase: ChatPhase.FILE_DISPATCH,
              description: 'Building and deploying your changes...',
            })}\n\n`,
          ),
        );

        await this.persistAndDispatchFiles(fileManager, params);
        // Clear change tracking after successful dispatch
        fileManager.clearChangeTracking();
      }

      // Error checking phase after file dispatch
      // 1. enqueue a new ChatStreamEventType for starting the error checking phase
      // 2. Use the this.config.dispatcherService.dispatchRunCommand function to run the "npx tsc" command on the dev server
      // 3. If the stdout is not empty, then the type checking failed. Log the stdout, and then:
      //     - Stream a new ChatStreamEventType indicating that errors were found and starting the fixing phase
      //     - Create a new LLM call (using the Vercel AI SDK) to generate a fix for the errors. Set the user intent type to 'error_fixing', and pass in the output from the npx tsc run as a user message
      //     - Give the LLM all of the same tools that were used in the other two phases
      //     - Log the token usage for the error_fixing user intent phase (input and output tokens), and aggregate the token usage to the overall total. Move the log for the overall total to after these steps
      // 4. If the stdout was empty, then log that no errors were found, and then continue
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: ChatStreamEventType.TYPECHECK_STARTED,
            command: 'npx tsc',
          })}\n\n`,
        ),
      );

      const typecheckResponse = await this.config.dispatcherService.runCommand(
        {
          prototype_id: params.prototype_id,
          command: 'npx tsc',
          timeout_ms: 120000,
          strip_ansi: true,
        },
        params.token,
        log2,
      );

      if (typecheckResponse.error || !typecheckResponse.data) {
        const errorMessage =
          typecheckResponse.error?.message ??
          'Failed to run type check on build worker';
        log2.error(
          new Error(errorMessage),
          '[ChatEngine] Failed to execute type check',
        );
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: ChatStreamEventType.TYPECHECK_FAILED,
              error: errorMessage,
            })}\n\n`,
          ),
        );
      } else {
        const typecheckStdout = typecheckResponse.data.stdout?.trim() ?? '';
        if (typecheckStdout.length > 0) {
          log2.warn('[ChatEngine] TypeScript errors detected after dispatch', {
            output: typecheckStdout,
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: ChatStreamEventType.TYPECHECK_ERRORS,
                output: typecheckStdout,
              })}\n\n`,
            ),
          );

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: ChatStreamEventType.PHASE_STARTED,
                phase: ChatPhase.ERROR_FIXING,
                description: 'Fixing detected type errors...',
              })}\n\n`,
            ),
          );

          const errorFixMessages = [
            ...messages.slice(0, -1).map((msg: ChatMessage) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            })),
            finalUserMessage,
            {
              role: 'assistant' as const,
              content: assistantResponse || finalBuffer,
            },
            {
              role: 'user' as const,
              content: `The TypeScript compiler reported the following errors:\n\n${typecheckStdout}\n\nPlease fix these errors.`,
            },
          ];

          const errorFixResult = streamText({
            model: this.getCurrentModel(),
            system: promptConfig.errorFixing,
            messages: errorFixMessages,
            tools: {
              ...createOrchestrationTools(params),
              ...createFileManagerTools(params),
            },
            toolChoice: 'auto',
            stopWhen: stepCountIs(25),
          });

          let errorFixBuffer = '';

          for await (const part of errorFixResult.fullStream) {
            switch (part.type) {
              case 'text-delta':
                errorFixBuffer += part.text;
                assistantResponse += part.text;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: ChatStreamEventType.CHAT_RESPONSE_DELTA,
                      content: part.text,
                    })}\n\n`,
                  ),
                );
                break;
              case 'tool-call':
                toolCalls.push({
                  toolName: part.toolName,
                  input: part.input,
                  output: null,
                });
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: ChatStreamEventType.TOOL_CALL,
                      tool: part.toolName,
                      toolCallId: part.toolCallId,
                      args: part.input,
                    })}\n\n`,
                  ),
                );
                break;
              case 'tool-result': {
                const matchingToolCall = toolCalls.find(
                  (tc) => tc.toolName === part.toolName && tc.output === null,
                );
                if (matchingToolCall) {
                  matchingToolCall.output = part.output;
                }

                if (part.toolName === 'create_execution_plan') {
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
                        type: ChatStreamEventType.EXECUTION_PLAN_CREATED,
                        toolCallId: part.toolCallId,
                        result: part.output,
                      })}\n\n`,
                    ),
                  );
                } else if (part.toolName === 'confirm_step_completion') {
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
                        type: ChatStreamEventType.STEP_COMPLETED,
                        toolCallId: part.toolCallId,
                        result: part.output,
                      })}\n\n`,
                    ),
                  );
                } else {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: ChatStreamEventType.TOOL_RESULT,
                        tool: part.toolName,
                        toolCallId: part.toolCallId,
                        result: part.output,
                      })}\n\n`,
                    ),
                  );
                }
                break;
              }
              default:
                break;
            }
          }

          const errorFixUsage = await errorFixResult.usage;
          if (errorFixUsage) {
            const errorFixInputTokens = errorFixUsage.inputTokens ?? 0;
            const errorFixOutputTokens = errorFixUsage.outputTokens ?? 0;

            totalInputTokens += errorFixInputTokens;
            totalOutputTokens += errorFixOutputTokens;

            log2.metricTokenUsage(
              MODEL_CONFIGS[this.modelProvider],
              errorFixInputTokens,
              errorFixOutputTokens,
              { intent: 'error_fixing' },
            );
          }

          if (errorFixBuffer.length > 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: ChatStreamEventType.CHAT_RESPONSE,
                  content: errorFixBuffer,
                })}\n\n`,
              ),
            );
          }

          // Dispatch error fixes to build worker
          if (
            fileManager instanceof VirtualFileManager &&
            fileManager.hasChanges()
          ) {
            log2.info(
              '[ChatEngine] Dispatching error fixes to build worker',
              {
                updatedFiles: Object.keys(fileManager.getChangedFiles()),
              },
            );

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: ChatStreamEventType.FILES_SYNCED,
                  updatedFilesObject: fileManager.getChangedFiles(),
                  deletedFiles: fileManager.getDeletedFiles(),
                })}\n\n`,
              ),
            );

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: ChatStreamEventType.PHASE_STARTED,
                  phase: ChatPhase.FILE_DISPATCH,
                  description: 'Building and deploying error fixes...',
                })}\n\n`,
              ),
            );

            await this.persistAndDispatchFiles(fileManager, params);
            fileManager.clearChangeTracking();
          }
        } else {
          log2.info('[ChatEngine] TypeScript check passed with no errors');
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: ChatStreamEventType.TYPECHECK_PASSED,
                message: 'TypeScript check completed successfully.',
              })}\n\n`,
            ),
          );
        }
      }

      // Track total token usage across all phases (after error handling)
      if (totalInputTokens > 0 || totalOutputTokens > 0) {
        log2.metricTokenUsage(
          MODEL_CONFIGS[this.modelProvider],
          totalInputTokens,
          totalOutputTokens,
          { intent: 'total_chat_call' },
        );
      }

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: ChatStreamEventType.CHAT_COMPLETE })}\n\n`,
        ),
      );

      await this.persistChatMessages(
        params.chat_session_id,
        userMessage,
        assistantResponse || finalBuffer,
        params.log2,
        params.imageUrl ?? undefined,
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
            type: ChatStreamEventType.ERROR,
            error:
              error instanceof Error ? error.message : 'Internal server error',
          })}\n\n`,
        ),
      );
    } finally {
      // Restore previous modelProvider
      this.modelProvider = previousModelProvider;
    }
  }
}
