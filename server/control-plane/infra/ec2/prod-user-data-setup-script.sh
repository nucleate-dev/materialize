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

# Node + service config
NODE_MAJOR="22"
EXEC_START="/usr/bin/node dist/server.js"

# --- Base packages + Node.js + AWS CLI + jq ---
if command -v dnf >/dev/null 2>&1; then
  dnf -y update
  dnf -y install jq tar unzip awscli --allowerasing
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  dnf -y install nodejs
else
  yum -y update
  yum -y install jq tar unzip awscli --allowerasing
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  yum -y install nodejs
fi

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

echo "[user-data] Bootstrap complete (region=${REGION}, app=${APP_DIR})."