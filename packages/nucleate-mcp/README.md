# @nucleate/mcp-server

MCP (Model Context Protocol) server for [Nucleate](https://nucleate.dev) - manage prototypes, dev servers, and files from Claude Code or other MCP clients.

## Installation

```bash
npm install -g @nucleate/mcp-server
```

Or use directly with npx:

```bash
npx @nucleate/mcp-server
```

## Authentication

The MCP server uses **Nucleate API keys** for authentication. API keys are long-lived tokens that don't expire (unless you set an expiration) and can be revoked at any time.

### Creating an API Key

1. Go to [nucleate.dev](https://nucleate.dev) and sign in
2. Navigate to **Settings > API Keys**
3. Click **Create API Key**
4. Give it a name (e.g., "Claude Code")
5. Copy the key immediately - it's only shown once!

API keys look like: `nuc_a1b2c3d4e5f6...` (68 characters)

### Alternative: Using JWT Token (Short-lived)

If you prefer to use your session token (expires in ~1 hour):

1. Open browser developer tools (F12) on nucleate.dev
2. Go to Application > Local Storage > nucleate.dev
3. Find `sb-hfgjmwidcoszkmvejxhw-auth-token`
4. Parse the JSON and copy `access_token`

**Note:** JWT tokens expire frequently and are not recommended for automation.

## Configuration

### Claude Code

Add to your `~/.mcp.json`:

```json
{
  "mcpServers": {
    "nucleate": {
      "command": "npx",
      "args": ["@nucleate/mcp-server"],
      "env": {
        "NUCLEATE_AUTH_TOKEN": "nuc_your_api_key_here"
      }
    }
  }
}
```

### Hosted Version (SSE Transport)

For the hosted version at `mcp.nucleate.dev`:

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

## Available Tools

### Project Management

| Tool | Description |
|------|-------------|
| `nucleate_create_prototype` | Create a new prototype |
| `nucleate_get_prototype` | Get prototype details and viewing URL |
| `nucleate_delete_prototype` | Delete a prototype |
| `nucleate_clone_prototype` | Clone/fork an existing prototype |
| `nucleate_deploy_prototype` | Deploy to a public URL |
| `nucleate_check_deploy_slug` | Check if a deployment slug is available |

### Dev Server Control

| Tool | Description |
|------|-------------|
| `nucleate_start_dev_server` | Start the development server |
| `nucleate_get_dev_server_status` | Get current server status |
| `nucleate_get_viewing_url` | Get the preview URL |

### File Operations

| Tool | Description |
|------|-------------|
| `nucleate_list_files` | List all files in a prototype |
| `nucleate_read_file` | Read file contents |
| `nucleate_write_file` | Write/update a file |
| `nucleate_delete_file` | Delete a file |
| `nucleate_read_multiple_files` | Batch read multiple files |

## Usage Examples

### In Claude Code

Once configured, you can ask Claude Code to:

```
Create a new Nucleate prototype called "my-app" in team <team-id>
```

```
List all files in prototype <prototype-id>
```

```
Update the App.tsx file in prototype <prototype-id> to add a button
```

```
Start the dev server for prototype <prototype-id> and give me the preview URL
```

## API Key Scopes

API keys can be created with specific scopes to limit access:

| Scope | Description |
|-------|-------------|
| `prototypes:read` | Read prototype metadata |
| `prototypes:write` | Create, update, delete prototypes |
| `files:read` | Read file contents |
| `files:write` | Write and delete files |
| `dev-server:control` | Start/stop dev servers |

By default, API keys have all scopes enabled.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NUCLEATE_AUTH_TOKEN` | Your API key or JWT token (required) | - |
| `NUCLEATE_CONTROL_PLANE_URL` | Control plane URL (for self-hosting) | `https://control-plane.nucleate.dev` |

## API Key Management

### Create via API

```bash
curl -X POST https://control-plane.nucleate.dev/api-keys/create \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My CLI Key",
    "team_id": "<your-team-id>",
    "expires_in_days": 365
  }'
```

### List Keys

```bash
curl https://control-plane.nucleate.dev/api-keys/list \
  -H "Authorization: Bearer <your-jwt-token>"
```

### Revoke a Key

```bash
curl -X DELETE https://control-plane.nucleate.dev/api-keys/<key-id> \
  -H "Authorization: Bearer <your-jwt-token>"
```

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** or secret managers
3. **Create separate keys** for different use cases
4. **Set expiration dates** for keys that don't need to be permanent
5. **Revoke unused keys** regularly
6. **Use minimal scopes** when possible

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
NUCLEATE_AUTH_TOKEN=nuc_... node dist/server.js
```

## Troubleshooting

### "Invalid token" error

- Ensure your API key starts with `nuc_`
- Check that the key hasn't been revoked
- Verify the key hasn't expired

### "Access denied to this prototype" error

- Ensure your API key was created for the correct team
- Verify you have the required scopes (e.g., `files:write` for writing)

### Connection issues

- Check your internet connection
- Verify `NUCLEATE_CONTROL_PLANE_URL` is correct (if customized)

## License

MIT
