import React from 'react';
import { View, ViewProps, StyleSheet, Pressable, PressableProps } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { spacing, borderRadius, shadows } from '../../lib/theme';

interface CardProps extends ViewProps {
  variant?: 'default' | 'outline' | 'elevated';
  padding?: keyof typeof spacing;
}

export function Card({
  variant = 'default',
  padding = 4,
  style,
  children,
  ...props
}: CardProps) {
  const { theme } = useTheme();

  const getBackgroundColor = () => {
    switch (variant) {
      case 'outline':
        return 'transparent';
      default:
        return theme.colors.card;
    }
  };

  const getBorderWidth = () => {
    return variant === 'outline' ? 1 : 0;
  };

  const getShadow = () => {
    return variant === 'elevated' ? shadows.md : {};
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: theme.colors.border,
          borderWidth: getBorderWidth(),
          padding: spacing[padding],
          ...getShadow(),
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

// Pressable card variant
interface PressableCardProps extends Omit<PressableProps, 'style'> {
  variant?: 'default' | 'outline' | 'elevated';
  padding?: keyof typeof spacing;
  style?: ViewProps['style'];
  children: React.ReactNode;
}

export function PressableCard({
  variant = 'default',
  padding = 4,
  style,
  children,
  ...props
}: PressableCardProps) {
  const { theme } = useTheme();

  const getBackgroundColor = (pressed: boolean) => {
    const base = variant === 'outline' ? 'transparent' : theme.colors.card;
    if (pressed) {
      return theme.colors.accent;
    }
    return base;
  };

  const getBorderWidth = () => {
    return variant === 'outline' ? 1 : 0;
  };

  const getShadow = () => {
    return variant === 'elevated' ? shadows.md : {};
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: getBackgroundColor(pressed),
          borderColor: theme.colors.border,
          borderWidth: getBorderWidth(),
          padding: spacing[padding],
          ...getShadow(),
        },
        style as any,
      ]}
      {...props}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
  },
});
