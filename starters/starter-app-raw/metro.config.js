// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname, {
  // Enable CSS support
  isCSSEnabled: true,
});

// Add web-specific resolver
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

module.exports = config;