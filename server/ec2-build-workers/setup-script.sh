#!/bin/bash

# EC2 Setup Script for React Native Web Build Workers
# This script should be run on each EC2 instance in the auto-scaling group

set -e

echo "Setting up React Native Web Build Worker..."

# Update system
sudo yum update -y

# Install Node.js (using NodeSource)
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install Bun (fast JavaScript runtime and package manager)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Install system dependencies
sudo yum install -y git zip unzip

# Install React Native CLI globally
sudo npm install -g @react-native-community/cli

# Install PM2 for process management
sudo npm install -g pm2

# Create app directory
sudo mkdir -p /opt/rn-build-worker
sudo chown ec2-user:ec2-user /opt/rn-build-worker

# Create workspace directory
mkdir -p /opt/rn-build-worker/workspace

# Set up log directories
sudo mkdir -p /var/log/rn-build-worker
sudo chown ec2-user:ec2-user /var/log/rn-build-worker

# Copy application files (assuming they're in the current directory)
cd /opt/rn-build-worker

# Install worker dependencies
npm install

# Create systemd service file
sudo tee /etc/systemd/system/rn-build-worker.service > /dev/null <<EOF
[Unit]
Description=React Native Build Worker
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/rn-build-worker
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=WORKSPACE_DIR=/opt/rn-build-worker/workspace
Environment=AWS_REGION=\$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
Environment=WORKER_IP=\$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
ExecStart=/usr/bin/node worker.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=rn-build-worker

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable rn-build-worker
sudo systemctl start rn-build-worker

# Set up log rotation
sudo tee /etc/logrotate.d/rn-build-worker > /dev/null <<EOF
/var/log/rn-build-worker/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 644 ec2-user ec2-user
    postrotate
        systemctl reload rn-build-worker > /dev/null 2>&1 || true
    endscript
}
EOF

# Create a default React Native template for faster builds
mkdir -p /opt/rn-build-worker/templates/default
cd /opt/rn-build-worker/templates/default

# Initialize a basic React Native Web project template
npx react-native init DefaultTemplate --template react-native-template-typescript
cd DefaultTemplate

# Install React Native Web dependencies
npm install react-native-web react-dom
npm install --save-dev @babel/core @babel/preset-env @babel/preset-react @babel/preset-typescript
npm install --save-dev webpack webpack-cli webpack-dev-server
npm install --save-dev babel-loader css-loader style-loader file-loader url-loader

# Create webpack config for web builds
cat > webpack.config.js <<'WEBPACK_EOF'
const path = require('path');

module.exports = {
  entry: './index.web.js',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              '@babel/preset-react',
              '@babel/preset-typescript'
            ],
            plugins: [
              ['@babel/plugin-proposal-class-properties', { loose: true }]
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              outputPath: 'images',
            },
          },
        ],
      }
    ]
  },
  resolve: {
    extensions: ['.web.js', '.js', '.web.jsx', '.jsx', '.web.ts', '.ts', '.web.tsx', '.tsx'],
    alias: {
      'react-native': 'react-native-web'
    }
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'build'),
    publicPath: '/'
  }
};
WEBPACK_EOF

# Create web entry point
cat > index.web.js <<'INDEX_EOF'
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.runApplication(appName, {
  initialProps: {},
  rootTag: document.getElementById('app-root')
});
INDEX_EOF

# Update package.json with build script
npm pkg set scripts.build="webpack --mode production"
npm pkg set scripts.start:web="webpack serve --mode development"

# Pre-install all dependencies to speed up builds
npm install

echo "React Native Web Build Worker setup complete!"
echo "Service status:"
sudo systemctl status rn-build-worker

echo "To check logs:"
echo "sudo journalctl -u rn-build-worker -f"

echo "Worker health check:"
curl -s http://localhost:3001/health | jq '.' || echo "Worker not responding yet"