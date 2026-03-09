#!/bin/bash
# -------- user-data bootstrap for materialize control-plane (S3 prebuilt dist) --------
set -euxo pipefail
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

# --- Static config ---
REGION="us-east-2"
APP_USER="app"
APP_DIR="/opt/materialize/server/control-plane"
S3_BUCKET="materialize-control-plane"
S3_KEY="dist/control-plane-dist.zip"
SECRET_CONFIG_ID="materialize-control-plane/environment"
EIP_ALLOCATION_ID="eipalloc-09e9c897144d50786"

# Node + service config
NODE_MAJOR="22"
EXEC_START="/usr/bin/node dist/server.js"

# --- Base packages + Node.js + AWS CLI + jq ---
if command -v dnf >/dev/null 2>&1; then
  dnf -y update
  dnf -y install jq tar unzip awscli --allowerasing
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  dnf -y install nodejs

  # Install Chrome dependencies for Puppeteer
  echo "[user-data] Installing Chrome dependencies for Puppeteer..."
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
else
  yum -y update
  yum -y install jq tar unzip awscli --allowerasing
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  yum -y install nodejs

  # Install Chrome dependencies for Puppeteer
  echo "[user-data] Installing Chrome dependencies for Puppeteer..."
  yum -y install \
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
fi

# --- Attach Elastic IP ---
echo "[user-data] Attaching Elastic IP..."
INSTANCE_ID=$(ec2-metadata -i | awk '{print $2}')
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$EIP_ALLOCATION_ID" --region "$REGION" --allow-reassociation

# --- Install CloudWatch Agent ---
yum install -y amazon-cloudwatch-agent || dnf install -y amazon-cloudwatch-agent
mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/

cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<EOF
{
  "agent": { "metrics_collection_interval": 60, "run_as_user": "root" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/var/log/user-data.log", "log_group_name": "/ec2/materialize/user-data", "log_stream_name": "{instance_id}/user-data.log", "timestamp_format": "%Y-%m-%d %H:%M:%S" },
          { "file_path": "/var/log/control-plane.log", "log_group_name": "/ec2/materialize/control-plane", "log_stream_name": "{instance_id}/control-plane.log", "timestamp_format": "%Y-%m-%d %H:%M:%S" },
          { "file_path": "/var/log/control-plane.err", "log_group_name": "/ec2/materialize/control-plane", "log_stream_name": "{instance_id}/control-plane.err", "timestamp_format": "%Y-%m-%d %H:%M:%S" }
        ]
      }
    }
  }
}
EOF

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s

# --- Create non-root app user ---
id -u "$APP_USER" &>/dev/null || useradd -m -r -s /bin/bash "$APP_USER"

# --- Prepare app directory ---
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" /opt/materialize

# --- Pull dist from S3 ---
echo "[user-data] Downloading dist from S3..."
aws s3 cp "s3://${S3_BUCKET}/${S3_KEY}" /tmp/control-plane-dist.zip --region "$REGION"

# Clean out old dist before unzip
rm -rf "$APP_DIR"/*

runuser -u "$APP_USER" -- bash -lc "
  set -euxo pipefail
  mkdir -p '$APP_DIR'
  unzip -o /tmp/control-plane-dist.zip -d '$APP_DIR'
  cd '$APP_DIR'
  npm install --omit=dev
"
rm -f /tmp/control-plane-dist.zip

# --- Render .env from Secrets Manager ---
runuser -u "$APP_USER" -- bash -lc "
  set -euxo pipefail
  aws secretsmanager get-secret-value \
    --region '${REGION}' \
    --secret-id '${SECRET_CONFIG_ID}' \
    --query 'SecretString' \
    --output text \
  | jq -r 'to_entries | .[] | \"\(.key)=\(.value|tostring|@json)\"' > '${APP_DIR}/.env'
"
chmod 600 "${APP_DIR}/.env"
chown "$APP_USER:$APP_USER" "${APP_DIR}/.env"

# --- systemd service ---
cat >/etc/systemd/system/control-plane.service <<EOF
[Unit]
Description=Materialize Control Plane (prebuilt dist)
After=network-online.target
Wants=network-online.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${EXEC_START}
Restart=always
RestartSec=3
StandardOutput=append:/var/log/control-plane.log
StandardError=append:/var/log/control-plane.err

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now control-plane

# --- Install and configure Caddy (TLS termination + reverse proxy, replaces ALB) ---
echo "[user-data] Installing Caddy..."
CADDY_VERSION=$(curl -s "https://api.github.com/repos/caddyserver/caddy/releases/latest" | jq -r '.tag_name' | sed 's/^v//')
if [[ -z "$CADDY_VERSION" || "$CADDY_VERSION" == "null" ]]; then
  echo "[user-data] ERROR: Failed to fetch Caddy version from GitHub API"
  exit 1
fi
curl -sfLo /tmp/caddy.tar.gz "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz"
mkdir -p /tmp/caddy-extract
tar -xzf /tmp/caddy.tar.gz -C /tmp/caddy-extract
install -m 0755 /tmp/caddy-extract/caddy /usr/bin/caddy
rm -rf /tmp/caddy-extract /tmp/caddy.tar.gz

groupadd --system caddy 2>/dev/null || true
useradd --system --gid caddy --create-home --home-dir /var/lib/caddy --shell /usr/sbin/nologin caddy 2>/dev/null || true
mkdir -p /etc/caddy /var/lib/caddy/.config /var/lib/caddy/.local
chown -R caddy:caddy /var/lib/caddy

cat > /etc/caddy/Caddyfile <<'CADDYEOF'
{
    on_demand_tls {
        ask http://localhost:3000/health
    }
}

https:// {
    tls {
        on_demand
    }
    reverse_proxy localhost:3000
}
CADDYEOF
chown caddy:caddy /etc/caddy/Caddyfile

cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy reverse proxy
After=network-online.target control-plane.service
Wants=network-online.target

[Service]
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Restart=on-failure
RestartSec=5
Environment=XDG_DATA_HOME=/var/lib/caddy/.local
Environment=XDG_CONFIG_HOME=/var/lib/caddy/.config

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now caddy

echo "[user-data] Bootstrap complete (region=${REGION}, app=${APP_DIR})."