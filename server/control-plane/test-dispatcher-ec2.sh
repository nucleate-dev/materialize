#!/bin/bash

# Enhanced test script for the DispatcherService with EC2 support
# Usage: 
#   bash test-dispatcher-ec2.sh                    # Test localhost
#   bash test-dispatcher-ec2.sh <control-plane-ip> # Test real EC2 control plane
#   DIRECT_WORKER=<worker-ip> bash test-dispatcher-ec2.sh # Test worker directly

PROTOTYPE_ID="test-dispatcher-1754867915"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_FILE="$SCRIPT_DIR/test-project.zip"

# Determine target based on arguments
if [ -n "$DIRECT_WORKER" ]; then
    TARGET_URL="http://$DIRECT_WORKER:3002/build-and-deploy"
    echo "Testing EC2 Worker directly at: $TARGET_URL"
elif [ -n "$1" ]; then
    TARGET_URL="http://$1:3000/dispatch"
    echo "Testing DispatcherService on EC2 at: $TARGET_URL"
else
    TARGET_URL="http://localhost:3000/dispatch"
    echo "Testing DispatcherService locally at: $TARGET_URL"
fi

echo "Prototype ID: $PROTOTYPE_ID"

# Create zip file of the real test project
echo "Creating zip file of test project from control-plane/test folder..."
cd "$SCRIPT_DIR/test"
zip -r ../test-project.zip . -x "test-upload*.sh" "*.zip" "*.DS_Store" "node_modules/*"
cd "$SCRIPT_DIR"

echo "Zip file created with the following contents:"
unzip -l test-project.zip

# Test the service
echo -e "\n\nTesting service with zip file..."
echo "Sending request to: $TARGET_URL"

# Set timeout based on whether testing locally or on EC2
if [[ "$TARGET_URL" == *"localhost"* ]]; then
    TIMEOUT=30
else
    TIMEOUT=120  # Longer timeout for EC2 builds
fi

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$TARGET_URL" \
  -F "prototypeId=$PROTOTYPE_ID" \
  -F "writeToDisK=true" \
  -F "hotReload=true" \
  -F "files=@test-project.zip" \
  --max-time $TIMEOUT)

# Parse response and HTTP code
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "HTTP Status Code: $HTTP_CODE"
echo "Response Body:"
echo "$BODY"

# Check if successful
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "\n✅ SUCCESS: Request completed successfully!"
    
    # Try to extract S3 URL if present
    if echo "$BODY" | grep -q "buildUrl\|url"; then
        echo "🔗 Build URL found in response"
    fi
else
    echo -e "\n❌ FAILED: HTTP $HTTP_CODE"
fi

echo -e "\nTest completed!"
echo "✅ Zipped real Expo test project"
echo "✅ Sent request to service"
echo ""
echo "Expected behavior:"
if [ -n "$DIRECT_WORKER" ]; then
    echo "- Worker should build project directly"
    echo "- Upload to S3 and return build URL"
else
    echo "- DispatcherService should find least loaded worker"
    echo "- Forward zip file to worker's /build-and-deploy endpoint"
    echo "- Return build result with S3 URL"
fi

# Cleanup
echo -e "\nCleaning up zip file..."
rm -f "$ZIP_FILE"

echo "Cleanup completed!"

# Usage examples
echo -e "\nUsage examples:"
echo "  bash test-dispatcher-ec2.sh                           # Test localhost"
echo "  bash test-dispatcher-ec2.sh 3.84.123.45              # Test EC2 control plane"
echo "  DIRECT_WORKER=10.0.1.100 bash test-dispatcher-ec2.sh # Test worker directly"