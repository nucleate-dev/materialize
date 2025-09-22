FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

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
CMD ["npm", "start"]