#!/bin/bash

# Test script for the file upload and build endpoints
# Usage: bash test-upload.sh

PROTOTYPE_ID="$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_FILE="$SCRIPT_DIR/test-project.zip"

echo "Testing file upload endpoint with prototype ID: $PROTOTYPE_ID"

# Create zip file of the test project (excluding the test script itself and any existing zip)
echo "Creating zip file of test project..."
cd "$SCRIPT_DIR"
zip -r test-project.zip . -x "test-upload.sh" "*.zip" "README.md"

echo "Zip file created with the following contents:"
unzip -l test-project.zip

# Test the upload endpoint with the zip file
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:3002/upload \
  -F "prototypeId=$PROTOTYPE_ID" \
  -F "files=@test-project.zip")

echo "Upload Response:"
echo $UPLOAD_RESPONSE

echo -e "\n\nTesting build endpoint..."

# Test build endpoint
BUILD_RESPONSE=$(curl -s -X POST http://localhost:3002/build \
  -H "Content-Type: application/json" \
  -d "{\"prototypeId\":\"$PROTOTYPE_ID\"}")

echo "Build Response:"
echo $BUILD_RESPONSE

echo -e "\n\nTesting health endpoint..."

# Test health endpoint
curl -s http://localhost:3002/health

echo -e "\n\nDone! Check S3 for built files at: $PROTOTYPE_ID/dist/"

# Cleanup zip file
echo "Cleaning up zip file..."
rm -f "$ZIP_FILE"