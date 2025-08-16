FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

RUN mkdir -p /tmp/npm-cache && chmod 777 /tmp/npm-cache
ENV NPM_CONFIG_CACHE=/tmp/npm-cache

# Install dependencies (including dev dependencies for building)
RUN npm install

# Copy your source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3002

# Start the built server
CMD ["npm", "start"]