import { createTamagui, createTokens } from 'tamagui';
import { defaultConfig } from '@tamagui/config/v4';

// Custom tokens matching the stylesheet starter's design system
const tokens = createTokens({
  ...defaultConfig.tokens,
  color: {
    ...defaultConfig.tokens.color,
    // Light theme colors
    lightBackground: '#ffffff',
    lightSurface: '#f5f5f5',
    lightPrimary: '#007AFF',
    lightSecondary: '#5856D6',
    lightText: '#000000',
    lightTextSecondary: '#666666',
    lightBorder: '#cccccc',
    lightError: '#FF3B30',
    lightSuccess: '#34C759',
    lightWarning: '#FF9500',
    lightInfo: '#007AFF',
    // Dark theme colors
    darkBackground: '#000000',
    darkSurface: '#1c1c1e',
    darkPrimary: '#0A84FF',
    darkSecondary: '#5E5CE6',
    darkText: '#ffffff',
    darkTextSecondary: '#aaaaaa',
    darkBorder: '#333333',
    darkError: '#FF453A',
    darkSuccess: '#32D74B',
    darkWarning: '#FF9F0A',
    darkInfo: '#0A84FF',
  },
  space: {
    ...defaultConfig.tokens.space,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  size: {
    ...defaultConfig.tokens.size,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    ...defaultConfig.tokens.radius,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
});

const config = createTamagui({
  ...defaultConfig,
  tokens,
  themes: {
    light: {
      background: tokens.color.lightBackground,
      surface: tokens.color.lightSurface,
      primary: tokens.color.lightPrimary,
      secondary: tokens.color.lightSecondary,
      color: tokens.color.lightText,
      color11: tokens.color.lightTextSecondary,
      borderColor: tokens.color.lightBorder,
      error: tokens.color.lightError,
      success: tokens.color.lightSuccess,
      warning: tokens.color.lightWarning,
      info: tokens.color.lightInfo,
    },
    dark: {
      background: tokens.color.darkBackground,
      surface: tokens.color.darkSurface,
      primary: tokens.color.darkPrimary,
      secondary: tokens.color.darkSecondary,
      color: tokens.color.darkText,
      color11: tokens.color.darkTextSecondary,
      borderColor: tokens.color.darkBorder,
      error: tokens.color.darkError,
      success: tokens.color.darkSuccess,
      warning: tokens.color.darkWarning,
      info: tokens.color.darkInfo,
    },
  },
});

export type AppConfig = typeof config;

export default config;
