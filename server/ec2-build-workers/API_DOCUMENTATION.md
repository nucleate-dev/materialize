# Build Worker API Documentation

## Overview

The Build Worker is a Fastify-based microservice that handles Expo project builds, deployments, and development server management. It runs on EC2 instances and provides endpoints for building React Native/Expo projects and deploying them to S3, as well as managing development servers with tunnel access.

**Base URL**: `http://localhost:3002` (configurable via `PORT` environment variable)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3002` |
| `AWS_ACCESS_KEY_ID` | AWS access key for S3 operations | Required |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for S3 operations | Required |
| `AWS_REGION` | AWS region for S3 operations | `us-east-1` |
| `BUCKET_NAME` | S3 bucket for storing built files | `materialize-sites` |
| `PROTOTYPES_DIR` | Local directory for storing prototype files | `./prototypes` |
| `BUILD_TEMP_DIR` | Temporary directory for build operations | `~/build-worker/temp` |

## API Endpoints

### 1. Health Check

**Endpoint**: `GET /health`

**Description**: Simple health check endpoint to verify service status.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 2. Build and Deploy

**Endpoint**: `POST /build-and-deploy`

**Description**: Builds an Expo project from uploaded source code and deploys it to S3. Optionally saves source files to local disk.

**Content-Type**: `multipart/form-data`

**Request Parameters**:
- `prototypeId` (string, required): Unique identifier for the prototype
- `write_to_disk` (boolean, optional): Whether to save source files locally (default: `true`)
- `files` (file, required): ZIP file containing the project source code

**Request Example**:
```bash
curl -X POST http://localhost:3002/build-and-deploy \
  -F "prototypeId=my-prototype-123" \
  -F "write_to_disk=true" \
  -F "files=@project.zip"
```

**Success Response** (200):
```json
{
  "jobId": "uuid-string",
  "prototypeId": "my-prototype-123",
  "status": "completed",
  "message": "Build and deploy completed successfully. 45 files uploaded.",
  "buildUrl": "https://materialize-sites.s3.amazonaws.com/my-prototype-123/dist/index.html",
  "buildLog": [
    {
      "step": "Create build directory",
      "success": true,
      "timestamp": "2024-01-01T00:00:00.000Z",
      "output": "Created: /path/to/build-dir",
      "error": ""
    }
  ],
  "buildSuccess": true,
  "uploadedFiles": [
    {
      "key": "my-prototype-123/dist/index.html",
      "location": "https://materialize-sites.s3.amazonaws.com/my-prototype-123/dist/index.html"
    }
  ],
  "localBuildPath": "/path/to/local/build",
  "localBuildUrl": "file:///path/to/local/build/index.html"
}
```

**Build Failure Response** (500):
```json
{
  "jobId": "uuid-string",
  "prototypeId": "my-prototype-123",
  "status": "build_failed",
  "error": "Build process failed",
  "details": "Error message details",
  "buildLog": [...],
  "buildFailed": true
}
```

**Partial Success Response** (207):
```json
{
  "jobId": "uuid-string",
  "prototypeId": "my-prototype-123",
  "status": "partial_success",
  "error": "Some files failed to upload to S3",
  "failedUploads": [...],
  "buildLog": [...],
  "buildSuccess": true,
  "uploadedFiles": [...],
  "message": "Build completed but S3 upload partially failed: 40 uploaded, 5 failed",
  "buildUrl": "https://materialize-sites.s3.amazonaws.com/my-prototype-123/dist/index.html"
}
```

**Error Response** (500):
```json
{
  "jobId": "uuid-string",
  "prototypeId": "unknown",
  "status": "failed",
  "error": "Build and deploy failed",
  "details": "Error message details",
  "stack": "Error stack trace"
}
```

---

### 3. Start Development Server

**Endpoint**: `POST /dev-server`

**Description**: Starts an Expo development server with tunnel access for a prototype project.

**Content-Type**: `multipart/form-data`

**Request Parameters**:
- `prototypeId` (string, required): Unique identifier for the prototype
- `port` (number, optional): Port for the dev server (default: `19006`)
- `files` (file, required): ZIP file containing the project source code

**Request Example**:
```bash
curl -X POST http://localhost:3002/dev-server \
  -F "prototypeId=my-prototype-123" \
  -F "port=19006" \
  -F "files=@project.zip"
```

**Success Response** (200):
```json
{
  "jobId": "uuid-string",
  "prototypeId": "my-prototype-123",
  "status": "started",
  "tunnelUrl": "https://my-prototype-123.ngrok.io",
  "message": "Dev server started successfully",
  "startTime": "2024-01-01T00:00:00.000Z"
}
```

**Conflict Response** (409):
```json
{
  "error": "Dev server already running for this prototype",
  "prototypeId": "my-prototype-123",
  "existingServer": {
    "prototypeId": "my-prototype-123",
    "jobId": "existing-job-id",
    "tunnelUrl": "https://existing-tunnel.ngrok.io",
    "startTime": "2024-01-01T00:00:00.000Z",
    "status": "running"
  }
}
```

**Error Response** (500):
```json
{
  "jobId": "uuid-string",
  "prototypeId": "my-prototype-123",
  "status": "failed",
  "error": "Failed to start dev server",
  "details": "Error message details"
}
```

---

### 4. Stop Development Server (by Prototype ID)

**Endpoint**: `DELETE /dev-server/:prototypeId`

**Description**: Stops a running development server for a specific prototype.

**Path Parameters**:
- `prototypeId` (string): Unique identifier for the prototype

**Request Example**:
```bash
curl -X DELETE http://localhost:3002/dev-server/my-prototype-123
```

**Success Response** (200):
```json
{
  "prototypeId": "my-prototype-123",
  "status": "stopped",
  "message": "Dev server stopped successfully"
}
```

**Not Found Response** (404):
```json
{
  "error": "No dev server running for this prototype",
  "prototypeId": "my-prototype-123"
}
```

**Error Response** (500):
```json
{
  "error": "Failed to stop dev server",
  "details": "Error message details"
}
```

---

### 5. Stop Development Server (by Port)

**Endpoint**: `DELETE /dev-server/port/:port`

**Description**: Stops a running development server by port number.

**Path Parameters**:
- `port` (string): Port number the dev server is running on

**Request Example**:
```bash
curl -X DELETE http://localhost:3002/dev-server/port/19006
```

**Success Response** (200):
```json
{
  "prototypeId": "my-prototype-123",
  "port": 19006,
  "status": "stopped",
  "message": "Dev server stopped successfully by port number"
}
```

**Bad Request Response** (400):
```json
{
  "error": "Invalid port number",
  "port": "invalid-port"
}
```

**Not Found Response** (404):
```json
{
  "error": "No dev server running on the specified port",
  "port": 19006
}
```

**Error Response** (500):
```json
{
  "error": "Failed to stop dev server",
  "details": "Error message details"
}
```

---

### 6. List Development Servers

**Endpoint**: `GET /dev-servers`

**Description**: Returns a list of all currently running development servers.

**Request Example**:
```bash
curl http://localhost:3002/dev-servers
```

**Success Response** (200):
```json
{
  "runningServers": [
    {
      "prototypeId": "my-prototype-123",
      "jobId": "uuid-string",
      "tunnelUrl": "https://my-prototype-123.ngrok.io",
      "startTime": "2024-01-01T00:00:00.000Z",
      "status": "running"
    }
  ],
  "count": 1
}
```

---

## Data Models

### BuildLogEntry
```typescript
interface BuildLogEntry {
  step: string;           // Name of the build step
  success: boolean;        // Whether the step succeeded
  timestamp: string;       // ISO timestamp of the step
  output: string;          // Standard output from the step
  error: string;           // Error output from the step
}
```

### BuildResult
```typescript
interface BuildResult {
  outputPath: string;      // Path to the built files
  buildLog: BuildLogEntry[]; // Array of build step logs
  success: true;           // Always true for successful builds
}
```

### DevServerInfo
```typescript
interface DevServerInfo {
  prototypeId: string;     // Unique identifier for the prototype
  jobId: string;           // Unique job identifier
  process: ChildProcess;   // Node.js child process
  projectDir: string;      // Directory containing the project
  tempDir: string;         // Temporary directory for the project
  tunnelUrl: string | null; // URL for the tunnel access
  startTime: Date;         // When the server was started
  logs: string[];          // Array of log messages
}
```

### FailedUpload
```typescript
interface FailedUpload {
  path?: string;           // Local file path
  key?: string;            // S3 object key
  filename?: string;       // Name of the file
  error: string;           // Error message
}
```

---

## Error Handling

The API uses standard HTTP status codes and returns detailed error information:

- **200**: Success
- **207**: Partial success (some operations failed)
- **400**: Bad request (missing parameters, invalid file type)
- **404**: Not found (resource doesn't exist)
- **409**: Conflict (resource already exists)
- **500**: Internal server error

All error responses include:
- `error`: Human-readable error message
- `details`: Technical error details
- `status`: Status of the operation
- `jobId`: Unique identifier for tracking (when applicable)

---

## Build Process

The build process follows these steps:

1. **File Upload**: Accepts ZIP file containing project source code
2. **Extraction**: Extracts ZIP to temporary directory
3. **Dependency Installation**: Runs `bun install` to install dependencies
4. **Build**: Executes `bunx expo export --platform web`
5. **Upload**: Uploads built files to S3 bucket
6. **Cleanup**: Removes temporary files and directories

---

## Development Server Management

Development servers are managed with the following features:

- **Tunnel Access**: Uses Expo's tunnel feature for external access
- **Port Management**: Configurable ports with automatic conflict detection
- **Process Monitoring**: Tracks running processes and cleanup on exit
- **Automatic Cleanup**: Removes temporary files when servers stop

---

## Security Considerations

- All file uploads are validated for ZIP format
- Temporary files are automatically cleaned up
- Process isolation for each build/dev server
- Environment variable configuration for AWS credentials

---

## Performance Notes

- Build operations have a 5-minute timeout for dependency installation
- Automatic cleanup runs every 30 minutes
- Temporary files older than 2 hours are automatically removed
- Disk space is checked before builds (requires minimum 500MB available)

---

## Monitoring and Logging

The service provides comprehensive logging:
- Build step logs with timestamps
- Process output capture
- Error tracking with stack traces
- Job ID tracking for all operations
- Automatic cleanup logging

---

## Dependencies

The service requires the following tools to be available:
- **Bun**: For package management and execution
- **Expo CLI**: For building and development server management
- **@expo/ngrok**: For tunnel functionality
- **AWS SDK**: For S3 operations
- **unzipper**: For ZIP file extraction 