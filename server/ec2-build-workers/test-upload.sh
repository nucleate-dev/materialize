#!/bin/bash

# Test script for the file upload endpoint
# Usage: bash test-upload.sh

echo "Testing file upload endpoint..."

# Test the upload endpoint with multiple files
curl -X POST http://localhost:3002/upload \
  -F "prototypeId=test-prototype-123" \
  -F "files=@test-App.js" \
  -F "files=@test-package.json"

echo -e "\n\nTesting health endpoint..."

# Test health endpoint
curl http://localhost:3002/health

echo -e "\n\nDone!"