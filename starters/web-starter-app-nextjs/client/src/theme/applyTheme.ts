/**
 * Theme application utilities
 *
 * These functions allow you to programmatically apply theme changes to the application.
 * This is useful for:
 * - Dynamic theme switching
 * - LLM-driven theme modifications
 * - GUI-based theme editors
 */

import { Theme, lightTheme, darkTheme } from './theme';

/**
 * Apply a theme to the document by updating CSS variables
 * @param theme - The theme object to apply
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  // Apply colors
  root.style.setProperty('--background', theme.colors.background);
  root.style.setProperty('--surface', theme.colors.surface);
  root.style.setProperty('--primary', theme.colors.primary);
  root.style.setProperty('--secondary', theme.colors.secondary);
  root.style.setProperty('--text', theme.colors.text);
  root.style.setProperty('--text-secondary', theme.colors.textSecondary);
  root.style.setProperty('--border', theme.colors.border);
  root.style.setProperty('--error', theme.colors.error);
  root.style.setProperty('--success', theme.colors.success);
  root.style.setProperty('--warning', theme.colors.warning);
  root.style.setProperty('--info', theme.colors.info);

  // Apply spacing
  root.style.setProperty('--spacing-xs', theme.spacing.xs);
  root.style.setProperty('--spacing-sm', theme.spacing.sm);
  root.style.setProperty('--spacing-md', theme.spacing.md);
  root.style.setProperty('--spacing-lg', theme.spacing.lg);
  root.style.setProperty('--spacing-xl', theme.spacing.xl);
  root.style.setProperty('--spacing-xxl', theme.spacing.xxl);

  // Apply typography sizes
  root.style.setProperty('--text-xs', theme.typography.sizes.xs);
  root.style.setProperty('--text-sm', theme.typography.sizes.sm);
  root.style.setProperty('--text-md', theme.typography.sizes.md);
  root.style.setProperty('--text-lg', theme.typography.sizes.lg);
  root.style.setProperty('--text-xl', theme.typography.sizes.xl);
  root.style.setProperty('--text-xxl', theme.typography.sizes.xxl);

  // Apply typography weights
  root.style.setProperty('--font-normal', theme.typography.weights.normal);
  root.style.setProperty('--font-medium', theme.typography.weights.medium);
  root.style.setProperty('--font-semibold', theme.typography.weights.semibold);
  root.style.setProperty('--font-bold', theme.typography.weights.bold);

  // Apply border radius
  root.style.setProperty('--radius-sm', theme.borderRadius.sm);
  root.style.setProperty('--radius-md', theme.borderRadius.md);
  root.style.setProperty('--radius-lg', theme.borderRadius.lg);
  root.style.setProperty('--radius-xl', theme.borderRadius.xl);
  root.style.setProperty('--radius-full', theme.borderRadius.full);
}

/**
 * Apply light theme
 */
export function applyLightTheme(): void {
  applyTheme(lightTheme);
}

/**
 * Apply dark theme
 */
export function applyDarkTheme(): void {
  applyTheme(darkTheme);
}

/**
 * Toggle between light and dark theme
 */
export function toggleTheme(): void {
  const currentBg = getComputedStyle(document.documentElement)
    .getPropertyValue('--background')
    .trim();

  if (currentBg === lightTheme.colors.background) {
    applyDarkTheme();
  } else {
    applyLightTheme();
  }
}

/**
 * Update specific color values in the current theme
 * @param colors - Partial color object with values to update
 */
export function updateColors(colors: Partial<Theme['colors']>): void {
  const root = document.documentElement;

  if (colors.background) root.style.setProperty('--background', colors.background);
  if (colors.surface) root.style.setProperty('--surface', colors.surface);
  if (colors.primary) root.style.setProperty('--primary', colors.primary);
  if (colors.secondary) root.style.setProperty('--secondary', colors.secondary);
  if (colors.text) root.style.setProperty('--text', colors.text);
  if (colors.textSecondary) root.style.setProperty('--text-secondary', colors.textSecondary);
  if (colors.border) root.style.setProperty('--border', colors.border);
  if (colors.error) root.style.setProperty('--error', colors.error);
  if (colors.success) root.style.setProperty('--success', colors.success);
  if (colors.warning) root.style.setProperty('--warning', colors.warning);
  if (colors.info) root.style.setProperty('--info', colors.info);
}

/**
 * Get the current theme values from CSS variables
 * @returns Current theme object
 */
export function getCurrentTheme(): Theme {
  const root = document.documentElement;
  const getVar = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();

  return {
    colors: {
      background: getVar('--background'),
      surface: getVar('--surface'),
      primary: getVar('--primary'),
      secondary: getVar('--secondary'),
      text: getVar('--text'),
      textSecondary: getVar('--text-secondary'),
      border: getVar('--border'),
      error: getVar('--error'),
      success: getVar('--success'),
      warning: getVar('--warning'),
      info: getVar('--info'),
    },
    spacing: {
      xs: getVar('--spacing-xs'),
      sm: getVar('--spacing-sm'),
      md: getVar('--spacing-md'),
      lg: getVar('--spacing-lg'),
      xl: getVar('--spacing-xl'),
      xxl: getVar('--spacing-xxl'),
    },
    typography: {
      sizes: {
        xs: getVar('--text-xs'),
        sm: getVar('--text-sm'),
        md: getVar('--text-md'),
        lg: getVar('--text-lg'),
        xl: getVar('--text-xl'),
        xxl: getVar('--text-xxl'),
      },
      weights: {
        normal: getVar('--font-normal'),
        medium: getVar('--font-medium'),
        semibold: getVar('--font-semibold'),
        bold: getVar('--font-bold'),
      },
    },
    borderRadius: {
      sm: getVar('--radius-sm'),
      md: getVar('--radius-md'),
      lg: getVar('--radius-lg'),
      xl: getVar('--radius-xl'),
      full: getVar('--radius-full'),
    },
  };
}
