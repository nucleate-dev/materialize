/**
 * Typography Components
 * Consistent typography system based on the premium theme
 */

"use client";

import React from 'react';
import { theme, cn } from '@/lib/theme';

// Text variants
type TextVariant = 'hero' | 'title' | 'heading' | 'subheading' | 'body' | 'bodyLarge' | 'caption' | 'badge';
type TextColor = 'primary' | 'secondary' | 'accent' | 'gradient' | 'gradientAccent' | 'white' | 'inherit';
type TextAlign = 'left' | 'center' | 'right';

interface TextProps {
  variant: TextVariant;
  color?: TextColor;
  align?: TextAlign;
  className?: string;
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
}

const colorClasses: Record<TextColor, string> = {
  primary: 'text-black dark:text-white',
  secondary: 'text-body dark:text-bodydark',
  accent: 'text-primary',
  gradient: theme.gradients.text,
  gradientAccent: theme.gradients.textAccent,
  white: 'text-white',
  inherit: 'text-inherit'
};

const alignClasses: Record<TextAlign, string> = {
  left: 'text-left',
  center: 'text-center', 
  right: 'text-right'
};

export const Text: React.FC<TextProps> = ({
  variant,
  color = 'primary',
  align = 'left',
  className,
  children,
  as
}) => {
  const Component = as || getDefaultElement(variant);
  
  return (
    <Component className={cn(
      theme.typography[variant],
      colorClasses[color],
      alignClasses[align],
      className
    )}>
      {children}
    </Component>
  );
};

function getDefaultElement(variant: TextVariant): keyof JSX.IntrinsicElements {
  switch (variant) {
    case 'hero':
      return 'h1';
    case 'title':
      return 'h2';
    case 'heading':
      return 'h3';
    case 'subheading':
      return 'h4';
    case 'body':
    case 'bodyLarge':
      return 'p';
    case 'caption':
    case 'badge':
      return 'span';
    default:
      return 'p';
  }
}

// Convenience components
export const HeroText: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="hero" {...props} />
);

export const TitleText: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="title" {...props} />
);

export const HeadingText: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="heading" {...props} />
);

export const SubheadingText: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="subheading" {...props} />
);

export const BodyText: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="body" {...props} />
);

export const BodyLargeText: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="bodyLarge" {...props} />
);

export const CaptionText: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="caption" {...props} />
);

export const BadgeText: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="badge" {...props} />
);