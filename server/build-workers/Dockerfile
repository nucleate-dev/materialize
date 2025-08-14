FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

RUN npm install -g expo-cli @expo/ngrok@^4.1.0
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