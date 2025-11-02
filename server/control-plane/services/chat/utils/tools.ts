import { Tool, tool } from 'ai';
import { z } from 'zod';
import { ChatEngineParams } from '../../../types/InternalTypes.js';
import { DispatchRequestBody } from '../../../types/PublicAPITypes.js';
import { DispatcherService } from '../../dispatcher/DispatcherService.js';
import { VirtualFileManager } from './file-manager.js';

// NEW: A dedicated method for orchestration tools
export function createOrchestrationTools(
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
        log2.consoleLogDevOnly('info', `[ChatEngine] Execution Plan Created`, {
          steps,
        });
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
        log2.consoleLogDevOnly(
          'info',
          `[ChatEngine] Step ${step_number} confirmed as complete.`,
          { summary },
        );
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

export function createFileManagerTools(
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
        log2.consoleLogDevOnly('info', `[ChatEngine] Tool call: write_file`, {
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
        log2.consoleLogDevOnly('info', `[ChatEngine] Tool call: create_file`, {
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
        log2.consoleLogDevOnly('info', `[ChatEngine] Tool call: delete_file`, {
          filePath,
        });
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
        log2.consoleLogDevOnly('info', `[ChatEngine] Tool call: list_files`, {
          directory,
        });
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
        log2.consoleLogDevOnly('info', `[ChatEngine] Tool call: file_exists`, {
          filePath,
        });
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
        log2.consoleLogDevOnly('info', `[ChatEngine] Tool call: search_files`, {
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
        log2.consoleLogDevOnly(
          'info',
          `[ChatEngine] Tool call: get_dependencies`,
          { filePath },
        );
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
        log2.consoleLogDevOnly(
          'info',
          `[ChatEngine] Tool call: append_file_content`,
          {
            filePath,
            contentLength: content.length,
          },
        );
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
        log2.consoleLogDevOnly(
          'info',
          `[ChatEngine] Tool call: replace_file_content`,
          {
            filePath,
            searchTextLength: searchText.length,
            replaceWithLength: replaceWith.length,
            expectOneMatch,
          },
        );
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

export function createDevServerTools(
  params: ChatEngineParams,
  dispatcherService: DispatcherService,
): Record<string, Tool> {
  const { fileManager, log2, prototype_id, token } = params;

  return {
    update_dev_server_with_changes: tool({
      description:
        'Dispatch any updates to the expo dev server for the user. This MUST be called before any typescript compile checks.',
      inputSchema: z.object({}),
      execute: async () => {
        const toolLog = log2.child({ tool: 'update_dev_server_with_changes' });

        if (!(fileManager instanceof VirtualFileManager)) {
          toolLog.warn(
            '[DevServerTools] update_dev_server_with_changes called without a virtual file manager instance.',
          );
          return {
            success: false,
            dispatched: false,
            error: 'Virtual file manager is not available to dispatch changes.',
          };
        }

        if (!fileManager.hasChanges()) {
          return {
            success: true,
            dispatched: false,
            message: 'No pending file changes to dispatch to the dev server.',
          };
        }

        const changedFiles = fileManager.getChangedFiles();
        const deletedFiles = Array.from(fileManager.getDeletedFiles());
        const filesForDispatch = Object.values(changedFiles);

        const requestBody: DispatchRequestBody = {
          prototype_id,
          framework: 'expo_react_native',
          files: filesForDispatch,
          assets: [],
          deleted_files: deletedFiles,
          file_scope: 'updates',
          hot_reload: true,
        };

        const dispatchResult = await dispatcherService.dispatch(
          requestBody,
          token,
          toolLog,
        );

        if (!dispatchResult.data || dispatchResult.error) {
          const errorMessage =
            dispatchResult.error?.message ??
            'Failed to dispatch file changes to the dev server.';
          toolLog.warn('[DevServerTools] Dispatch failed', {
            error: errorMessage,
          });

          return {
            success: false,
            dispatched: false,
            error: errorMessage,
          };
        }

        fileManager.clearChangeTracking();

        return {
          success: true,
          dispatched: true,
          viewing_url: dispatchResult.data.viewing_url,
          build_errors: dispatchResult.data.build_errors,
          build_warnings: dispatchResult.data.build_warnings,
          message: 'Changes dispatched to the dev server successfully.',
        };
      },
    }),

    typescript_compile_check: tool({
      description:
        'Run `npx tsc` on the dev server and return the compiler output. Empty output indicates no TypeScript errors.',
      inputSchema: z.object({}),
      execute: async () => {
        const toolLog = log2.child({ tool: 'typescript_compile_check' });

        const commandResult = await dispatcherService.runCommand(
          {
            prototype_id,
            command: 'npx tsc',
            timeout_ms: 120000,
            strip_ansi: true,
          },
          token,
          toolLog,
        );

        if (!commandResult.data || commandResult.error) {
          const errorMessage =
            commandResult.error?.message ??
            'Failed to run TypeScript compile check.';
          toolLog.warn('[DevServerTools] TypeScript compile check failed', {
            error: errorMessage,
          });

          return {
            success: false,
            output: '',
            error: errorMessage,
          };
        }

        const output = commandResult.data.stdout?.trim() ?? '';

        return {
          success:
            commandResult.data.status === 'success' && output.length === 0,
          output,
          status: commandResult.data.status,
        };
      },
    }),
  };
}
