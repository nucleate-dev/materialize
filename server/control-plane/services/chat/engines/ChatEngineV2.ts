import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { createClient } from '@supabase/supabase-js';
import { generateText, stepCountIs, streamText } from 'ai';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import type {
  ChatMessage,
  CodeError,
  DispatchRequestBody,
  EnhancedChatContext,
  PrototypeFileInput,
} from '../../../types/PublicAPITypes.js';
import { buildPromptConfig, isDesignStyleKey } from '../prompts/PROMPTS_V2.js';
import { VirtualFileManager } from '../utils/file-manager.js';
import { detectUserIntent } from '../utils/intent-classifier.js';
import { fetchImageAsBase64 } from '../utils/image-utils.js';
import {
  createDevServerTools,
  createFileManagerTools,
  createOrchestrationTools,
} from '../utils/tools.js';
import {
  ChatPhase,
  ChatStreamEventType,
  ImageProcessingStatus,
} from '../utils/chat-types.js';
import {
  ChatEngineConfig,
  ChatEngineParams,
  DesignStyleKey,
  EventTracker,
  MODEL_CONFIGS,
  ModelProvider,
  PromptConfig,
} from '../../../types/InternalTypes.js';

const DEFAULT_MODEL_PROVIDER: ModelProvider = 'google';

const CURRENT_MODEL: ModelProvider = ((): ModelProvider => {
  const envModel = process.env.CHAT_MODEL_PROVIDER;
  if (envModel && envModel in MODEL_CONFIGS) {
    return envModel as ModelProvider;
  }
  return DEFAULT_MODEL_PROVIDER;
})();

export class ChatEngineV2 {
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
    return this.getModel(this.modelProvider);
  }

  private getModel(model: ModelProvider): LanguageModelV2 {
    switch (model) {
      case 'google':
        return this.google(MODEL_CONFIGS.google);
      case 'anthropic':
        return this.anthropic(MODEL_CONFIGS.anthropic);
      case 'openai':
        if (!this.openai) {
          throw new Error('OpenAI API key is not configured for ChatEngine');
        }
        return this.openai(MODEL_CONFIGS.openai);
      case 'openai-mini':
        if (!this.openai) {
          throw new Error('OpenAI API key is not configured for ChatEngine');
        }
        return this.openai(MODEL_CONFIGS['openai-mini']);
    }
  }

  private async persistAndDispatchFiles(
    fileManager: VirtualFileManager,
    params: ChatEngineParams,
    streamAndPersistEvent: (event: Record<string, unknown>) => void,
  ): Promise<{
    updatedFiles: string[];
    updatedFilesObject: Record<string, PrototypeFileInput>;
    deletedFiles: string[];
    build_errors?: CodeError[];
  }> {
    const { prototype_id, token } = params;
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
      streamAndPersistEvent({
        type: ChatStreamEventType.DISPATCH_START,
      });
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
        streamAndPersistEvent({
          type: ChatStreamEventType.VIEWING_URL,
          viewing_url: dispatchResult.data.viewing_url,
        });
        fileManager.clearChangeTracking();
        const newBuildErrors: CodeError[] = dispatchResult.data.build_errors;

        streamAndPersistEvent({
          type: ChatStreamEventType.BUILD_ERRORS,
          build_errors: newBuildErrors,
        });
        return {
          updatedFiles: filesArray.map((file) => file.name),
          updatedFilesObject: allFiles,
          deletedFiles: Array.from(deletedFiles),
          build_errors: dispatchResult.data.build_errors,
        };
      } else {
        // PROPAGATE ERROR TO CLIENT
        streamAndPersistEvent({
          type: ChatStreamEventType.DISPATCH_ERROR,
          error: 'Failed to update the live preview.',
          details: `${dispatchResult.error}`,
        });
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

  private async persistEvent(
    chatSessionId: string,
    eventType: string,
    eventData: unknown,
    sequence: number,
    log2: SystemLogger,
  ): Promise<void> {
    try {
      const supabaseServiceRoleClient = createClient(
        this.config.supabaseUrl,
        this.config.supabaseServiceKey,
      );

      const { error } = await supabaseServiceRoleClient
        .from('prototype_chat_messages')
        .insert({
          chat_session_id: chatSessionId,
          message_type: 'event',
          event_type: eventType,
          event_data: eventData as never,
          event_timestamp: new Date().toISOString(),
          sequence: sequence,
          role: 'assistant', // Events are associated with assistant
          content: '', // Empty content for events
        });

      if (error) {
        log2.warn('[ChatEngine] Failed to persist event', {
          event_type: eventType,
          error: error.message,
        });
      }
    } catch (error) {
      log2.error(error, '[ChatEngine] Error persisting event', {
        event_type: eventType,
      });
    }
  }

  private async persistChatMessages(
    chatSessionId: string,
    userMessage: string,
    assistantResponse: string,
    log2: SystemLogger,
    userSequence: number,
    assistantSequence: number,
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
      // Insert sequentially to ensure correct ordering by sequence number

      const now = new Date().toISOString();

      // Insert user message first
      const { error: userMessageError } = await supabaseServiceRoleClient
        .from('prototype_chat_messages')
        .insert({
          chat_session_id: chatSessionId,
          message_type: 'chat',
          role: 'user' as const,
          content: userMessage,
          image_url: imageUrl || null,
          event_timestamp: now,
          sequence: userSequence,
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
          message_type: 'chat',
          role: 'assistant' as const,
          content: assistantResponse,
          event_timestamp: now,
          sequence: assistantSequence,
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

    // Event tracking for persistence
    const eventTracker: EventTracker = {
      sequence: 0,
      events: [],
    };

    // Reserve sequence 0 for user message
    const userSequence = eventTracker.sequence++;

    // Helper to stream event to client AND persist to database
    const streamAndPersistEvent = (event: Record<string, unknown>): void => {
      // Stream to client
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      // Extract event type and persist asynchronously (don't block stream)
      const eventType = event.type as string;
      const currentSequence = eventTracker.sequence++;

      void this.persistEvent(
        params.chat_session_id,
        eventType,
        event, // Store the entire event payload
        currentSequence,
        log2,
      );
    };

    // Fetch and convert image to base64 if imageUrl is provided
    let imageBase64: string | null = null;
    if (imageUrl) {
      // Stream image processing start event
      streamAndPersistEvent({
        type: ChatStreamEventType.IMAGE_PROCESSING,
        status: ImageProcessingStatus.FETCHING,
        imageUrl,
      });

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
        streamAndPersistEvent({
          type: ChatStreamEventType.IMAGE_PROCESSING,
          status: ImageProcessingStatus.FAILED,
        });
      } else {
        log2.consoleLogDevOnly(
          'info',
          '[ChatEngine] Successfully fetched and converted image to base64',
        );
        // Stream image processing success event
        streamAndPersistEvent({
          type: ChatStreamEventType.IMAGE_PROCESSING,
          status: ImageProcessingStatus.COMPLETE,
        });
      }
    }

    try {
      log2.consoleLogDevOnly(
        'info',
        '[ChatEngine] Generating response with plan-and-execute strategy...',
      );

      const userIntent = detectUserIntent(userMessage);

      // Stream intent detection event
      streamAndPersistEvent({
        type: ChatStreamEventType.INTENT_DETECTED,
        intent: userIntent,
        timestamp: new Date().toISOString(),
      });

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
        streamAndPersistEvent({
          type: ChatStreamEventType.PHASE_STARTED,
          phase: ChatPhase.SPEC_EXPANSION,
          description: 'Understanding your request in detail...',
        });

        const specExpansionResult = await generateText({
          model: this.getModel('google'),
          system: promptConfig.specExpansion,
          messages: [{ role: 'user', content: userMessage }],
        });
        userMessageForPrompt = specExpansionResult.text;

        // Stream the expanded spec to the client
        streamAndPersistEvent({
          type: ChatStreamEventType.SPEC_EXPANDED,
          original_message: userMessage,
          expanded_message: userMessageForPrompt,
          timestamp: new Date().toISOString(),
        });

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
      streamAndPersistEvent({
        type: ChatStreamEventType.PHASE_STARTED,
        phase: ChatPhase.MAIN_EXECUTION,
        description: 'Executing plan and making changes...',
      });

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
          ...createDevServerTools(params, this.config.dispatcherService),
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
              streamAndPersistEvent({
                type: ChatStreamEventType.CHAT_RESPONSE_DELTA,
                content: part.text,
              });
              break;

            case 'tool-call':
              // Capture tool call for persistence
              toolCalls.push({
                toolName: part.toolName,
                input: part.input,
                output: null, // Will be filled in tool-result
              });

              // Inform the client that a tool is being called
              streamAndPersistEvent({
                type: ChatStreamEventType.TOOL_CALL,
                tool: part.toolName,
                toolCallId: part.toolCallId,
                args: part.input, // It's useful to show the client what the tool is doing
              });
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
                streamAndPersistEvent({
                  type: ChatStreamEventType.EXECUTION_PLAN_CREATED,
                  toolCallId: part.toolCallId,
                  result: part.output,
                });
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

                streamAndPersistEvent({
                  type: ChatStreamEventType.STEP_COMPLETED,
                  toolCallId: part.toolCallId,
                  result: part.output,
                });
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

                streamAndPersistEvent(toolResult);
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
        streamAndPersistEvent({
          type: ChatStreamEventType.CHAT_RESPONSE,
          content: finalBuffer,
        });
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
        streamAndPersistEvent({
          type: ChatStreamEventType.FILES_SYNCED,
          updatedFilesObject: fileManager.getChangedFiles(),
          deletedFiles: fileManager.getDeletedFiles(),
        });

        // Stream phase start event for file dispatch
        streamAndPersistEvent({
          type: ChatStreamEventType.PHASE_STARTED,
          phase: ChatPhase.FILE_DISPATCH,
          description: 'Building and deploying your changes...',
        });

        await this.persistAndDispatchFiles(
          fileManager,
          params,
          streamAndPersistEvent,
        );
        // Clear change tracking after successful dispatch
        fileManager.clearChangeTracking();
      }

      // Error checking phase after file dispatch
      streamAndPersistEvent({
        type: ChatStreamEventType.TYPECHECK_STARTED,
        command: 'npx tsc',
      });

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
        streamAndPersistEvent({
          type: ChatStreamEventType.TYPECHECK_FAILED,
          error: errorMessage,
        });
      } else {
        const typecheckStdout = typecheckResponse.data.stdout?.trim() ?? '';
        if (typecheckStdout.length > 0) {
          log2.warn('[ChatEngine] TypeScript errors detected after dispatch', {
            output: typecheckStdout,
          });

          streamAndPersistEvent({
            type: ChatStreamEventType.TYPECHECK_ERRORS,
            output: typecheckStdout,
          });

          streamAndPersistEvent({
            type: ChatStreamEventType.PHASE_STARTED,
            phase: ChatPhase.ERROR_FIXING,
            description: 'Fixing detected type errors...',
          });

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
                streamAndPersistEvent({
                  type: ChatStreamEventType.CHAT_RESPONSE_DELTA,
                  content: part.text,
                });
                break;
              case 'tool-call':
                toolCalls.push({
                  toolName: part.toolName,
                  input: part.input,
                  output: null,
                });
                streamAndPersistEvent({
                  type: ChatStreamEventType.TOOL_CALL,
                  tool: part.toolName,
                  toolCallId: part.toolCallId,
                  args: part.input,
                });
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
                  streamAndPersistEvent({
                    type: ChatStreamEventType.EXECUTION_PLAN_CREATED,
                    toolCallId: part.toolCallId,
                    result: part.output,
                  });
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
                  streamAndPersistEvent({
                    type: ChatStreamEventType.STEP_COMPLETED,
                    toolCallId: part.toolCallId,
                    result: part.output,
                  });
                } else {
                  streamAndPersistEvent({
                    type: ChatStreamEventType.TOOL_RESULT,
                    tool: part.toolName,
                    toolCallId: part.toolCallId,
                    result: part.output,
                  });
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
            streamAndPersistEvent({
              type: ChatStreamEventType.CHAT_RESPONSE,
              content: errorFixBuffer,
            });
          }

          // Dispatch error fixes to build worker
          if (
            fileManager instanceof VirtualFileManager &&
            fileManager.hasChanges()
          ) {
            log2.info('[ChatEngine] Dispatching error fixes to build worker', {
              updatedFiles: Object.keys(fileManager.getChangedFiles()),
            });

            streamAndPersistEvent({
              type: ChatStreamEventType.FILES_SYNCED,
              updatedFilesObject: fileManager.getChangedFiles(),
              deletedFiles: fileManager.getDeletedFiles(),
            });

            streamAndPersistEvent({
              type: ChatStreamEventType.PHASE_STARTED,
              phase: ChatPhase.FILE_DISPATCH,
              description: 'Building and deploying error fixes...',
            });

            await this.persistAndDispatchFiles(
              fileManager,
              params,
              streamAndPersistEvent,
            );
            fileManager.clearChangeTracking();
          }
        } else {
          log2.info('[ChatEngine] TypeScript check passed with no errors');
          streamAndPersistEvent({
            type: ChatStreamEventType.TYPECHECK_PASSED,
            message: 'TypeScript check completed successfully.',
          });
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

      // Persist chat messages with sequence numbers
      // User message was assigned sequence 0, assistant message is at the end
      const assistantSequence = eventTracker.sequence++;

      await this.persistChatMessages(
        params.chat_session_id,
        userMessage,
        assistantResponse || finalBuffer,
        params.log2,
        userSequence,
        assistantSequence,
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
