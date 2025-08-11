#!/bin/bash

# EC2 Build Worker Setup Script
# This script installs all required dependencies for the React Native Web build worker

set -e  # Exit on any error

echo "🚀 Starting EC2 Build Worker setup..."

# Update system packages
echo "📦 Updating system packages..."
if command -v yum &> /dev/null; then
    sudo yum update -y
elif command -v apt-get &> /dev/null; then
    sudo apt-get update -y
else
    echo "❌ Neither yum nor apt-get found. Unsupported OS."
    exit 1
fi

# Install Node.js (LTS version)
echo "📦 Installing Node.js..."
if command -v yum &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
    sudo yum install -y nodejs
elif command -v apt-get &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Verify Node.js installation
echo "✅ Node.js version: $(node --version)"
echo "✅ NPM version: $(npm --version)"

# Install Bun globally (for running the worker)
echo "📦 Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc

# Install global npm packages required by the worker
echo "📦 Installing global npm packages..."

# Expo CLI - required for building React Native projects
bun install -g @expo/cli

# Expo ngrok - required for tunneling in dev mode
bun install -g @expo/ngrok@^4.1.0

# Additional build tools
bun install -g typescript

# Install essential system dependencies
# echo "📦 Installing essential system dependencies..."
# if command -v yum &> /dev/null; then
#     sudo yum install -y curl unzip lsof
# elif command -v apt-get &> /dev/null; then
#     sudo apt-get install -y curl unzip lsof
# fi

# Install AWS CLI for S3 operations
echo "📦 Installing AWS CLI..."
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
rm -rf awscliv2.zip aws/

# Create directories for the worker
echo "📁 Creating worker directories..."
mkdir -p ~/build-worker
sudo mkdir -p /var/log/build-worker

# Set appropriate permissions
sudo chown -R ubuntu:ubuntu /var/log/build-worker

# Create systemd service file for the worker
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/build-worker.service > /dev/null <<EOF
[Unit]
Description=React Native Web Build Worker
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=1
User=ubuntu
WorkingDirectory=/home/ubuntu
Environment=NODE_ENV=production
Environment=PATH=/home/ubuntu/.bun/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/home/ubuntu/.bun/bin/bun worker.ts
StandardOutput=append:/var/log/build-worker/stdout.log
StandardError=append:/var/log/build-worker/stderr.log

[Install]
WantedBy=multi-user.target
EOF

# Enable the service (but don't start it yet)
sudo systemctl enable build-worker

# Create log rotation configuration
echo "📝 Setting up log rotation..."
sudo tee /etc/logrotate.d/build-worker > /dev/null <<EOF
/var/log/build-worker/*.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
    create 644 ubuntu ubuntu
}
EOF

# Verify global installations
echo "🔍 Verifying installations..."
echo "✅ Expo CLI version: $(expo --version || echo 'Not found')"
echo "✅ Bun version: $(bun --version || echo 'Not found')"
echo "✅ AWS CLI version: $(aws --version || echo 'Not found')"

# Set up environment variables template
echo "📋 Creating environment template..."
cat > ~/build-worker/.env.template <<EOF
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
BUCKET_NAME=materialize-sites

# Server Configuration
PORT=3002
PROTOTYPES_DIR=./prototypes

# Expo Configuration
EXPO_NO_TELEMETRY=1
CI=1
EOF

echo "🎉 EC2 Build Worker setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Copy your worker.ts and package.json to ~/build-worker/"
echo "2. Configure environment variables in ~/build-worker/.env"
echo "3. Start the service with: sudo systemctl start build-worker"
echo "4. Check logs with: sudo journalctl -u build-worker -f"
echo ""
echo "🔧 Service management commands:"
echo "  Start:   sudo systemctl start build-worker"
echo "  Stop:    sudo systemctl stop build-worker" 
echo "  Restart: sudo systemctl restart build-worker"
echo "  Status:  sudo systemctl status build-worker"
echo "  Logs:    sudo journalctl -u build-worker -f"