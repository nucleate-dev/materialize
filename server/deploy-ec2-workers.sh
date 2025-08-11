#!/bin/bash

# Deploy ec2-build-workers to EC2 instance
# Usage: ./deploy-ec2-workers.sh

set -e

EC2_HOST="ec2-3-17-13-26.us-east-2.compute.amazonaws.com"
EC2_USER="ec2-user"
KEY_PATH="ec2-build-workers/mat-ec2-key-1.pem"
BUILD_DIR="ec2-build-workers"
BUILD_ZIP="build.zip"

echo "Creating build archive..."
zip -r "$BUILD_ZIP" "$BUILD_DIR"

echo "Deploying to EC2 instance..."
scp -i "$KEY_PATH" "$BUILD_ZIP" "$EC2_USER@$EC2_HOST:/home/$EC2_USER/"

echo "Unzipping on EC2 server..."
ssh -i "$KEY_PATH" "$EC2_USER@$EC2_HOST" "unzip -o $BUILD_ZIP && rm $BUILD_ZIP"

echo "Cleaning up local build archive..."
rm "$BUILD_ZIP"

echo "Deployment complete!"