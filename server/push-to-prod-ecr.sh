#!/bin/bash

# Configuration
AWS_REGION="us-east-2"
AWS_ACCOUNT_ID="551635290282"
ECR_REPOSITORY="materialize/prod"
IMAGE_TAG="latest"
BUILD_DIR="build-workers"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Starting Docker build and push to ECR...${NC}"

# Check if we're in the right directory
if [ ! -d "$BUILD_DIR" ]; then
    echo -e "${RED}❌ Error: $BUILD_DIR directory not found!${NC}"
    echo "Make sure you're running this script from the parent directory that contains $BUILD_DIR/"
    exit 1
fi

# Change to build directory
cd $BUILD_DIR

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    echo -e "${RED}❌ Error: Dockerfile not found in $BUILD_DIR/!${NC}"
    exit 1
fi

echo -e "${YELLOW}📁 Building from directory: $(pwd)${NC}"

# Step 1: Login to ECR
echo -e "${YELLOW}🔐 Logging in to ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to login to ECR${NC}"
    exit 1
fi

echo -e "${GREEN}✅ ECR login successful${NC}"

# Step 2: Build Docker image
echo -e "${YELLOW}🏗️  Building Docker image...${NC}"
docker build --platform linux/amd64 -t $ECR_REPOSITORY .

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker build successful${NC}"

# Step 3: Tag the image
echo -e "${YELLOW}🏷️  Tagging image...${NC}"
docker tag $ECR_REPOSITORY:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to tag image${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Image tagged successfully${NC}"

# Step 4: Push to ECR
echo -e "${YELLOW}📤 Pushing image to ECR...${NC}"
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to push image to ECR${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Image pushed successfully!${NC}"

# Step 5: Clean up local images
echo -e "${YELLOW}🧹 Cleaning up local Docker images...${NC}"
docker rmi $ECR_REPOSITORY:$IMAGE_TAG
docker rmi $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Warning: Failed to remove some local images (this won't affect ECR)${NC}"
else
    echo -e "${GREEN}✅ Local images cleaned up${NC}"
fi

echo -e "${GREEN}🎉 Complete! Image available at:${NC}"
echo -e "${GREEN}   $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG${NC}"

# Go back to parent directory
cd ..

echo -e "${YELLOW}💡 Tip: You can now create a new task revision in ECS to use the updated image${NC}"
