import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { streamText, tool } from 'ai';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SystemLogger } from '../loggers/SystemLogger.js';
import type {
  DispatchPrecheckResponse,
  PrototypeAssetInput,
  PrototypeFileInput,
} from '../types/PublicAPITypes.js';
import { SYSTEM_PROMPT } from './chat/PROMPTS.js';
import { FileManagerInterface } from './chat/file-manager.js';

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

  private createFileManagerTools(
    params: ChatEngineParams,
  ): Record<string, any> {
    const { fileManager, log2 } = params;

    return {
      read_file: tool({
        description: 'Read the contents of a file from the virtual file system',
        inputSchema: z.object({
          filePath: z.string().describe('The path to the file to read'),
        }),
        execute: async ({ filePath }: { filePath: string }) => {
          log2.info(`[ChatEngine] Tool call: read_file`, { filePath });
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

  async executeChat(params: ChatEngineParams): Promise<void> {
    const { messages, userMessage, controller, encoder, log2 } = params;

    try {
      log2.consoleLogDevOnly(
        'info',
        '[ChatEngine] Generating response with virtual file system tools...',
      );

      // Generate response with comprehensive tool support
      const response = streamText({
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
        tools: this.createFileManagerTools(params),
        toolChoice: 'auto', // let the model call tools when needed
      });

      let finalBuffer = ''; // Accumulate text deltas here

      // Stream the full response including text and tool calls
      for await (const part of response.fullStream) {
        log2.info('part', { part });
        if (part.type === 'text-delta') {
          finalBuffer += part.text; // Accumulate text
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'chat_response_delta',
                content: part.text,
              })}\n\n`,
            ),
          );
        } else if (part.type === 'tool-call') {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'tool_call',
                tool: part.toolName,
                toolCallId: part.toolCallId,
              })}\n\n`,
            ),
          );
        } else if (part.type === 'tool-result') {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'tool_result',
                tool: part.toolName,
                toolCallId: part.toolCallId,
                result: part.output,
              })}\n\n`,
            ),
          );
        }
      }

      // Always send a final message from our buffer
      // Some providers return empty response.text when everything came via deltas
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

      // Send completion message
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'chat_complete',
          })}\n\n`,
        ),
      );

      controller.close();
    } catch (error) {
      log2.error(error, '[ChatEngine] Error during chat execution');

      // Send error response
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'error',
            error:
              error instanceof Error ? error.message : 'Internal server error',
          })}\n\n`,
        ),
      );

      controller.close();
      throw error;
    }
  }
}
