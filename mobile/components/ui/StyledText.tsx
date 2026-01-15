import React from 'react';
import { Text, TextProps, TextStyle, StyleSheet } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { typography } from '../../lib/theme';

type FontSize = keyof typeof typography.fontSize;
type FontWeight = keyof typeof typography.fontWeight;

interface StyledTextProps extends TextProps {
  variant?: 'body' | 'heading' | 'label' | 'caption';
  size?: FontSize;
  weight?: FontWeight;
  color?: string;
  muted?: boolean;
  center?: boolean;
}

export function StyledText({
  children,
  variant = 'body',
  size,
  weight,
  color,
  muted = false,
  center = false,
  style,
  ...props
}: StyledTextProps) {
  const { theme } = useTheme();

  // Determine font size based on variant or explicit size
  const fontSize = size
    ? typography.fontSize[size]
    : variant === 'heading'
      ? typography.fontSize['2xl']
      : variant === 'caption'
        ? typography.fontSize.xs
        : variant === 'label'
          ? typography.fontSize.sm
          : typography.fontSize.base;

  // Determine line height
  const lineHeight = size
    ? typography.lineHeight[size]
    : variant === 'heading'
      ? typography.lineHeight['2xl']
      : variant === 'caption'
        ? typography.lineHeight.xs
        : variant === 'label'
          ? typography.lineHeight.sm
          : typography.lineHeight.base;

  // Determine font weight
  const fontWeight = weight
    ? typography.fontWeight[weight]
    : variant === 'heading'
      ? typography.fontWeight.bold
      : variant === 'label'
        ? typography.fontWeight.medium
        : typography.fontWeight.normal;

  // Determine color
  const textColor = color
    ? color
    : muted
      ? theme.colors.mutedForeground
      : theme.colors.foreground;

  const textStyle: TextStyle = {
    fontSize,
    lineHeight,
    fontWeight,
    color: textColor,
    textAlign: center ? 'center' : undefined,
  };

  return (
    <Text style={[textStyle, style]} {...props}>
      {children}
    </Text>
  );
}

// Convenience components
export function Heading({
  children,
  size = '2xl',
  ...props
}: Omit<StyledTextProps, 'variant'>) {
  return (
    <StyledText variant="heading" size={size} {...props}>
      {children}
    </StyledText>
  );
}

export function BodyText({ children, ...props }: Omit<StyledTextProps, 'variant'>) {
  return (
    <StyledText variant="body" {...props}>
      {children}
    </StyledText>
  );
}

export function Label({ children, ...props }: Omit<StyledTextProps, 'variant'>) {
  return (
    <StyledText variant="label" {...props}>
      {children}
    </StyledText>
  );
}

export function Caption({ children, ...props }: Omit<StyledTextProps, 'variant'>) {
  return (
    <StyledText variant="caption" muted {...props}>
      {children}
    </StyledText>
  );
}
