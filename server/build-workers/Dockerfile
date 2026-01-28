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
    libvips42 \
    libvips-dev \
    xvfb \
    libgtk-3-0 \
    libgbm1 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    fonts-liberation \
    && curl -L --fail https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared \
    && chmod +x /usr/local/bin/cloudflared \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Install GitHub CLI (gh) for source repo PR automation
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
      && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
      && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
      && apt-get update \
      && apt-get install -y --no-install-recommends gh \
      && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Install Bun runtime globally accessible to all users
# Using /opt/bun for system-wide installation
ENV BUN_INSTALL=/opt/bun
RUN curl -fsSL https://bun.sh/install | bash \
    && ln -sf /opt/bun/bin/bun /usr/local/bin/bun \
    && ln -sf /opt/bun/bin/bunx /usr/local/bin/bunx \
    && chmod -R 755 /opt/bun \
    && chmod 755 /opt/bun/bin/bun /opt/bun/bin/bunx

# Create shared Bun cache directory accessible to all users
RUN mkdir -p /tmp/bun-cache && chmod 1777 /tmp/bun-cache
RUN mkdir -p /tmp/bun-install-cache && chmod 1777 /tmp/bun-install-cache

# Environment setup for Node + Watchman + PTY
ENV TERM=xterm-256color
ENV SHELL=/bin/bash
ENV EXPO_NO_TELEMETRY=1
ENV CHOKIDAR_USEPOLLING=1
ENV CHOKIDAR_INTERVAL=100
ENV WATCHPACK_POLLING=true
# Next.js optimization settings
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_SHARP_PATH=/usr/lib/x86_64-linux-gnu/libvips.so.42
# Bun settings - use shared cache directories
ENV BUN_INSTALL=/opt/bun
ENV BUN_INSTALL_CACHE_DIR=/tmp/bun-install-cache
ENV BUN_TMPDIR=/tmp/bun-cache
ENV PATH="/opt/bun/bin:$PATH"

# Copy package files first for caching
COPY package*.json ./
COPY tsconfig.json ./

# Setup npm cache (faster installs)
RUN mkdir -p /tmp/npm-cache && chmod 777 /tmp/npm-cache
ENV NPM_CONFIG_CACHE=/tmp/npm-cache


# Global + project dependencies
RUN npm install -g @expo/ngrok@^4.1.0 typescript shadcn@latest
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create log directory and build workspace
RUN mkdir -p /tmp/logs /tmp/materialize-dev-server /tmp/source-repository

# Create unprivileged terminal user
RUN groupadd --system materialize-user && \
    useradd --system --gid materialize-user --shell /bin/bash --home-dir /tmp/materialize-dev-server materialize-user && \
    chown -R materialize-user:materialize-user /tmp/materialize-dev-server && \
    chown -R materialize-user:materialize-user /tmp/source-repository

# Create user-specific Bun directories with proper ownership
RUN mkdir -p /tmp/materialize-dev-server/.bun && \
    mkdir -p /tmp/materialize-dev-server/.cache/bun && \
    chown -R materialize-user:materialize-user /tmp/materialize-dev-server/.bun && \
    chown -R materialize-user:materialize-user /tmp/materialize-dev-server/.cache

# Set default ACLs so all new files created by root are automatically accessible to materialize-user
# This ensures Metro bundler (running as materialize-user) can read files created by CodeService (running as root)
RUN setfacl -R -m u:materialize-user:rwX /tmp/materialize-dev-server && \
    setfacl -R -d -m u:materialize-user:rwX /tmp/materialize-dev-server && \
    setfacl -R -d -m g:materialize-user:rwX /tmp/materialize-dev-server && \
    setfacl -R -m u:materialize-user:rwX /tmp/source-repository && \
    setfacl -R -d -m u:materialize-user:rwX /tmp/source-repository && \
    setfacl -R -d -m g:materialize-user:rwX /tmp/source-repository && \
    setfacl -R -m u:materialize-user:rwX /tmp/bun-cache && \
    setfacl -R -d -m u:materialize-user:rwX /tmp/bun-cache && \
    setfacl -R -m u:materialize-user:rwX /tmp/bun-install-cache && \
    setfacl -R -d -m u:materialize-user:rwX /tmp/bun-install-cache

# Keep a minimal bashrc to prevent PTY exit
# Also set Bun environment for materialize-user
RUN echo '# Minimal bashrc for PTY sessions' > /etc/bash.bashrc && \
    echo 'export PS1="$ "' >> /etc/bash.bashrc && \
    echo 'export BUN_INSTALL=/opt/bun' >> /etc/bash.bashrc && \
    echo 'export BUN_INSTALL_CACHE_DIR=/tmp/bun-install-cache' >> /etc/bash.bashrc && \
    echo 'export BUN_TMPDIR=/tmp/bun-cache' >> /etc/bash.bashrc && \
    echo 'export PATH="/opt/bun/bin:$PATH"' >> /etc/bash.bashrc && \
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

RUN mkdir -p /root/.claude/skills/designing-react-native-uis && \
    cp -R /app/skills/designing-react-native-uis/* /root/.claude/skills/designing-react-native-uis/ && \
    mkdir -p /root/.claude/skills/creating-landing-pages && \
    cp -R /app/skills/creating-landing-pages/* /root/.claude/skills/creating-landing-pages/ && \
    mkdir -p /root/.claude/skills/react-native-variants && \
    cp -R /app/skills/react-native-variants/* /root/.claude/skills/react-native-variants/

ENV TERMINAL_USER=materialize-user

COPY entrypoint.sh /usr/local/bin/worker-entrypoint.sh
RUN chmod +x /usr/local/bin/worker-entrypoint.sh

# Expose app port
EXPOSE 3002

# Run Fastify server
ENTRYPOINT ["/usr/local/bin/worker-entrypoint.sh"]
CMD ["npm", "start"]
