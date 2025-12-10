import React from 'react';
import { Text, TextProps, StyleSheet, TextStyle } from 'react-native';
import { useTheme } from './useTheme';
import { Theme } from './theme';

export type TextVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodyLarge'
  | 'caption'
  | 'label';

interface StyledTextProps extends TextProps {
  variant?: TextVariant;
  color?: 'primary' | 'secondary' | 'text' | 'textSecondary' | 'error' | 'success' | 'warning' | 'info';
}

const getVariantStyle = (variant: TextVariant, theme: Theme): TextStyle => {
  switch (variant) {
    case 'h1':
      return {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: theme.typography.weights.bold,
        lineHeight: theme.typography.sizes.xxl * 1.2,
      };
    case 'h2':
      return {
        fontSize: theme.typography.sizes.xl,
        fontWeight: theme.typography.weights.bold,
        lineHeight: theme.typography.sizes.xl * 1.2,
      };
    case 'h3':
      return {
        fontSize: theme.typography.sizes.lg,
        fontWeight: theme.typography.weights.semibold,
        lineHeight: theme.typography.sizes.lg * 1.3,
      };
    case 'bodyLarge':
      return {
        fontSize: theme.typography.sizes.lg,
        fontWeight: theme.typography.weights.normal,
        lineHeight: theme.typography.sizes.lg * 1.5,
      };
    case 'body':
      return {
        fontSize: theme.typography.sizes.md,
        fontWeight: theme.typography.weights.normal,
        lineHeight: theme.typography.sizes.md * 1.5,
      };
    case 'caption':
      return {
        fontSize: theme.typography.sizes.sm,
        fontWeight: theme.typography.weights.normal,
        lineHeight: theme.typography.sizes.sm * 1.4,
      };
    case 'label':
      return {
        fontSize: theme.typography.sizes.xs,
        fontWeight: theme.typography.weights.medium,
        lineHeight: theme.typography.sizes.xs * 1.4,
        letterSpacing: 0.5,
      };
    default:
      return {
        fontSize: theme.typography.sizes.md,
        fontWeight: theme.typography.weights.normal,
      };
  }
};

export const StyledText: React.FC<StyledTextProps> = ({
  variant = 'body',
  color = 'text',
  style,
  ...props
}) => {
  const theme = useTheme();

  const variantStyle = getVariantStyle(variant, theme);
  const colorStyle = { color: theme.colors[color] };

  return (
    <Text
      style={[variantStyle, colorStyle, style]}
      {...props}
    />
  );
};
