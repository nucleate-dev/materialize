# MCP Server Integration for Claude Code CLI Handler

**Status**: Planning
**Author**: Build Worker Team
**Date**: 2024-12-18
**Related Files**:
- `services/chat/claude-code-cli-query-handler.ts`
- `services/chat/chat-query-handler.ts`
- `services/chat/mcp/mcp-dev-tools.ts`

---

## Table of Contents

1. [Overview](#overview)
2. [Context & Problem Statement](#context--problem-statement)
3. [Architecture Decision](#architecture-decision)
4. [Implementation Plan](#implementation-plan)
5. [Detailed Implementation Steps](#detailed-implementation-steps)
6. [Testing Strategy](#testing-strategy)
7. [Rollout Plan](#rollout-plan)
8. [Future Considerations](#future-considerations)
9. [Appendix](#appendix)

---

## Overview

This document outlines the implementation plan for adding Model Context Protocol (MCP) server support to the Claude Code CLI handler. Currently, the SDK-based chat handler uses in-process MCP servers, but the CLI requires external MCP servers configured via `--mcp-config`. This document details how to expose our existing MCP tools (SafeWrite, SafeBash, checkTerminal, RestartDevServer) to the CLI in a maintainable and efficient way.

### Goals

- ✅ Enable CLI handler to use the same MCP tools as SDK handler
- ✅ Maintain feature parity between CLI and SDK modes
- ✅ Minimize code duplication
- ✅ Ensure robust error handling and debugging
- ✅ Keep implementation simple and maintainable

### Non-Goals

- ❌ Creating a general-purpose MCP server for external use
- ❌ Supporting MCP servers outside the Fargate container
- ❌ Implementing MCP tools beyond what SDK handler already has

---

## Context & Problem Statement

### Current State

**SDK Handler** (`chat-query-handler.ts`):
- Uses in-process MCP servers via `createSdkMcpServer()`
- Creates `McpSdkServerConfigWithInstance` objects
- Passes directly to SDK's `query()` function
- Has access to:
  - `devtools` server: SafeWrite, SafeBash, checkTerminal, RestartDevServer
  - `design` server: GeminiDesignExpert (optional)

**CLI Handler** (`claude-code-cli-query-handler.ts`):
- Spawns external `claude` CLI process
- Cannot use in-process MCP servers
- Needs external MCP server configured via `--mcp-config`
- Currently missing MCP tool support

### The Problem

The CLI's `--mcp-config` flag expects:
```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",          // stdio transport
      "args": ["/path/to/server.js"],
      "env": { "VAR": "value" }
    },
    // OR
    "server-name": {
      "url": "http://localhost:3000/mcp",  // SSE transport
      "transport": "sse"
    }
  }
}
```

We need to bridge the gap between:
- **What we have**: In-process MCP tools with direct function callbacks
- **What CLI needs**: External MCP server accessible via stdio or HTTP/SSE

---

## Architecture Decision

### Decision: HTTP/SSE Transport

We will implement MCP servers using **HTTP Server-Sent Events (SSE) transport** over stdio transport.

### Rationale

| Criterion | stdio | HTTP/SSE | Winner |
|-----------|-------|----------|--------|
| **Infrastructure** | Need separate process | Reuse existing Fastify server | ✅ SSE |
| **Service Access** | Need IPC for callbacks | Direct access to services | ✅ SSE |
| **Debugging** | Stdio stream debugging | Standard HTTP tools | ✅ SSE |
| **Process Management** | Need spawn/lifecycle logic | No process management | ✅ SSE |
| **Performance** | Minimal overhead | Localhost HTTP (minimal) | 🤝 Tie |
| **Security** | Process isolation | Localhost-only endpoints | 🤝 Tie |
| **MCP Standard** | More common | Fully supported by spec | 🤝 Tie |
| **Reusability** | One-to-one process | Shared across CLI invocations | ✅ SSE |

**Conclusion**: HTTP/SSE is the clear winner for our architecture because:
1. We already run a Fastify server in the build-worker
2. MCP tools need access to SandboxService, TerminalService, etc. (already available in Fastify context)
3. Simpler implementation with better debugging
4. No process lifecycle complexity

### Alternative Considered: stdio Transport

**Why we rejected it:**
- Requires spawning a separate Node.js process per MCP server
- Need complex IPC mechanism for tool callbacks (SandboxService, TerminalService, etc.)
- More failure modes (process crashes, IPC failures, cleanup issues)
- Harder to debug and monitor
- Additional bundling and deployment complexity

---

## Implementation Plan

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│ Claude Code CLI Process                             │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │ CLI reads --mcp-config                     │    │
│  │ {                                          │    │
│  │   "mcpServers": {                          │    │
│  │     "devtools": {                          │    │
│  │       "url": "http://localhost:3000/...",  │    │
│  │       "transport": "sse"                   │    │
│  │     }                                      │    │
│  │   }                                        │    │
│  │ }                                          │    │
│  └────────────────────────────────────────────┘    │
│         │                                           │
│         │ SSE connection                            │
│         ▼                                           │
└─────────────────────────────────────────────────────┘
         │
         │ HTTP/SSE
         │
         ▼
┌─────────────────────────────────────────────────────┐
│ Fastify Server (Build Worker)                       │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │ MCP Endpoints                              │    │
│  │                                            │    │
│  │  GET /mcp/devtools                         │    │
│  │  GET /mcp/design (optional)                │    │
│  └────────────────────────────────────────────┘    │
│         │                                           │
│         ▼                                           │
│  ┌────────────────────────────────────────────┐    │
│  │ MCP Server (SSE Transport)                 │    │
│  │                                            │    │
│  │  • Tool handlers with direct access to:   │    │
│  │    - SandboxService                        │    │
│  │    - TerminalService                       │    │
│  │    - FileSyncService                       │    │
│  │    - DevServerService                      │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Components to Implement

1. **MCP HTTP Endpoints** (new file: `services/chat/mcp/mcp-http-server.ts`)
   - SSE endpoint handlers for each MCP server
   - Request/response handling
   - Error handling and logging

2. **MCP Config Generator** (in `claude-code-cli-query-handler.ts`)
   - Generate MCP config JSON
   - Write to temporary file or use JSON string
   - Cleanup after CLI process completes

3. **CLI Spawning Update** (in `claude-code-cli-query-handler.ts`)
   - Add `--mcp-config` flag to CLI arguments
   - Pass config file path or JSON string

4. **Fastify Route Registration** (in `index.ts` or similar)
   - Register MCP endpoints on server startup
   - Wire up service dependencies

---

## Detailed Implementation Steps

### Step 1: Create MCP HTTP Server Module

**File**: `services/chat/mcp/mcp-http-server.ts`

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SystemLogger } from '../../../loggers/SystemLogger.js';
import { NucleateDevelopmentServerService } from '../../dev-server/NucleateDevelopmentServerService.js';
import { SandboxService } from '../../SandboxService.js';
import { TerminalService } from '../../terminals/TerminalService.js';

/**
 * Creates an MCP server endpoint handler for the devtools server
 * Exposes SafeWrite, SafeBash, checkTerminal, RestartDevServer tools
 */
export async function handleDevtoolsMcpEndpoint(
  request: FastifyRequest,
  reply: FastifyReply,
  services: {
    sandboxService: SandboxService;
    terminalService: TerminalService;
    devServerService: NucleateDevelopmentServerService;
    logger: SystemLogger;
    workDir: string;
  },
): Promise<void> {
  const { sandboxService, terminalService, devServerService, logger, workDir } = services;

  // Create SSE transport
  const transport = new SSEServerTransport('/mcp/devtools', reply.raw);

  // Create MCP server
  const server = new Server(
    {
      name: 'devtools',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register ListTools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'SafeWrite',
        description: 'Write a file to the local filesystem with proper permissions and tracking',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'The absolute path to the file to write',
            },
            content: {
              type: 'string',
              description: 'The content to write to the file',
            },
          },
          required: ['file_path', 'content'],
        },
      },
      {
        name: 'SafeBash',
        description: 'Execute bash commands in a safe terminal environment',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The bash command to execute',
            },
            args: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional arguments to pass to the command',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'checkTerminal',
        description: 'Check the dev-server terminal output to help debug errors',
        inputSchema: {
          type: 'object',
          properties: {
            lines: {
              type: 'number',
              description: 'Number of recent output lines to retrieve (default: 20, max: 1000)',
              minimum: 1,
              maximum: 1000,
            },
          },
        },
      },
      {
        name: 'RestartDevServer',
        description: 'Restart the Expo dev server',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  }));

  // Register CallTool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'SafeWrite': {
          const { file_path, content } = args as { file_path: string; content: string };
          const result = await handleSafeWrite(file_path, content, sandboxService, workDir, logger);
          return result;
        }

        case 'SafeBash': {
          const { command, args: cmdArgs } = args as { command: string; args?: string[] };
          const result = await handleSafeBash(command, cmdArgs ?? [], sandboxService, logger);
          return result;
        }

        case 'checkTerminal': {
          const { lines } = args as { lines?: number };
          const result = await handleCheckTerminal(lines, terminalService, logger);
          return result;
        }

        case 'RestartDevServer': {
          const result = await handleRestartDevServer(devServerService, logger);
          return result;
        }

        default:
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${name}`,
              },
            ],
          };
      }
    } catch (error) {
      logger.error(
        error instanceof Error ? error : new Error(String(error)),
        `MCP tool ${name} failed`,
      );
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  });

  // Connect and handle the request
  await server.connect(transport);

  // Keep connection alive until client disconnects
  request.raw.on('close', () => {
    logger.debug('MCP devtools client disconnected');
  });
}

/**
 * Creates an MCP server endpoint handler for the design server
 * Exposes GeminiDesignExpert tool
 */
export async function handleDesignMcpEndpoint(
  request: FastifyRequest,
  reply: FastifyReply,
  services: {
    logger: SystemLogger;
  },
): Promise<void> {
  const { logger } = services;

  // Create SSE transport
  const transport = new SSEServerTransport('/mcp/design', reply.raw);

  // Create MCP server
  const server = new Server(
    {
      name: 'design',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register ListTools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'GeminiDesignExpert',
        description: 'Get design advice and UI/UX recommendations from Gemini',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The design question or request',
            },
          },
          required: ['query'],
        },
      },
    ],
  }));

  // Register CallTool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'GeminiDesignExpert') {
      const { query } = args as { query: string };
      const result = await handleGeminiDesignExpert(query, logger);
      return result;
    }

    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Unknown tool: ${name}`,
        },
      ],
    };
  });

  // Connect and handle the request
  await server.connect(transport);

  // Keep connection alive until client disconnects
  request.raw.on('close', () => {
    logger.debug('MCP design client disconnected');
  });
}

// Tool implementation functions (extracted from mcp-dev-tools.ts logic)

async function handleSafeWrite(
  filePath: string,
  content: string,
  sandboxService: SandboxService,
  workDir: string,
  logger: SystemLogger,
) {
  // Implementation moved from ChatQueryHandler.handleMcpWriteFile
  // ... (same logic)
}

async function handleSafeBash(
  command: string,
  args: string[],
  sandboxService: SandboxService,
  logger: SystemLogger,
) {
  // Implementation moved from ChatQueryHandler.executeSandboxCommand
  // ... (same logic)
}

async function handleCheckTerminal(
  lines: number | undefined,
  terminalService: TerminalService,
  logger: SystemLogger,
) {
  // Implementation similar to mcp-dev-tools.ts checkTerminal tool
  // ... (same logic)
}

async function handleRestartDevServer(
  devServerService: NucleateDevelopmentServerService,
  logger: SystemLogger,
) {
  // Implementation similar to mcp-dev-tools.ts RestartDevServer tool
  // ... (same logic)
}

async function handleGeminiDesignExpert(
  query: string,
  logger: SystemLogger,
) {
  // Implementation from mcp-design-tools.ts
  // ... (same logic)
}
```

### Step 2: Register MCP Endpoints in Fastify Server

**File**: `index.ts` (or wherever Fastify routes are registered)

```typescript
import { handleDevtoolsMcpEndpoint, handleDesignMcpEndpoint } from './services/chat/mcp/mcp-http-server.js';

// During server initialization, after service setup:

fastify.get('/mcp/devtools', async (request, reply) => {
  await handleDevtoolsMcpEndpoint(request, reply, {
    sandboxService,
    terminalService,
    devServerService,
    logger,
    workDir,
  });
});

fastify.get('/mcp/design', async (request, reply) => {
  // Only register if design tools are enabled
  if (enableDesignMcpTools) {
    await handleDesignMcpEndpoint(request, reply, {
      logger,
    });
  } else {
    reply.code(404).send({ error: 'Design MCP server not enabled' });
  }
});
```

### Step 3: Add MCP Config Generation to CLI Handler

**File**: `services/chat/claude-code-cli-query-handler.ts`

```typescript
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

export class ClaudeCodeCliQueryHandler {
  // ... existing code ...

  /**
   * Generates MCP configuration for the CLI
   * Returns the path to a temporary JSON config file
   */
  private async generateMcpConfigFile(
    enableDesignTools: boolean,
  ): Promise<string> {
    const mcpConfig = {
      mcpServers: {
        devtools: {
          url: 'http://localhost:3000/mcp/devtools',
          transport: 'sse',
        },
      },
    };

    // Add design server if enabled
    if (enableDesignTools) {
      mcpConfig.mcpServers['design'] = {
        url: 'http://localhost:3000/mcp/design',
        transport: 'sse',
      };
    }

    // Write to temporary file
    const configPath = join(tmpdir(), `mcp-config-${randomUUID()}.json`);
    await writeFile(configPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');

    this.logger.debug('Generated MCP config file', {
      configPath,
      servers: Object.keys(mcpConfig.mcpServers),
    });

    return configPath;
  }

  /**
   * Cleans up temporary MCP config file
   */
  private async cleanupMcpConfigFile(configPath: string): Promise<void> {
    try {
      await unlink(configPath);
      this.logger.debug('Cleaned up MCP config file', { configPath });
    } catch (error) {
      this.logger.warn('Failed to cleanup MCP config file', {
        configPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
```

### Step 4: Update CLI Spawning to Include MCP Config

**File**: `services/chat/claude-code-cli-query-handler.ts`

Update the `handleQuery` method:

```typescript
async handleQuery(
  context: QueryExecutionContext,
  handlers: MessageHandlers,
): Promise<void> {
  const { socket, data, sessionState } = context;
  const { sendMessage, notifyOrchestrationStartChat, notifyOrchestrationEndChat } = handlers;

  let mcpConfigPath: string | null = null;

  try {
    // ... existing authentication and setup code ...

    // Generate MCP config file
    mcpConfigPath = await this.generateMcpConfigFile(
      this.enableDesignMcpTools // or get from data/context
    );

    // ... existing query text extraction ...

    // Spawn CLI process with MCP config
    const cliProcess = this.spawnCliProcess(
      queryText,
      authEnv.env,
      sessionState,
      systemPromptAppend,
      mcpConfigPath, // NEW: Pass MCP config path
    );

    // ... existing process handling ...

  } catch (error) {
    // ... existing error handling ...
  } finally {
    // Cleanup MCP config file
    if (mcpConfigPath) {
      await this.cleanupMcpConfigFile(mcpConfigPath);
    }

    // ... existing cleanup ...
  }
}
```

Update the `spawnCliProcess` method:

```typescript
private spawnCliProcess(
  query: string,
  env: NodeJS.ProcessEnv,
  sessionState: CodeSessionState,
  systemPromptAppend?: string,
  mcpConfigPath?: string, // NEW parameter
): ChildProcessByStdio<null, Readable, Readable> {
  const args = [
    '-p', query,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'acceptEdits',
  ];

  // Add resume flag if we have an active session
  if (sessionState.sessionId) {
    args.push('--resume', sessionState.sessionId);
  }

  // Add system prompt append if provided
  if (systemPromptAppend && systemPromptAppend.trim()) {
    args.push('--append-system-prompt', systemPromptAppend);
  }

  // Add MCP config if provided
  if (mcpConfigPath) {
    args.push('--mcp-config', mcpConfigPath);
  }

  this.logger.debug('Spawning Claude CLI process', {
    args,
    cwd: this.workDir,
    hasSessionId: !!sessionState.sessionId,
    hasSystemPrompt: !!systemPromptAppend,
    hasMcpConfig: !!mcpConfigPath,
  });

  const cliProcess = spawn('claude', args, {
    cwd: this.workDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return cliProcess;
}
```

### Step 5: Add enableDesignMcpTools to CLI Handler

**File**: `services/chat/claude-code-cli-query-handler.ts`

Add the property to the constructor and class:

```typescript
export class ClaudeCodeCliQueryHandler {
  private readonly workDir: string;
  private readonly logger: SystemLogger;
  private readonly supabaseClientService: SupabaseClientService;
  private readonly toolPermissionService: ToolPermissionService;
  private sessionState: SessionState;
  private readonly enableDesignMcpTools: boolean; // NEW

  constructor(
    workDir: string,
    logger: SystemLogger,
    supabaseClientService: SupabaseClientService,
    toolPermissionService: ToolPermissionService,
    enableDesignMcpTools: boolean, // NEW parameter
  ) {
    this.workDir = workDir;
    this.logger = logger.child({ service: 'ClaudeCodeCliQueryHandler' });
    this.supabaseClientService = supabaseClientService;
    this.toolPermissionService = toolPermissionService;
    this.enableDesignMcpTools = enableDesignMcpTools; // NEW
    this.sessionState = {
      modifiedFilesThisQuery: new Set(),
      pendingToolCalls: new Map(),
    };
  }
}
```

### Step 6: Update ChatService to Pass Configuration

**File**: `services/chat/ChatService.ts` (wherever CLI handler is instantiated)

```typescript
// When creating CLI handler instance:
const cliHandler = new ClaudeCodeCliQueryHandler(
  workDir,
  logger,
  supabaseClientService,
  toolPermissionService,
  enableDesignMcpTools, // Pass from ChatService config
);
```

---

## Testing Strategy

### Unit Tests

**File**: `services/chat/mcp/mcp-http-server.test.ts`

```typescript
describe('MCP HTTP Server', () => {
  describe('handleDevtoolsMcpEndpoint', () => {
    it('should list all devtools tools', async () => {
      // Test ListTools request
    });

    it('should execute SafeWrite tool', async () => {
      // Test SafeWrite tool execution
    });

    it('should execute SafeBash tool', async () => {
      // Test SafeBash tool execution
    });

    it('should handle checkTerminal tool', async () => {
      // Test checkTerminal tool execution
    });

    it('should handle RestartDevServer tool', async () => {
      // Test RestartDevServer tool execution
    });

    it('should handle errors gracefully', async () => {
      // Test error scenarios
    });
  });

  describe('handleDesignMcpEndpoint', () => {
    it('should list GeminiDesignExpert tool', async () => {
      // Test ListTools request
    });

    it('should execute GeminiDesignExpert tool', async () => {
      // Test tool execution
    });
  });
});
```

### Integration Tests

**File**: `services/chat/claude-code-cli-query-handler.integration.test.ts`

```typescript
describe('ClaudeCodeCliQueryHandler with MCP', () => {
  it('should generate MCP config file', async () => {
    const handler = new ClaudeCodeCliQueryHandler(...);
    const configPath = await handler.generateMcpConfigFile(false);

    // Verify file exists
    const exists = await fileExists(configPath);
    expect(exists).toBe(true);

    // Verify content
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    expect(config.mcpServers.devtools).toBeDefined();
  });

  it('should spawn CLI with MCP config', async () => {
    // Test full CLI spawning with MCP config
  });

  it('should cleanup MCP config file after completion', async () => {
    // Test cleanup logic
  });
});
```

### Manual Testing

1. **Test MCP endpoint directly**:
   ```bash
   curl -N http://localhost:3000/mcp/devtools
   ```
   Should establish SSE connection and respond to MCP protocol messages.

2. **Test CLI with MCP config**:
   ```bash
   # Create test config
   cat > /tmp/test-mcp.json <<EOF
   {
     "mcpServers": {
       "devtools": {
         "url": "http://localhost:3000/mcp/devtools",
         "transport": "sse"
       }
     }
   }
   EOF

   # Test CLI
   claude -p "Write hello world to /tmp/test.txt using SafeWrite" \
     --mcp-config /tmp/test-mcp.json \
     --verbose
   ```

3. **Test via chat interface**:
   - Send a chat message that requires file writing
   - Verify SafeWrite tool is used instead of Write
   - Check logs for MCP connection establishment

---

## Rollout Plan

### Phase 1: MCP HTTP Server Implementation (Week 1)

**Tasks**:
1. ✅ Create `mcp-http-server.ts` with devtools endpoint
2. ✅ Implement tool handlers (SafeWrite, SafeBash, checkTerminal, RestartDevServer)
3. ✅ Add unit tests for MCP server
4. ✅ Register endpoint in Fastify server
5. ✅ Manual testing with curl/SSE client

**Success Criteria**:
- MCP devtools endpoint responds to requests
- All tools execute successfully
- Error handling works correctly

### Phase 2: CLI Handler Integration (Week 2)

**Tasks**:
1. ✅ Add MCP config generation to CLI handler
2. ✅ Update `spawnCliProcess` to include `--mcp-config`
3. ✅ Add cleanup logic for temporary files
4. ✅ Add integration tests
5. ✅ Test CLI spawning with MCP config

**Success Criteria**:
- CLI spawns with valid MCP config
- MCP tools are available in CLI mode
- Cleanup works correctly
- No file descriptor leaks

### Phase 3: Design MCP Server (Week 3, Optional)

**Tasks**:
1. ✅ Create design endpoint handler
2. ✅ Implement GeminiDesignExpert tool
3. ✅ Add to MCP config generation
4. ✅ Test design tools in CLI mode

**Success Criteria**:
- Design tools work in CLI mode
- Feature parity with SDK mode

### Phase 4: Production Rollout (Week 4)

**Tasks**:
1. ✅ Deploy to staging environment
2. ✅ Run end-to-end tests
3. ✅ Monitor error rates and performance
4. ✅ Gradual rollout to production (10% → 50% → 100%)

**Success Criteria**:
- No increase in error rates
- CLI and SDK modes have feature parity
- No performance degradation

**Rollback Plan**:
- If issues detected, remove `--mcp-config` flag from CLI spawning
- Falls back to built-in tools only
- No data loss or corruption

---

## Monitoring & Observability

### Metrics to Track

1. **MCP Connection Metrics**:
   - SSE connection establishment rate
   - Connection duration
   - Connection failures

2. **Tool Execution Metrics**:
   - Tool call count by tool name
   - Tool execution duration
   - Tool error rate

3. **Performance Metrics**:
   - HTTP request latency for MCP endpoints
   - Memory usage of MCP server handlers
   - File descriptor count (watch for leaks)

### Logging

Add structured logging for:
- MCP connection establishment/teardown
- Tool invocations with parameters
- Tool execution results
- Error conditions with stack traces

Example:
```typescript
logger.info('MCP tool invoked', {
  tool: 'SafeWrite',
  file_path: '/path/to/file',
  content_length: content.length,
  duration_ms: executionTime,
});
```

### Alerts

Set up alerts for:
- MCP endpoint error rate > 5%
- MCP connection failures > 10/min
- Average tool execution time > 5s
- File descriptor leak detection

---

## Future Considerations

### Potential Enhancements

1. **Tool Result Caching**:
   - Cache checkTerminal results for short periods
   - Reduce redundant terminal reads

2. **Rate Limiting**:
   - Add rate limiting to MCP endpoints
   - Prevent abuse or runaway tool calls

3. **Authentication**:
   - Add token-based auth for MCP endpoints
   - Even though localhost-only, defense in depth

4. **Metrics Dashboard**:
   - Create Grafana dashboard for MCP metrics
   - Track tool usage patterns

5. **MCP Server as Standalone Service**:
   - If needed, extract MCP server to separate microservice
   - Enable use by multiple build workers

### Known Limitations

1. **SSE Connection Limits**:
   - Fastify has default connection limits
   - May need tuning for high concurrency

2. **Error Recovery**:
   - CLI doesn't auto-reconnect to MCP server on failure
   - Need robust error handling and retries

3. **State Management**:
   - MCP server is stateless
   - Any state needs to be passed via tool parameters or managed externally

---

## Appendix

### A. MCP Protocol Reference

- **Specification**: https://modelcontextprotocol.io/specification
- **SSE Transport**: https://modelcontextprotocol.io/specification/transport#sse
- **Tool Schema**: https://modelcontextprotocol.io/specification/tools

### B. Example MCP Config File

```json
{
  "mcpServers": {
    "devtools": {
      "url": "http://localhost:3000/mcp/devtools",
      "transport": "sse"
    },
    "design": {
      "url": "http://localhost:3000/mcp/design",
      "transport": "sse"
    }
  }
}
```

### C. Tool Definitions

#### SafeWrite
```json
{
  "name": "SafeWrite",
  "description": "Write a file to the local filesystem",
  "inputSchema": {
    "type": "object",
    "properties": {
      "file_path": { "type": "string" },
      "content": { "type": "string" }
    },
    "required": ["file_path", "content"]
  }
}
```

#### SafeBash
```json
{
  "name": "SafeBash",
  "description": "Execute bash commands safely",
  "inputSchema": {
    "type": "object",
    "properties": {
      "command": { "type": "string" },
      "args": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "required": ["command"]
  }
}
```

#### checkTerminal
```json
{
  "name": "checkTerminal",
  "description": "Check dev-server terminal output",
  "inputSchema": {
    "type": "object",
    "properties": {
      "lines": {
        "type": "number",
        "minimum": 1,
        "maximum": 1000
      }
    }
  }
}
```

#### RestartDevServer
```json
{
  "name": "RestartDevServer",
  "description": "Restart the development server",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

### D. Error Handling Patterns

**Pattern 1: Tool Execution Error**
```typescript
try {
  const result = await executeTool(params);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
  };
} catch (error) {
  logger.error(error, 'Tool execution failed');
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
  };
}
```

**Pattern 2: Connection Error**
```typescript
request.raw.on('error', (error) => {
  logger.error(error, 'SSE connection error');
  // Connection will auto-close
});

request.raw.on('close', () => {
  logger.debug('MCP client disconnected');
  // Cleanup any resources
});
```

### E. Performance Benchmarks

Expected performance targets:

| Metric | Target | Measurement |
|--------|--------|-------------|
| MCP connection establishment | < 100ms | Time to first response |
| SafeWrite execution | < 500ms | File write completion |
| SafeBash execution | < 2s | Command completion (avg) |
| checkTerminal execution | < 50ms | Terminal buffer read |
| RestartDevServer execution | < 5s | Server restart completion |

### F. Security Considerations

1. **Localhost-only binding**:
   ```typescript
   fastify.listen({ host: '127.0.0.1', port: 3000 });
   ```

2. **Input validation**:
   - All tool inputs validated via Zod schemas
   - Path traversal prevention for file operations
   - Command injection prevention for bash commands

3. **Rate limiting** (optional):
   ```typescript
   import rateLimit from '@fastify/rate-limit';

   fastify.register(rateLimit, {
     max: 100,
     timeWindow: '1 minute',
   });
   ```

4. **CORS** (not needed for localhost, but good practice):
   ```typescript
   // Only allow same-origin requests
   reply.header('Access-Control-Allow-Origin', 'http://localhost:3000');
   ```

---

## Document Changelog

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2024-12-18 | 1.0 | Initial document | Build Worker Team |

---

## Approval

- [ ] Technical Review: _______________ Date: ___________
- [ ] Security Review: _______________ Date: ___________
- [ ] Product Approval: _______________ Date: ___________
