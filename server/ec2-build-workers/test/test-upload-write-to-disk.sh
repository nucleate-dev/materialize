#!/bin/bash

# Test script for the file upload and build endpoints with write_to_disk enabled
# Usage: bash test-upload-write-to-disk.sh

PROTOTYPE_ID="test-prototype-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_FILE="$SCRIPT_DIR/test-project.zip"

echo "Testing file upload endpoint with write_to_disk enabled"
echo "Prototype ID: $PROTOTYPE_ID"

# Create zip file of the test project (excluding the test script itself and any existing zip)
echo "Creating zip file of test project..."
cd "$SCRIPT_DIR"
zip -r test-project.zip . -x "test-upload*.sh" "*.zip" "README.md"

echo "Zip file created with the following contents:"
unzip -l test-project.zip

# Test the upload endpoint with the zip file and write_to_disk enabled
echo -e "\n\nTesting upload endpoint with write_to_disk=true..."
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:3002/upload \
  -F "prototypeId=$PROTOTYPE_ID" \
  -F "write_to_disk=true" \
  -F "files=@test-project.zip")

echo "Upload Response:"
echo $UPLOAD_RESPONSE

echo -e "\n\nTesting build endpoint with write_to_disk=true..."

# Test build endpoint with write_to_disk enabled
BUILD_RESPONSE=$(curl -s -X POST http://localhost:3002/build \
  -H "Content-Type: application/json" \
  -d "{\"prototypeId\":\"$PROTOTYPE_ID\",\"write_to_disk\":true}")

echo "Build Response:"
echo $BUILD_RESPONSE

echo -e "\n\nTesting health endpoint..."

# Test health endpoint
curl -s http://localhost:3002/health

echo -e "\n\nDone! Files should be saved locally at:"
echo "- Source files: ./prototypes/$PROTOTYPE_ID/files/"
echo "- Build files: ./prototypes/$PROTOTYPE_ID/build/"
echo "- S3 build URL: Check response above for buildUrl"

# Check if local files were created
if [ -d "./prototypes/$PROTOTYPE_ID" ]; then
    echo -e "\n✅ Local prototype directory created:"
    ls -la "./prototypes/$PROTOTYPE_ID/"
    
    if [ -d "./prototypes/$PROTOTYPE_ID/files" ]; then
        echo -e "\n📁 Source files directory:"
        ls -la "./prototypes/$PROTOTYPE_ID/files/"
    fi
    
    if [ -d "./prototypes/$PROTOTYPE_ID/build" ]; then
        echo -e "\n🏗️  Build files directory:"
        ls -la "./prototypes/$PROTOTYPE_ID/build/"
    fi
else
    echo -e "\n❌ No local prototype directory found - check for errors above"
fi

# Cleanup zip file
echo -e "\nCleaning up zip file..."
rm -f "$ZIP_FILE"