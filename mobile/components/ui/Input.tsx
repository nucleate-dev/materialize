import React, { useState } from 'react';
import {
  TextInput,
  TextInputProps,
  View,
  StyleSheet,
  Pressable,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { Label, Caption } from './StyledText';
import { spacing, borderRadius, typography } from '../../lib/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  containerStyle,
  style,
  ...props
}: InputProps) {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const getBorderColor = () => {
    if (error) return theme.colors.destructive;
    if (isFocused) return theme.colors.ring;
    return theme.colors.input;
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Label style={styles.label}>{label}</Label>}

      <View
        style={[
          styles.inputContainer,
          {
            borderColor: getBorderColor(),
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        {leftIcon && <View style={styles.iconContainer}>{leftIcon}</View>}

        <TextInput
          style={[
            styles.input,
            {
              color: theme.colors.foreground,
            },
            style,
          ]}
          placeholderTextColor={theme.colors.mutedForeground}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />

        {rightIcon && <View style={styles.iconContainer}>{rightIcon}</View>}
      </View>

      {error && (
        <Caption style={styles.hint} color={theme.colors.destructive}>
          {error}
        </Caption>
      )}
      {hint && !error && <Caption style={styles.hint}>{hint}</Caption>}
    </View>
  );
}

// Password input with show/hide toggle
interface PasswordInputProps extends Omit<InputProps, 'secureTextEntry' | 'rightIcon'> {}

export function PasswordInput({ ...props }: PasswordInputProps) {
  const { theme } = useTheme();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Input
      {...props}
      secureTextEntry={!showPassword}
      rightIcon={
        <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
          <Label color={theme.colors.mutedForeground}>
            {showPassword ? 'Hide' : 'Show'}
          </Label>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[1.5],
  },
  label: {
    marginBottom: spacing[0.5],
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.base,
    paddingVertical: spacing[3],
  },
  iconContainer: {
    marginRight: spacing[2],
  },
  hint: {
    marginTop: spacing[1],
  },
});
