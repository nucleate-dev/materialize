#!/bin/bash

# Test script for the build-and-deploy endpoint with support for both zip and array-of-files
# Usage: 
#   bash test-build-and-deploy.sh                  # Test with zip (default)
#   bash test-build-and-deploy.sh --mode zip       # Test with zip explicitly  
#   bash test-build-and-deploy.sh --mode files     # Test with array-of-files

PROTOTYPE_ID="test-build-deploy-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_FILE="$SCRIPT_DIR/test-project.zip"
MODE="zip"  # default mode

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --mode)
            MODE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--mode zip|files]"
            exit 1
            ;;
    esac
done

echo "Testing build-and-deploy endpoint with prototype ID: $PROTOTYPE_ID"
echo "Upload mode: $MODE"

cd "$SCRIPT_DIR"

if [ "$MODE" = "zip" ]; then
    echo ""
    echo "=== ZIP MODE ==="
    
    # Create zip file of the test project
    echo "Creating zip file of test project..."
    cd ../test
    zip -r "$SCRIPT_DIR/test-project.zip" . -x "*.zip" "README.md"
    cd "$SCRIPT_DIR"
    
    echo "Zip file created with the following contents:"
    unzip -l test-project.zip
    
    echo ""
    echo "Testing build-and-deploy endpoint with zip..."
    
    # Test the build-and-deploy endpoint with zip
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3002/build-and-deploy \
      -F "prototypeId=$PROTOTYPE_ID" \
      -F "write_to_disk=true" \
      -F "files=@test-project.zip")
    
    # Parse response and HTTP code
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n -1)
    
    echo "HTTP Status Code: $HTTP_CODE"
    echo "Response Body:"
    echo "$BODY"
    
    # Cleanup zip file
    echo ""
    echo "Cleaning up zip file..."
    rm -f "$ZIP_FILE"

elif [ "$MODE" = "files" ]; then
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
                manifest="$manifest{\"id\":\"file$file_count\",\"filename\":\"$filename\"}"
            else
                manifest="$manifest{\"id\":\"file$file_count\",\"path\":\"$dir\",\"filename\":\"$filename\"}"
            fi
            ((file_count++))
        fi
    done
    manifest="$manifest]}"
    
    echo "Generated manifest:"
    echo "$manifest"
    echo ""
    
    # Build curl command for array-of-files
    CURL_CMD="curl -s -w \"\n%{http_code}\" -X POST http://localhost:3002/build-and-deploy"
    CURL_CMD="$CURL_CMD -F \"prototypeId=$PROTOTYPE_ID\""
    CURL_CMD="$CURL_CMD -F \"write_to_disk=true\""
    CURL_CMD="$CURL_CMD -F \"manifest=$manifest\""
    
    # Add each file with corresponding ID
    file_index=0
    for file in "${files_to_upload[@]}"; do
        if [ -f "$file" ]; then
            CURL_CMD="$CURL_CMD -F \"files=@$file;filename=file$file_index\""
            echo "  - $file (id: file$file_index)"
            ((file_index++))
        else
            echo "  - WARNING: $file not found, skipping"
        fi
    done
    
    echo ""
    echo "Testing build-and-deploy endpoint with array-of-files..."
    
    # Execute the curl command
    RESPONSE=$(eval $CURL_CMD)
    
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
    echo "✅ SUCCESS: Request completed successfully!"
    
    # Try to extract build URL if present
    if echo "$BODY" | grep -q "buildUrl\|url"; then
        echo "🔗 Build URL found in response"
        # Extract and display the URL
        BUILD_URL=$(echo "$BODY" | grep -o '"buildUrl":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$BUILD_URL" ]; then
            echo "   $BUILD_URL"
        fi
    fi
else
    echo "❌ FAILED: HTTP $HTTP_CODE"
fi

echo ""
echo "Test completed!"
echo "✅ Tested build-and-deploy endpoint in $MODE mode"
echo "✅ Prototype ID: $PROTOTYPE_ID"

echo ""
echo "Usage examples:"
echo "  bash test-build-and-deploy.sh                  # Test with zip (default)"
echo "  bash test-build-and-deploy.sh --mode zip       # Test with zip explicitly"
echo "  bash test-build-and-deploy.sh --mode files     # Test with array-of-files"