#!/bin/bash

# Test script for the dev-server endpoint using array-of-files
# Usage: 
#   bash test-dev-server.sh                  # Test with array-of-files
#   bash test-dev-server.sh --port PORT      # Test with custom port

PROTOTYPE_ID="test-dev-server-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_PORT="19006"  # default Expo port

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            DEV_PORT="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--port PORT]"
            exit 1
            ;;
    esac
done

echo "Testing dev-server endpoint with prototype ID: $PROTOTYPE_ID"
echo "Dev port: $DEV_PORT"

cd "$SCRIPT_DIR"

# Array-of-files mode
echo ""
echo "=== ARRAY-OF-FILES MODE ==="

# Files to upload in array-of-files mode
files_to_upload=(
    "../test/package.json"
    "../test/app.json"
    "../test/expo-env.d.ts"
    "../test/app/_layout.tsx"
    "../test/app/+not-found.tsx"
    "../test/app/(tabs)/_layout.tsx"
    "../test/app/(tabs)/index.tsx"
    "../test/app/(tabs)/explore.tsx"
    "../test/components/HelloWave.tsx"
    "../test/components/ThemedText.tsx"
    "../test/components/ThemedView.tsx"
    "../test/constants/Colors.ts"
    "../test/hooks/useThemeColor.ts"
)

echo "Preparing to upload ${#files_to_upload[@]} files using array-of-files mode..."

# Create manifest JSON
manifest="{\"files\":["
file_count=0
for file in "${files_to_upload[@]}"; do
    if [ -f "$file" ]; then
        if [ $file_count -gt 0 ]; then
            manifest="$manifest,"
        fi
        # Extract directory and filename
        dir=$(dirname "$file")
        filename=$(basename "$file")
        
        # Create file entry in manifest
        if [ "$dir" = "." ]; then
            manifest="$manifest{\"id\":\"$file\",\"filename\":\"$filename\"}"
        else
            manifest="$manifest{\"id\":\"$file\",\"path\":\"$dir\",\"filename\":\"$filename\"}"
        fi
            ((file_count++))
        fi
    done
    manifest="$manifest]}"
    
    echo "Generated manifest:"
    echo "$manifest"
    echo ""
    
    # Build curl command for array-of-files
    CURL_CMD="curl -s -w \"\n%{http_code}\" -X POST http://localhost:3002/dev-server"
    CURL_CMD="$CURL_CMD -F \"prototypeId=$PROTOTYPE_ID\""
    CURL_CMD="$CURL_CMD -F \"port=$DEV_PORT\""
    CURL_CMD="$CURL_CMD -F \"manifest=$manifest\""
    
    # Add each file with corresponding ID
    for file in "${files_to_upload[@]}"; do
        if [ -f "$file" ]; then
            CURL_CMD="$CURL_CMD -F \"files=@$file;filename=$file;id=$file\""
            echo "  - $file (id: $file)"
        else
            echo "  - WARNING: $file not found, skipping"
        fi
    done
    
    echo ""
    echo "Testing dev-server endpoint with array-of-files..."
    
    # Execute the curl command with timeout for dev server startup
    RESPONSE=$(eval $CURL_CMD --max-time 60)
    
    # Parse response and HTTP code
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n -1)
    
    echo "HTTP Status Code: $HTTP_CODE"
    echo "Response Body:"
    echo "$BODY"

else
    echo "Invalid mode: $MODE. Use 'zip' or 'files'"
    exit 1
fi

echo ""
echo "=== RESULTS ==="
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ SUCCESS: Dev server started successfully!"
    
    # Try to extract tunnel URL if present
    if echo "$BODY" | grep -q "tunnelUrl"; then
        echo "🌐 Tunnel URL found in response"
        # Extract and display the URL
        TUNNEL_URL=$(echo "$BODY" | grep -o '"tunnelUrl":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$TUNNEL_URL" ]; then
            echo "   $TUNNEL_URL"
            echo ""
            echo "📱 You can now access your React Native app at the tunnel URL above"
            echo "🛑 Don't forget to stop the dev server when done:"
            echo "   curl -X DELETE http://localhost:3002/dev-server/$PROTOTYPE_ID"
        fi
    fi
elif [ "$HTTP_CODE" = "409" ]; then
    echo "⚠️  CONFLICT: Dev server already running for this prototype"
else
    echo "❌ FAILED: HTTP $HTTP_CODE"
fi

echo ""
echo "Test completed!"
echo "✅ Tested dev-server endpoint in $MODE mode"
echo "✅ Prototype ID: $PROTOTYPE_ID"

echo ""
echo "Usage examples:"
echo "  bash test-dev-server.sh                         # Test with zip (default)"
echo "  bash test-dev-server.sh --mode zip              # Test with zip explicitly"
echo "  bash test-dev-server.sh --mode files            # Test with array-of-files"
echo "  bash test-dev-server.sh --mode files --port 8081  # Test with custom port"