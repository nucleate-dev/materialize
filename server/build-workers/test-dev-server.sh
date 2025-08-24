#!/bin/bash

# Simple script to test the dev server with real files
echo "Testing dev server with real test app files..."

# First, check if any dev server is running and stop it
echo "Checking for existing dev servers..."
status_response=$(curl -s -X GET http://localhost:3002/dev-server/status)
echo "Current status: $status_response"

# Try to stop any running dev server
echo "Stopping any existing dev server..."
stop_response=$(curl -s -X DELETE http://localhost:3002/dev-server \
  -H "Content-Type: application/json" \
  -d '{}')
echo "Stop response: $stop_response"

# Wait a moment for cleanup
sleep 2

# Generate a unique prototype ID
prototype_id="test-$(date +%s)"
echo "Using prototype_id: $prototype_id"

# Read package.json and escape it for JSON
package_json=$(cat test/package.json | jq -c . | jq -R .)

# Read app.json and escape it for JSON  
app_json=$(cat test/app.json | jq -c . | jq -R .)

# Read a simple app file
index_tsx=$(cat test/app/_layout.tsx | jq -R -s .)

# Make the request
echo "Sending request to start dev server..."
response=$(curl -s -X POST http://localhost:3002/dev-server \
  -H "Content-Type: application/json" \
  -d "{
    \"prototype_id\": \"$prototype_id\",
    \"framework\": \"expo_react_native\",
    \"file_scope\": \"complete\",
    \"files\": [
      {\"name\": \"package.json\", \"contents\": $package_json},
      {\"name\": \"app.json\", \"contents\": $app_json},
      {\"name\": \"app/_layout.tsx\", \"contents\": $index_tsx}
    ],
    \"assets\": []
  }")

echo "Response:"
echo "$response" | jq .

# Extract tunnel URL if successful
tunnel_url=$(echo "$response" | jq -r '.tunnel_url // empty')
if [ -n "$tunnel_url" ]; then
  echo ""
  echo "🎉 Dev server started successfully!"
  echo "Tunnel URL: $tunnel_url"
  echo ""
  echo ""
  echo "You can:"
  echo "1. Open the tunnel URL in your browser: $tunnel_url"
  echo "2. Check dev server status with:"
  echo "   curl -X GET http://localhost:3002/dev-server/status"
  echo "3. Stop the dev server with:"
  echo "   curl -X DELETE http://localhost:3002/dev-server -H \"Content-Type: application/json\" -d '{\"prototype_id\": \"$prototype_id\"}'"
else
  echo ""
  echo "❌ Dev server failed to start"
  echo "Check the errors above"
fi