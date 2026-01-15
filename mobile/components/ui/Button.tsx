import React from 'react';
import {
  Pressable,
  PressableProps,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { StyledText } from './StyledText';
import { spacing, borderRadius } from '../../lib/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  children,
  style,
  ...props
}: ButtonProps) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;

  const getBackgroundColor = (pressed: boolean): string => {
    if (isDisabled) {
      return theme.colors.muted;
    }

    switch (variant) {
      case 'primary':
        return pressed ? adjustBrightness(theme.colors.primary, -10) : theme.colors.primary;
      case 'secondary':
        return pressed
          ? adjustBrightness(theme.colors.secondary, -5)
          : theme.colors.secondary;
      case 'destructive':
        return pressed
          ? adjustBrightness(theme.colors.destructive, -10)
          : theme.colors.destructive;
      case 'outline':
      case 'ghost':
        return pressed ? theme.colors.accent : 'transparent';
      default:
        return theme.colors.primary;
    }
  };

  const getTextColor = (): string => {
    if (isDisabled) {
      return theme.colors.mutedForeground;
    }

    switch (variant) {
      case 'primary':
        return theme.colors.primaryForeground;
      case 'secondary':
        return theme.colors.secondaryForeground;
      case 'destructive':
        return theme.colors.destructiveForeground;
      case 'outline':
      case 'ghost':
        return theme.colors.foreground;
      default:
        return theme.colors.primaryForeground;
    }
  };

  const getBorderColor = (): string | undefined => {
    if (variant === 'outline') {
      return isDisabled ? theme.colors.muted : theme.colors.border;
    }
    return undefined;
  };

  const getPadding = (): { paddingVertical: number; paddingHorizontal: number } => {
    switch (size) {
      case 'sm':
        return { paddingVertical: spacing[2], paddingHorizontal: spacing[3] };
      case 'lg':
        return { paddingVertical: spacing[4], paddingHorizontal: spacing[6] };
      default:
        return { paddingVertical: spacing[3], paddingHorizontal: spacing[4] };
    }
  };

  const getFontSize = (): 'sm' | 'base' | 'lg' => {
    switch (size) {
      case 'sm':
        return 'sm';
      case 'lg':
        return 'lg';
      default:
        return 'base';
    }
  };

  return (
    <Pressable
      disabled={isDisabled}
      {...props}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: getBackgroundColor(pressed),
          borderColor: getBorderColor(),
          borderWidth: variant === 'outline' ? 1 : 0,
          ...getPadding(),
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={getTextColor()} />
      ) : (
        <StyledText size={getFontSize()} weight="medium" color={getTextColor()}>
          {children}
        </StyledText>
      )}
    </Pressable>
  );
}

// Helper to adjust brightness
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
    gap: spacing[2],
  },
  fullWidth: {
    width: '100%',
  },
});
