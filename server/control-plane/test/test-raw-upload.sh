#!/bin/bash

# Test script for uploading individual files (no zip)
# Usage: bash test-raw-upload.sh

PROTOTYPE_ID="test-prototype-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Testing individual file upload endpoint with prototype ID: $PROTOTYPE_ID"

cd "$SCRIPT_DIR"

# Build the curl command with all files
CURL_CMD="curl -s -X POST http://localhost:3002/upload -F \"prototypeId=$PROTOTYPE_ID\""

# Add all the key files from the React Native project
files_to_upload=(
    "package.json"
    "tsconfig.json"
    "app.json"
    "expo-env.d.ts"
    "eslint.config.js"
    "app/_layout.tsx"
    "app/+not-found.tsx"
    "app/(tabs)/_layout.tsx"
    "app/(tabs)/index.tsx"
    "app/(tabs)/explore.tsx"
    "app/(tabs)/settings.tsx"
    "app/onboarding/welcome.tsx"
    "app/onboarding/features.tsx"
    "app/onboarding/complete.tsx"
    "components/Collapsible.tsx"
    "components/ExternalLink.tsx"
    "components/HapticTab.tsx"
    "components/HelloWave.tsx"
    "components/ParallaxScrollView.tsx"
    "components/ThemedText.tsx"
    "components/ThemedView.tsx"
    "components/ui/IconSymbol.tsx"
    "components/ui/IconSymbol.ios.tsx"
    "components/ui/TabBarBackground.tsx"
    "components/ui/TabBarBackground.ios.tsx"
    "constants/Colors.ts"
    "hooks/useColorScheme.ts"
    "hooks/useColorScheme.web.ts"
    "hooks/useThemeColor.ts"
    "store/useAppStore.ts"
    "scripts/reset-project.js"
    "assets/images/icon.png"
    "assets/images/favicon.png"
    "assets/images/adaptive-icon.png"
    "assets/images/splash-icon.png"
    "assets/images/react-logo.png"
    "assets/images/react-logo@2x.png"
    "assets/images/react-logo@3x.png"
    "assets/images/partial-react-logo.png"
    "assets/fonts/SpaceMono-Regular.ttf"
)

echo "Uploading ${#files_to_upload[@]} files individually..."

# Add each file to the curl command
for file in "${files_to_upload[@]}"; do
    if [ -f "$file" ]; then
        CURL_CMD="$CURL_CMD -F \"files=@$file\""
        echo "  - $file"
    else
        echo "  - WARNING: $file not found, skipping"
    fi
done

echo ""
echo "Executing upload..."

# Execute the curl command
UPLOAD_RESPONSE=$(eval $CURL_CMD)

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