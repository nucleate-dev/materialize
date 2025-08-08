# Materialize Server - React Native Build Pipeline

This server provides a distributed build system for React Native projects with the following components:

## Architecture

1. **Control Plane** (`/dispatcher`): Manages worker pool and dispatches build requests
2. **Worker Nodes** (`/build`): Execute React Native Web builds using bun

## Setup

### Environment Variables

```bash
# Worker endpoints (comma-separated)
WORKER_ENDPOINTS=http://worker1.example.com:3001,http://worker2.example.com:3001

# Maximum concurrent builds per worker
MAX_CONCURRENT_BUILDS=3

# Standard Fastify config
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
```

### Installation

```bash
npm install
npm run dev  # Development
npm run build && npm start  # Production
```

## API Endpoints

### Control Plane Routes

#### POST `/dispatcher`
Dispatches a build request to an available worker.

**Request Body:**
```json
{
  "prototype_id": "my-project-123",
  "files": {
    "file1": {
      "path": "App.js",
      "content": "import React from 'react';\n..."
    },
    "file2": {
      "path": "package.json", 
      "content": "{\"name\": \"my-app\"...}"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "workerId": "worker-uuid-123",
  "buildId": "build-uuid-456",
  "message": "Build dispatched successfully"
}
```

#### GET `/dispatcher/status`
Get worker pool status.

#### POST `/dispatcher/workers`
Add a new worker to the pool.

#### DELETE `/dispatcher/workers/:workerId`
Remove a worker from the pool.

### Worker Node Routes

#### POST `/build`
Execute a React Native Web build.

**Request Body:** Same as dispatcher route

**Response:**
```json
{
  "success": true,
  "prototype_id": "my-project-123",
  "buildId": "build-uuid-456",
  "message": "Build completed successfully in 45000ms",
  "buildOutput": "Install output: ...\n\nBuild output: ..."
}
```

#### GET `/build/status/:prototype_id`
Check build status for a prototype.

#### DELETE `/build/cleanup/:prototype_id`
Clean up project files.

## File Structure

Projects are built in `/apps/[prototype_id]/` directory structure:

```
/apps/
  ├── project-123/
  │   ├── App.js
  │   ├── package.json
  │   └── ...other files
  └── project-456/
      ├── App.js
      └── ...
```

## Build Process

1. Files are written to `/apps/[prototype_id]/`
2. Dependencies installed with `bun install`
3. React Native Web build executed with `bun run build:web` or `npx webpack`
4. Build output captured and returned

## Usage Example

### Control Plane Setup
```javascript
// Start control plane server
npm run dev

// Add workers to pool
curl -X POST http://localhost:3001/dispatcher/workers \
  -H "Content-Type: application/json" \
  -d '{"endpoint": "http://worker1.amazonaws.com:3001", "maxConcurrentBuilds": 3}'
```

### Dispatch Build
```javascript
const response = await fetch('http://control-plane:3001/dispatcher', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prototype_id: 'my-react-native-app',
    files: {
      'app': {
        path: 'App.js',
        content: `import React from 'react';
export default function App() {
  return <div>Hello World</div>;
}`
      },
      'package': {
        path: 'package.json',
        content: JSON.stringify({
          name: 'my-app',
          dependencies: { 'react': '18.2.0', 'react-native-web': '~0.19.6' }
        })
      }
    }
  })
});
```

### Worker Node Setup
```javascript
// Worker nodes run the same server but only handle /build requests
npm run dev
```

## Deployment

### Control Plane (EC2)
- Single instance managing worker pool
- Handles `/dispatcher` routes
- Maintains worker health checks

### Worker Pool (Auto Scaling EC2)
- Multiple instances handling builds
- Each handles `/build` routes  
- Requires bun installation for React Native builds

## Health Checks

Workers are health checked every 5 minutes. Unhealthy workers are excluded from dispatch rotation.

## Error Handling

- Build timeouts: 10 minutes maximum
- Dependency install timeouts: 5 minutes maximum
- Failed builds return detailed error messages
- Worker failures trigger automatic retry on different worker