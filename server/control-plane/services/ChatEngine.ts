import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { LatencyEvents } from '../loggers/LatencyEvents.js';
import { SystemLogger } from '../loggers/SystemLogger.js';
import type {
  CodeError,
  DispatchPrecheckResponse,
  DispatchRequestBody,
  PrototypeAssetInput,
  PrototypeFileInput,
} from '../types/PublicAPITypes.js';
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
    results?: Array<{
      filePath: string;
      lineNumber: number;
      context: string;
      matchedLine: string;
    }>;
    dependencies?: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  };
  getFinalState(): PrototypeFiles;
}

const MAX_ERROR_FIX_RETRIES = 1;

// Model Configuration
const CURRENT_MODEL: 'google' | 'anthropic' = 'google';
const MODEL_CONFIGS = {
  google: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-20250514',
} as const;

function filterCriticalErrors(buildErrors: CodeError[]): CodeError[] {
  return buildErrors.filter(
    (error) => error.type === 'syntax' || error.type === 'dependency',
  );
}

function createErrorFixingContext(errors: CodeError[]): string {
  if (errors.length === 0) return '';

  const errorList = errors
    .map((error) => {
      const location = error.file
        ? `${error.file}${error.line ? `:${error.line}` : ''}${
            error.column ? `:${error.column}` : ''
          }`
        : 'unknown location';
      return `- ${error.type.toUpperCase()}: ${error.message} (${location})`;
    })
    .join('\n');

  return `
CRITICAL BUILD ERRORS DETECTED:
The following errors must be fixed immediately:

${errorList}

You MUST fix these errors by:
1. Reading the problematic files if needed using read_file tool
2. Identifying and correcting the syntax/logic/import issues
3. Writing corrected files using write_file tool

Focus only on these specific errors. Do not make unrelated changes.`;
}

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
  inputFiles: PrototypeFiles | null;
  inputAssets: Record<string, PrototypeAssetInput> | null;
  prototype_id: string;
  token: string;
  chat_session_id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  log2: SystemLogger;
  precheckData: DispatchPrecheckResponse;
}

export class ChatEngine {
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

  async executeChat(params: ChatEngineParams): Promise<void> {
    const {
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
      log2,
      precheckData,
    } = params;

    try {
      // Execute planning phase
      log2.consoleLogDevOnly('info', '[ChatEngine] Starting planning phase...');
      const planningResult = await log2.time(
        LatencyEvents.chat_planning_phase_latency,
        async () =>
          await this.handlePlanningPhase(
            messages,
            userMessage,
            fileManager,
            inputFiles,
            chat_session_id,
            controller,
            encoder,
            log2,
          ),
      );

      log2.consoleLogDevOnly('info', '🧠 [ChatEngine] Planning result:', {
        planningResult,
      });

      // Execute execution phase
      log2.consoleLogDevOnly(
        'info',
        '[ChatEngine] Starting execution phase...',
      );
      const supabase = createClient<Database>(
        this.config.supabaseUrl,
        this.config.supabaseServiceKey,
      );
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
        log2,
      );

      // Handle dispatch and error fixing
      await this.handleDispatchAndErrorFixing(
        fileManager,
        inputAssets,
        prototype_id,
        token,
        controller,
        encoder,
        log2,
        messages,
        inputFiles,
        precheckData,
      );
    } catch (error) {
      log2.error(error, '[ChatEngine] Error during chat execution');
      throw error;
    }
  }

  private async handlePlanningPhase(
    messages: ChatMessage[],
    userMessage: string,
    fileManager: FileManagerInterface,
    convertedFiles: PrototypeFiles | null,
    chat_session_id: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    log2: SystemLogger,
  ): Promise<string> {
    const supabase = createClient<Database>(
      this.config.supabaseUrl,
      this.config.supabaseServiceKey,
    );

    // Phase 1: Get the planning response
    let response = await generateText({
      model: this.getCurrentModel(),
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
      log2.consoleLogDevOnly(
        'info',
        `[handlePlanningPhase] Processing ${response.toolCalls.length} tool calls (total: ${toolCallsMade})`,
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
          log2.consoleLogDevOnly(
            'warn',
            '[handlePlanningPhase] Detected duplicate tool call',
          );

          // If we have a valid plan, break the loop
          const hasValidPlan =
            finalResponse.includes('EXECUTION_PLAN') &&
            finalResponse.includes('[') &&
            finalResponse.includes(']');
          if (hasValidPlan) {
            log2.consoleLogDevOnly(
              'info',
              '[handlePlanningPhase] Valid plan detected, proceeding',
            );
            finalResponse +=
              '\n\n✅ Planning complete. Proceeding with execution.';
            break;
          } else {
            // Give the model feedback about duplicate tool calls and ask it to reflect
            log2.consoleLogDevOnly(
              'warn',
              '⚠️ No valid plan yet, asking model to reflect on duplicate calls',
            );

            const reflectionMessage = genToolUsageReflectionPrompt(
              currentCall.name,
              currentCall.args,
            );

            response = await generateText({
              model: this.getCurrentModel(),
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
              log2.consoleLogDevOnly(
                'warn',
                '⚠️ Model still trying to make tool calls after reflection, forcing plan creation',
              );
              finalResponse +=
                '\n\n⚠️ Creating execution plan with available information...';
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
          log2.error(
            error,
            `[handlePlanningPhase] Tool call failed: ${toolCall.toolName}`,
            { toolCallId: toolCall.toolCallId },
          );
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
        const projectContextContinuation = this.getProjectContext(
          convertedFiles,
          log2,
        );
        if (projectContextContinuation) {
          continuationMessage += projectContextContinuation;
        }
      }

      response = await generateText({
        model: this.getCurrentModel(),
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
        finalResponse += `\n\n⚠️ Maximum tool calls reached (50).`;
        break;
      }
    }

    // Ensure we have a valid plan before proceeding
    const hasValidPlan =
      finalResponse.includes('EXECUTION_PLAN') &&
      finalResponse.includes('[') &&
      finalResponse.includes(']');

    if (!hasValidPlan) {
      log2.info(
        '[handlePlanningPhase] No valid execution plan found, generating fallback plan',
      );
      const fallbackResponse = await generateText({
        model: this.getCurrentModel(),
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
    log2: SystemLogger,
  ): Promise<void> {
    // Check if the response contains an execution plan
    if (finalResponse.includes('EXECUTION_PLAN')) {
      const planningResult = extractExecutionPlan(finalResponse, log2);

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
            const stepResult = await log2.time(
              LatencyEvents.chat_step_execution_latency,
              async () =>
                await this.executeStep(
                  operation,
                  fileManager,
                  messages,
                  inputFiles,
                  log2,
                ),
            );
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
            log2.error(
              error,
              `[handleExecutionPhase] Error executing step ${i + 1}:`,
            );

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
              updatedFiles: fileManager.getFinalState(),
            })}\n\n`,
          ),
        );

        // Save execution summary message to database
        const executionSummary = `🎉 Execution completed! Successfully processed ${
          planningResult.operations.length
        } operations:\n\n${planningResult.operations
          .map((op, index) => `${index + 1}. ${op.title} (${op.type})`)
          .join('\n')}`;
        log2.info(
          '[handleExecutionPhase] Saving execution summary to database: ',
          { executionSummary },
        );
        await supabase.from('prototype_chat_messages').insert({
          chat_session_id: chat_session_id,
          content: executionSummary,
          role: 'assistant' as const,
          phase: 'execution',
        });
      }
    }
  }

  private async handleDispatchAndErrorFixing(
    fileManager: FileManagerInterface,
    inputAssets: unknown,
    prototype_id: string,
    token: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    log2: SystemLogger,
    messages: { role: string; content: string }[],
    inputFiles: PrototypeFiles | null,
    precheckData: DispatchPrecheckResponse,
  ): Promise<void> {
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
      const { isEditableDevServer } = await import(
        '../utils/prototypeDevServerStatusUtils.js'
      );

      if (
        'status' in precheckData &&
        isEditableDevServer(precheckData.status)
      ) {
        tempDispatchResponse = await this.config.fastifyApp.inject({
          method: 'POST',
          url: '/dispatch',
          headers: {
            'x-trace-id': log2.getTraceId(),
          },
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
        tempDispatchResponse = await this.config.fastifyApp.inject({
          method: 'POST',
          url: '/dispatch',
          headers: {
            'x-trace-id': log2.getTraceId(),
          },
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

      const dispatchData = JSON.parse(tempDispatchResponse.payload);

      // ERROR FIXING PHASE: Check for build errors and attempt to fix them
      if (
        'build_errors' in dispatchData &&
        dispatchData.build_errors.length > 0
      ) {
        log2.consoleLogDevOnly(
          'info',
          '[ChatEngine] Build errors detected, starting error-fixing phase',
          {
            errorCount: dispatchData.build_errors.length,
            criticalErrorCount: filterCriticalErrors(dispatchData.build_errors)
              .length,
          },
        );

        try {
          const remainingErrors = await this.handleErrorFixingPhase(
            dispatchData.build_errors,
            fileManager,
            messages,
            inputFiles,
            prototype_id,
            token,
            log2,
          );

          // Final dispatch to confirm error fixes
          if (remainingErrors.length === 0) {
            log2.consoleLogDevOnly(
              'info',
              '[ChatEngine] All critical errors fixed, doing final dispatch',
            );

            const finalDispatchResponse = await this.config.fastifyApp.inject({
              method: 'POST',
              url: '/dispatch',
              headers: {
                'x-trace-id': log2.getTraceId(),
              },
              payload: {
                jwt: token,
                prototype_id: prototype_id,
                framework: 'expo_react_native',
                files: Object.entries(fileManager.getFinalState()).map(
                  ([, file]) => file,
                ),
                assets: [],
                file_scope: 'updates',
                hot_reload: true,
              },
            });

            // Update dispatchData with final result
            const finalDispatchData = JSON.parse(finalDispatchResponse.payload);
            if ('viewing_url' in finalDispatchData) {
              // Use the final dispatch data for the viewing URL
              Object.assign(dispatchData, finalDispatchData);
            }
          } else {
            log2.consoleLogDevOnly(
              'warn',
              '[ChatEngine] Some errors could not be fixed, continuing with current build',
              {
                remainingCriticalErrors: remainingErrors.length,
              },
            );
          }
        } catch (errorFixingError) {
          log2.error(
            errorFixingError,
            '[ChatEngine] Error during error-fixing phase',
          );
          // Continue with original dispatch result
        }
      }

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
            message: 'Files updated successfully',
          })}\n\n`,
        ),
      );
    } catch (error) {
      log2.error(error, '[ChatEngine] Error calling dispatch endpoint');

      // Stream dispatch completion event for error case
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'dispatch_complete',
            success: false,
            message: 'File update failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          })}\n\n`,
        ),
      );
    }
  }

  // Error-fixing phase - runs silently after execution completes
  private async handleErrorFixingPhase(
    buildErrors: CodeError[],
    fileManager: FileManagerInterface,
    messages: { role: string; content: string }[],
    inputFiles: PrototypeFiles | null,
    prototype_id: string,
    token: string,
    log2: SystemLogger,
  ): Promise<CodeError[]> {
    const criticalErrors = filterCriticalErrors(buildErrors);

    if (criticalErrors.length === 0) {
      log2.consoleLogDevOnly(
        'info',
        '[handleErrorFixingPhase] No critical errors to fix',
      );
      return buildErrors;
    }

    log2.consoleLogDevOnly(
      'info',
      '[handleErrorFixingPhase] Starting error-fixing phase',
      {
        criticalErrorCount: criticalErrors.length,
        errorTypes: criticalErrors.map((e) => e.type),
      },
    );

    let currentErrors = criticalErrors;
    let retryCount = 0;

    while (currentErrors.length > 0 && retryCount < MAX_ERROR_FIX_RETRIES) {
      retryCount++;
      log2.consoleLogDevOnly(
        'info',
        `[handleErrorFixingPhase] Error fix attempt ${retryCount}/${MAX_ERROR_FIX_RETRIES}`,
      );

      // Create error-fixing step
      const errorFixingStep = {
        id: `error_fix_${retryCount}`,
        type: 'modify' as const,
        title: `Fix Build Errors (Attempt ${retryCount}/${MAX_ERROR_FIX_RETRIES})`,
        description: createErrorFixingContext(currentErrors),
        filePath: 'multiple', // Since we might fix multiple files
      };

      // Execute error fixing step (silently, no streaming)
      try {
        await this.executeStep(
          errorFixingStep,
          fileManager,
          messages,
          inputFiles,
          log2,
        );

        // Test the fixes by dispatching again to get updated build status
        const testDispatchResponse = await this.config.fastifyApp.inject({
          method: 'POST',
          url: '/dispatch',
          headers: {
            'x-trace-id': log2.getTraceId(),
          },
          payload: {
            jwt: token,
            prototype_id: prototype_id,
            framework: 'expo_react_native',
            files: Object.entries(fileManager.getFinalState()).map(
              ([, file]) => file,
            ),
            assets: [],
            file_scope: 'updates',
            hot_reload: true,
          },
        });

        const testDispatchData = JSON.parse(testDispatchResponse.payload);

        if ('build_errors' in testDispatchData) {
          const newCriticalErrors = filterCriticalErrors(
            testDispatchData.build_errors,
          );

          log2.consoleLogDevOnly(
            'info',
            `[handleErrorFixingPhase] After fix attempt ${retryCount}:`,
            {
              previousErrorCount: currentErrors.length,
              newErrorCount: newCriticalErrors.length,
              fixedCount: Math.max(
                0,
                currentErrors.length - newCriticalErrors.length,
              ),
            },
          );

          currentErrors = newCriticalErrors;
        } else {
          log2.consoleLogDevOnly(
            'warn',
            '[handleErrorFixingPhase] Dispatch response missing build_errors',
          );
          break;
        }
      } catch (error) {
        log2.error(
          error,
          `[handleErrorFixingPhase] Error in fix attempt ${retryCount}:`,
        );
        // Continue to next retry attempt
      }
    }

    if (currentErrors.length > 0) {
      log2.consoleLogDevOnly(
        'warn',
        '[handleErrorFixingPhase] Unable to fix all critical errors after max retries',
        {
          remainingErrorCount: currentErrors.length,
          maxRetries: MAX_ERROR_FIX_RETRIES,
        },
      );
    } else {
      log2.consoleLogDevOnly(
        'info',
        '[handleErrorFixingPhase] All critical errors fixed successfully',
      );
    }

    // Return the final error state (includes both critical and non-critical errors)
    return currentErrors;
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
    log2: SystemLogger,
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
    const projectContext = this.getProjectContext(inputFiles, log2);
    if (projectContext) {
      userMessage += projectContext;
    }

    // Use AI SDK with tool support
    let response = await generateText({
      model: this.getCurrentModel(),
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
      log2.consoleLogDevOnly(
        'info',
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
          log2.consoleLogDevOnly(
            'warn',
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
            model: this.getCurrentModel(),
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
            log2.consoleLogDevOnly(
              'warn',
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
          log2.error(
            error,
            `[executeStep] Tool call failed: ${toolCall.toolName}`,
          );
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
        log2.consoleLogDevOnly(
          'info',
          `✅ Step completed: ${operation.id} - ${operation.title}`,
        );
        finalResponse += `\n\n✅ Step completed: ${operation.title}`;
        break;
      }

      // Prevent infinite loops
      if (toolCallsMade >= 50) {
        log2.consoleLogDevOnly(
          'warn',
          '⚠️ Step execution taking too long, forcing completion',
        );
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
        const projectContextContinuation = this.getProjectContext(
          inputFiles,
          log2,
        );
        if (projectContextContinuation) {
          continuationMessage += projectContextContinuation;
        }
      }

      response = await generateText({
        model: this.getCurrentModel(),
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
  private getProjectContext(
    inputFiles: PrototypeFiles | null,
    log2: SystemLogger,
  ): string {
    try {
      log2.consoleLogDevOnly(
        'info',
        '🔍 Building context from Expo Snack files...',
      );

      if (!inputFiles || Object.keys(inputFiles).length === 0) {
        log2.consoleLogDevOnly(
          'warn',
          '⚠️ No snack files provided for context',
        );
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
          log2.consoleLogDevOnly(
            'info',
            `✅ Found ${category} file in snack: ${filePath}`,
          );
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
          log2.consoleLogDevOnly(
            'info',
            `✅ Found config file in snack: ${filePath}`,
          );
        }
      });

      // Build context string
      let projectContext = '';

      if (relevantFiles.length > 0) {
        projectContext = `\n\n<📁 EXPO SNACK PROJECT CONTEXT: The following files are available in this React Native project:\n`;

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

      log2.consoleLogDevOnly(
        'info',
        `✅ Expo Snack context built with ${relevantFiles.length} files`,
      );
      return projectContext;
    } catch (error) {
      log2.consoleLogDevOnly('error', 'Could not build Expo Snack context:', {
        error,
      });
      return '';
    }
  }
}

// File Manager class for handling file operations during chat
export class FileManager {
  private files: Map<string, PrototypeFile>;
  private prototypeId: string | null;
  private log2: SystemLogger;

  constructor(
    convertedFiles: PrototypeFiles | null,
    log2: SystemLogger,
    prototypeId?: string,
  ) {
    this.files = new Map(Object.entries(convertedFiles || {}));
    this.prototypeId = prototypeId || null;
    this.log2 = log2;
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
    results?: Array<{
      filePath: string;
      lineNumber: number;
      context: string;
      matchedLine: string;
    }>;
    dependencies?: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  } {
    const { name, arguments: args } = toolCall.function;

    this.log2.consoleLogDevOnly('info', `🔧 TOOL CALL: ${name}`, {
      filePath: args?.filePath ?? '',
      filePaths: args?.filePaths ?? '',
      query: args?.query ?? '',
    });

    switch (name) {
      case 'read_file':
        return this.readFile(args.filePath as string);

      case 'read_files':
        return this.readFiles(args.filePaths as string[]);

      case 'write_file':
        return this.writeFile(
          args.filePath as string,
          args.contents as string,
          args.operation as string | undefined,
        );

      case 'list_files':
        return this.listFiles();

      case 'search_files':
        return this.searchFiles(
          args.query as string,
          args.fileExtensions as string[] | undefined,
        );

      case 'read_package_json':
        return this.readPackageJson();

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

  readFiles(filePaths: string[]): {
    success: boolean;
    files: Array<{ filePath: string; name: string; exists: boolean }>;
    message: string;
    contents?: string;
  } {
    const results = filePaths.map((filePath) => {
      const file = this.files.get(filePath);
      if (!file) {
        return {
          filePath,
          name: filePath.split('/').pop() || filePath,
          exists: false,
        };
      }
      return {
        filePath,
        name: file.name || filePath.split('/').pop() || filePath,
        exists: true,
      };
    });

    const successCount = results.filter((r) => r.exists).length;
    const errorCount = results.filter((r) => !r.exists).length;

    // Build a combined contents string for all files
    const fileContents = filePaths
      .map((filePath) => {
        const file = this.files.get(filePath);
        if (!file) return null;
        return `--- ${filePath} ---\n${file.contents || ''}\n`;
      })
      .filter(Boolean)
      .join('\n');

    return {
      success: successCount > 0,
      files: results,
      message: `Successfully read ${successCount} files${
        errorCount > 0 ? `, ${errorCount} files not found` : ''
      }`,
      contents: fileContents || undefined,
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
      this.log2.consoleLogDevOnly(
        'error',
        `❌ Cannot modify non-existent file: ${filePath}`,
      );
      return { error: `Cannot modify non-existent file: ${filePath}` };
    }

    if (op === 'create' && existingFile) {
      this.log2.consoleLogDevOnly(
        'error',
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
      id: existingFile?.id || uuidv4(),
      prototype_id: existingFile?.prototype_id || this.prototypeId,
      created_at: existingFile?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as PrototypeFile;

    this.files.set(filePath, updatedFile);

    this.log2.consoleLogDevOnly(
      'info',
      `✅ Successfully ${op}d file ${filePath} in function memory`,
    );

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

  searchFiles(
    query: string,
    fileExtensions?: string[],
  ): {
    success: boolean;
    results: Array<{
      filePath: string;
      lineNumber: number;
      context: string;
      matchedLine: string;
    }>;
    message: string;
  } {
    const results: Array<{
      filePath: string;
      lineNumber: number;
      context: string;
      matchedLine: string;
    }> = [];
    const searchRegex = new RegExp(query, 'i'); // Case-insensitive search

    // Default to common React Native file extensions if none specified
    const extensionsToSearch = fileExtensions || [
      '.tsx',
      '.ts',
      '.js',
      '.jsx',
      '.json',
    ];

    for (const [filePath, file] of this.files) {
      // Check if file extension matches our search criteria
      const hasMatchingExtension = extensionsToSearch.some(
        (ext) => filePath.endsWith(ext) || filePath.includes(ext),
      );

      if (!hasMatchingExtension || !file.contents) {
        continue;
      }

      const lines = file.contents.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (searchRegex.test(line)) {
          // Get context: 2 lines before and after the match
          const contextStart = Math.max(0, i - 2);
          const contextEnd = Math.min(lines.length - 1, i + 2);
          const contextLines = lines.slice(contextStart, contextEnd + 1);

          // Mark the matched line in the context
          const contextWithLineNumbers = contextLines
            .map((contextLine, idx) => {
              const actualLineNum = contextStart + idx + 1;
              const isMatchedLine = actualLineNum === i + 1;
              return `${actualLineNum.toString().padStart(3, ' ')}: ${
                isMatchedLine ? '→ ' : '  '
              }${contextLine}`;
            })
            .join('\n');

          results.push({
            filePath,
            lineNumber: i + 1,
            context: contextWithLineNumbers,
            matchedLine: line.trim(),
          });

          // Limit results to top 10 matches to avoid overwhelming context
          if (results.length >= 10) {
            return {
              success: true,
              results,
              message: `Found ${results.length} matches (limited to first 10). Search query: "${query}"`,
            };
          }
        }
      }
    }

    return {
      success: true,
      results,
      message: `Found ${results.length} matches for search query: "${query}"`,
    };
  }

  readPackageJson(): {
    success: boolean;
    dependencies?: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    message: string;
    error?: string;
  } {
    // Look for package.json file in the project
    const packageJsonFile =
      this.files.get('package.json') || this.files.get('./package.json');

    if (!packageJsonFile || !packageJsonFile.contents) {
      return {
        success: false,
        error: 'package.json file not found in project files',
        message: 'Could not locate package.json to read dependencies',
      };
    }

    try {
      const packageJson = JSON.parse(packageJsonFile.contents);

      return {
        success: true,
        dependencies: {
          dependencies: packageJson.dependencies || {},
          devDependencies: packageJson.devDependencies || {},
        },
        message: `Successfully read package.json with ${
          Object.keys(packageJson.dependencies || {}).length
        } dependencies and ${
          Object.keys(packageJson.devDependencies || {}).length
        } devDependencies`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse package.json: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        message:
          'package.json file exists but could not be parsed as valid JSON',
      };
    }
  }

  // Get final state for updating database/snack
  getFinalState(): PrototypeFiles {
    const result: PrototypeFiles = {};
    for (const [filePath, file] of this.files) {
      result[filePath] = file;
    }
    return result;
  }
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
  read_files: {
    description:
      'Read the contents of multiple files in the project at once (faster than multiple read_file calls)',
    inputSchema: z.object({
      filePaths: z.array(z.string()).describe('Array of file paths to read'),
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
  search_files: {
    description:
      'Search for specific patterns, functions, or text across project files',
    inputSchema: z.object({
      query: z.string().describe('The search pattern or text to find'),
      fileExtensions: z
        .array(z.string())
        .optional()
        .describe(
          'Optional array of file extensions to search (.tsx, .ts, .js, .jsx, .json)',
        ),
    }),
    execute: async (): Promise<void> => {
      throw new Error('Tool execution should be handled by file manager');
    },
  },
  read_package_json: {
    description:
      'Read package.json to understand available dependencies and project configuration',
    inputSchema: z.object({}),
    execute: async (): Promise<void> => {
      throw new Error('Tool execution should be handled by file manager');
    },
  },
};
