#!/bin/bash

# Simple debug script to test Expo tunnel
# Usage: ./debug-expo.sh

set -e

BASE_URL="http://localhost:3002"
PROTOTYPE_ID="debug-expo-$(date +%s)"
ZIP_FILE="/tmp/debug-expo.zip"

echo "🔍 Debug Expo Dev Server"
echo "========================"
echo "Prototype ID: $PROTOTYPE_ID"

# Create zip from test directory
echo "📦 Creating zip from test directory..."
cd test
zip -r "$ZIP_FILE" . -x "*.DS_Store" "node_modules/*" ".expo/*" ".git/*" > /dev/null
cd ..

echo "✅ Zip created: $ZIP_FILE"

# Start dev server and capture response immediately
echo ""
echo "🚀 Starting dev server..."
echo "Making request to: $BASE_URL/dev-server"

# Start request in background and monitor it
{
    curl -v -X POST "$BASE_URL/dev-server" \
        -F "prototypeId=$PROTOTYPE_ID" \
        -F "file=@$ZIP_FILE" \
        --max-time 20 2>&1
} &
curl_pid=$!

# Monitor server logs while request is running
echo "📊 Monitoring server logs for 15 seconds..."
sleep 15

# Check if curl is still running
if kill -0 $curl_pid 2>/dev/null; then
    echo "⚠️  Curl still running after 15 seconds, checking server status..."
    
    # Check if our prototype is in the process
    echo "🔍 Checking running dev servers..."
    curl -s "$BASE_URL/dev-servers" | jq '.'
    
    # If we find our server, get its logs
    if curl -s "$BASE_URL/dev-servers" | jq -e ".runningServers[] | select(.prototypeId == \"$PROTOTYPE_ID\")" > /dev/null; then
        echo "📋 Found dev server, getting logs..."
        curl -s "$BASE_URL/dev-server/$PROTOTYPE_ID/logs" | jq '.'
        
        # Stop the dev server
        echo "🛑 Stopping dev server..."
        curl -s -X DELETE "$BASE_URL/dev-server/$PROTOTYPE_ID" | jq '.'
    fi
    
    # Kill the curl process
    kill $curl_pid 2>/dev/null || true
else
    wait $curl_pid
    echo "✅ Curl completed"
fi

# Cleanup
rm -f "$ZIP_FILE"

echo ""
echo "🔍 Debug complete"