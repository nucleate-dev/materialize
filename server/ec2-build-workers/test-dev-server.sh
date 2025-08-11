#!/bin/bash

# Test script for dev server endpoints
# Usage: ./test-dev-server.sh

set -e

BASE_URL="http://localhost:3002"
PROTOTYPE_ID="test-expo-$(date +%s)"
TEST_DIR="./test"
ZIP_FILE="/tmp/test-expo.zip"

echo "🧪 Testing Dev Server Endpoints"
echo "================================"
echo "Prototype ID: $PROTOTYPE_ID"
echo "Base URL: $BASE_URL"
echo ""

# Function to check if server is running
check_server() {
    if ! curl -sf "$BASE_URL/health" > /dev/null; then
        echo "❌ Server is not running at $BASE_URL"
        echo "Please start the server with: node worker.js"
        exit 1
    fi
    echo "✅ Server is running"
}

# Function to use existing test project
prepare_test_project() {
    echo "📦 Using existing test Expo project..."
    
    if [ ! -d "$TEST_DIR" ]; then
        echo "❌ Test directory not found: $TEST_DIR"
        echo "Make sure you're running this script from the worker directory"
        exit 1
    fi
    
    if [ ! -f "$TEST_DIR/package.json" ]; then
        echo "❌ No package.json found in test directory"
        exit 1
    fi
    
    # Clean up any existing zip file
    rm -f "$ZIP_FILE"
    
    # Create zip file from existing test project
    echo "📦 Creating zip file from existing project..."
    cd "$TEST_DIR"
    zip -r "$ZIP_FILE" . -x "*.DS_Store" "node_modules/*" ".expo/*" ".git/*" > /dev/null
    cd - > /dev/null
    
    echo "✅ Test project zipped"
    echo "   Project files: $TEST_DIR"
    echo "   Zip file: $ZIP_FILE"
    
    # Show some info about the project
    echo "📋 Project info:"
    echo "   Name: $(cat "$TEST_DIR/package.json" | jq -r '.name // "unknown"')"
    echo "   Expo version: $(cat "$TEST_DIR/package.json" | jq -r '.dependencies.expo // "unknown"')"
}

# Function to start dev server
start_dev_server() {
    echo ""
    echo "🚀 Starting dev server..."
    echo "⏳ This may take 30-60 seconds as Expo sets up the tunnel..."
    echo "   - Extracting files and installing dependencies"
    echo "   - Starting Expo dev server with --web --tunnel"
    echo "   - Waiting for tunnel URL from Expo"
    echo ""
    
    # Show progress while waiting
    {
        for i in {1..60}; do
            echo -n "."
            sleep 1
        done
        echo " (timeout)"
    } &
    progress_pid=$!
    
    raw=$(curl -sS -X POST "$BASE_URL/dev-server" \
        -F "prototypeId=$PROTOTYPE_ID" \
        -F "files=@$ZIP_FILE" \
        --max-time 600 \
        --fail-with-body \
        -H "Accept: application/json" \
        -w "\nHTTP_STATUS:%{http_code}\n")

    status=$(echo "$raw" | sed -n 's/^HTTP_STATUS://p')
    body=$(echo "$raw" | sed '/^HTTP_STATUS:/d')

    echo "HTTP: $status"
    echo "Body: $body"
    
    response="$body"
    
    # Stop progress indicator
    kill $progress_pid 2>/dev/null || true
    wait $progress_pid 2>/dev/null || true
    echo ""
    
    echo "Response: $response"
    
    if echo "$response" | jq -e '.tunnelUrl' > /dev/null 2>&1; then
        tunnel_url=$(echo "$response" | jq -r '.tunnelUrl')
        echo "✅ Dev server started successfully!"
        echo "🌐 Tunnel URL: $tunnel_url"
        echo "📊 Job ID: $(echo "$response" | jq -r '.jobId')"
        return 0
    elif echo "$response" | jq -e '.error' > /dev/null 2>&1; then
        echo "❌ Failed to start dev server"
        error_msg=$(echo "$response" | jq -r '.error')
        details=$(echo "$response" | jq -r '.details // empty')
        echo "Error: $error_msg"
        if [ -n "$details" ]; then
            echo "Details: $details"
        fi
        
        # Show logs if available
        if echo "$response" | jq -e '.logs' > /dev/null 2>&1; then
            echo ""
            echo "📋 Startup logs:"
            echo "$response" | jq -r '.logs[]? // empty'
        fi
        return 1
    else
        echo "❌ Unexpected response format"
        echo "$response"
        return 1
    fi
}

# Function to list dev servers
list_dev_servers() {
    echo ""
    echo "📋 Listing running dev servers..."
    
    response=$(curl -s "$BASE_URL/dev-servers")
    echo "Response: $response"
    
    count=$(echo "$response" | jq -r '.count')
    echo "✅ Found $count running dev server(s)"
    
    if [ "$count" -gt 0 ]; then
        echo "$response" | jq -r '.runningServers[] | "  - \(.prototypeId): \(.tunnelUrl)"'
    fi
}

# Function to stop dev server
stop_dev_server() {
    echo ""
    echo "🛑 Stopping dev server..."
    
    response=$(curl -s -X DELETE "$BASE_URL/dev-server/$PROTOTYPE_ID")
    echo "Response: $response"
    
    if echo "$response" | jq -e '.status' > /dev/null 2>&1; then
        status=$(echo "$response" | jq -r '.status')
        if [ "$status" = "stopped" ]; then
            echo "✅ Dev server stopped successfully"
            return 0
        fi
    fi
    
    echo "❌ Failed to stop dev server"
    return 1
}

# Function to cleanup
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    rm -f "$ZIP_FILE"
    echo "✅ Cleanup complete"
}

# Main test flow
main() {
    echo "Starting dev server endpoint tests..."
    
    # Check if required tools are available
    if ! command -v jq &> /dev/null; then
        echo "❌ jq is required for this test script"
        echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
        exit 1
    fi
    
    if ! command -v zip &> /dev/null; then
        echo "❌ zip is required for this test script"
        exit 1
    fi
    
    check_server
    prepare_test_project
    
    # Test dev server lifecycle
    if start_dev_server; then
        sleep 2  # Give it a moment to fully start
        list_dev_servers
        
        echo ""
        echo "⏳ Dev server should be running. You can:"
        echo "   1. Visit the tunnel URL above to see the app"
        echo "   2. Press Enter to continue with stopping the server"
        read -p "Press Enter to stop the dev server..."
        
        stop_dev_server
        sleep 1
        list_dev_servers
    fi
    
    cleanup
    echo ""
    echo "🎉 Test complete!"
}

# Handle interrupts
trap cleanup EXIT

main "$@"