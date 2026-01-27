/**
 * Dev Server Control Tools for Nucleate MCP Server
 */

import { z } from 'zod';
import type { NucleateApiClient } from '../api-client/index.js';
import type { CallToolResult } from './project-management.js';

// Input schemas
export const startDevServerInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to start the dev server for'),
});

export const getDevServerStatusInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to get status for'),
});

export const getViewingUrlInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to get the viewing URL for'),
});

// Tool definitions
export const devServerTools = [
  {
    name: 'nucleate_start_dev_server',
    description:
      'Start the development server for a Nucleate prototype. Returns the viewing URL where you can preview the app.',
    inputSchema: startDevServerInputSchema,
    async handler(
      args: z.infer<typeof startDevServerInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.startDevServer({
        prototype_id: args.prototype_id,
      });

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to start dev server: ${result.error.message}`,
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
    name: 'nucleate_get_dev_server_status',
    description:
      'Get the current status of a Nucleate prototype dev server. Returns the status and viewing URL if available.',
    inputSchema: getDevServerStatusInputSchema,
    async handler(
      args: z.infer<typeof getDevServerStatusInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.fetchViewingUrl({
        prototype_id: args.prototype_id,
        current_page: 'edit',
      });

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to get dev server status: ${result.error.message}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                prototype_id: args.prototype_id,
                status: result.data?.status ?? 'unknown',
                viewing_url: result.data?.viewing_url,
                terminal_url: result.data?.terminal_url,
                source: result.data?.source,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },
  {
    name: 'nucleate_get_viewing_url',
    description:
      'Get the preview URL for a Nucleate prototype. Use this to get the URL where users can view the running app.',
    inputSchema: getViewingUrlInputSchema,
    async handler(
      args: z.infer<typeof getViewingUrlInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.fetchViewingUrl({
        prototype_id: args.prototype_id,
        current_page: 'view',
      });

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to get viewing URL: ${result.error.message}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                prototype_id: args.prototype_id,
                viewing_url: result.data?.viewing_url,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  },
] as const;

export type DevServerTool = (typeof devServerTools)[number];
