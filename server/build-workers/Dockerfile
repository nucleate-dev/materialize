FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

# Install system dependencies for watchman
RUN apk add --no-cache \
    build-base \
    autoconf \
    automake \
    libtool \
    bash \
    python3 \
    python3-dev \
    openssl-dev \
    pcre2-dev \
    libevent-dev \
    curl \
    unzip \
    rust \
    cargo

# Install watchman from prebuilt binary (faster than building from source)
RUN WATCHMAN_VERSION="2024.01.15.00" && \
    curl -L "https://github.com/facebook/watchman/releases/download/v${WATCHMAN_VERSION}/watchman-v${WATCHMAN_VERSION}-linux.zip" -o watchman.zip && \
    unzip watchman.zip && \
    cd watchman-v${WATCHMAN_VERSION}-linux && \
    mkdir -p /usr/local/bin /usr/local/lib /usr/local/var/run/watchman && \
    cp bin/* /usr/local/bin/ && \
    cp lib/* /usr/local/lib/ && \
    chmod 755 /usr/local/bin/watchman && \
    chmod 2777 /usr/local/var/run/watchman && \
    cd .. && \
    rm -rf watchman* && \
    ldconfig /usr/local/lib

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for building)
RUN mkdir -p /tmp/npm-cache && chmod 777 /tmp/npm-cache
ENV NPM_CONFIG_CACHE=/tmp/npm-cache
RUN npm install -g @expo/ngrok@^4.1.0
RUN npm install

# Copy your source code
COPY . .

# Build TypeScript
RUN npm run build
# Create necessary directories
RUN mkdir -p /tmp/logs

ENV EXPO_NO_TELEMETRY=1
ENV CHOKIDAR_USEPOLLING=1
ENV CHOKIDAR_INTERVAL=100
ENV WATCHPACK_POLLING=true

# Expose port and start
EXPOSE 3002
CMD ["sh", "-c", "watchman --foreground --logfile=/tmp/logs/watchman.log & npm start"]
