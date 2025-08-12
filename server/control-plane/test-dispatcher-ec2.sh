#!/bin/bash

# Enhanced test script for the DispatcherService with EC2 support
# Usage: 
#   bash test-dispatcher-ec2.sh                           # Test localhost with zip
#   bash test-dispatcher-ec2.sh <control-plane-ip>        # Test real EC2 control plane with zip
#   bash test-dispatcher-ec2.sh --mode files              # Test localhost with array-of-files
#   bash test-dispatcher-ec2.sh <control-plane-ip> --mode files  # Test EC2 with array-of-files
#   DIRECT_WORKER=<worker-ip> bash test-dispatcher-ec2.sh # Test worker directly

PROTOTYPE_ID="test-dispatcher-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_FILE="$SCRIPT_DIR/test-project.zip"
MODE="zip"  # default mode
TARGET_IP=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --mode)
            MODE="$2"
            shift 2
            ;;
        *)
            # Assume it's an IP address if it doesn't start with --
            if [[ "$1" != --* ]]; then
                TARGET_IP="$1"
                shift
            else
                echo "Unknown option: $1"
                echo "Usage: $0 [IP] [--mode zip|files]"
                exit 1
            fi
            ;;
    esac
done

# Determine target based on parsed arguments
if [ -n "$DIRECT_WORKER" ]; then
    TARGET_URL="http://$DIRECT_WORKER:3002/build-and-deploy"
    echo "Testing EC2 Worker directly at: $TARGET_URL"
elif [ -n "$TARGET_IP" ]; then
    TARGET_URL="http://$TARGET_IP:3000/dispatch"
    echo "Testing DispatcherService on EC2 at: $TARGET_URL"
else
    TARGET_URL="http://localhost:3000/dispatch"
    echo "Testing DispatcherService locally at: $TARGET_URL"
fi

echo "Prototype ID: $PROTOTYPE_ID"
echo "Upload mode: $MODE"

cd "$SCRIPT_DIR"

if [ "$MODE" = "zip" ]; then
    echo ""
    echo "=== ZIP MODE ==="
    
    # Create zip file of the real test project
    echo "Creating zip file of test project from control-plane/test folder..."
    cd "$SCRIPT_DIR/test"
    zip -r ../test-project.zip . -x "test-upload*.sh" "*.zip" "*.DS_Store" "node_modules/*"
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
      -F "writeToDisk=true" \
      -F "hotReload=false" \
      -F "files=@test-project.zip" \
      --max-time $TIMEOUT)

elif [ "$MODE" = "files" ]; then
    echo ""
    echo "=== ARRAY-OF-FILES MODE ==="
    
    # Check if test directory exists
    if [ ! -d "$SCRIPT_DIR/test" ]; then
        echo "Error: test directory not found at $SCRIPT_DIR/test"
        exit 1
    fi
    
    cd "$SCRIPT_DIR/test"
    
    # Find files to upload (similar to what would be in the zip)
    files_to_upload=(
        "package.json"
        "app.json"
        "expo-env.d.ts"
    )
    
    # Add files from app directory if they exist
    if [ -d "app" ]; then
        find app -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | while read file; do
            files_to_upload+=("$file")
        done
    fi
    
    # Add files from components directory if they exist
    if [ -d "components" ]; then
        find components -name "*.tsx" -o -name "*.ts" -o -name "*.js" -o -name "*.jsx" | while read file; do
            files_to_upload+=("$file")
        done
    fi
    
    # Add other common files
    for pattern in "constants/*.ts" "hooks/*.ts" "hooks/*.tsx"; do
        for file in $pattern; do
            if [ -f "$file" ]; then
                files_to_upload+=("$file")
            fi
        done
    done
    
    echo "Preparing to upload files using array-of-files mode..."
    
    # Create manifest JSON dynamically
    manifest="{\"files\":["
    file_count=0
    actual_files=()
    
    # Get actual files that exist
    for file in "${files_to_upload[@]}"; do
        if [ -f "$file" ]; then
            actual_files+=("$file")
        fi
    done
    
    # Also add any .ts, .tsx, .js, .jsx files in root
    for file in *.{ts,tsx,js,jsx,json}; do
        if [ -f "$file" ] && [[ ! " ${actual_files[@]} " =~ " ${file} " ]]; then
            actual_files+=("$file")
        fi
    done
    
    echo "Found ${#actual_files[@]} files to upload:"
    
    for file in "${actual_files[@]}"; do
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
        echo "  - $file (id: file$file_count)"
        ((file_count++))
    done
    manifest="$manifest]}"
    
    echo ""
    echo "Generated manifest:"
    echo "$manifest"
    echo ""
    
    # Set timeout based on whether testing locally or on EC2
    if [[ "$TARGET_URL" == *"localhost"* ]]; then
        TIMEOUT=30
    else
        TIMEOUT=120  # Longer timeout for EC2 builds
    fi
    
    # Build curl command for array-of-files
    CURL_CMD="curl -s -w \"\n%{http_code}\" -X POST \"$TARGET_URL\""
    CURL_CMD="$CURL_CMD -F \"prototypeId=$PROTOTYPE_ID\""
    CURL_CMD="$CURL_CMD -F \"writeToDisk=true\""
    CURL_CMD="$CURL_CMD -F \"hotReload=false\""
    CURL_CMD="$CURL_CMD -F \"manifest=$manifest\""
    
    # Add each file with corresponding ID
    file_index=0
    for file in "${actual_files[@]}"; do
        if [ -f "$file" ]; then
            CURL_CMD="$CURL_CMD -F \"files=@$file;filename=file$file_index\""
            ((file_index++))
        fi
    done
    
    CURL_CMD="$CURL_CMD --max-time $TIMEOUT"
    
    echo "Testing service with array-of-files..."
    echo "Sending request to: $TARGET_URL"
    
    # Execute the curl command
    RESPONSE=$(eval $CURL_CMD)
    
    cd "$SCRIPT_DIR"

else
    echo "Invalid mode: $MODE. Use 'zip' or 'files'"
    exit 1
fi

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
echo "✅ Zipped real Expo test project"
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
if [ "$MODE" = "zip" ]; then
    echo -e "\nCleaning up zip file..."
    rm -f "$ZIP_FILE"
fi

echo "Cleanup completed!"

# Usage examples
echo -e "\nUsage examples:"
echo "  bash test-dispatcher-ec2.sh                              # Test localhost with zip"
echo "  bash test-dispatcher-ec2.sh --mode files                 # Test localhost with array-of-files"
echo "  bash test-dispatcher-ec2.sh 3.84.123.45                 # Test EC2 control plane with zip"
echo "  bash test-dispatcher-ec2.sh 3.84.123.45 --mode files    # Test EC2 control plane with array-of-files"
echo "  DIRECT_WORKER=10.0.1.100 bash test-dispatcher-ec2.sh    # Test worker directly with zip"
echo "  DIRECT_WORKER=10.0.1.100 bash test-dispatcher-ec2.sh --mode files  # Test worker directly with array-of-files"