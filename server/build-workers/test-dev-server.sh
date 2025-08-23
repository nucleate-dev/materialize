#!/bin/bash

# Simple script to test the dev server with real files
echo "Testing dev server with real test app files..."

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
response=$(curl -s -X POST http://localhost:3001/dev-server \
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
  echo "You can:"
  echo "1. Open the tunnel URL in your browser to see the app"
  echo "2. Stop the dev server with:"
  echo "   curl -X DELETE http://localhost:3001/dev-server -H \"Content-Type: application/json\" -d '{\"prototype_id\": \"$prototype_id\"}'"
else
  echo ""
  echo "❌ Dev server failed to start"
  echo "Check the errors above"
fi