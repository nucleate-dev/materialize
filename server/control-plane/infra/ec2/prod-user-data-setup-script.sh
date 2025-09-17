#!/bin/bash
# -------- user-data bootstrap for materialize control-plane (sparse checkout, ESM compiled) --------
set -euxo pipefail
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

# --- Static config ---
REGION="us-east-2"
APP_USER="app"

# Monorepo + sparse checkout settings
REPO_URL="git@github.com:sourish-a/materialize.git"   # SSH URL to your monorepo
GIT_BRANCH="main"                                     # branch/tag/SHA to deploy
REPO_ROOT="/opt/materialize"                          # repo working tree root
SPARSE_PATH="server/control-plane"                    # the only folder we want
APP_DIR="${REPO_ROOT}/${SPARSE_PATH}"                 # app working dir

# Secrets Manager identifiers
SECRET_DEPLOY_KEY_ID="materialize-github-ssh-deploy-key"           # private SSH key (plaintext)
SECRET_CONFIG_ID="materialize-control-plane/environment"           # JSON envs (plaintext JSON)

# Node + service config
NODE_MAJOR="22"                                       # install Node 22.x
EXEC_START="/usr/bin/node dist/server.js"             # run compiled JS (ESM-ready)

# --- Base packages + Node.js + AWS CLI + Git + jq ---
if command -v dnf >/dev/null 2>&1; then
  dnf -y update
  # NOTE: do NOT install 'curl' here; AL2023 ships curl-minimal which conflicts.
  dnf -y install git jq tar openssh-clients awscli --allowerasing
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  dnf -y install nodejs
else
  yum -y update
  yum -y install git jq tar openssh-clients awscli --allowerasing
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  yum -y install nodejs
fi

# --- Install CloudWatch Agent ---
yum install -y amazon-cloudwatch-agent || dnf install -y amazon-cloudwatch-agent

# Create CloudWatch Agent config directory if missing
mkdir -p /opt/aws/amazon-cloudwatch-agent/etc/

# Create CloudWatch Agent configuration file
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<EOF
{
  "agent": {
    "metrics_collection_interval": 60,
    "run_as_user": "root"
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/user-data.log",
            "log_group_name": "/ec2/materialize/user-data",
            "log_stream_name": "{instance_id}/user-data.log",
            "timestamp_format": "%Y-%m-%d %H:%M:%S"
          },
          {
            "file_path": "/var/log/control-plane.log",
            "log_group_name": "/ec2/materialize/control-plane",
            "log_stream_name": "{instance_id}/control-plane.log",
            "timestamp_format": "%Y-%m-%d %H:%M:%S"
          },
          {
            "file_path": "/var/log/control-plane.err",
            "log_group_name": "/ec2/materialize/control-plane",
            "log_stream_name": "{instance_id}/control-plane.err",
            "timestamp_format": "%Y-%m-%d %H:%M:%S"
          }
        ]
      }
    },
    "log_stream_name": "default"
  }
}
EOF

# Start CloudWatch Agent with the config
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
  -s

# --- Create non-root app user ---
id -u "$APP_USER" &>/dev/null || useradd -m -r -s /bin/bash "$APP_USER"

# --- Prepare SSH for GitHub (deploy key pulled from Secrets Manager) ---
runuser -u "$APP_USER" -- bash -lc "
  set -euxo pipefail
  mkdir -p ~/.ssh
  aws secretsmanager get-secret-value \
    --region '${REGION}' \
    --secret-id '${SECRET_DEPLOY_KEY_ID}' \
    --query 'SecretString' \
    --output text > ~/.ssh/id_ed25519
  chmod 600 ~/.ssh/id_ed25519

  # Non-interactive host key verification for GitHub
  ssh-keyscan github.com >> ~/.ssh/known_hosts

  # Ensure this identity is used for github.com
  cat > ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
EOF
  chmod 600 ~/.ssh/config
"

# --- Sparse clone (only server/control-plane) ---
mkdir -p "$REPO_ROOT"
chown -R "$APP_USER:$APP_USER" "$REPO_ROOT"

runuser -u "$APP_USER" -- bash -lc "
  set -euxo pipefail
  if [ -d '$REPO_ROOT/.git' ]; then
    git -C '$REPO_ROOT' config core.sparseCheckout true
    git -C '$REPO_ROOT' sparse-checkout set '$SPARSE_PATH'
    git -C '$REPO_ROOT' fetch --depth 1 origin '$GIT_BRANCH'
    git -C '$REPO_ROOT' reset --hard 'origin/$GIT_BRANCH'
  else
    git clone --branch '$GIT_BRANCH' --single-branch --depth 1 \
      --filter=blob:none --sparse '$REPO_URL' '$REPO_ROOT'
    git -C '$REPO_ROOT' sparse-checkout set '$SPARSE_PATH'
  fi
"

# --- Render .env from one JSON secret into the app directory (FIXED jq line) ---
runuser -u "$APP_USER" -- bash -lc "
  set -euxo pipefail
  mkdir -p '$APP_DIR'
  aws secretsmanager get-secret-value \
    --region '${REGION}' \
    --secret-id '${SECRET_CONFIG_ID}' \
    --query 'SecretString' \
    --output text \
  | jq -r 'to_entries | .[] | \"\(.key)=\(.value|tostring|@json)\"' > '$APP_DIR/.env'
"
chmod 600 "$APP_DIR/.env"
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"

# --- Fix .env permissions so ec2-user can read it ---
chown ec2-user:ec2-user "$APP_DIR/.env"
chmod 644 "$APP_DIR/.env"

# --- Install deps & build (compile to dist/) ---
runuser -u "$APP_USER" -- bash -lc "
  set -euxo pipefail
  cd '$APP_DIR'
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
  npm run build
  # Optional: slim runtime after build
  # npm prune --omit=dev
"

# --- systemd service (runs compiled server) ---
cat >/etc/systemd/system/control-plane.service <<EOF
[Unit]
Description=Materialize Control Plane (compiled)
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
# Environment=PATH=/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now control-plane

echo "[user-data] Bootstrap complete (region=${REGION}, app=${APP_DIR})."