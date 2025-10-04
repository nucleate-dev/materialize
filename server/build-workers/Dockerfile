# Use Debian (glibc) so the prebuilt Watchman binary works cleanly
FROM --platform=linux/amd64 node:22-bookworm-slim

WORKDIR /app

# ----- System deps (roughly equivalent to your Alpine list) -----
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential \
    autoconf automake libtool \
    python3 python3-dev \
    libssl-dev \
    libpcre2-dev \
    libevent-dev \
    curl unzip ca-certificates \
    git \
 && rm -rf /var/lib/apt/lists/*

# ----- Install Watchman from prebuilt binary -----
# Prebuilt zip is typically glibc-linked and works on Debian slim
ARG WATCHMAN_VERSION=2024.01.15.00
RUN set -eux; \
    curl -L "https://github.com/facebook/watchman/releases/download/v${WATCHMAN_VERSION}/watchman-v${WATCHMAN_VERSION}-linux.zip" -o /tmp/watchman.zip && \
    unzip /tmp/watchman.zip -d /tmp && \
    mkdir -p /usr/local/bin /usr/local/lib /usr/local/var/run/watchman && \
    cp /tmp/watchman-v${WATCHMAN_VERSION}-linux/bin/* /usr/local/bin/ && \
    cp /tmp/watchman-v${WATCHMAN_VERSION}-linux/lib/* /usr/local/lib/ || true && \
    chmod 755 /usr/local/bin/watchman && \
    chmod 2777 /usr/local/var/run/watchman && \
    rm -rf /tmp/watchman.zip /tmp/watchman-v${WATCHMAN_VERSION}-linux

# ----- NPM hardening / resilience -----
# You can override these via build args if you use a private mirror (Verdaccio/CodeArtifact)
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY}

# Shared, writable cache inside the container
ENV NPM_CONFIG_CACHE=/tmp/npm-cache
RUN mkdir -p /tmp/npm-cache /tmp/logs && chmod -R 777 /tmp/npm-cache /tmp/logs

# Make npm tolerant of flaky networks and low parallelism
# (All of these become defaults for subsequent RUN steps and runtime)
RUN npm config set registry "${NPM_REGISTRY}" \
 && npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 600000 \
 && npm config set network-timeout 600000 \
 && npm config set maxsockets 1 \
 && npm config set fund false \
 && npm config set audit false

# If you are NOT behind a proxy, ensure these aren’t set
# (Comment these out if you do need a proxy and set the two lines below accordingly)
RUN npm config delete proxy || true \
 && npm config delete https-proxy || true

# If you DO use a proxy, uncomment and pass as build args:
# ARG HTTP_PROXY
# ARG HTTPS_PROXY
# RUN [ -z "$HTTP_PROXY" ] || npm config set proxy "$HTTP_PROXY"; \
#     [ -z "$HTTPS_PROXY" ] || npm config set https-proxy "$HTTPS_PROXY"

# ----- Global tooling needed by your worker flow -----
RUN npm install -g @expo/ngrok@^4.1.0

# ----- App deps (deterministic) -----
# Copy only manifests first to maximize layer cache
COPY package*.json ./
COPY tsconfig.json ./

# Prefer ci for reproducibility
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

# ----- Copy source and build -----
COPY . .
RUN npm run build

# ----- Runtime env -----
ENV EXPO_NO_TELEMETRY=1 \
    CHOKIDAR_USEPOLLING=1 \
    CHOKIDAR_INTERVAL=100 \
    WATCHPACK_POLLING=true \
    CI=1

EXPOSE 3002

# Watchman in foreground + your server
CMD ["sh", "-c", "watchman --foreground --logfile=/tmp/logs/watchman.log & npm start"]
