# MCP Local Processes Implementation Plan

## Overview

This document outlines the plan to convert our MCP tool servers (dev-tools and design-tools) from in-process servers to local process servers. This change is needed to support multiple consumers, including the Claude Code CLI.

## Current State

### Existing MCP Tool Definitions

1. **Dev Tools** (`mcp-dev-tools.ts`)
   - `SafeWrite` - Write files to filesystem
   - `SafeBash` - Execute bash commands
   - `checkTerminal` - Check dev server terminal output
   - `RestartDevServer` - Restart the Expo/Next.js dev server

2. **Design Tools** (`mcp-design-tools.ts`)
   - `GeminiDesignExpert` - AI-powered design/UX guidance using Gemini 2.5 Flash

### Current Integration Pattern

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

### Key Challenge

The current architecture relies on **callbacks and service instances** being passed directly to the MCP server factory functions. In a local process model:
- Callbacks cannot be serialized/passed to separate processes
- Service instances (terminalService, devServerService) are not accessible from external processes
- State synchronization becomes necessary

---

## Proposed Architecture

### Option A: Stdio-based MCP Servers with HTTP/IPC Backend

```
┌─────────────────────────────────────────────────────────────────┐
│                      Sandbox Container                          │
│                                                                 │
│  ┌──────────────────┐     ┌──────────────────────────────────┐ │
│  │  Claude Code CLI │     │         Fastify Server           │ │
│  │                  │     │                                  │ │
│  │  or              │     │  ┌─────────────────────────────┐ │ │
│  │                  │     │  │  Internal API Endpoints     │ │ │
│  │  Claude Agent    │     │  │  - POST /internal/write     │ │ │
│  │  SDK             │     │  │  - POST /internal/bash      │ │ │
│  └────────┬─────────┘     │  │  - GET /internal/terminal   │ │ │
│           │               │  │  - POST /internal/restart   │ │ │
│           │ stdio         │  └─────────────────────────────┘ │ │
│           │               │                                  │ │
│  ┌────────▼─────────┐     │  ┌─────────────────────────────┐ │ │
│  │  MCP Dev Tools   │     │  │     Service Layer           │ │ │
│  │  Server Process  │────────│  - SandboxService           │ │ │
│  │                  │ HTTP │  │  - TerminalService          │ │ │
│  └──────────────────┘     │  │  - DevServerService         │ │ │
│                           │  └─────────────────────────────┘ │ │
│  ┌──────────────────┐     │                                  │ │
│  │  MCP Design Tools│     └──────────────────────────────────┘ │
│  │  Server Process  │                                          │
│  └──────────────────┘                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- Clean separation of concerns
- MCP servers are standalone and reusable
- Standard MCP protocol (stdio JSON-RPC)
- Easy to test independently

**Cons:**
- Requires internal HTTP API for cross-process communication
- Slightly more complex setup
- Latency overhead for HTTP calls

### Option B: Unix Domain Socket Communication

Similar to Option A but uses Unix domain sockets instead of HTTP for faster local communication.

**Pros:**
- Lower latency than HTTP
- Still maintains process isolation

**Cons:**
- More complex implementation
- Less standard tooling available

### Option C: Hybrid Approach (Recommended)

Keep the in-process servers for the Claude Agent SDK path while also providing standalone MCP server binaries for CLI usage.

```
┌─────────────────────────────────────────────────────────────────┐
│                          Consumer                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Path 1: Claude Agent SDK (in-process)                         │
│  ┌──────────────────┐                                          │
│  │  ChatQueryHandler│ ──> createDevelopmentToolsMcpServer()    │
│  └──────────────────┘      (callbacks passed directly)         │
│                                                                 │
│  Path 2: Claude Code CLI (local process)                       │
│  ┌──────────────────┐     ┌──────────────────┐                 │
│  │  Claude Code CLI │────>│  MCP Server Bin  │──> Internal API │
│  └──────────────────┘     └──────────────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- No changes to existing working path
- Gradual rollout possible
- Best of both worlds

**Cons:**
- Code duplication between in-process and standalone implementations
- More code to maintain

---

## Questions for Discussion

### Q1: Internal Communication Protocol

For the MCP server processes to execute actions, they need to communicate with the main Fastify server. Options:

1. **HTTP REST API** - Simple, well-understood
2. **Unix Domain Socket** - Faster, but more complex
3. **Named Pipes** - Windows-compatible if needed
4. **gRPC** - Type-safe, efficient, but adds dependency

**Preference?** HTTP seems simplest for initial implementation.

### Q2: Authentication for Internal API

Since the internal API will be on localhost, do we need authentication?

1. **No auth** - Trust localhost connections
2. **Shared secret** - Simple token-based auth
3. **Unix socket permissions** - OS-level access control

### Q3: State Access Pattern

The `checkTerminal` tool needs access to terminal output history. Options:

1. **Pull model** - MCP server requests state from internal API
2. **Push model** - Main server pushes state updates to MCP server
3. **Shared memory/file** - Both processes access common state store

### Q4: Design Tools - External Dependencies

The design tools use Google Gemini API. For the local process version:

1. Keep API key in environment variable (already works)
2. Pass through internal API (adds complexity)
3. Make design tools a separate optional MCP server

### Q5: Process Lifecycle Management

Who spawns and manages the MCP server processes?

1. **Main Fastify server** spawns them on startup
2. **Claude Code CLI** spawns them when connecting
3. **Systemd/supervisor** manages them as services
4. **On-demand** - spawned per chat session

---

## Implementation Plan

### Phase 1: Internal API Layer

Create internal HTTP endpoints in the Fastify server:

```typescript
// server/build-workers/routes/internal-mcp-api.ts

// POST /internal/mcp/write
interface WriteRequest {
  filePath: string;
  content: string;
}

// POST /internal/mcp/bash
interface BashRequest {
  command: string;
  args?: string[];
}

// GET /internal/mcp/terminal?lines=20
interface TerminalResponse {
  output: string;
}

// POST /internal/mcp/restart-dev-server
interface RestartResponse {
  success: boolean;
  message?: string;
}
```

### Phase 2: Standalone MCP Server Package

Create a new package/directory for standalone MCP servers:

```
server/build-workers/
├── mcp-servers/
│   ├── dev-tools/
│   │   ├── index.ts          # Entry point
│   │   ├── server.ts         # MCP server implementation
│   │   ├── internal-client.ts # HTTP client for internal API
│   │   └── package.json
│   ├── design-tools/
│   │   ├── index.ts
│   │   ├── server.ts
│   │   └── package.json
│   └── shared/
│       ├── types.ts
│       └── utils.ts
```

### Phase 3: MCP Server Implementation

```typescript
// mcp-servers/dev-tools/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { InternalApiClient } from "./internal-client.js";

const server = new Server({
  name: "nucleate-dev-tools",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {}
  }
});

const internalClient = new InternalApiClient(
  process.env.INTERNAL_API_URL || "http://localhost:3000"
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "SafeWrite",
      description: "Write a file to the local filesystem",
      inputSchema: { /* ... */ }
    },
    // ... other tools
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "SafeWrite":
      return await internalClient.writeFile(request.params.arguments);
    case "SafeBash":
      return await internalClient.runCommand(request.params.arguments);
    // ... etc
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Phase 4: Build & Distribution

1. Build standalone MCP servers as executable binaries
2. Include in container image
3. Configure Claude Code CLI to use them

### Phase 5: Testing & Validation

1. Unit tests for internal API endpoints
2. Integration tests for MCP server
3. End-to-end tests with Claude Code CLI

---

## File Changes Summary

### New Files

1. `server/build-workers/routes/internal-mcp-api.ts` - Internal API endpoints
2. `server/build-workers/mcp-servers/dev-tools/index.ts` - Dev tools entry point
3. `server/build-workers/mcp-servers/dev-tools/server.ts` - Dev tools MCP server
4. `server/build-workers/mcp-servers/dev-tools/internal-client.ts` - Internal API client
5. `server/build-workers/mcp-servers/design-tools/index.ts` - Design tools entry point
6. `server/build-workers/mcp-servers/design-tools/server.ts` - Design tools MCP server
7. `server/build-workers/mcp-servers/shared/types.ts` - Shared types

### Modified Files

1. `server/build-workers/routes/index.ts` - Register internal API routes
2. `server/build-workers/Dockerfile` - Build and include MCP server binaries
3. `server/build-workers/package.json` - Add new dependencies if needed

---

## Open Questions

1. Should we use a single MCP server process with both dev-tools and design-tools, or separate processes?

2. How should we handle the case where the internal API is unavailable?

3. Do we need versioning/compatibility checks between MCP servers and the internal API?

4. Should the MCP servers support hot-reload of configuration?

5. How do we handle graceful shutdown of MCP server processes?

---

## Next Steps

1. [ ] Finalize architecture decision (Option A, B, or C)
2. [ ] Answer open questions above
3. [ ] Design internal API schema in detail
4. [ ] Implement Phase 1 (Internal API)
5. [ ] Implement Phase 2-3 (Standalone MCP servers)
6. [ ] Test with Claude Code CLI
7. [ ] Document usage for CLI consumers
