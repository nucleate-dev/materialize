# Build Workers

A containerized sandbox server running in AWS Fargate that provides an isolated development environment for React Native (Expo) applications with AI-assisted development capabilities.

## Overview

Build Workers is a Fastify-based server that runs inside Docker containers on AWS Fargate. Each container provides:

- **Expo Development Server** - Run and preview React Native applications in real-time
- **AI Chat Integration** - Claude Code SDK and Vercel AI SDK for AI-assisted development
- **PTY Terminal Sessions** - Full terminal access via WebSocket connections
- **File Synchronization** - Bi-directional sync between Supabase and the container filesystem
- **Build & Deploy** - Export Expo projects and deploy to S3

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     AWS Fargate Container                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Fastify Server (Port 3002)               │    │
│  │  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │    │
│  │  │  ChatService  │  │  TerminalSvc  │  │ SandboxSvc  │  │    │
│  │  │  (WebSocket)  │  │    (PTY)      │  │   (Files)   │  │    │
│  │  └───────────────┘  └───────────────┘  └─────────────┘  │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │      NucleateDevelopmentServerService             │  │    │
│  │  │  ┌─────────────────────────────────────────────┐  │  │    │
│  │  │  │  ExpoDevServerService (Adapter Pattern)     │  │  │    │
│  │  │  └─────────────────────────────────────────────┘  │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  │  ┌───────────────┐  ┌───────────────────────────────┐  │    │
│  │  │ FileSyncSvc   │  │ CloudflareTunnelMgmtSvc      │  │    │
│  │  │  (Supabase)   │  │  (External Access)           │  │    │
│  │  └───────────────┘  └───────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  /tmp/materialize-dev-server/  ← Project Files (materialize-user)│
│  /app/                         ← Server Code (root)              │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
server/build-workers/
├── worker.ts                    # Main entry point (Fastify server)
├── Dockerfile                   # Container image definition
├── entrypoint.sh               # Docker entrypoint script
├── package.json                # Dependencies and scripts
├── FLAGS.ts                    # Feature flags
├── services/
│   ├── chat/                   # AI chat integration
│   │   ├── ChatService.ts      # WebSocket chat orchestration
│   │   ├── chat-query-handler.ts        # Claude SDK handler
│   │   ├── chat-query-handler-vercel.ts # Vercel AI SDK handler
│   │   ├── ClaudeCodePrompts.ts         # System prompts
│   │   ├── design-agent-service.ts      # Design generation
│   │   └── mcp/                         # Model Context Protocol tools
│   │       ├── mcp-dev-tools.ts
│   │       └── mcp-design-tools.ts
│   ├── dev-server/             # Development server management
│   │   ├── NucleateDevelopmentServerService.ts  # Main orchestrator
│   │   ├── ExpoDevServerService.ts              # Expo-specific logic
│   │   ├── adapters/
│   │   │   └── ExpoReactNativeAdapter.ts
│   │   └── handlers/           # HTTP route handlers
│   ├── terminals/              # PTY terminal management
│   │   ├── TerminalService.ts
│   │   └── EternalTerminalLogManager.ts
│   ├── FileSyncService.ts      # Supabase file synchronization
│   ├── SandboxService.ts       # File/git operations
│   ├── SupabaseClientService.ts
│   └── CloudflareTunnelManagementService.ts
├── types/                      # TypeScript definitions
├── utils/                      # Shared utilities
└── loggers/                    # Logging infrastructure
```

## Core Services

### ChatService

Manages AI-powered chat interactions via WebSocket connections.

**Features:**

- Real-time WebSocket communication with heartbeat monitoring
- Support for multiple AI providers (Claude via Agent SDK, OpenAI/Google via Vercel AI SDK)
- MCP (Model Context Protocol) tools for file operations, bash commands, and design systems
- Message persistence to Supabase
- Tool permission validation and execution
- Credit/usage tracking

**WebSocket Endpoint:** `GET /ws/chat`

**Events:**
| Event | Description |
|-------|-------------|
| `AUTHENTICATED` | Client successfully authenticated |
| `MESSAGE_RECEIVED` | Incoming message from client |
| `AGENT_MESSAGE` | AI response (streaming) |
| `TOOL_START` / `TOOL_COMPLETE` | Tool execution lifecycle |
| `QUERY_COMPLETE` | Query processing finished |

---

### NucleateDevelopmentServerService

Central orchestrator for development server lifecycle management.

**HTTP Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/allocate` | Allocate container resources |
| `POST` | `/dev-server/start-v2` | Start Expo dev server |
| `POST` | `/update-files-v2` | Update project files |
| `POST` | `/dev-server/restart-v2` | Restart dev server |
| `POST` | `/dev-server/refetch-env` | Refresh environment variables |
| `DELETE` | `/cleanup` | Clean up resources |
| `POST` | `/build-and-deploy` | Build and deploy to S3 |
| `GET` | `/build-status` | Get current build status |

**Dev Server Lifecycle:**

```
allocate → start-v2 → [update-files-v2]* → build-and-deploy → cleanup
```

---

### ExpoDevServerService

Manages Expo React Native development server with tunnel support.

**Workflow:**

1. Fetch project files from Supabase
2. Install dependencies (`npm install`)
3. Start Expo with tunnel: `npx expo start --web --tunnel`
4. Monitor output for tunnel URL (ngrok, exp.direct)
5. Return tunnel URL for iframe embedding
6. Handle hot reload on file updates
7. Build to static web output on deploy

**Key Methods:**

- `startDevServer()` - Launch Expo with tunnel detection (60s timeout)
- `updateDevServerFiles()` - Smart file updates with dependency diffing
- `buildAndDeployProjectCore()` - Export to web and upload to S3

---

### TerminalService

Multi-session PTY terminal management with WebSocket support.

**Features:**

- Multiple concurrent terminal sessions using `node-pty`
- WebSocket-based real-time I/O
- Session persistence with log uploads to Supabase
- Command validation (security)
- Privilege dropping to unprivileged user

**WebSocket Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ws/terminal/create` | Create new terminal session |
| `GET` | `/ws/terminal/:sessionId/input` | Send input to terminal |
| `GET` | `/ws/terminal/:sessionId/info` | Get terminal session info |
| `DELETE` | `/ws/terminal/:sessionId` | Close terminal session |

**Session Types:**

- `dev-server` - Expo development server output
- `test` - Testing terminal
- `build` - Build terminal

**WebSocket Message Format:**

```typescript
{
  type: "create" | "input" | "resize" | "close",
  sessionId?: string,
  input?: string,
  cols?: number,
  rows?: number
}
```

---

### FileSyncService

Bi-directional file synchronization with Supabase as source of truth.

**Sync Directions:**

1. **Supabase → Disk** (on container start)
   - Fetch files from `prototype_files` table
   - Download assets from Supabase Storage
   - Write to `/tmp/materialize-dev-server/`

2. **Disk → Supabase** (during development)
   - Watch filesystem with Chokidar
   - Debounce changes (200ms)
   - Batch upsert to Supabase

**Configuration:**

```typescript
FILE_FETCH_BATCH_SIZE: 500;
FILE_UPSERT_BATCH_SIZE: 200;
ASSET_DOWNLOAD_CONCURRENCY: 10;
```

**Excluded Directories:** `node_modules`, `.git`, `.expo`, `dist`, `build`, `.cache`

---

### SandboxService

Low-level file and git operations API.

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sandbox/make-dir` | Create directory |
| `POST` | `/sandbox/read-file` | Read file contents (10MB limit) |
| `POST` | `/sandbox/write-file` | Write file |
| `POST` | `/sandbox/git-checkout` | Checkout git branch |
| `POST` | `/sandbox/run-command` | Execute terminal command |

---

## AI Integration

### Claude Agent SDK

Primary AI integration using Anthropic's Claude Code SDK.

**Package:** `@anthropic-ai/claude-agent-sdk`

**MCP Tools Provided:**

- File operations (Read, Write, Edit, Glob, Grep)
- Bash command execution
- Terminal session management
- Design system integration

**Tool Permission Validation:**

- Enforces file access boundaries
- Prevents access to server code (`/app/`)
- Restricts sensitive file operations

### Vercel AI SDK

Alternative AI provider support for OpenAI and Google models.

**Package:** `ai`

**Supported Providers:**

- OpenAI (GPT models)
- Google (Gemini models)

---

## Docker Configuration

### Base Image

`node:22-slim` (Debian-based)

### Security Model

**Users:**

- `root` - Runs the Fastify server and manages processes
- `materialize-user` - Unprivileged user for development server and user code

**Directory Permissions:**

```
/app/                        → root only (server code)
/tmp/materialize-dev-server/ → materialize-user (project files)
/root/.claude/               → Claude session data
```

### Key Environment Variables

| Variable              | Default                       | Description                   |
| --------------------- | ----------------------------- | ----------------------------- |
| `PORT`                | `3002`                        | Fastify server port           |
| `WORK_DIR`            | `/tmp/materialize-dev-server` | Project workspace             |
| `TERMINAL_USER`       | `materialize-user`            | PTY session user              |
| `EXPO_NO_TELEMETRY`   | `1`                           | Disable Expo telemetry        |
| `CHOKIDAR_USEPOLLING` | `1`                           | Enable polling for file watch |
| `NODE_OPTIONS`        | `--max-old-space-size=2048`   | Node memory limit             |

### Build Process

```bash
# Install system dependencies
apt-get install build-essential python3 curl git watchman

# Install cloudflared for tunnels
curl -L https://github.com/cloudflare/cloudflared/releases/.../cloudflared-linux-amd64.deb

# Install Node dependencies and build
npm install
npm run build  # TypeScript compilation
```

---

## Development

### Prerequisites

- Node.js 22+
- Docker (for local container testing)

### Local Development

```bash
# Install dependencies
npm install

# Run with hot reload
npm run dev

# Run in production mode
npm start
```

### Scripts

| Script                       | Description                |
| ---------------------------- | -------------------------- |
| `npm run dev`                | Start with nodemon/ts-node |
| `npm run build`              | Compile TypeScript         |
| `npm start`                  | Run compiled server        |
| `npm run lint:check`         | ESLint check               |
| `npm run typecheck`          | TypeScript type check      |
| `npm run gen:supabase:types` | Generate Supabase types    |

### Building Docker Image

```bash
docker build -t build-worker .
docker run -p 3002:3002 build-worker
```

---

## API Reference

### Health Check

```http
GET /health

Response:
{
  "status": "ok",
  "service": "fargate-build-worker",
  "workDir": "/tmp/materialize-dev-server"
}
```

### Allocate Resources

```http
POST /allocate

Request:
{
  "prototypeId": "string",
  "userId": "string",
  "accessToken": "string",
  "supabaseUrl": "string",
  "supabaseAnonKey": "string"
}

Response:
{
  "success": true,
  "tunnelUrl": "string"
}
```

### Start Dev Server

```http
POST /dev-server/start-v2

Request:
{
  "prototypeId": "string",
  "adapter": "expo-react-native"
}

Response:
{
  "success": true,
  "tunnelUrl": "https://nucleate-xxx.ngrok.io"
}
```

### Update Files

```http
POST /update-files-v2

Request:
{
  "files": [
    { "path": "string", "content": "string" }
  ]
}

Response:
{
  "success": true,
  "tunnelUrl": "string",
  "restartRequired": false
}
```

---

## Logging & Observability

### SystemLogger

- JSON structured logging to stdout
- CloudWatch EMF metrics support
- Request/trace ID correlation
- Automatic sensitive field redaction

**Metrics Namespace:** `Materialize/BuildWorker`

**Redacted Fields:** `password`, `authorization`, `token`, `api_key`, `secret`

### Terminal Logging

- Session output persisted to `/tmp/materialize-eternal-terminal-logs/`
- Uploaded to Supabase Storage bucket: `terminal-sessions`
- Tracked sessions: `dev-server`, `test`, `build`

---

## Dependencies

### Core

| Package                 | Purpose               |
| ----------------------- | --------------------- |
| `fastify`               | Web server framework  |
| `@fastify/websocket`    | WebSocket support     |
| `node-pty`              | PTY terminal spawning |
| `@supabase/supabase-js` | Database client       |
| `@aws-sdk/client-s3`    | S3 uploads            |

### AI

| Package                          | Purpose                 |
| -------------------------------- | ----------------------- |
| `@anthropic-ai/claude-agent-sdk` | Claude Code integration |
| `@modelcontextprotocol/sdk`      | MCP protocol            |
| `ai`                             | Vercel AI SDK           |
| `@ai-sdk/openai`                 | OpenAI provider         |
| `@ai-sdk/google`                 | Google AI provider      |

### Utilities

| Package    | Purpose              |
| ---------- | -------------------- |
| `chokidar` | File system watching |
| `sharp`    | Image processing     |
| `axios`    | HTTP requests        |
| `uuid`     | ID generation        |

---

## Feature Flags

Defined in `FLAGS.ts`:

| Flag                                   | Default | Description                            |
| -------------------------------------- | ------- | -------------------------------------- |
| `ENABLE_DESIGN_AGENT_ON_FIRST_MESSAGE` | `true`  | Run design agent on first chat message |
| `ENABLE_MCP_DESIGN_TOOLS`              | `false` | Enable MCP design tools                |

---

## Security Considerations

1. **Privilege Separation** - Server runs as root, user code runs as `materialize-user`
2. **Path Validation** - All file operations validate against directory traversal
3. **Command Validation** - Terminal commands validated before execution (non-dev mode)
4. **File Access Control** - Claude Code restricted from server directories
5. **Sensitive Data** - Environment files excluded from sync, logs redacted
6. **File Size Limits** - 10MB read limit, 50MB request body limit
