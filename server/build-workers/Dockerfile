FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

RUN mkdir -p /tmp/npm-cache && chmod 777 /tmp/npm-cache
ENV NPM_CONFIG_CACHE=/tmp/npm-cache

RUN npm install -g @expo/ngrok@^4.1.0

# Install dependencies (including dev dependencies for building)
RUN npm install

# Copy your source code
COPY . .

# Build TypeScript
RUN npm run build

ENV EXPO_NO_TELEMETRY=1
ENV CHOKIDAR_USEPOLLING=1
ENV CHOKIDAR_INTERVAL=100
ENV WATCHPACK_POLLING=true

# Pre-populate fixed project directory with test app and install deps
RUN mkdir -p /tmp/expo-dev/project \
  && cp -R test/. /tmp/expo-dev/project \
  && cd /tmp/expo-dev/project \
  && npm install

# Expose port
EXPOSE 3002

# Start the built server
CMD ["npm", "start"]