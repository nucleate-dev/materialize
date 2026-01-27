# @nucleate/mcp-core

Core library for the Nucleate MCP server. Contains shared API client and tool definitions.

## Installation

```bash
npm install @nucleate/mcp-core
```

## Usage

### API Client

```typescript
import { NucleateApiClient } from '@nucleate/mcp-core';

const client = new NucleateApiClient({
  baseUrl: 'https://control-plane.nucleate.dev',
  authToken: 'nuc_your_api_key_here',
});

// List files in a prototype
const files = await client.listFiles('prototype-id');

// Read a file
const content = await client.readFile('prototype-id', 'src/App.tsx');

// Write a file
await client.writeFile('prototype-id', 'src/App.tsx', 'new content');
```

### Tool Definitions

```typescript
import { allTools, getToolByName } from '@nucleate/mcp-core';

// Get all tool definitions
console.log(allTools.map(t => t.name));

// Get a specific tool
const tool = getToolByName('nucleate_list_files');
```

## Available Tools

### Project Management
- `nucleate_create_prototype` - Create a new prototype
- `nucleate_get_prototype` - Get prototype details
- `nucleate_delete_prototype` - Delete a prototype
- `nucleate_clone_prototype` - Clone/fork a prototype
- `nucleate_deploy_prototype` - Deploy to public URL
- `nucleate_check_deploy_slug` - Check slug availability

### Dev Server
- `nucleate_start_dev_server` - Start dev server
- `nucleate_get_dev_server_status` - Get server status
- `nucleate_get_viewing_url` - Get preview URL

### File Operations
- `nucleate_list_files` - List all files
- `nucleate_read_file` - Read file contents
- `nucleate_write_file` - Write/update file
- `nucleate_delete_file` - Delete file
- `nucleate_read_multiple_files` - Batch read files

## API Client Methods

### Prototype Management

```typescript
client.createPrototype(params)
client.deletePrototype(prototypeId)
client.fetchViewingUrl(params)
```

### Dev Server

```typescript
client.startDevServer(params)
```

### Deployment

```typescript
client.checkDeploySlug(slug)
client.deployPrototype(params)
```

### File Operations

```typescript
client.listFiles(prototypeId)
client.readFile(prototypeId, filePath)
client.writeFile(prototypeId, filePath, content)
client.deleteFile(prototypeId, filePath)
client.readMultipleFiles(prototypeId, filePaths)
```

## Exports

```typescript
// API Client
export { NucleateApiClient, NucleateApiClientConfig } from './api-client';

// Tools
export { allTools, getToolByName, toolNames } from './tools';
export { projectManagementTools } from './tools/project-management';
export { devServerTools } from './tools/dev-server';
export { fileOperationTools } from './tools/file-operations';

// Constants
export { NUCLEATE_CONTROL_PLANE_URL } from './index';
```
