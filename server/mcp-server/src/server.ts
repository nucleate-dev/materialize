/**
 * Nucleate Hosted MCP Server
 *
 * Provides MCP (Model Context Protocol) tools via SSE transport.
 * Deployed at mcp.nucleate.dev for remote access from MCP clients.
 *
 * Usage in MCP client config:
 *   {
 *     "mcpServers": {
 *       "nucleate": {
 *         "url": "https://mcp.nucleate.dev/sse",
 *         "headers": {
 *           "Authorization": "Bearer <your-supabase-jwt>"
 *         }
 *       }
 *     }
 *   }
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
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

const PORT = parseInt(process.env.PORT || '3003', 10);
const CONTROL_PLANE_URL =
  process.env.NUCLEATE_CONTROL_PLANE_URL || NUCLEATE_CONTROL_PLANE_URL;

const fastify = Fastify({
  logger: true,
});

// Enable CORS for browser-based clients
await fastify.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Health check
fastify.get('/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

// Active SSE transports keyed by session ID
const transports = new Map<string, SSEServerTransport>();

// SSE endpoint for MCP communication
fastify.get('/sse', async (request, reply) => {
  // Extract auth token from Authorization header
  const authHeader = request.headers.authorization;
  const authToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!authToken) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authorization header with Bearer token is required',
    });
  }

  // Create API client with user's token
  const apiClient = new NucleateApiClient({
    baseUrl: CONTROL_PLANE_URL,
    authToken,
  });

  // Create MCP server for this connection
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
  server.setRequestHandler(CallToolRequestSchema, async (toolRequest) => {
    const { name, arguments: args } = toolRequest.params;

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
              text: `Invalid arguments: ${error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
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

  // Create SSE transport
  const transport = new SSEServerTransport('/messages', reply.raw);

  // Store transport for cleanup
  const sessionId = crypto.randomUUID();
  transports.set(sessionId, transport);

  // Clean up when connection closes
  request.raw.on('close', () => {
    transports.delete(sessionId);
    server.close();
  });

  // Connect and start serving
  await server.connect(transport);
});

// POST endpoint for receiving messages (paired with SSE)
fastify.post('/messages', async (request, reply) => {
  // This endpoint receives messages from the client
  // The SSEServerTransport handles routing to the correct session
  const sessionId = request.headers['x-session-id'] as string;

  if (!sessionId || !transports.has(sessionId)) {
    return reply.status(400).send({
      error: 'Invalid session',
      message: 'Session ID not found. Connect to /sse first.',
    });
  }

  const transport = transports.get(sessionId)!;

  try {
    // Parse and handle the message
    const body = request.body as { jsonrpc: string; method: string; params?: unknown; id?: unknown };
    await transport.handlePostMessage(request.raw, reply.raw, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return reply.status(500).send({
      error: 'Internal error',
      message,
    });
  }
});

// Convert Zod schema to JSON Schema format using zod v4 built-in
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

// Start server
const start = async (): Promise<void> => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Nucleate MCP Server listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
