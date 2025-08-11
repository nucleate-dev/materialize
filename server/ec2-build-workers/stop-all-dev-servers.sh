#!/bin/bash

# Script to stop all running dev servers
# Usage: ./stop-all-dev-servers.sh

set -e

BASE_URL="http://localhost:3002"

echo "🛑 Stop All Dev Servers"
echo "======================"
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

# Function to get all running dev servers
get_running_servers() {
    response=$(curl -s "$BASE_URL/dev-servers")
    echo "$response" | jq -r '.runningServers[]?.prototypeId // empty'
}

# Function to stop a specific dev server
stop_dev_server() {
    local prototype_id="$1"
    echo "🛑 Stopping dev server: $prototype_id"
    
    response=$(curl -s -X DELETE "$BASE_URL/dev-server/$prototype_id")
    
    if echo "$response" | jq -e '.status' > /dev/null 2>&1; then
        status=$(echo "$response" | jq -r '.status')
        if [ "$status" = "stopped" ]; then
            echo "✅ Dev server $prototype_id stopped successfully"
            return 0
        fi
    fi
    
    echo "❌ Failed to stop dev server $prototype_id"
    echo "Response: $response"
    return 1
}

# Main function
main() {
    # Check if required tools are available
    if ! command -v jq &> /dev/null; then
        echo "❌ jq is required for this script"
        echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
        exit 1
    fi
    
    check_server
    
    echo "📋 Getting list of running dev servers..."
    running_servers=$(get_running_servers)
    
    if [ -z "$running_servers" ]; then
        echo "✅ No dev servers are currently running"
        exit 0
    fi
    
    echo "Found running dev servers:"
    echo "$running_servers" | while read -r server; do
        echo "  - $server"
    done
    echo ""
    
    # Ask for confirmation
    server_count=$(echo "$running_servers" | wc -l | tr -d ' ')
    echo "⚠️  This will stop $server_count dev server(s)"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Operation cancelled"
        exit 0
    fi
    
    echo ""
    echo "🛑 Stopping all dev servers..."
    
    stopped_count=0
    failed_count=0
    
    echo "$running_servers" | while read -r prototype_id; do
        if [ -n "$prototype_id" ]; then
            if stop_dev_server "$prototype_id"; then
                stopped_count=$((stopped_count + 1))
            else
                failed_count=$((failed_count + 1))
            fi
            echo ""
        fi
    done
    
    # Final status check
    echo "📋 Final status check..."
    sleep 1
    final_servers=$(get_running_servers)
    
    if [ -z "$final_servers" ]; then
        echo "🎉 All dev servers have been stopped successfully!"
    else
        remaining_count=$(echo "$final_servers" | wc -l | tr -d ' ')
        echo "⚠️  $remaining_count dev server(s) are still running:"
        echo "$final_servers" | while read -r server; do
            echo "  - $server"
        done
    fi
}

main "$@"