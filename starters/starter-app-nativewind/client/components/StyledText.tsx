import React from 'react';
import { Text, TextProps } from 'react-native';

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
  className?: string;
}

const variantClasses: Record<TextVariant, string> = {
  h1: 'text-3xl font-bold text-black dark:text-white',
  h2: 'text-2xl font-bold text-black dark:text-white',
  h3: 'text-xl font-semibold text-black dark:text-white',
  bodyLarge: 'text-lg text-black dark:text-white',
  body: 'text-base text-black dark:text-white',
  caption: 'text-sm text-gray-600 dark:text-gray-400',
  label: 'text-xs font-medium text-gray-700 dark:text-gray-300',
};

// Simple utility to merge class names
const mergeClasses = (...classes: (string | undefined | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export const StyledText: React.FC<StyledTextProps> = ({
  variant = 'body',
  className,
  ...props
}) => {
  const baseClasses = variantClasses[variant];
  const finalClassName = mergeClasses(baseClasses, className);

  return <Text className={finalClassName} {...props} />;
};
