#!/usr/bin/env bash

# Improved test script for the build-and-deploy endpoint
# Usage: bash improved-test-upload.sh

# --- Pre-flight Check ---
if ! command -v jq &> /dev/null
then
    echo "ERROR: 'jq' is not installed, but is required by this script."
    exit 1
fi

# --- Configuration ---
PROTOTYPE_ID="test-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_PROJECT_DIR="$SCRIPT_DIR/../test"
SERVER_URL="http://localhost:3002"

echo "Testing build-and-deploy endpoint with improved error handling"
echo "Prototype ID: $PROTOTYPE_ID"
echo "Test Project Source: $TEST_PROJECT_DIR"
echo "Server URL: $SERVER_URL"

if [ ! -d "$TEST_PROJECT_DIR" ]; then
    echo "ERROR: Test project directory not found at '$TEST_PROJECT_DIR'"
    exit 1
fi

# Test server health first
echo -e "\n🏥 Testing server health..."
HEALTH_RESPONSE=$(curl -s --max-time 10 "$SERVER_URL/health")
if [ $? -ne 0 ]; then
    echo "❌ ERROR: Cannot connect to server at $SERVER_URL"
    echo "Make sure the server is running on port 3002"
    exit 1
fi

echo "✅ Server health check passed"
echo "$HEALTH_RESPONSE" | jq .

# Navigate to the test project directory
cd "$TEST_PROJECT_DIR"

# 1. Get files with ABSOLUTE paths so we can access them from anywhere
echo -e "\n📁 Finding files..."
mapfile -t RELATIVE_FILES < <(find . -type f \
    -not -path "./node_modules/*" \
    -not -path "./.expo/*" \
    -not -path "./dist/*" \
    -not -path "./.git/*" \
    -not -name "*.zip" \
    -not -name "*.tar.gz" \
    -not -name ".DS_Store" \
    | sed 's|^\./||' | sort)

echo "Found ${#RELATIVE_FILES[@]} files to process."

if [ ${#RELATIVE_FILES[@]} -eq 0 ]; then
    echo "❌ ERROR: No files found to upload"
    exit 1
fi

# Check for required files
if [ ! -f "package.json" ]; then
    echo "❌ ERROR: package.json not found in test project"
    exit 1
fi

# Create arrays for both relative paths (for manifest) and absolute paths (for curl)
ABSOLUTE_FILES=()
for REL_FILE in "${RELATIVE_FILES[@]}"; do
    ABS_FILE="$TEST_PROJECT_DIR/$REL_FILE"
    ABSOLUTE_FILES+=("$ABS_FILE")
    
    # Verify file exists and is readable
    if [ ! -f "$ABS_FILE" ]; then
        echo "❌ ERROR: File $ABS_FILE does not exist"
        exit 1
    fi
    
    # Check file size (warn if > 10MB)
    FILE_SIZE=$(wc -c < "$ABS_FILE")
    if [ $FILE_SIZE -gt 10485760 ]; then
        echo "⚠️  WARNING: Large file detected: $REL_FILE ($(($FILE_SIZE / 1024 / 1024))MB)"
    fi
    
    echo "  ✓ $REL_FILE -> $ABS_FILE ($(($FILE_SIZE / 1024))KB)"
done

# 2. Generate the manifest JSON using relative paths
echo -e "\n📋 Generating file manifest..."
MANIFEST_ENTRIES=""

for REL_FILE in "${RELATIVE_FILES[@]}"; do
    ID="$REL_FILE"
    FILE_PATH=$(dirname "$REL_FILE")
    [ "$FILE_PATH" == "." ] && FILE_PATH=""
    FILENAME=$(basename "$REL_FILE")

    ENTRY=$(jq -n \
      --arg id "$ID" \
      --arg path "$FILE_PATH" \
      --arg filename "$FILENAME" \
      '{id: $id, path: $path, filename: $filename}')

    [ -z "$MANIFEST_ENTRIES" ] && MANIFEST_ENTRIES="$ENTRY" || MANIFEST_ENTRIES="$MANIFEST_ENTRIES,$ENTRY"
done

MANIFEST_JSON="{\"files\":[$MANIFEST_ENTRIES]}"
echo "✅ Generated manifest for ${#RELATIVE_FILES[@]} files"

# Validate manifest JSON
if ! echo "$MANIFEST_JSON" | jq . > /dev/null; then
    echo "❌ ERROR: Invalid manifest JSON generated"
    exit 1
fi

# 3. Build curl command using absolute file paths
echo -e "\n🚀 Building curl command..."
CURL_ARGS=()
CURL_ARGS+=(-X POST)
CURL_ARGS+=(-F "prototypeId=$PROTOTYPE_ID")
CURL_ARGS+=(-F "write_to_disk=true")
CURL_ARGS+=(-F "manifest=$MANIFEST_JSON")

echo -e "\n📤 Adding files to curl command..."
for i in "${!RELATIVE_FILES[@]}"; do
    REL_FILE="${RELATIVE_FILES[$i]}"
    ABS_FILE="${ABSOLUTE_FILES[$i]}"
    
    # Verify file exists before adding to curl
    if [ -f "$ABS_FILE" ]; then
        # FIXED: Use the relative file path as the filename so the server can match it to manifest
        CURL_ARGS+=(-F "files=@$ABS_FILE;filename=$REL_FILE")
        echo "  ✓ Added: $REL_FILE"
    else
        echo "❌ ERROR: File $ABS_FILE does not exist!"
        exit 1
    fi
done

# Add timeout and connectivity options (remove retry to avoid multiple requests)
CURL_ARGS+=(--max-time 300)     # 5 minute timeout
CURL_ARGS+=(--connect-timeout 30) # 30 second connection timeout
CURL_ARGS+=(--fail-with-body)   # Return body even on HTTP error codes

echo -e "\n🚀 Starting build-and-deploy request..."
echo "📊 Request details:"
echo "  - Prototype ID: $PROTOTYPE_ID"
echo "  - Files to upload: ${#RELATIVE_FILES[@]}"
echo "  - Server: $SERVER_URL/build-and-deploy"
echo "  - Timeout: 5 minutes"

# Show progress
echo -e "\n⏳ Uploading files and starting build process..."
echo "   This may take several minutes depending on project size..."

# Debug: Show the curl command that will be executed
echo -e "\n🔍 Debug: Curl command preview:"
echo "curl -s --max-time 300 --retry 2 --retry-delay 5 \\"
echo "  -X POST \\"
echo "  -F 'prototypeId=$PROTOTYPE_ID' \\"
echo "  -F 'write_to_disk=true' \\"
echo "  -F 'manifest=<manifest_json>' \\"
for i in "${!RELATIVE_FILES[@]}"; do
    REL_FILE="${RELATIVE_FILES[$i]}"
    echo "  -F 'files=@${TEST_PROJECT_DIR}/${REL_FILE};filename=${REL_FILE}' \\"
done
echo "  '$SERVER_URL/build-and-deploy'"

# Execute the request with progress
START_TIME=$(date +%s)
BUILD_DEPLOY_RESPONSE=$(curl -s "${CURL_ARGS[@]}" "$SERVER_URL/build-and-deploy")
CURL_EXIT_CODE=$?
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo -e "\n📊 Request completed in ${DURATION} seconds"

# Check curl exit code
if [ $CURL_EXIT_CODE -ne 0 ]; then
    echo "❌ ERROR: curl failed with exit code $CURL_EXIT_CODE"
    case $CURL_EXIT_CODE in
        7) echo "   Connection refused - is the server running?" ;;
        28) echo "   Request timeout - build took too long" ;;
        *) echo "   See curl man page for error code meaning" ;;
    esac
    exit 1
fi

# Check if we got an empty response
if [ -z "$BUILD_DEPLOY_RESPONSE" ]; then
    echo "❌ ERROR: Got empty response from server"
    echo "   This might indicate:"
    echo "   1. Server timeout during processing"
    echo "   2. Server error without proper error response"
    echo "   3. Network issues"
    echo "   4. Server out of memory/disk space"
    exit 1
fi

echo -e "\n📋 Build-and-Deploy Response:"
if echo "$BUILD_DEPLOY_RESPONSE" | jq -e . >/dev/null 2>&1; then
    # Parse JSON response
    STATUS=$(echo "$BUILD_DEPLOY_RESPONSE" | jq -r '.status // "unknown"')
    
    case $STATUS in
        "completed")
            echo "🎉 SUCCESS: Build and deploy completed!"
            BUILD_URL=$(echo "$BUILD_DEPLOY_RESPONSE" | jq -r '.buildUrl // "N/A"')
            echo "🌐 Live URL: $BUILD_URL"
            
            # Show build log summary
            LOG_COUNT=$(echo "$BUILD_DEPLOY_RESPONSE" | jq '.buildLog | length')
            echo "📝 Build log entries: $LOG_COUNT"
            
            UPLOADED_COUNT=$(echo "$BUILD_DEPLOY_RESPONSE" | jq '.uploadedFiles | length')
            echo "☁️  Files uploaded to S3: $UPLOADED_COUNT"
            ;;
        "build_failed")
            echo "❌ FAILURE: Build process failed"
            ERROR_DETAILS=$(echo "$BUILD_DEPLOY_RESPONSE" | jq -r '.details // "No details provided"')
            echo "💥 Error: $ERROR_DETAILS"
            ;;
        "partial_success")
            echo "⚠️  PARTIAL SUCCESS: Build completed but some S3 uploads failed"
            BUILD_URL=$(echo "$BUILD_DEPLOY_RESPONSE" | jq -r '.buildUrl // "N/A"')
            echo "🌐 Live URL: $BUILD_URL"
            ;;
        "failed")
            echo "❌ FAILURE: Request failed"
            ERROR_DETAILS=$(echo "$BUILD_DEPLOY_RESPONSE" | jq -r '.details // "No details provided"')
            echo "💥 Error: $ERROR_DETAILS"
            ;;
        *)
            echo "❓ UNKNOWN STATUS: $STATUS"
            ;;
    esac
    
    # Pretty print the full response
    echo -e "\n📋 Full Response:"
    echo "$BUILD_DEPLOY_RESPONSE" | jq .
else
    echo "❌ ERROR: Received invalid JSON response"
    echo "Raw response:"
    echo "$BUILD_DEPLOY_RESPONSE"
    exit 1
fi

echo -e "\n✅ Test completed!"
echo "📁 If successful, files should be at:"
echo "   - Source files: ./prototypes/$PROTOTYPE_ID/files/"
echo "   - Build files: ./prototypes/$PROTOTYPE_ID/build/"

# Final health check
echo -e "\n🔍 Final server health check..."
curl -s "$SERVER_URL/health" | jq .