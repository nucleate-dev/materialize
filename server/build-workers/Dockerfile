FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

# Install CloudWatch agent and dependencies
RUN apk add --no-cache \
    curl \
    ca-certificates \
    procps \
    unzip \
    && rm -rf /var/cache/apk/*

# Download and install CloudWatch agent
RUN curl -O https://s3.amazonaws.com/amazoncloudwatch-agent/linux/amd64/latest/AmazonCloudWatchAgent.zip \
    && unzip AmazonCloudWatchAgent.zip \
    && ./install.sh \
    && rm -rf AmazonCloudWatchAgent.zip amazon-cloudwatch-agent

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for building)
RUN mkdir -p /tmp/npm-cache && chmod 777 /tmp/npm-cache
ENV NPM_CONFIG_CACHE=/tmp/npm-cache
RUN npm install -g @expo/ngrok@^4.1.0
RUN npm install

# Copy CloudWatch configuration
COPY cloudwatch-config.json /opt/aws/amazon-cloudwatch-agent/etc/cloudwatch-config.json

# Copy your source code
COPY . .

# Build TypeScript
RUN npm run build

# Copy and make startup script executable
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

# Create necessary directories
RUN mkdir -p /tmp/logs /var/log/amazon-cloudwatch-agent

ENV EXPO_NO_TELEMETRY=1
ENV CHOKIDAR_USEPOLLING=1
ENV CHOKIDAR_INTERVAL=100
ENV WATCHPACK_POLLING=true

# Expose port and start with CloudWatch agent
EXPOSE 3002
CMD ["/usr/local/bin/start.sh"]