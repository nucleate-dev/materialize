#!/bin/bash

# Test script for the new build-and-deploy endpoint with write_to_disk enabled
# Usage: bash test-upload-write-to-disk.sh

PROTOTYPE_ID="test-prototype-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_FILE="$SCRIPT_DIR/test-project.zip"

echo "Testing build-and-deploy endpoint with write_to_disk enabled"
echo "Prototype ID: $PROTOTYPE_ID"

# Create zip file of the test project (excluding the test script itself and any existing zip)
echo "Creating zip file of test project..."
cd "$SCRIPT_DIR"
zip -r test-project.zip . -x "test-upload*.sh" "*.zip" "README.md"

echo "Zip file created with the following contents:"
unzip -l test-project.zip

# Test the build-and-deploy endpoint with the zip file and write_to_disk enabled
echo -e "\n\nTesting build-and-deploy endpoint with write_to_disk=true..."
BUILD_DEPLOY_RESPONSE=$(curl -s -X POST http://localhost:3002/build-and-deploy \
  -F "prototypeId=$PROTOTYPE_ID" \
  -F "write_to_disk=true" \
  -F "files=@test-project.zip")

echo "Build-and-Deploy Response:"
echo $BUILD_DEPLOY_RESPONSE

echo -e "\n\nTesting health endpoint..."

# Test health endpoint
curl -s http://localhost:3002/health

echo -e "\n\nDone! Single endpoint completed the entire process:"
echo "✅ Extracted files"
echo "✅ Built project with Expo"
echo "✅ Uploaded ONLY built files to S3"
echo "✅ Saved files locally (if write_to_disk=true)"
echo ""
echo "Files should be saved locally at:"
echo "- Source files: ./prototypes/$PROTOTYPE_ID/files/"
echo "- Build files: ./prototypes/$PROTOTYPE_ID/build/"
echo "- S3 build URL: Check response above for buildUrl"

# Check if local files were created (relative to the project root where worker.ts runs)
PROTOTYPES_PATH="../prototypes/$PROTOTYPE_ID"
if [ -d "$PROTOTYPES_PATH" ]; then
    echo -e "\n✅ Local prototype directory created:"
    ls -la "$PROTOTYPES_PATH/"
    
    if [ -d "$PROTOTYPES_PATH/files" ]; then
        echo -e "\n📁 Source files directory:"
        ls -la "$PROTOTYPES_PATH/files/"
    fi
    
    if [ -d "$PROTOTYPES_PATH/build" ]; then
        echo -e "\n🏗️  Build files directory:"
        ls -la "$PROTOTYPES_PATH/build/"
    fi
else
    echo -e "\n❌ No local prototype directory found at $PROTOTYPES_PATH"
    echo "    Let's check if it was created elsewhere:"
    echo "    Current directory: $(pwd)"
    echo "    Looking for: prototypes/$PROTOTYPE_ID"
    find . -name "prototypes" -type d 2>/dev/null | head -5
    find .. -name "prototypes" -type d 2>/dev/null | head -5
fi

# Cleanup zip file
echo -e "\nCleaning up zip file..."
rm -f "$ZIP_FILE"