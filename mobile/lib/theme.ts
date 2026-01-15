import { TextStyle } from 'react-native';

// Colors converted from web app's HSL values to hex
// Light mode: Terracotta Warmth theme
const lightColors = {
  background: '#faf9f8',
  foreground: '#1f1a17',
  card: '#ffffff',
  cardForeground: '#1f1a17',
  popover: '#ffffff',
  popoverForeground: '#1f1a17',

  // Primary: Terracotta
  primary: '#e85d2d',
  primaryForeground: '#ffffff',

  // Secondary: Warm neutral
  secondary: '#f0ece7',
  secondaryForeground: '#1f1a17',

  // Muted: Warm gray
  muted: '#f3f1ee',
  mutedForeground: '#78716c',

  // Accent
  accent: '#f3f1ee',
  accentForeground: '#1f1a17',

  // Semantic colors
  destructive: '#ef4444',
  destructiveForeground: '#ffffff',
  success: '#16a085',
  successForeground: '#ffffff',
  warning: '#f59e0b',
  warningForeground: '#1f1a17',
  info: '#0ea5e9',
  infoForeground: '#ffffff',

  // Borders & inputs
  border: '#e5e0db',
  input: '#e5e0db',
  ring: '#e85d2d',

  // Static
  white: '#ffffff',
  black: '#000000',

  // Body text (warm gray)
  body: '#6b5b4f',
};

// Dark mode colors
const darkColors = {
  background: '#151210',
  foreground: '#ede9e5',
  card: '#1c1816',
  cardForeground: '#ede9e5',
  popover: '#191513',
  popoverForeground: '#ede9e5',

  // Primary: Terracotta (brighter for dark mode)
  primary: '#eb7a52',
  primaryForeground: '#ffffff',

  // Secondary
  secondary: '#2a2420',
  secondaryForeground: '#ede9e5',

  // Muted
  muted: '#262220',
  mutedForeground: '#8c8279',

  // Accent
  accent: '#262220',
  accentForeground: '#ede9e5',

  // Semantic colors
  destructive: '#f87171',
  destructiveForeground: '#ffffff',
  success: '#1eb49e',
  successForeground: '#ffffff',
  warning: '#fbbf24',
  warningForeground: '#1f1a17',
  info: '#38bdf8',
  infoForeground: '#ffffff',

  // Borders & inputs
  border: '#33302c',
  input: '#33302c',
  ring: '#eb7a52',

  // Static
  white: '#ffffff',
  black: '#000000',

  // Body text
  body: '#c4b5a8',
};

export type ThemeColors = typeof lightColors;

// Typography scale
export const typography = {
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  lineHeight: {
    xs: 16,
    sm: 20,
    base: 24,
    lg: 28,
    xl: 28,
    '2xl': 32,
    '3xl': 36,
    '4xl': 40,
  },
  fontWeight: {
    normal: '400' as TextStyle['fontWeight'],
    medium: '500' as TextStyle['fontWeight'],
    semibold: '600' as TextStyle['fontWeight'],
    bold: '700' as TextStyle['fontWeight'],
  },
};

// Spacing scale (in pixels)
export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
  28: 112,
  32: 128,
} as const;

// Border radius
export const borderRadius = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  full: 9999,
} as const;

// Shadows (for iOS and Android)
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  typography: typeof typography;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  shadows: typeof shadows;
}

export const lightTheme: Theme = {
  dark: false,
  colors: lightColors,
  typography,
  spacing,
  borderRadius,
  shadows,
};

export const darkTheme: Theme = {
  dark: true,
  colors: darkColors,
  typography,
  spacing,
  borderRadius,
  shadows,
};
