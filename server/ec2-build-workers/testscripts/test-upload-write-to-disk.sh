#!/usr/bin/env bash

# Fixed test script for the build-and-deploy endpoint
# Usage: bash fixed-test-upload.sh

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

echo "Testing build-and-deploy endpoint with file array and write_to_disk=true"
echo "Prototype ID: $PROTOTYPE_ID"
echo "Test Project Source: $TEST_PROJECT_DIR"

if [ ! -d "$TEST_PROJECT_DIR" ]; then
    echo "ERROR: Test project directory not found at '$TEST_PROJECT_DIR'"
    exit 1
fi

# Navigate to the test project directory
cd "$TEST_PROJECT_DIR"

# 1. Get files with ABSOLUTE paths so we can access them from anywhere
echo "Finding files..."
mapfile -t RELATIVE_FILES < <(find . -type f -not -path "./node_modules/*" -not -path "./.expo/*" -not -path "./dist/*" -not -name "*.zip" | sed 's|^\./||')
echo "Found ${#RELATIVE_FILES[@]} files to process."

# Create arrays for both relative paths (for manifest) and absolute paths (for curl)
ABSOLUTE_FILES=()
for REL_FILE in "${RELATIVE_FILES[@]}"; do
    ABS_FILE="$TEST_PROJECT_DIR/$REL_FILE"
    ABSOLUTE_FILES+=("$ABS_FILE")
    echo "File: $REL_FILE -> $ABS_FILE"
done

# 2. Generate the manifest JSON using relative paths
echo -e "\nGenerating file manifest..."
MANIFEST_ENTRIES=""

for REL_FILE in "${RELATIVE_FILES[@]}"; do
    ID="$REL_FILE"
    FILE_PATH=$(dirname "$REL_FILE")
    [ "$FILE_PATH" == "." ] && FILE_PATH=""
    FILENAME=$(basename "$REL_FILE")

    echo "Manifest entry: ID=$ID, Path='$FILE_PATH', Filename=$FILENAME"

    ENTRY=$(jq -n \
      --arg id "$ID" \
      --arg path "$FILE_PATH" \
      --arg filename "$FILENAME" \
      '{id: $id, path: $path, filename: $filename}')

    [ -z "$MANIFEST_ENTRIES" ] && MANIFEST_ENTRIES="$ENTRY" || MANIFEST_ENTRIES="$MANIFEST_ENTRIES,$ENTRY"
done

MANIFEST_JSON="{\"files\":[$MANIFEST_ENTRIES]}"
echo -e "\nManifest JSON:"
echo "$MANIFEST_JSON" | jq .

# 3. Build curl command using absolute file paths
echo -e "\nBuilding curl command..."
CURL_ARGS=()
CURL_ARGS+=(-F "prototypeId=$PROTOTYPE_ID")
CURL_ARGS+=(-F "write_to_disk=true")
CURL_ARGS+=(-F "manifest=$MANIFEST_JSON")

echo -e "\nAdding files to curl command (with absolute paths)..."
for i in "${!RELATIVE_FILES[@]}"; do
    REL_FILE="${RELATIVE_FILES[$i]}"
    ABS_FILE="${ABSOLUTE_FILES[$i]}"
    
    echo "Adding file: $REL_FILE (from $ABS_FILE)"
    
    # Verify file exists before adding to curl
    if [ -f "$ABS_FILE" ]; then
        FILE_SIZE=$(wc -c < "$ABS_FILE")
        echo "  File size: $FILE_SIZE bytes"
        # Use relative file path as the filename for the server
        CURL_ARGS+=(-F "files=@$ABS_FILE;filename=$REL_FILE")
    else
        echo "  ERROR: File $ABS_FILE does not exist!"
        exit 1
    fi
done

# We can now run curl from any directory since we're using absolute paths
echo -e "\nTesting build-and-deploy endpoint..."
echo "Current directory: $(pwd)"
echo "Curl will read files using absolute paths"

# Test with timeout
BUILD_DEPLOY_RESPONSE=$(curl -s --max-time 120 -X POST http://localhost:3002/build-and-deploy "${CURL_ARGS[@]}")

echo "Build-and-Deploy Response:"
if jq -e . >/dev/null 2>&1 <<<"$BUILD_DEPLOY_RESPONSE"; then
  echo "$BUILD_DEPLOY_RESPONSE" | jq .
else
  echo "$BUILD_DEPLOY_RESPONSE"
fi

# Check if we got an empty response
if [ -z "$BUILD_DEPLOY_RESPONSE" ]; then
    echo "WARNING: Got empty response from server. This might indicate:"
    echo "1. Server timeout during processing"
    echo "2. Server error without proper error response"
    echo "3. Network issues"
    echo ""
    echo "Try checking the server logs for more details."
fi

echo -e "\n\nTesting health endpoint..."
curl -s http://localhost:3002/health | jq .

echo -e "\n\nDone! If successful, files should be at:"
echo "- Source files: ./prototypes/$PROTOTYPE_ID/files/"
echo "- Build files: ./prototypes/$PROTOTYPE_ID/build/"