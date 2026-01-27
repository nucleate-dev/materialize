/**
 * File Operation Tools for Nucleate MCP Server
 */

import { z } from 'zod';
import type { NucleateApiClient } from '../api-client/index.js';
import type { CallToolResult } from './project-management.js';

// Input schemas
export const listFilesInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to list files for'),
});

export const readFileInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to read the file from'),
  file_path: z.string().min(1).describe('The relative path of the file to read'),
});

export const writeFileInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to write the file to'),
  file_path: z.string().min(1).describe('The relative path of the file to write'),
  content: z
    .string()
    .describe(
      'The content to write. For binary files (images, etc.), provide base64 encoded content.',
    ),
});

export const deleteFileInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to delete the file from'),
  file_path: z.string().min(1).describe('The relative path of the file to delete'),
});

export const readMultipleFilesInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to read files from'),
  file_paths: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe('Array of file paths to read (max 20 files)'),
});

// Tool definitions
export const fileOperationTools = [
  {
    name: 'nucleate_list_files',
    description:
      'List all files in a Nucleate prototype. Returns file names, types (text/binary), and last modified timestamps.',
    inputSchema: listFilesInputSchema,
    async handler(
      args: z.infer<typeof listFilesInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.listFiles(args.prototype_id);

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to list files: ${result.error.message}`,
            },
          ],
        };
      }

      const files = result.data?.files ?? [];
      const summary = `Found ${files.length} files in prototype ${args.prototype_id}`;

      return {
        content: [
          {
            type: 'text',
            text: `${summary}\n\n${JSON.stringify(files, null, 2)}`,
          },
        ],
      };
    },
  },
  {
    name: 'nucleate_read_file',
    description:
      'Read the contents of a single file from a Nucleate prototype. For binary files, content is returned as base64.',
    inputSchema: readFileInputSchema,
    async handler(
      args: z.infer<typeof readFileInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.readFile(args.prototype_id, args.file_path);

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to read file: ${result.error.message}`,
            },
          ],
        };
      }

      const data = result.data;
      if (!data) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'File not found',
            },
          ],
        };
      }

      // For text files, return the content directly
      // For binary files, return metadata indicating it's binary
      if (data.type === 'text') {
        return {
          content: [
            {
              type: 'text',
              text: `File: ${data.file_path}\nType: ${data.type}\n\n${data.content}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `File: ${data.file_path}\nType: ${data.type} (base64 encoded)\nSize: ${data.content.length} bytes (encoded)\n\nContent (base64):\n${data.content.substring(0, 500)}${data.content.length > 500 ? '...' : ''}`,
            },
          ],
        };
      }
    },
  },
  {
    name: 'nucleate_write_file',
    description:
      'Write or update a file in a Nucleate prototype. For binary files (images, etc.), provide content as base64 encoded string.',
    inputSchema: writeFileInputSchema,
    async handler(
      args: z.infer<typeof writeFileInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.writeFile(
        args.prototype_id,
        args.file_path,
        args.content,
      );

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to write file: ${result.error.message}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    },
  },
  {
    name: 'nucleate_delete_file',
    description: 'Delete a file from a Nucleate prototype. This action is irreversible.',
    inputSchema: deleteFileInputSchema,
    async handler(
      args: z.infer<typeof deleteFileInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.deleteFile(args.prototype_id, args.file_path);

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to delete file: ${result.error.message}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    },
  },
  {
    name: 'nucleate_read_multiple_files',
    description:
      'Read multiple files from a Nucleate prototype in a single request. More efficient than multiple single file reads.',
    inputSchema: readMultipleFilesInputSchema,
    async handler(
      args: z.infer<typeof readMultipleFilesInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.readMultipleFiles(args.prototype_id, args.file_paths);

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to read files: ${result.error.message}`,
            },
          ],
        };
      }

      const files = result.data?.files ?? [];
      const successful = files.filter((f) => f.content !== null).length;
      const failed = files.filter((f) => f.content === null).length;

      // Format output
      const output: string[] = [
        `Read ${successful}/${args.file_paths.length} files successfully${failed > 0 ? ` (${failed} failed)` : ''}`,
        '',
      ];

      for (const file of files) {
        output.push(`=== ${file.file_path} (${file.type}) ===`);
        if (file.error) {
          output.push(`Error: ${file.error}`);
        } else if (file.type === 'binary') {
          output.push(
            `[Binary file - ${file.content?.length ?? 0} bytes base64 encoded]`,
          );
        } else {
          output.push(file.content ?? '');
        }
        output.push('');
      }

      return {
        content: [
          {
            type: 'text',
            text: output.join('\n'),
          },
        ],
      };
    },
  },
] as const;

export type FileOperationTool = (typeof fileOperationTools)[number];
