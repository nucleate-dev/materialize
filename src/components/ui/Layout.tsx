/**
 * Layout Components
 * Consistent layout patterns and containers based on the premium theme
 */

"use client";

import React from 'react';
import { theme, cn } from '@/lib/theme';

// Container Component
interface ContainerProps {
  variant?: 'default' | 'wide' | 'narrow';
  className?: string;
  children: React.ReactNode;
}

export const Container: React.FC<ContainerProps> = ({
  variant = 'default',
  className,
  children
}) => {
  const variantClasses = {
    default: theme.layout.container,
    wide: theme.layout.containerWide,
    narrow: theme.layout.containerNarrow
  };

  return (
    <div className={cn(variantClasses[variant], className)}>
      {children}
    </div>
  );
};

// Section Component
interface SectionProps {
  variant?: 'default' | 'compact';
  background?: 'hero' | 'section' | 'solid' | 'transparent';
  className?: string;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  variant = 'default',
  background = 'transparent',
  className,
  children
}) => {
  const variantClasses = {
    default: theme.layout.section,
    compact: theme.layout.sectionCompact
  };

  const backgroundClasses = {
    hero: theme.backgrounds.hero,
    section: theme.backgrounds.section,
    solid: theme.backgrounds.solid,
    transparent: ''
  };

  return (
    <section className={cn(
      variantClasses[variant],
      backgroundClasses[background],
      className
    )}>
      {children}
    </section>
  );
};

// Grid Component
interface GridProps {
  variant?: 'default' | 'wide';
  cols?: number;
  gap?: number;
  className?: string;
  children: React.ReactNode;
}

export const Grid: React.FC<GridProps> = ({
  variant = 'default',
  cols,
  gap = 8,
  className,
  children
}) => {
  const variantClasses = {
    default: theme.layout.grid,
    wide: theme.layout.gridWide
  };

  // Custom grid columns if specified
  const customCols = cols ? `grid-cols-${cols}` : '';
  const customGap = `gap-${gap}`;

  return (
    <div className={cn(
      cols ? `grid ${customCols} ${customGap}` : variantClasses[variant],
      className
    )}>
      {children}
    </div>
  );
};

// Flex layouts
interface FlexProps {
  direction?: 'row' | 'col';
  align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  wrap?: boolean;
  gap?: number;
  className?: string;
  children: React.ReactNode;
}

export const Flex: React.FC<FlexProps> = ({
  direction = 'row',
  align = 'start',
  justify = 'start',
  wrap = false,
  gap = 0,
  className,
  children
}) => {
  const directionClass = direction === 'row' ? 'flex-row' : 'flex-col';
  const alignClass = `items-${align}`;
  const justifyClass = `justify-${justify}`;
  const wrapClass = wrap ? 'flex-wrap' : '';
  const gapClass = gap > 0 ? `gap-${gap}` : '';

  return (
    <div className={cn(
      'flex',
      directionClass,
      alignClass,
      justifyClass,
      wrapClass,
      gapClass,
      className
    )}>
      {children}
    </div>
  );
};

// Center Component (common pattern)
interface CenterProps {
  className?: string;
  children: React.ReactNode;
  fullHeight?: boolean;
}

export const Center: React.FC<CenterProps> = ({
  className,
  children,
  fullHeight = false
}) => {
  return (
    <div className={cn(
      theme.layout.centerContent,
      fullHeight && 'min-h-screen',
      className
    )}>
      {children}
    </div>
  );
};

// Stack Component (vertical spacing)
interface StackProps {
  space?: number;
  className?: string;
  children: React.ReactNode;
}

export const Stack: React.FC<StackProps> = ({
  space = 4,
  className,
  children
}) => {
  return (
    <div className={cn(`space-y-${space}`, className)}>
      {children}
    </div>
  );
};

// Spacer Component
interface SpacerProps {
  size?: number;
  direction?: 'horizontal' | 'vertical';
}

export const Spacer: React.FC<SpacerProps> = ({
  size = 4,
  direction = 'vertical'
}) => {
  const sizeClass = direction === 'vertical' ? `h-${size}` : `w-${size}`;
  return <div className={sizeClass} />;
};