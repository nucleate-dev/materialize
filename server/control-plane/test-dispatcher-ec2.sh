#!/bin/bash

# Enhanced test script for the DispatcherService with EC2 support
# Usage: 
#   bash test-dispatcher-ec2.sh                    # Test localhost
#   bash test-dispatcher-ec2.sh <control-plane-ip> # Test real EC2 control plane
#   DIRECT_WORKER=<worker-ip> bash test-dispatcher-ec2.sh # Test worker directly

PROTOTYPE_ID="test-dispatcher-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_FILE="$SCRIPT_DIR/test-project.zip"

# Determine target based on arguments
if [ -n "$DIRECT_WORKER" ]; then
    TARGET_URL="http://$DIRECT_WORKER:3002/build-and-deploy"
    echo "Testing EC2 Worker directly at: $TARGET_URL"
elif [ -n "$1" ]; then
    TARGET_URL="http://$1:3001/dispatch"
    echo "Testing DispatcherService on EC2 at: $TARGET_URL"
else
    TARGET_URL="http://localhost:3001/dispatch"
    echo "Testing DispatcherService locally at: $TARGET_URL"
fi

echo "Prototype ID: $PROTOTYPE_ID"

# Create a simple test project for zipping
echo "Creating test project files..."
mkdir -p "$SCRIPT_DIR/test-project"

# Create a simple React Native web project structure
cat > "$SCRIPT_DIR/test-project/package.json" << 'EOF'
{
  "name": "test-project",
  "version": "1.0.0",
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "expo": "~49.0.0",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-native": "0.72.6",
    "react-native-web": "~0.19.6"
  },
  "devDependencies": {
    "@babel/core": "^7.20.0"
  }
}
EOF

cat > "$SCRIPT_DIR/test-project/App.js" << 'EOF'
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>Hello from DispatcherService Test!</Text>
      <Text>Testing EC2 Integration</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
EOF

cat > "$SCRIPT_DIR/test-project/app.json" << 'EOF'
{
  "expo": {
    "name": "test-project",
    "slug": "test-project",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFFFFF"
      }
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}
EOF

# Create zip file of the test project
echo "Creating zip file of test project..."
cd "$SCRIPT_DIR/test-project"
zip -r ../test-project.zip . -x "*.DS_Store" "node_modules/*"
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
echo "✅ Created test project files"
echo "✅ Zipped project files"
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
echo -e "\nCleaning up test files..."
rm -f "$ZIP_FILE"
rm -rf "$SCRIPT_DIR/test-project"

echo "Cleanup completed!"

# Usage examples
echo -e "\nUsage examples:"
echo "  bash test-dispatcher-ec2.sh                           # Test localhost"
echo "  bash test-dispatcher-ec2.sh 3.84.123.45              # Test EC2 control plane"
echo "  DIRECT_WORKER=10.0.1.100 bash test-dispatcher-ec2.sh # Test worker directly"