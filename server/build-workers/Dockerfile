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
RUN npm install -g @expo/ngrok@^4.1.0 typescript @anthropic-ai/claude-code
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create log directory and build workspace
RUN mkdir -p /tmp/logs /tmp/materialize-dev-server

# Keep a minimal bashrc to prevent PTY exit
RUN echo '# Minimal bashrc for PTY sessions' > /etc/bash.bashrc && \
    echo 'export PS1="$ "' >> /etc/bash.bashrc && \
    echo '# Keep shell alive' >> /etc/bash.bashrc

# Expose app port
EXPOSE 3002

# Run Fastify server
CMD ["npm", "start"]
