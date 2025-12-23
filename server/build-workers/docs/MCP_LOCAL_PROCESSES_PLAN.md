# MCP Local Processes Implementation Plan

## Overview

This document outlines the plan to convert our MCP tool servers (dev-tools and design-tools) from in-process servers to local process servers. This change is needed to support multiple consumers, including the Claude Code CLI.

**Status**: Planning (Decisions Finalized)

---

## Decisions Made

| Decision               | Choice                                                   |
| ---------------------- | -------------------------------------------------------- |
| Architecture           | Option A: HTTP-based internal API                        |
| Process Count          | Two separate MCP servers (dev-tools and design-tools)    |
| Process Lifecycle      | Fastify server (worker.ts) spawns MCP servers on startup |
| Internal Communication | HTTP REST API on localhost                               |
| Authentication         | No auth (trust localhost connections)                    |

---

## Current State

### Existing MCP Tool Definitions

1. **Dev Tools** (`services/chat/mcp/mcp-dev-tools.ts`)
   - `SafeWrite` - Write files to filesystem
   - `SafeBash` - Execute bash commands
   - `checkTerminal` - Check dev server terminal output
   - `RestartDevServer` - Restart the Expo/Next.js dev server

2. **Design Tools** (`services/chat/mcp/mcp-design-tools.ts`)
   - `GeminiDesignExpert` - AI-powered design/UX guidance using Gemini 2.5 Flash

### Current Integration Pattern

The MCP tools are currently created as in-process servers and passed directly to the Claude Agent SDK:

```typescript
// In chat-query-handler.ts
const mcpServers: Record<string, McpSdkServerConfigWithInstance> = {
  devtools: createDevelopmentToolsMcpServer(
    runCommand,      // Callback for command execution
    writeFile,       // Callback for file writing
    terminalService, // Service instance for terminal state
    restartDevServer // Callback for dev server restart
  ),
  design: createDesignToolsMcpServer(logger, modelName)
};

// Passed to Claude Agent SDK
const response = query({
  prompt: messages,
  options: { mcpServers, ... }
});
```

### Existing CLI Integration

There's already a `ClaudeCodeCliQueryHandler` (`services/chat/claude-code-cli-query-handler.ts`) that:

- Spawns the `claude` CLI as a subprocess
- Passes OAuth token via `CLAUDE_CODE_OAUTH_TOKEN` environment variable
- Parses JSON output from stdout (`--output-format stream-json`)
- Transforms CLI output to WebSocket messages

This existing pattern shows how the CLI path works, and the MCP servers need to integrate with this.

### Key Challenge

In-process callbacks cannot be passed to separate MCP server processes. We need:

1. An internal HTTP API that MCP servers can call
2. MCP servers that communicate via stdio with Claude Code CLI
3. Process lifecycle management in worker.ts

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Sandbox Container                                   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         Fastify Server (worker.ts)                          ││
│  │  Port 3002                                                                  ││
│  │                                                                             ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ ││
│  │  │ SandboxService  │  │ TerminalService │  │ NucleateDevelopmentServer   │ ││
│  │  │                 │  │                 │  │ Service                     │ ││
│  │  │ - writeFile()   │  │ - getOutput()   │  │ - restartDevServer()        │ ││
│  │  │ - runCommand()  │  │                 │  │                             │ ││
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ ││
│  │                              │                                              ││
│  │                              ▼                                              ││
│  │  ┌─────────────────────────────────────────────────────────────────────────┐││
│  │  │                       MCP API Routes                                    │││
│  │  │  POST /mcp/write                 POST /mcp/bash                         │││
│  │  │  GET  /mcp/terminal              POST /mcp/restart-dev-server           │││
│  │  │  POST /mcp/gemini-design                                                │││
│  │  └─────────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                        ▲                                         │
│                                        │ HTTP (localhost:3002)                   │
│                                        │                                         │
│  ┌─────────────────────┐      ┌─────────────────────┐                           │
│  │  MCP Dev Tools      │      │  MCP Design Tools   │                           │
│  │  Server Process     │      │  Server Process     │                           │
│  │                     │      │                     │                           │
│  │  (stdio transport)  │      │  (stdio transport)  │                           │
│  └──────────┬──────────┘      └──────────┬──────────┘                           │
│             │                            │                                       │
│             │ stdio                      │ stdio                                 │
│             │                            │                                       │
│  ┌──────────▼────────────────────────────▼──────────┐                           │
│  │              Claude Code CLI                      │                           │
│  │                                                   │                           │
│  │  Configured via .mcp.json or environment          │                           │
│  └───────────────────────────────────────────────────┘                           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Claude Code CLI MCP Configuration

Claude Code CLI discovers MCP servers via `.mcp.json` (project) or `~/.claude.json` (user). The configuration format:

```json
{
  "mcpServers": {
    "nucleate-dev-tools": {
      "type": "stdio",
      "command": "node",
      "args": ["/app/mcp-servers/dev-tools/index.js"],
      "env": {
        "INTERNAL_API_URL": "http://localhost:3002"
      }
    },
    "nucleate-design-tools": {
      "type": "stdio",
      "command": "node",
      "args": ["/app/mcp-servers/design-tools/index.js"],
      "env": {
        "INTERNAL_API_URL": "http://localhost:3002",
        "GOOGLE_API_KEY": "${GOOGLE_API_KEY}"
      }
    }
  }
}
```

The Fastify server will generate this configuration file at startup and place it in the work directory so Claude Code CLI can discover the MCP servers.

---

## Implementation Plan

### Phase 1: MCP API Routes

Create HTTP endpoints that expose the service layer functionality to MCP servers.

#### File: `server/build-workers/routes/mcp-api.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SandboxService } from "../services/SandboxService.js";
import { TerminalService } from "../services/terminals/TerminalService.js";
import { NucleateDevelopmentServerService } from "../services/dev-server/NucleateDevelopmentServerService.js";

// Request/Response types
interface WriteFileRequest {
  filePath: string;
  content: string;
}

interface WriteFileResponse {
  success: boolean;
  bytesWritten?: number;
  error?: string;
}

interface BashRequest {
  command: string;
  args?: string[];
}

interface BashResponse {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
}

interface TerminalRequest {
  lines?: number; // default 20, max 1000
}

interface TerminalResponse {
  output: string;
}

interface RestartDevServerResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface GeminiDesignRequest {
  request: string;
  context?: string;
}

interface GeminiDesignResponse {
  success: boolean;
  response?: string;
  error?: string;
}

export function registerMcpRoutes(
  app: FastifyInstance,
  sandboxService: SandboxService,
  terminalService: TerminalService,
  devServerService: NucleateDevelopmentServerService,
): void {
  // POST /mcp/write
  app.post<{ Body: WriteFileRequest; Reply: WriteFileResponse }>(
    "/mcp/write",
    async (request, reply) => {
      const { filePath, content } = request.body;
      try {
        await sandboxService.writeFile(filePath, content);
        const bytesWritten = Buffer.byteLength(content, "utf8");
        return { success: true, bytesWritten };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // POST /mcp/bash
  app.post<{ Body: BashRequest; Reply: BashResponse }>(
    "/mcp/bash",
    async (request, reply) => {
      const { command, args = [] } = request.body;
      try {
        const result = await sandboxService.runCommandInternal(
          command,
          args,
          30000, // 30 second timeout
        );
        return {
          success: !result.error,
          stdout: result.stdout,
          stderr: result.error ? result.stderr : undefined,
          exitCode: result.error ? 1 : 0,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // GET /mcp/terminal
  app.get<{ Querystring: TerminalRequest; Reply: TerminalResponse }>(
    "/mcp/terminal",
    async (request, reply) => {
      const lines = Math.min(Math.max(request.query.lines || 20, 1), 1000);
      const output = terminalService.getRecentOutput(lines);
      return { output };
    },
  );

  // POST /mcp/restart-dev-server
  app.post<{ Reply: RestartDevServerResponse }>(
    "/mcp/restart-dev-server",
    async (request, reply) => {
      try {
        await devServerService.developmentServerAdapter.restartDevServer(
          request.log2 || baseLogger,
        );
        return { success: true, message: "Dev server restarted successfully" };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // POST /mcp/gemini-design (for design tools MCP server)
  app.post<{ Body: GeminiDesignRequest; Reply: GeminiDesignResponse }>(
    "/mcp/gemini-design",
    async (request, reply) => {
      const { request: designRequest, context } = request.body;
      try {
        // This will use the Gemini API directly
        // Implementation details in Phase 2
        const response = await callGeminiDesignExpert(designRequest, context);
        return { success: true, response };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}
```

### Phase 2: MCP Server Packages

Create standalone MCP server packages that can be spawned as child processes.

#### Directory Structure

```
server/build-workers/
├── mcp-servers/
│   ├── dev-tools/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts           # Entry point
│   │   │   ├── server.ts          # MCP server implementation
│   │   │   ├── internal-client.ts # HTTP client for internal API
│   │   │   └── tools.ts           # Tool definitions
│   │   └── dist/                  # Compiled output
│   │       └── index.js
│   │
│   ├── design-tools/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── server.ts
│   │   │   ├── internal-client.ts
│   │   │   └── tools.ts
│   │   └── dist/
│   │       └── index.js
│   │
│   └── shared/
│       ├── package.json
│       ├── src/
│       │   ├── types.ts           # Shared TypeScript types
│       │   ├── internal-client-base.ts  # Base HTTP client
│       │   └── utils.ts
│       └── dist/
```

#### File: `mcp-servers/dev-tools/src/index.ts`

```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { InternalApiClient } from "./internal-client.js";
import { getToolDefinitions, handleToolCall } from "./tools.js";

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL || "http://localhost:3002";

async function main() {
  const server = new Server(
    {
      name: "nucleate-dev-tools",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const client = new InternalApiClient(INTERNAL_API_URL);

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getToolDefinitions(),
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, args, client);
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Nucleate Dev Tools MCP Server started");
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
```

#### File: `mcp-servers/dev-tools/src/tools.ts`

```typescript
import { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { InternalApiClient } from "./internal-client.js";

export function getToolDefinitions(): Tool[] {
  return [
    {
      name: "SafeWrite",
      description:
        "Write a file to the local filesystem with proper permissions and tracking",
      inputSchema: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "The absolute path to the file to write",
            minLength: 1,
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
        required: ["file_path", "content"],
      },
    },
    {
      name: "SafeBash",
      description:
        "Execute bash commands in a safe terminal environment (only short-running commands)",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The bash command to execute",
            minLength: 1,
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Optional arguments to pass to the command",
          },
        },
        required: ["command"],
      },
    },
    {
      name: "checkTerminal",
      description: "Check dev-server terminal output to help debug errors",
      inputSchema: {
        type: "object",
        properties: {
          lines: {
            type: "number",
            description:
              "Number of recent output lines to retrieve (1-1000, default: 20)",
            minimum: 1,
            maximum: 1000,
            default: 20,
          },
        },
      },
    },
    {
      name: "RestartDevServer",
      description:
        "Restart the Expo dev server. Useful after config changes or package installs.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown> | undefined,
  client: InternalApiClient,
): Promise<CallToolResult> {
  try {
    switch (name) {
      case "SafeWrite": {
        const { file_path, content } = args as {
          file_path: string;
          content: string;
        };
        const result = await client.writeFile(file_path, content);
        if (result.success) {
          return {
            content: [
              {
                type: "text",
                text: `Successfully wrote ${result.bytesWritten} bytes to ${file_path}`,
              },
            ],
          };
        } else {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true,
          };
        }
      }

      case "SafeBash": {
        const { command, args: cmdArgs } = args as {
          command: string;
          args?: string[];
        };
        const result = await client.runBash(command, cmdArgs);
        if (result.success) {
          return {
            content: [{ type: "text", text: result.stdout || "(no output)" }],
          };
        } else {
          return {
            content: [
              { type: "text", text: `Error: ${result.error || result.stderr}` },
            ],
            isError: true,
          };
        }
      }

      case "checkTerminal": {
        const { lines } = (args as { lines?: number }) || {};
        const result = await client.getTerminalOutput(lines);
        return {
          content: [{ type: "text", text: result.output || "(no output)" }],
        };
      }

      case "RestartDevServer": {
        const result = await client.restartDevServer();
        if (result.success) {
          return {
            content: [
              { type: "text", text: result.message || "Dev server restarted" },
            ],
          };
        } else {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true,
          };
        }
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

#### File: `mcp-servers/dev-tools/src/internal-client.ts`

```typescript
interface WriteFileResponse {
  success: boolean;
  bytesWritten?: number;
  error?: string;
}

interface BashResponse {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
}

interface TerminalResponse {
  output: string;
}

interface RestartResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class InternalApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  async writeFile(
    filePath: string,
    content: string,
  ): Promise<WriteFileResponse> {
    const response = await fetch(`${this.baseUrl}/mcp/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath, content }),
    });
    return response.json() as Promise<WriteFileResponse>;
  }

  async runBash(command: string, args?: string[]): Promise<BashResponse> {
    const response = await fetch(`${this.baseUrl}/mcp/bash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, args }),
    });
    return response.json() as Promise<BashResponse>;
  }

  async getTerminalOutput(lines?: number): Promise<TerminalResponse> {
    const url = new URL(`${this.baseUrl}/mcp/terminal`);
    if (lines) url.searchParams.set("lines", String(lines));
    const response = await fetch(url.toString());
    return response.json() as Promise<TerminalResponse>;
  }

  async restartDevServer(): Promise<RestartResponse> {
    const response = await fetch(`${this.baseUrl}/mcp/restart-dev-server`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return response.json() as Promise<RestartResponse>;
  }
}
```

### Phase 3: Worker.ts Integration

Update worker.ts to:

1. Register MCP API routes
2. Spawn MCP server processes on startup
3. Generate `.mcp.json` configuration file
4. Handle graceful shutdown of MCP processes

#### Changes to `server/build-workers/worker.ts`

```typescript
import { spawn, ChildProcess } from "child_process";
import { registerMcpRoutes } from "./routes/mcp-api.js";

// ... existing imports and setup ...

// MCP Server process management
let mcpDevToolsProcess: ChildProcess | null = null;
let mcpDesignToolsProcess: ChildProcess | null = null;

// Register MCP API routes
registerMcpRoutes(
  app,
  sandboxService,
  terminalService,
  nucleateDevelopmentServerService,
);

// Spawn MCP server processes
async function spawnMcpServers(): Promise<void> {
  const mcpServerDir = "/app/mcp-servers"; // Path in container

  // Spawn dev-tools MCP server
  mcpDevToolsProcess = spawn(
    "node",
    [`${mcpServerDir}/dev-tools/dist/index.js`],
    {
      env: {
        ...process.env,
        INTERNAL_API_URL: `http://localhost:${PORT}`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  mcpDevToolsProcess.stderr?.on("data", (data) => {
    baseLogger.debug("MCP dev-tools stderr", { output: data.toString() });
  });

  mcpDevToolsProcess.on("exit", (code) => {
    baseLogger.warn("MCP dev-tools process exited", { code });
    mcpDevToolsProcess = null;
  });

  // Spawn design-tools MCP server
  mcpDesignToolsProcess = spawn(
    "node",
    [`${mcpServerDir}/design-tools/dist/index.js`],
    {
      env: {
        ...process.env,
        INTERNAL_API_URL: `http://localhost:${PORT}`,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  mcpDesignToolsProcess.stderr?.on("data", (data) => {
    baseLogger.debug("MCP design-tools stderr", { output: data.toString() });
  });

  mcpDesignToolsProcess.on("exit", (code) => {
    baseLogger.warn("MCP design-tools process exited", { code });
    mcpDesignToolsProcess = null;
  });

  baseLogger.info("MCP server processes spawned");
}

// Generate .mcp.json for Claude Code CLI
async function generateMcpConfig(): Promise<void> {
  const mcpConfig = {
    mcpServers: {
      "nucleate-dev-tools": {
        type: "stdio",
        command: "node",
        args: ["/app/mcp-servers/dev-tools/dist/index.js"],
        env: {
          INTERNAL_API_URL: `http://localhost:${PORT}`,
        },
      },
      "nucleate-design-tools": {
        type: "stdio",
        command: "node",
        args: ["/app/mcp-servers/design-tools/dist/index.js"],
        env: {
          INTERNAL_API_URL: `http://localhost:${PORT}`,
          GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "",
        },
      },
    },
  };

  await fs.writeFile(
    `${WORK_DIR}/.mcp.json`,
    JSON.stringify(mcpConfig, null, 2),
  );

  baseLogger.info("Generated .mcp.json for Claude Code CLI");
}

// Update graceful shutdown
const close = async (): Promise<void> => {
  baseLogger.info("Shutting down build worker...");
  try {
    // Kill MCP server processes
    if (mcpDevToolsProcess) {
      mcpDevToolsProcess.kill("SIGTERM");
    }
    if (mcpDesignToolsProcess) {
      mcpDesignToolsProcess.kill("SIGTERM");
    }

    await nucleateDevelopmentServerService.developmentServerAdapter.stopDevServer(
      baseLogger,
    );
    terminalService.shutdownAllSessions();
    await chatService.shutdown();
    await app.close();
  } finally {
    process.exit(0);
  }
};

// Update start function
const start = async (): Promise<void> => {
  try {
    await fs.mkdir(WORK_DIR, { recursive: true });

    // Generate MCP config before starting server
    await generateMcpConfig();

    // Note: MCP servers are spawned on-demand by Claude Code CLI
    // We don't need to spawn them here since CLI handles that
    // But we need the .mcp.json config file to be present

    await app.listen({ port: PORT, host: "0.0.0.0" });
    baseLogger.info("Build worker started successfully", {
      port: PORT,
      workDir: WORK_DIR,
    });
  } catch (err) {
    baseLogger.error(err, "Failed to start build worker");
    process.exit(1);
  }
};
```

### Phase 4: Dockerfile Updates

Update the Dockerfile to build and include MCP servers.

#### Changes to `server/build-workers/Dockerfile`

```dockerfile
# ... existing build stages ...

# Build MCP servers
FROM node:20-slim AS mcp-builder

WORKDIR /build

# Copy MCP server source
COPY mcp-servers/ ./mcp-servers/

# Build shared package first
WORKDIR /build/mcp-servers/shared
RUN npm ci && npm run build

# Build dev-tools
WORKDIR /build/mcp-servers/dev-tools
RUN npm ci && npm run build

# Build design-tools
WORKDIR /build/mcp-servers/design-tools
RUN npm ci && npm run build

# ... in final stage ...

# Copy MCP server builds
COPY --from=mcp-builder /build/mcp-servers/dev-tools/dist /app/mcp-servers/dev-tools/dist
COPY --from=mcp-builder /build/mcp-servers/dev-tools/package.json /app/mcp-servers/dev-tools/
COPY --from=mcp-builder /build/mcp-servers/dev-tools/node_modules /app/mcp-servers/dev-tools/node_modules

COPY --from=mcp-builder /build/mcp-servers/design-tools/dist /app/mcp-servers/design-tools/dist
COPY --from=mcp-builder /build/mcp-servers/design-tools/package.json /app/mcp-servers/design-tools/
COPY --from=mcp-builder /build/mcp-servers/design-tools/node_modules /app/mcp-servers/design-tools/node_modules
```

### Phase 5: Testing

1. **Unit Tests**: Test MCP API endpoints
2. **Integration Tests**: Test MCP server tool calls
3. **E2E Tests**: Test with Claude Code CLI

---

## File Changes Summary

### New Files

| File                                           | Purpose                             |
| ---------------------------------------------- | ----------------------------------- |
| `routes/mcp-api.ts`                            | HTTP API endpoints for MCP servers  |
| `mcp-servers/dev-tools/package.json`           | Dev tools MCP server package config |
| `mcp-servers/dev-tools/tsconfig.json`          | TypeScript config                   |
| `mcp-servers/dev-tools/src/index.ts`           | Entry point                         |
| `mcp-servers/dev-tools/src/server.ts`          | MCP server setup                    |
| `mcp-servers/dev-tools/src/tools.ts`           | Tool definitions and handlers       |
| `mcp-servers/dev-tools/src/internal-client.ts` | HTTP client for internal API        |
| `mcp-servers/design-tools/...`                 | Same structure for design tools     |
| `mcp-servers/shared/...`                       | Shared types and utilities          |

### Modified Files

| File           | Changes                                 |
| -------------- | --------------------------------------- |
| `worker.ts`    | Register MCP routes, generate .mcp.json |
| `Dockerfile`   | Build and copy MCP server packages      |
| `package.json` | Add workspace reference to mcp-servers  |

---

## Remaining Open Questions

1. **Error Handling**: How should MCP servers handle internal API timeouts or failures?
   - Suggestion: Return error to tool caller, let Claude retry if needed

2. **Logging**: Should MCP servers log to stderr (captured by parent) or to a file?
   - Suggestion: stderr for simplicity, captured by worker.ts

3. **Health Checks**: Should MCP servers expose a health check endpoint?
   - Suggestion: Not needed since stdio transport handles this

4. **Versioning**: How to handle version mismatches between MCP servers and internal API?
   - Suggestion: Build them together, deploy together

---

## Implementation Order

1. [ ] Create `routes/mcp-api.ts` with all endpoints
2. [ ] Create `mcp-servers/shared/` with base client and types
3. [ ] Create `mcp-servers/dev-tools/` package
4. [ ] Create `mcp-servers/design-tools/` package
5. [ ] Update `worker.ts` to register routes and generate config
6. [ ] Update `Dockerfile` to build MCP servers
7. [ ] Write tests for MCP API
8. [ ] Write tests for MCP servers
9. [ ] E2E test with Claude Code CLI
