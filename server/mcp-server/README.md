# Nucleate MCP Server (Hosted)

This is the hosted MCP server that runs at `mcp.nucleate.dev`, providing SSE transport for remote MCP clients.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Nucleate Control Plane                        │
│                    (File APIs + API Key Auth)                    │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│  Local npm Package        │   │  Hosted MCP Server        │
│  @nucleate/mcp-server     │   │  mcp.nucleate.dev         │
│  (stdio transport)        │   │  (SSE transport)          │
│  packages/nucleate-mcp    │   │  server/mcp-server        │
└───────────────────────────┘   └───────────────────────────┘
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/sse` | GET | SSE connection for MCP protocol |
| `/messages` | POST | Message endpoint (paired with SSE) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3003) |
| `NUCLEATE_CONTROL_PLANE_URL` | No | Control plane URL (default: https://control-plane.nucleate.dev) |

## Local Development

```bash
cd server/mcp-server
npm install
npm run dev
```

## Deployment

### Docker

```bash
docker build -t nucleate-mcp-server .
docker run -p 3003:3003 nucleate-mcp-server
```

### Client Configuration

```json
{
  "mcpServers": {
    "nucleate": {
      "url": "https://mcp.nucleate.dev/sse",
      "headers": {
        "Authorization": "Bearer nuc_your_api_key_here"
      }
    }
  }
}
```

## Related Packages

- `packages/nucleate-mcp-core` - Shared library with API client and tool definitions
- `packages/nucleate-mcp` - npm package for local stdio transport (`@nucleate/mcp-server`)
