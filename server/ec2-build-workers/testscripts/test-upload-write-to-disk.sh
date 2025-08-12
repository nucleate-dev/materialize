#!/bin/bash

# Test script for the build-and-deploy endpoint with a file array and manifest.
# This script sends individual files instead of a single zip archive.
#
# DEPENDENCY: This script requires 'jq' to be installed for JSON manipulation.
# (e.g., 'sudo apt-get install jq' or 'brew install jq')
#
# Usage: bash test-upload-write-to-disk.sh

# --- Pre-flight Check ---
if ! command -v jq &> /dev/null
then
    echo "ERROR: 'jq' is not installed, but is required by this script."
    echo "Please install it (e.g., 'sudo apt-get install jq' or 'brew install jq') and try again."
    exit 1
fi

# --- Configuration ---
PROTOTYPE_ID="test-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_PROJECT_DIR="$SCRIPT_DIR/../test" # Assumes a 'test' directory with the project source

echo "Testing build-and-deploy endpoint with file array and write_to_disk=true"
echo "Prototype ID: $PROTOTYPE_ID"
echo "Test Project Source: $TEST_PROJECT_DIR"

if [ ! -d "$TEST_PROJECT_DIR" ]; then
    echo "ERROR: Test project directory not found at '$TEST_PROJECT_DIR'"
    exit 1
fi

# --- Main Logic ---

# Navigate to the test project directory to get relative paths
cd "$TEST_PROJECT_DIR"

# 1. Generate the manifest JSON
echo "Generating file manifest..."
MANIFEST_ENTRIES=""

# Find all files, excluding specified patterns, and process them
# The 'while read' loop is safer for filenames with spaces
while IFS= read -r FILE; do
    # Use the relative path as the unique ID, as required by the server
    ID="$FILE"
    # Get the directory path; handle files in the root directory
    FILE_PATH=$(dirname "$FILE")
    [ "$FILE_PATH" == "." ] && FILE_PATH=""
    # Get the filename
    FILENAME=$(basename "$FILE")

    # Create a JSON object for the file using jq for safe escaping
    ENTRY=$(jq -n \
      --arg id "$ID" \
      --arg path "$FILE_PATH" \
      --arg filename "$FILENAME" \
      '{id: $id, path: $path, filename: $filename}')

    # Append the entry to our list, adding a comma if it's not the first one
    [ -z "$MANIFEST_ENTRIES" ] && MANIFEST_ENTRIES="$ENTRY" || MANIFEST_ENTRIES="$MANIFEST_ENTRIES,$ENTRY"
done < <(find . -type f -not -path "./node_modules/*" -not -path "./.expo/*" -not -path "./dist/*" -not -name "*.zip" | sed 's|^\./||')

# Construct the final manifest JSON string
MANIFEST_JSON="{\"files\":[$MANIFEST_ENTRIES]}"
echo "Manifest generated for $(echo "$MANIFEST_ENTRIES" | grep -o '{' | wc -l) files."

# 2. Build the curl command arguments dynamically
echo -e "\nBuilding curl command..."
CURL_ARGS=()
CURL_ARGS+=(-F "prototypeId=$PROTOTYPE_ID")
CURL_ARGS+=(-F "write_to_disk=true")
CURL_ARGS+=(-F "manifest=$MANIFEST_JSON")

# Add each file to the curl arguments array
while IFS= read -r FILE; do
    ID="$FILE"
    # The format 'files=@<filepath>;id=<id>' attaches the ID to the multipart file part
    CURL_ARGS+=(-F "files=@$FILE;id=$ID")
done < <(find . -type f -not -path "./node_modules/*" -not -path "./.expo/*" -not -path "./dist/*" -not -name "*.zip" | sed 's|^\./||')


# Return to the original script directory before making the call
cd "$SCRIPT_DIR"

# 3. Test the build-and-deploy endpoint
echo -e "\nTesting build-and-deploy endpoint..."
# Use process substitution to pass arguments safely, and add --verbose for debugging if needed
BUILD_DEPLOY_RESPONSE=$(curl -s -X POST http://localhost:3002/build-and-deploy "${CURL_ARGS[@]}")

echo "Build-and-Deploy Response:"
# Pipe to jq for pretty printing if the response is JSON
if jq -e . >/dev/null 2>&1 <<<"$BUILD_DEPLOY_RESPONSE"; then
  echo "$BUILD_DEPLOY_RESPONSE" | jq .
else
  echo "$BUILD_DEPLOY_RESPONSE"
fi

echo -e "\n\nTesting health endpoint..."
# Test health endpoint
curl -s http://localhost:3002/health | jq .

echo -e "\n\nDone! Process completed:"
echo "✅ Sent file array with manifest"
echo "✅ Server should have built the project"
echo "✅ Server should have uploaded built files to S3"
echo "✅ Server should have saved files locally because write_to_disk=true"
echo ""
echo "Files should be saved locally at (relative to where the server is running):"
echo "- Source files: ./prototypes/$PROTOTYPE_ID/files/"
echo "- Build files: ./prototypes/$PROTOTYPE_ID/build/"

# 4. Check if local files were created (relative to the project root where worker.ts runs)
PROTOTYPES_PATH="./prototypes/$PROTOTYPE_ID" # Assuming the script is run from the same level as the 'prototypes' dir
if [ -d "$PROTOTYPES_PATH" ]; then
    echo -e "\n✅ Local prototype directory created:"
    ls -l "$PROTOTYPES_PATH/"

    if [ -d "$PROTOTYPES_PATH/files" ]; then
        echo -e "\n📁 Source files directory content:"
        ls -l "$PROTOTYPES_PATH/files/"
    else
        echo -e "\n❌ Source files directory not found at $PROTOTYPES_PATH/files"
    fi

    if [ -d "$PROTOTYPES_PATH/build" ]; then
        echo -e "\n🏗️  Build files directory content:"
        ls -l "$PROTOTYPES_PATH/build/"
    else
        echo -e "\n❌ Build files directory not found at $PROTOTYPES_PATH/build"
    fi
else
    echo -e "\n❌ No local prototype directory found at '$PROTOTYPES_PATH'"
fi

echo -e "\nCleanup complete. No temporary files were created."