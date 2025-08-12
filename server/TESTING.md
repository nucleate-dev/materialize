# Testing Guide

This guide explains how to test the React Native Web build service using the provided test scripts. The service uses **array-of-files uploads** for efficient file handling.

## Overview

The build service has two main components:
1. **Control Plane** (`control-plane/`) - Routes requests to workers
2. **EC2 Build Workers** (`ec2-build-workers/`) - Actually build and deploy the apps

The service uses **Array-of-Files Mode**: Individual files with manifest for secure and efficient uploads.

## Control Plane Testing

The control plane dispatcher routes requests to available EC2 workers.

### Test Script: `control-plane/test-dispatcher-ec2.sh`

**Location**: `/control-plane/test-dispatcher-ec2.sh`

#### Usage Examples:

```bash
# Test localhost (default)
bash test-dispatcher-ec2.sh

# Test EC2 control plane
bash test-dispatcher-ec2.sh 3.84.123.45

# Test worker directly (bypasses dispatcher)
DIRECT_WORKER=10.0.1.100 bash test-dispatcher-ec2.sh
```

#### What It Tests:
- Finds individual files and uploads with manifest
- Validates response format and build URL
- Tests dispatcher routing to least-loaded worker

#### Expected Output:
```
Testing DispatcherService locally at: http://localhost:3000/dispatch
Prototype ID: test-dispatcher-1234567890

Found 15 files to upload:
  - package.json (id: file0)
  - app.json (id: file1)
  - app/_layout.tsx (id: file2)
  ...

✅ SUCCESS: Request completed successfully!
🔗 Build URL found in response
   https://materialize-sites.s3.amazonaws.com/test-dispatcher-1234567890/dist/index.html
```

## EC2 Build Worker Testing

The build workers handle the actual building and deployment.

### Test Scripts in `ec2-build-workers/testscripts/`

#### 1. Build and Deploy Test: `test-build-and-deploy.sh`

**Purpose**: Tests the `/build-and-deploy` endpoint that builds and uploads to S3.

```bash
# Test build and deploy
bash testscripts/test-build-and-deploy.sh
```

**What it does**:
- Uploads individual files with manifest
- Runs full build process (npm install + expo export)
- Uploads build output to S3
- Returns build URL for iframe viewing

**Expected Output**:
```
Testing build-and-deploy endpoint with prototype ID: test-build-deploy-1234567890

Preparing to upload 13 files using array-of-files mode...
Generated manifest:
{"files":[{"id":"file0","filename":"package.json"},{"id":"file1","filename":"app.json"},...]}

HTTP Status Code: 200

✅ SUCCESS: Request completed successfully!
🔗 Build URL found in response
   https://materialize-sites.s3.amazonaws.com/test-build-deploy-1234567890/dist/index.html
```

#### 2. Dev Server Test: `test-dev-server.sh`

**Purpose**: Tests the `/dev-server` endpoint that starts hot-reloading development servers.

```bash
# Test dev server
bash testscripts/test-dev-server.sh

# Test with custom port
bash testscripts/test-dev-server.sh --port 8081
```

**What it does**:
- Uploads project files and starts Expo dev server
- Creates ngrok tunnel for external access
- Returns tunnel URL for live development
- Supports hot reloading for enterprise users

**Expected Output**:
```
Testing dev-server endpoint with prototype ID: test-dev-server-1234567890
Dev port: 19006

Preparing to upload 13 files using array-of-files mode...

✅ SUCCESS: Dev server started successfully!
🌐 Tunnel URL found in response
   https://test-dev-server-1234.ngrok.io

📱 You can now access your React Native app at the tunnel URL above
🛑 Don't forget to stop the dev server when done:
   curl -X DELETE http://localhost:3002/dev-server/test-dev-server-1234567890
```

## Array-of-Files Format

The array-of-files format uses multipart form data with:

### Form Fields:
- `prototypeId`: Unique identifier for the build
- `writeToDisk`: Whether to save to local disk (build-and-deploy only)
- `port`: Dev server port (dev-server only)
- `manifest`: JSON describing file structure
- `files`: Multiple file parts with IDs matching manifest

### Manifest Format:
```json
{
  "files": [
    {"id": "file0", "filename": "package.json"},
    {"id": "file1", "path": "app", "filename": "index.tsx"},
    {"id": "file2", "path": "components", "filename": "Button.tsx"}
  ]
}
```

### Security Features:
- Path sanitization prevents `../` directory traversal
- Validates manifest structure before processing
- Limits file types and sizes

## Testing Different Scenarios

### 1. Free User Flow (Build Only)
```bash
# Control plane test with build-only
bash test-dispatcher-ec2.sh
# Should return S3 URL for static hosting
```

### 2. Enterprise User Flow (Hot Reload)
```bash
# Test dev server startup
bash testscripts/test-dev-server.sh

# Test dev server shutdown (builds and deploys before stopping)
curl -X DELETE http://localhost:3002/dev-server/PROTOTYPE_ID
```

### 3. Load Testing
```bash
# Test multiple concurrent builds
for i in {1..5}; do
  bash testscripts/test-build-and-deploy.sh &
done
wait
```

### 4. Error Testing
```bash
# Test invalid manifest
curl -X POST http://localhost:3002/build-and-deploy \
  -F "prototypeId=test-error" \
  -F "manifest={invalid-json}" \
  -F "files=@package.json"

# Test missing prototypeId
curl -X POST http://localhost:3002/build-and-deploy \
  -F "manifest={\"files\":[]}"
```

## Prerequisites

Before running tests, ensure:

1. **Local Environment**:
   - Node.js 18+ installed
   - Control plane server running on port 3000
   - Build worker server running on port 3002

2. **AWS Configuration**:
   - AWS credentials configured
   - S3 bucket `materialize-sites` exists
   - ElastiCache Redis cluster running (for control plane)

3. **Test Files**:
   - Valid React Native project in `control-plane/test/`
   - Test files in `ec2-build-workers/testscripts/` directory

## Troubleshooting

### Common Issues:

**"No valid file array provided"**
- Check that test files exist in the expected directories
- Verify manifest JSON is valid
- Ensure file IDs in manifest match uploaded files

**"Build process failed"**
- Check that test project has valid `package.json` and `app.json`
- Verify npm dependencies can be installed
- Check disk space on build worker

**"Timeout waiting for tunnel URL"** (dev-server)
- Ensure ngrok is installed and accessible
- Check that the specified port is available
- Verify network connectivity for tunnel creation

### Debug Mode:
Add `-v` flag to curl commands in test scripts for verbose output:
```bash
# Edit test script to add verbose flag
curl -v -X POST http://localhost:3002/build-and-deploy ...
```

## Success Criteria

A successful test should:
1. Return HTTP 200 status code
2. Include valid build URL in response
3. Upload files appear in S3 bucket (for build-and-deploy)
4. Tunnel URL is accessible (for dev-server)
5. No error messages in server logs

## Next Steps

After successful testing:
1. Verify build output loads correctly in browser
2. Test iframe embedding of build URLs
3. Validate hot-reload functionality for dev servers
4. Monitor resource usage during builds
5. Test cleanup and garbage collection