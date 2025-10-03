#!/bin/bash

# EC2 User Data Script for Materialize Control Plane Dev Environment
# This script runs at instance launch to set up prerequisites and CloudWatch logging

set -euxo pipefail

# Variables - these should match the deploy script
USER="ec2-user"
REMOTE_BASE="/home/${USER}/control-plane"
BUILD_WORKERS_BASE="/home/${USER}/build-workers"
CW_CONFIG_PATH="/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json"
CW_LOG_FILE="${REMOTE_BASE}/dev-server.log"
CW_LOG_GROUP="/ec2/materialize/control-plane-dev"

echo "==> Starting EC2 user data script for Materialize Control Plane Dev"

# 1. Install system prerequisites
echo "==> Installing system prerequisites..."

if command -v dnf >/dev/null 2>&1; then
  # Amazon Linux 2023 / RHEL 9+ (uses dnf)
  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo dnf install -y nodejs gcc-c++ make
  fi
  command -v unzip >/dev/null 2>&1 || sudo dnf install -y unzip
  sudo dnf install -y amazon-cloudwatch-agent

  # Install Chrome dependencies for Puppeteer
  echo "==> Installing Chrome dependencies for Puppeteer..."
  dnf -y install \
    xorg-x11-server-Xvfb \
    gtk3 \
    libXcomposite \
    libXcursor \
    libXdamage \
    libXext \
    libXi \
    libXtst \
    cups-libs \
    libXScrnSaver \
    libXrandr \
    alsa-lib \
    atk \
    cairo \
    cairo-gobject \
    fontconfig \
    freetype \
    gdk-pixbuf2 \
    glib2 \
    glibc \
    libdrm \
    libX11 \
    libXau \
    libXdmcp \
    libXrender \
    libgcc \
    libstdc++ \
    nspr \
    nss \
    nss-util \
    pango \
    libXfixes \
    libxcb \
    libXinerama \
    libXt \
    xdg-utils

  # Install build-workers dependencies (watchman prerequisites)
  echo "==> Installing build-workers dependencies for watchman..."
  dnf -y install \
    autoconf \
    automake \
    libtool \
    python3 \
    python3-devel \
    openssl-devel \
    pcre2-devel \
    libevent-devel \
    curl \
    rust \
    cargo
else
  # Amazon Linux 2 / RHEL 8 (uses yum)
  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo yum install -y nodejs gcc-c++ make
  fi
  command -v unzip >/dev/null 2>&1 || sudo yum install -y unzip
  sudo yum install -y amazon-cloudwatch-agent

  # Install Chrome dependencies for Puppeteer
  echo "==> Installing Chrome dependencies for Puppeteer..."
  sudo yum install -y \
    xorg-x11-server-Xvfb \
    gtk3 \
    libXcomposite \
    libXcursor \
    libXdamage \
    libXext \
    libXi \
    libXtst \
    cups-libs \
    libXScrnSaver \
    libXrandr \
    GConf2 \
    alsa-lib \
    atk \
    cairo \
    cairo-gobject \
    fontconfig \
    freetype \
    gdk-pixbuf2 \
    glib2 \
    glibc \
    libdrm \
    libX11 \
    libXau \
    libXdmcp \
    libXrender \
    libgcc \
    libstdc++ \
    nspr \
    nss \
    nss-util \
    pango \
    libXfixes \
    libxcb \
    libXss \
    libXinerama \
    libXt \
    xdg-utils

  # Install build-workers dependencies (watchman prerequisites)
  echo "==> Installing build-workers dependencies for watchman..."
  sudo yum install -y \
    autoconf \
    automake \
    libtool \
    python3 \
    python3-devel \
    openssl-devel \
    pcre2-devel \
    libevent-devel \
    curl \
    rust \
    cargo
fi

# 2. Install watchman for build-workers
echo "==> Installing watchman from prebuilt binary..."
WATCHMAN_VERSION="2024.01.15.00"
cd /tmp
curl -L "https://github.com/facebook/watchman/releases/download/v${WATCHMAN_VERSION}/watchman-v${WATCHMAN_VERSION}-linux.zip" -o watchman.zip
unzip watchman.zip
cd watchman-v${WATCHMAN_VERSION}-linux
mkdir -p /usr/local/bin /usr/local/lib /usr/local/var/run/watchman
cp bin/* /usr/local/bin/
cp lib/* /usr/local/lib/
chmod 755 /usr/local/bin/watchman
chmod 2777 /usr/local/var/run/watchman
cd ..
rm -rf watchman*
ldconfig /usr/local/lib

# 3. Install global npm packages for build-workers
echo "==> Installing @expo/ngrok globally..."
npm install -g @expo/ngrok@^4.1.0

# 4. Create application directories
echo "==> Creating application directories..."
mkdir -p ${REMOTE_BASE}
mkdir -p ${BUILD_WORKERS_BASE}
mkdir -p /tmp/logs
mkdir -p /tmp/npm-cache
chmod 777 /tmp/npm-cache
chown ${USER}:${USER} ${REMOTE_BASE}
chown ${USER}:${USER} ${BUILD_WORKERS_BASE}
chown ${USER}:${USER} /tmp/logs

# 5. Set environment variables for build-workers
echo "==> Setting environment variables in ec2-user's profile..."
cat >> /home/${USER}/.bashrc << 'EOF'
export EXPO_NO_TELEMETRY=1
export CHOKIDAR_USEPOLLING=1
export CHOKIDAR_INTERVAL=100
export WATCHPACK_POLLING=true
export NPM_CONFIG_CACHE=/tmp/npm-cache
EOF

echo "✅ System prerequisites installed successfully"

# 6. Configure CloudWatch Agent
echo "==> Configuring CloudWatch Agent..."

# Write CloudWatch Agent configuration
sudo bash -c "cat > ${CW_CONFIG_PATH}" <<EOCONFIG
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "${CW_LOG_FILE}",
            "log_group_name": "${CW_LOG_GROUP}",
            "log_stream_name": "{instance_id}-dev-server",
            "timestamp_format": "%Y-%m-%d %H:%M:%S"
          }
        ]
      }
    },
    "force_flush_interval": 5
  }
}
EOCONFIG

# Start and configure CloudWatch Agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -c file:${CW_CONFIG_PATH} \
  -s

echo "✅ CloudWatch Agent configured and started successfully"

# 7. Schedule auto-termination in 3 hours
echo "==> Scheduling auto-termination in 3 hours..."
shutdown -h +180

echo "==> EC2 user data script completed successfully"
echo "Instance is ready for application deployment"

# Signal completion for monitoring (create a marker file)
echo "$(date): User data script completed successfully" > /tmp/user-data-complete
echo "✅ User data script execution complete - instance ready for deployment"