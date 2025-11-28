# Use Debian-based Node image (glibc, matches EC2)
FROM --platform=linux/amd64 node:22-slim

WORKDIR /app

# Install required system packages
# Force refresh of package lists and install dependencies
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/* && \
    apt-get update -o Acquire::Check-Valid-Until=false && \
    apt-get install -y --no-install-recommends \
    build-essential \
    acl \
    python3 \
    python3-dev \
    curl \
    ca-certificates \
    unzip \
    git \
    procps \
    watchman \
    && curl -L --fail https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared \
    && chmod +x /usr/local/bin/cloudflared \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Environment setup for Node + Watchman + PTY
ENV TERM=xterm-256color
ENV SHELL=/bin/bash
ENV EXPO_NO_TELEMETRY=1
ENV CHOKIDAR_USEPOLLING=1
ENV CHOKIDAR_INTERVAL=100
ENV WATCHPACK_POLLING=true

# Copy package files first for caching
COPY package*.json ./
COPY tsconfig.json ./

# Setup npm cache (faster installs)
RUN mkdir -p /tmp/npm-cache && chmod 777 /tmp/npm-cache
ENV NPM_CONFIG_CACHE=/tmp/npm-cache

# Global + project dependencies
RUN npm install -g @expo/ngrok@^4.1.0 typescript
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create log directory and build workspace
RUN mkdir -p /tmp/logs /tmp/materialize-dev-server

# Create unprivileged terminal user
RUN groupadd --system materialize-user && \
    useradd --system --gid materialize-user --shell /bin/bash --home-dir /tmp/materialize-dev-server materialize-user && \
    chown -R materialize-user:materialize-user /tmp/materialize-dev-server

# Set default ACLs so all new files created by root are automatically accessible to materialize-user
# This ensures Metro bundler (running as materialize-user) can read files created by CodeService (running as root)
RUN setfacl -R -m u:materialize-user:rwX /tmp/materialize-dev-server && \
    setfacl -R -d -m u:materialize-user:rwX /tmp/materialize-dev-server && \
    setfacl -R -d -m g:materialize-user:rwX /tmp/materialize-dev-server

# Keep a minimal bashrc to prevent PTY exit
RUN echo '# Minimal bashrc for PTY sessions' > /etc/bash.bashrc && \
    echo 'export PS1="$ "' >> /etc/bash.bashrc && \
    echo '# Keep shell alive' >> /etc/bash.bashrc

# Create Claude Code settings directory and configure permissions
RUN mkdir -p /root/.claude && \
    echo '{\n\
  "permissions": {\n\
    "allow": [\n\
      "Read(/tmp/materialize-dev-server/.env)",\n\
      "Edit(/tmp/materialize-dev-server/.env)",\n\
      "Write(/tmp/materialize-dev-server/.env)"\n\
    ],\n\
    "deny": [\n\
      "Read(./.env)",\n\
      "Read(./.env.*)",\n\
      "Read(./secrets/**)",\n\
      "Read(./**/.env)",\n\
      "Read(./**/.env.*)",\n\
      "Read(/tmp/**/.env)",\n\
      "Read(/tmp/**/.env.*)",\n\
      "Edit(/tmp/**/.env)",\n\
      "Edit(/tmp/**/.env.*)",\n\
      "Write(/tmp/**/.env)",\n\
      "Write(/tmp/**/.env.*)",\n\
      "Read(./build-workers/**)",\n\
      "Read(./control-plane/**)",\n\
      "Edit(./build-workers/**)",\n\
      "Edit(./control-plane/**)",\n\
      "Write(./build-workers/**)",\n\
      "Write(./control-plane/**)",\n\
      "Bash(cd */build-workers*)",\n\
      "Bash(cd */control-plane*)",\n\
      "Bash(ps*)",\n\
      "Bash(top*)",\n\
      "Bash(htop*)",\n\
      "Bash(pgrep*)",\n\
      "Bash(pkill*)",\n\
      "Bash(kill*)",\n\
      "Bash(killall*)"\n\
    ]\n\
  },\n\
  "env": {\n\
    "CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR": "true",\n\
    "CLAUDE_CODE_STREAM_CLOSE_TIMEOUT": "300000"\n\
  }\n\
}' > /root/.claude/settings.json

ENV TERMINAL_USER=materialize-user

COPY entrypoint.sh /usr/local/bin/worker-entrypoint.sh
RUN chmod +x /usr/local/bin/worker-entrypoint.sh

# Expose app port
EXPOSE 3002

# Run Fastify server
ENTRYPOINT ["/usr/local/bin/worker-entrypoint.sh"]
CMD ["npm", "start"]
