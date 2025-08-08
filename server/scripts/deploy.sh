#!/bin/bash

# Materialize Server Deployment Script for EC2
# Usage: ./scripts/deploy.sh [environment]
# Example: ./scripts/deploy.sh production

ENVIRONMENT=${1:-staging}

echo "🚀 Starting deployment for $ENVIRONMENT environment..."

# Check if required environment variables are set
if [ -z "$EC2_HOST" ]; then
    echo "❌ EC2_HOST environment variable is required"
    exit 1
fi

if [ -z "$EC2_USER" ]; then
    echo "❌ EC2_USER environment variable is required"
    exit 1
fi

# Build the application
echo "📦 Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf deploy.tar.gz \
    dist/ \
    package.json \
    package-lock.json \
    ecosystem.config.js \
    .env.example

# Copy to EC2 instance
echo "📤 Uploading to EC2 instance..."
scp -o StrictHostKeyChecking=no deploy.tar.gz $EC2_USER@$EC2_HOST:~/

# Deploy on EC2
echo "🚀 Deploying on EC2..."
ssh -o StrictHostKeyChecking=no $EC2_USER@$EC2_HOST << EOF
    # Stop existing application
    pm2 stop materialize-server || true
    
    # Backup current deployment
    if [ -d "materialize-server" ]; then
        mv materialize-server materialize-server-backup-\$(date +%Y%m%d-%H%M%S)
    fi
    
    # Create new directory
    mkdir -p materialize-server
    cd materialize-server
    
    # Extract deployment package
    tar -xzf ~/deploy.tar.gz
    
    # Install dependencies
    npm ci --only=production
    
    # Create logs directory
    mkdir -p logs
    
    # Start application with PM2
    pm2 start ecosystem.config.js --env $ENVIRONMENT
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    sudo env PATH=\$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u \$USER --hp \$HOME || true
    
    # Clean up
    rm ~/deploy.tar.gz
    
    echo "✅ Deployment completed successfully"
EOF

# Clean up local files
rm deploy.tar.gz

echo "🎉 Deployment to $ENVIRONMENT completed!"
echo "📊 Check application status: ssh $EC2_USER@$EC2_HOST 'pm2 status'"
echo "📋 View logs: ssh $EC2_USER@$EC2_HOST 'pm2 logs materialize-server'"