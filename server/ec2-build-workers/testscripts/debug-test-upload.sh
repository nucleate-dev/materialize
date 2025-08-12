#!/usr/bin/env bash

# Corrected test script for the build-and-deploy endpoint
# Usage: bash corrected-test-upload.sh

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

echo "Testing build-and-deploy endpoint with corrected multipart format"
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

# 1. Get files
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

# 2. Generate the manifest JSON
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

echo -e "\n📋 Manifest preview:"
echo "$MANIFEST_JSON" | jq '.'

# 3. Build curl command - FIXED VERSION
echo -e "\n🚀 Building curl command..."

# Start with basic args
CURL_CMD="curl -v -X POST"
CURL_CMD="$CURL_CMD -F 'prototypeId=$PROTOTYPE_ID'"
CURL_CMD="$CURL_CMD -F 'write_to_disk=true'" 
CURL_CMD="$CURL_CMD -F 'manifest=$MANIFEST_JSON'"

# Add files - the key fix is using filename as the ID
echo -e "\n📤 Adding files to curl command..."
for REL_FILE in "${RELATIVE_FILES[@]}"; do
    ABS_FILE="$TEST_PROJECT_DIR/$REL_FILE"
    
    # Verify file exists
    if [ ! -f "$ABS_FILE" ]; then
        echo "❌ ERROR: File $ABS_FILE does not exist"
        exit 1
    fi
    
    # CRITICAL FIX: Use the relative file path as the filename
    # The server will use part.filename as the ID when part.fields?.id?.value is not available
    CURL_CMD="$CURL_CMD -F 'files=@$ABS_FILE;filename=$REL_FILE'"
    echo "  ✓ Added: $REL_FILE"
done

# Add timeout options
CURL_CMD="$CURL_CMD --max-time 300 --connect-timeout 30 --fail-with-body"
CURL_CMD="$CURL_CMD '$SERVER_URL/build-and-deploy'"

echo -e "\n🔍 Full curl command:"
echo "$CURL_CMD"

echo -e "\n🚀 Starting build-and-deploy request..."
echo "📊 Request details:"
echo "  - Prototype ID: $PROTOTYPE_ID"
echo "  - Files to upload: ${#RELATIVE_FILES[@]}"
echo "  - Server: $SERVER_URL/build-and-deploy"
echo "  - Timeout: 5 minutes"

# Execute the request
echo -e "\n⏳ Uploading files and starting build process..."
START_TIME=$(date +%s)

# Execute using eval to handle the complex command properly
BUILD_DEPLOY_RESPONSE=$(eval "$CURL_CMD" 2>&1)
CURL_EXIT_CODE=$?

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo -e "\n📊 Request completed in ${DURATION} seconds"

# Check curl exit code
if [ $CURL_EXIT_CODE -ne 0 ]; then
    echo "❌ ERROR: curl failed with exit code $CURL_EXIT_CODE"
    echo "Curl output:"
    echo "$BUILD_DEPLOY_RESPONSE"
    exit 1
fi

# Extract JSON from curl verbose output
echo -e "\n📋 Processing response..."
JSON_RESPONSE=$(echo "$BUILD_DEPLOY_RESPONSE" | grep -E '^[{[]' | tail -1)

if [ -z "$JSON_RESPONSE" ]; then
    echo "❌ ERROR: No JSON response found in curl output"
    echo "Full curl output:"
    echo "$BUILD_DEPLOY_RESPONSE"
    exit 1
fi

echo -e "\n📋 Build-and-Deploy Response:"
if echo "$JSON_RESPONSE" | jq -e . >/dev/null 2>&1; then
    # Parse JSON response
    STATUS=$(echo "$JSON_RESPONSE" | jq -r '.status // "unknown"')
    
    case $STATUS in
        "completed")
            echo "🎉 SUCCESS: Build and deploy completed!"
            BUILD_URL=$(echo "$JSON_RESPONSE" | jq -r '.buildUrl // "N/A"')
            echo "🌐 Live URL: $BUILD_URL"
            ;;
        "build_failed")
            echo "❌ FAILURE: Build process failed"
            ERROR_DETAILS=$(echo "$JSON_RESPONSE" | jq -r '.details // "No details provided"')
            echo "💥 Error: $ERROR_DETAILS"
            ;;
        "partial_success")
            echo "⚠️  PARTIAL SUCCESS: Build completed but some S3 uploads failed"
            BUILD_URL=$(echo "$JSON_RESPONSE" | jq -r '.buildUrl // "N/A"')
            echo "🌐 Live URL: $BUILD_URL"
            ;;
        "failed")
            echo "❌ FAILURE: Request failed"
            ERROR_DETAILS=$(echo "$JSON_RESPONSE" | jq -r '.details // "No details provided"')
            echo "💥 Error: $ERROR_DETAILS"
            ;;
        *)
            echo "❓ UNKNOWN STATUS: $STATUS"
            ;;
    esac
    
    # Pretty print the full response
    echo -e "\n📋 Full Response:"
    echo "$JSON_RESPONSE" | jq .
else
    echo "❌ ERROR: Invalid JSON response"
    echo "Raw response:"
    echo "$JSON_RESPONSE"
    echo -e "\nFull curl output:"
    echo "$BUILD_DEPLOY_RESPONSE"
    exit 1
fi

echo -e "\n✅ Test completed!"