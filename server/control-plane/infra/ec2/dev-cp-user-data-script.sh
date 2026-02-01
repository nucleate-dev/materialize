#!/bin/bash

# EC2 User Data Script for Materialize Control Plane Dev Environment
# This script runs at instance launch to set up prerequisites and CloudWatch logging

set -euxo pipefail

# Ensure HOME is set for non-interactive shells (cloud-init uses set -u).
: "${HOME:=/root}"

# Variables - these should match the deploy script
USER="ec2-user"
REMOTE_BASE="/home/${USER}/control-plane"
BUILD_WORKERS_BASE="/home/${USER}/build-workers"
CW_CONFIG_PATH="/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json"
CW_LOG_FILE_CP="${REMOTE_BASE}/dev-server.log"
CW_LOG_FILE_BW="${BUILD_WORKERS_BASE}/dev-server.log"
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
  command -v git >/dev/null 2>&1 || sudo dnf install -y git
  command -v lsof >/dev/null 2>&1 || sudo dnf install -y lsof
  sudo dnf install -y amazon-cloudwatch-agent
  if ! command -v gh >/dev/null 2>&1; then
    sudo dnf install -y dnf-plugins-core
    sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
    sudo dnf install -y gh
  fi

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
    rust \
    cargo \
    acl
else
  # Amazon Linux 2 / RHEL 8 (uses yum)
  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
    sudo yum install -y nodejs gcc-c++ make
  fi
  command -v unzip >/dev/null 2>&1 || sudo yum install -y unzip
  command -v git >/dev/null 2>&1 || sudo yum install -y git
  command -v lsof >/dev/null 2>&1 || sudo yum install -y lsof
  sudo yum install -y amazon-cloudwatch-agent
  if ! command -v gh >/dev/null 2>&1; then
    sudo yum install -y yum-utils
    sudo yum-config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
    sudo yum install -y gh
  fi

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
    rust \
    cargo \
    acl
fi

# 1a. Install cloudflared for HTTPS tunnels
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "==> Installing cloudflared..."
  CLOUDFLARED_ARCH="amd64"
  if [ "$(uname -m)" = "aarch64" ]; then
    CLOUDFLARED_ARCH="arm64"
  fi
  curl -L -o /tmp/cloudflared "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CLOUDFLARED_ARCH}"
  chmod +x /tmp/cloudflared
  sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
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

# 3. Install Bun runtime for Vite projects (shared install for non-root users)
echo "==> Installing Bun runtime..."
BUN_INSTALL=/usr/local/bun curl -fsSL https://bun.sh/install | bash
ln -sf /usr/local/bun/bin/bun /usr/local/bin/bun
ln -sf /usr/local/bun/bin/bunx /usr/local/bin/bunx
chmod -R a+rX /usr/local/bun

# 4. Install global npm packages for build-workers
echo "==> Installing @expo/ngrok globally..."
npm install -g @expo/ngrok@^4.1.0 typescript shadcn@latest

# 5. Create application directories
echo "==> Creating application directories..."
mkdir -p ${REMOTE_BASE}
mkdir -p ${BUILD_WORKERS_BASE}
mkdir -p /tmp/logs
chown ${USER}:${USER} ${REMOTE_BASE}
chown ${USER}:${USER} ${BUILD_WORKERS_BASE}
chown ${USER}:${USER} /tmp/logs

# 5a. Create materialize-user to mirror Fargate containers
echo "==> Creating materialize-user for sandbox parity..."
MATERIALIZE_USER="materialize-user"
MATERIALIZE_GROUP="materialize-user"
MATERIALIZE_HOME="/tmp/materialize-dev-server"
if ! getent group ${MATERIALIZE_GROUP} >/dev/null; then
  groupadd --system ${MATERIALIZE_GROUP}
fi
if ! id -u ${MATERIALIZE_USER} >/dev/null 2>&1; then
  useradd --system --gid ${MATERIALIZE_GROUP} --shell /bin/bash --home-dir ${MATERIALIZE_HOME} ${MATERIALIZE_USER}
fi
mkdir -p ${MATERIALIZE_HOME}
chown -R ${MATERIALIZE_USER}:${MATERIALIZE_GROUP} ${MATERIALIZE_HOME}
setfacl -R -m u:${MATERIALIZE_USER}:rwX ${MATERIALIZE_HOME}
setfacl -R -m g:${MATERIALIZE_GROUP}:rwX ${MATERIALIZE_HOME}
setfacl -R -d -m u:${MATERIALIZE_USER}:rwX ${MATERIALIZE_HOME}
setfacl -R -d -m g:${MATERIALIZE_GROUP}:rwX ${MATERIALIZE_HOME}

# Set up /tmp/source-repository with same ACL permissions
mkdir -p /tmp/source-repository
chown -R ${MATERIALIZE_USER}:${MATERIALIZE_GROUP} /tmp/source-repository
setfacl -R -m u:${MATERIALIZE_USER}:rwX /tmp/source-repository
setfacl -R -m g:${MATERIALIZE_GROUP}:rwX /tmp/source-repository
setfacl -R -d -m u:${MATERIALIZE_USER}:rwX /tmp/source-repository
setfacl -R -d -m g:${MATERIALIZE_GROUP}:rwX /tmp/source-repository

# 6. Set environment variables for build-workers
echo "==> Setting environment variables in ec2-user's profile..."
cat >> /home/${USER}/.bashrc << 'EOF'
export EXPO_NO_TELEMETRY=1
export CHOKIDAR_USEPOLLING=1
export CHOKIDAR_INTERVAL=100
export WATCHPACK_POLLING=true
export BUN_INSTALL=/usr/local/bun
export PATH="$BUN_INSTALL/bin:$PATH"
EOF

# Make Bun available for all users (including materialize-user)
cat > /etc/profile.d/bun.sh << 'EOF'
export BUN_INSTALL=/usr/local/bun
export PATH="$BUN_INSTALL/bin:$PATH"
EOF
chmod 644 /etc/profile.d/bun.sh

echo "✅ System prerequisites installed successfully"

# 7. Configure CloudWatch Agent
echo "==> Configuring CloudWatch Agent..."

# Write CloudWatch Agent configuration
sudo bash -c "cat > ${CW_CONFIG_PATH}" <<EOCONFIG
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "${CW_LOG_FILE_CP}",
            "log_group_name": "${CW_LOG_GROUP}",
            "log_stream_name": "{instance_id}-control-plane",
            "timestamp_format": "%Y-%m-%d %H:%M:%S"
          },
          {
            "file_path": "${CW_LOG_FILE_BW}",
            "log_group_name": "${CW_LOG_GROUP}",
            "log_stream_name": "{instance_id}-build-workers",
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

# 8. Schedule auto-termination in 3 hours
echo "==> Scheduling auto-termination in 3 hours..."
shutdown -h +180

echo "==> EC2 user data script completed successfully"
echo "Instance is ready for application deployment"

# Signal completion for monitoring (create a marker file)
echo "$(date): User data script completed successfully" > /tmp/user-data-complete
echo "✅ User data script execution complete - instance ready for deployment"
