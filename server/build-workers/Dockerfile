FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

# Copy package files for your Fastify server
COPY package*.json ./
COPY tsconfig.json ./

# Install Expo CLI and ngrok globally
RUN npm install -g expo-cli @expo/ngrok@^4.1.0

# Pre-install all Expo dependencies globally for faster project creation
RUN npm install -g \
    @expo/vector-icons@^14.1.0 \
    @react-navigation/native@^7.1.6 \
    expo@~53.0.20 \
    expo-font@~13.3.2 \
    expo-linking@~7.1.7 \
    expo-router@~5.1.4 \
    expo-splash-screen@~0.30.10 \
    expo-status-bar@~2.2.3 \
    expo-system-ui@~5.0.10 \
    expo-web-browser@~14.2.0 \
    react@19.0.0 \
    react-dom@19.0.0 \
    react-native@0.79.5 \
    react-native-reanimated@~3.17.4 \
    react-native-safe-area-context@5.4.0 \
    react-native-screens@~4.11.1 \
    react-native-web@~0.20.0

# Pre-install common dev dependencies that might be useful
RUN npm install -g \
    @babel/core@^7.25.2 \
    @types/react@~19.0.10 \
    jest@^29.2.1 \
    jest-expo@~53.0.9 \
    react-test-renderer@19.0.0 \
    typescript@~5.8.3

# Install your Fastify server dependencies
RUN npm install

# Copy your Fastify server source code
COPY . .

# Build your Fastify TypeScript server
RUN npm run build

# Expose port for your Fastify server
EXPOSE 3002

# Start your Fastify server (which will create Expo projects using pre-installed packages)
CMD ["npm", "start"]