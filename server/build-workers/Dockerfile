# Use Debian-based Node image (glibc, matches EC2)
FROM --platform=linux/amd64 node:22-slim

WORKDIR /app

# Install required system packages
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    python3-dev \
    curl \
    unzip \
    git \
    procps \
    watchman \
    && rm -rf /var/lib/apt/lists/*

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
RUN npm install -g @expo/ngrok@^4.1.0
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create log directory
RUN mkdir -p /tmp/logs

# Keep a minimal bashrc to prevent PTY exit
RUN echo '# Minimal bashrc for PTY sessions' > /etc/bash.bashrc && \
    echo 'export PS1="$ "' >> /etc/bash.bashrc && \
    echo '# Keep shell alive' >> /etc/bash.bashrc

# Expose app port
EXPOSE 3002

# Run Fastify server
CMD ["npm", "start"]