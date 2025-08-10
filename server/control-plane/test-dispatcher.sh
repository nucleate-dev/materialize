#!/bin/bash

# Test script for the DispatcherService
# Usage: bash test-dispatcher.sh

PROTOTYPE_ID="test-dispatcher-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_FILE="$SCRIPT_DIR/test-project.zip"

echo "Testing DispatcherService"
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

# Test the DispatcherService (assuming it's running on localhost:3001)
echo -e "\n\nTesting DispatcherService with zip file..."
DISPATCHER_RESPONSE=$(curl -s -X POST http://localhost:3001/dispatch \
  -F "prototypeId=$PROTOTYPE_ID" \
  -F "writeToDisK=true" \
  -F "files=@test-project.zip")

echo "DispatcherService Response:"
echo $DISPATCHER_RESPONSE

echo -e "\n\nDispatcher test completed!"
echo "✅ Created test project files"
echo "✅ Zipped project files"
echo "✅ Sent request to DispatcherService"
echo ""
echo "Expected behavior:"
echo "- DispatcherService should find least loaded worker"
echo "- Forward zip file to worker's /build-and-deploy endpoint"
echo "- Return build result with S3 URL"

# Cleanup
echo -e "\nCleaning up test files..."
rm -f "$ZIP_FILE"
rm -rf "$SCRIPT_DIR/test-project"

echo "Cleanup completed!"