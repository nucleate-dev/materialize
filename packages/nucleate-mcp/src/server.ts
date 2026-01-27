/**
 * Nucleate MCP Server
 *
 * Provides MCP (Model Context Protocol) tools for managing Nucleate prototypes.
 * This server uses stdio transport for local CLI usage.
 *
 * Usage:
 *   NUCLEATE_AUTH_TOKEN=<your-token> npx @nucleate/mcp-server
 *
 * Configuration in ~/.mcp.json:
 *   {
 *     "mcpServers": {
 *       "nucleate": {
 *         "command": "npx",
 *         "args": ["@nucleate/mcp-server"],
 *         "env": {
 *           "NUCLEATE_AUTH_TOKEN": "<your-supabase-jwt>"
 *         }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  NucleateApiClient,
  allTools,
  getToolByName,
  NUCLEATE_CONTROL_PLANE_URL,
} from '@nucleate/mcp-core';

// Environment configuration
const NUCLEATE_AUTH_TOKEN = process.env.NUCLEATE_AUTH_TOKEN;
const CONTROL_PLANE_URL = process.env.NUCLEATE_CONTROL_PLANE_URL || NUCLEATE_CONTROL_PLANE_URL;

export function createServer(): void {
  // Validate auth token
  if (!NUCLEATE_AUTH_TOKEN) {
    console.error('Error: NUCLEATE_AUTH_TOKEN environment variable is required');
    console.error(
      'Get your token from nucleate.dev and set it as NUCLEATE_AUTH_TOKEN',
    );
    process.exit(1);
  }

  // Create API client
  const apiClient = new NucleateApiClient({
    baseUrl: CONTROL_PLANE_URL,
    authToken: NUCLEATE_AUTH_TOKEN,
  });

  // Create MCP server
  const server = new Server(
    {
      name: 'nucleate',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
      })),
    };
  });

  // Handle call tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = getToolByName(name);
    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      } satisfies CallToolResult;
    }

    try {
      // Validate input using the tool's schema
      const validatedArgs = tool.inputSchema.parse(args);

      // Execute the tool handler
      const result = await tool.handler(validatedArgs as never, apiClient);

      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid arguments: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
            },
          ],
          isError: true,
        } satisfies CallToolResult;
      }

      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${message}`,
          },
        ],
        isError: true,
      } satisfies CallToolResult;
    }
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error) => {
    console.error('Failed to connect MCP server:', error);
    process.exit(1);
  });
}

/**
 * Convert Zod schema to JSON Schema format for MCP
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Get the shape if it's an object schema
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodTypeAny;
      properties[key] = zodFieldToJsonSchema(zodValue);

      // Check if field is required (not optional)
      if (!(zodValue instanceof z.ZodOptional) && !(zodValue instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return zodFieldToJsonSchema(schema);
}

function zodFieldToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const description = schema._def.description;
  const base: Record<string, unknown> = {};

  if (description) {
    base.description = description;
  }

  // Handle optional/default wrappers
  if (schema instanceof z.ZodOptional) {
    return { ...base, ...zodFieldToJsonSchema(schema._def.innerType) };
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodFieldToJsonSchema(schema._def.innerType);
    return { ...base, ...inner, default: schema._def.defaultValue() };
  }

  // Handle primitive types
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { ...base, type: 'string' };
    const checks = schema._def.checks || [];
    for (const check of checks) {
      if (check.kind === 'min') result.minLength = check.value;
      if (check.kind === 'max') result.maxLength = check.value;
      if (check.kind === 'uuid') result.format = 'uuid';
      if (check.kind === 'regex') result.pattern = check.regex.source;
    }
    return result;
  }

  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { ...base, type: 'number' };
    const checks = schema._def.checks || [];
    for (const check of checks) {
      if (check.kind === 'min') result.minimum = check.value;
      if (check.kind === 'max') result.maximum = check.value;
      if (check.kind === 'int') result.type = 'integer';
    }
    return result;
  }

  if (schema instanceof z.ZodBoolean) {
    return { ...base, type: 'boolean' };
  }

  if (schema instanceof z.ZodEnum) {
    return { ...base, type: 'string', enum: schema._def.values };
  }

  if (schema instanceof z.ZodArray) {
    return {
      ...base,
      type: 'array',
      items: zodFieldToJsonSchema(schema._def.type),
    };
  }

  if (schema instanceof z.ZodObject) {
    return { ...base, ...zodToJsonSchema(schema) };
  }

  // Fallback
  return { ...base, type: 'string' };
}

// Auto-start when run directly
createServer();
