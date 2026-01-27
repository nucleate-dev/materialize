/**
 * Project Management Tools for Nucleate MCP Server
 */

import { z } from 'zod';
import type { NucleateApiClient } from '../api-client/index.js';

export interface CallToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// Input schemas
export const listPrototypesInputSchema = z.object({
  team_id: z.string().uuid().describe('The team ID to list prototypes for'),
});

export const createPrototypeInputSchema = z.object({
  name: z.string().min(1).max(100).describe('Name of the prototype'),
  team_id: z.string().uuid().describe('The team ID to create the prototype in'),
  framework: z
    .enum(['mobile_expo_react_native', 'web_nextjs_react'])
    .default('web_nextjs_react')
    .describe('Framework to use for the prototype'),
  description: z.string().max(500).optional().describe('Optional description'),
  visibility: z
    .enum(['PUBLIC', 'TEAM', 'TEAM_SUBSET', 'SELF'])
    .default('TEAM')
    .describe('Visibility level of the prototype'),
});

export const getPrototypeInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to get details for'),
});

export const deletePrototypeInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to delete'),
});

export const clonePrototypeInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to clone'),
  name: z.string().min(1).max(100).describe('Name for the cloned prototype'),
  team_id: z.string().uuid().describe('The team ID to create the clone in'),
});

export const deployPrototypeInputSchema = z.object({
  prototype_id: z.string().uuid().describe('The prototype ID to deploy'),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .describe('URL slug for the deployment (lowercase alphanumeric and hyphens only)'),
});

export const checkDeploySlugInputSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .describe('URL slug to check availability'),
});

// Tool definitions
export const projectManagementTools = [
  {
    name: 'nucleate_create_prototype',
    description:
      'Create a new Nucleate prototype. Returns the prototype ID and viewing URL.',
    inputSchema: createPrototypeInputSchema,
    async handler(
      args: z.infer<typeof createPrototypeInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.createPrototype({
        name: args.name,
        team_id: args.team_id,
        framework: args.framework,
        description: args.description,
        visibility: args.visibility,
        creation_source: 'unknown', // MCP-created prototypes
      });

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to create prototype: ${result.error.message}`,
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
    name: 'nucleate_get_prototype',
    description:
      'Get details for a Nucleate prototype including its viewing URL and status.',
    inputSchema: getPrototypeInputSchema,
    async handler(
      args: z.infer<typeof getPrototypeInputSchema>,
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
              text: `Failed to get prototype: ${result.error.message}`,
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
                ...result.data,
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
    name: 'nucleate_delete_prototype',
    description: 'Delete a Nucleate prototype. This action is irreversible.',
    inputSchema: deletePrototypeInputSchema,
    async handler(
      args: z.infer<typeof deletePrototypeInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.deletePrototype(args.prototype_id);

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to delete prototype: ${result.error.message}`,
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
    name: 'nucleate_clone_prototype',
    description:
      'Clone/fork an existing Nucleate prototype. Creates a copy with a new name.',
    inputSchema: clonePrototypeInputSchema,
    async handler(
      args: z.infer<typeof clonePrototypeInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.createPrototype({
        name: args.name,
        team_id: args.team_id,
        prototype_id: args.prototype_id, // This triggers cloning
        creation_source: 'prototype_editor_clone',
        visibility: 'TEAM',
      });

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to clone prototype: ${result.error.message}`,
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
    name: 'nucleate_deploy_prototype',
    description:
      'Deploy a Nucleate prototype to a public URL. The prototype will be accessible at apps.nucleate.dev/{slug}.',
    inputSchema: deployPrototypeInputSchema,
    async handler(
      args: z.infer<typeof deployPrototypeInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.deployPrototype({
        prototype_id: args.prototype_id,
        slug: args.slug,
      });

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to deploy prototype: ${result.error.message}`,
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
    name: 'nucleate_check_deploy_slug',
    description: 'Check if a deployment slug is available for use.',
    inputSchema: checkDeploySlugInputSchema,
    async handler(
      args: z.infer<typeof checkDeploySlugInputSchema>,
      client: NucleateApiClient,
    ): Promise<CallToolResult> {
      const result = await client.checkDeploySlug(args.slug);

      if (result.error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to check slug: ${result.error.message}`,
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
] as const;

export type ProjectManagementTool = (typeof projectManagementTools)[number];
