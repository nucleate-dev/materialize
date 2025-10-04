# Build Worker API Routes

This document provides a high-level overview of the API routes available in the build worker service.

## PublicApiService Routes

### POST /dev-server
**Purpose**: Start or update an Expo development server

**Inputs**:
- `prototype_id` (string) - Unique identifier for the prototype
- `framework` (string) - Framework type
- `files` (array) - Array of file objects with name and contents
- `assets` (array, optional) - Array of asset files
- `file_scope` (string) - Either "complete" (full project) or "updates" (incremental changes)
- `deleted_files` (array, optional) - Files to remove (for updates)

**Outputs**:
- `status` (string) - "success" or "error"
- `tunnel_url` (string, optional) - Public URL to access the dev server
- `build_errors` (array) - Any build/compilation errors
- `build_warnings` (array) - Any build warnings

**What it does**:
- For "complete" scope: Creates a new project directory, writes all files, installs dependencies, and starts the Expo dev server
- For "updates" scope: Updates specific files in an existing running dev server
- Returns a tunnel URL for accessing the live development server

---

### DELETE /dev-server
**Purpose**: Stop the running development server and trigger a production build

**Inputs**:
- Request body (optional configuration)

**Outputs**:
- `status` (string) - "success" or "error"
- `server_operation_status` (string) - Current operation state
- `server_status` (string) - Dev server status
- `prototypeId` (string, optional) - Associated prototype ID
- `version` (string, optional) - Built version number
- `build_errors` (array) - Any errors
- `build_warnings` (array) - Any warnings

**What it does**:
- Initiates a background build and deploy process
- Attempts to stop the dev server (returns error if already building/deploying)
- The actual shutdown happens after the build completes

---

### POST /dev-server/restart
**Purpose**: Restart the development server

**Inputs**: None (uses existing server state)

**Outputs**:
- `status` (string) - "success"

**What it does**:
- Kills the current Expo dev server process
- Restarts it with the same configuration and project files
- Useful after dependency changes

---

### POST /build-and-deploy
**Purpose**: Build and deploy a prototype to production

**Inputs**:
- `prototype_id` (string) - Unique identifier for the prototype
- `framework` (string) - Framework type

**Outputs**:
- `status` (string) - "success" or "error"
- `build_url` (string, optional) - URL where the built app is deployed
- `build_errors` (array) - Compilation/build errors
- `build_warnings` (array) - Build warnings
- `version` (string, optional) - Version number of the build

**What it does**:
- Reads files from the existing project directory (created by dev server)
- Runs Expo build process
- Uploads built files to S3
- Returns deployment URL

---

### POST /run-command
**Purpose**: Execute arbitrary commands in the project directory

**Inputs**:
- `command` (string) - Command to execute
- `args` (array, optional) - Command arguments
- `cwd` (string, optional) - Working directory
- `env` (object, optional) - Environment variables
- `timeout_ms` (number, optional) - Command timeout (default: 120000ms)

**Outputs**:
- `status` (string) - "success" or "error"
- `stdout` (string, optional) - Standard output
- `stderr` (string, optional) - Standard error
- `exit_code` (number, optional) - Process exit code
- `error` (string, optional) - Error message if failed

**What it does**:
- Executes shell commands in the project directory
- Captures and returns output
- Enforces timeout limits

---

### POST /allocate
**Purpose**: Allocate the worker to a specific prototype with scoped AWS credentials

**Inputs**:
- `accessKeyId` (string) - AWS access key
- `secretAccessKey` (string) - AWS secret key
- `sessionToken` (string) - AWS session token
- `prototypeId` (string) - Prototype to allocate to

**Outputs**:
- `status` (string) - "ok" or "error"
- `error` (string, optional) - Error message if failed
- `details` (string, optional) - Additional error details

**What it does**:
- Creates a scoped S3 client with provided temporary credentials
- Associates the worker with a specific prototype
- Required before other operations that need S3 access

---

## ExpoDevServerService (Internal Methods)

The ExpoDevServerService provides the core functionality used by the PublicApiService. Key internal capabilities include:

### Build & Deploy Pipeline
- **buildProjectCore()** - Builds an Expo project from files
- **deployProjectCore()** - Deploys built files to S3 with versioning
- **buildAndDeployProjectCore()** - Combined build and deploy operation

### File Management
- **updateDevServerFiles()** - Updates files in a running dev server
- Handles file additions, updates, and deletions
- Detects dependency changes and triggers reinstalls
- Monitors Metro bundler for compilation errors

### Process Management
- **startExpoProcess()** - Starts Expo dev server with tunnel
- **killExpoProcess()** - Stops running Expo processes
- **restartDevServer()** - Restarts dev server after changes
- **shutdown()** - Graceful shutdown of all services

### Error Monitoring
- Parses Metro bundler output for errors and warnings
- Detects TypeScript, JavaScript, and React errors
- Monitors npm/dependency installation issues

### S3 Operations
- Uploads to both versioned (`/v{timestamp}`) and latest (`/latest`) folders
- Manages cache headers for optimal CDN performance
- Handles file deletions and overwrites

---

## State Management

The service maintains state about:
- Current prototype being served
- Dev server status (STOPPED, STARTING, RUNNING, ERROR)
- Current operation (IDLE, BUILDING, DEPLOYING, UPDATING_FILES, etc.)
- Tunnel URL and port information
- Built version numbers

## Architecture Notes

- **Single Instance**: Each worker handles one prototype at a time
- **Fixed Directory**: Uses `/tmp/expo-dev/project` for all operations
- **Tunnel URLs**: Generates unique ngrok-based tunnel URLs for dev server access
- **Versioned Deploys**: All deployments are versioned with timestamps
- **Error Handling**: Comprehensive error parsing from Metro, npm, and TypeScript
