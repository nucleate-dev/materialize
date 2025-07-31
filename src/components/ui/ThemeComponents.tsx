/**
 * Themed UI Components
 * Reusable components using the premium theme system
 */

"use client";

import React from 'react';
import { theme, cn, createGlowEffect, createIconGradient, createHoverScale } from '@/lib/theme';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

// Glass Container Component
interface GlassContainerProps {
  variant?: 'primary' | 'secondary' | 'subtle' | 'overlay';
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
}

export const GlassContainer: React.FC<GlassContainerProps> = ({
  variant = 'primary',
  className,
  children,
  hover = false
}) => {
  return (
    <div className={cn(
      theme.glass[variant],
      hover && theme.interactive.hover,
      className
    )}>
      {children}
    </div>
  );
};

// Themed Button Component
interface ThemedButtonProps {
  variant?: 'primary' | 'secondary' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  href?: string;
}

export const ThemedButton: React.FC<ThemedButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className,
  children,
  onClick,
  disabled,
  icon,
  href
}) => {
  const sizeClasses = {
    sm: 'px-6 py-2 text-sm',
    md: 'px-8 py-3 text-base',
    lg: 'px-10 py-4 text-lg'
  };

  const baseClasses = cn(
    theme.components.button[variant],
    sizeClasses[size],
    disabled && 'opacity-50 cursor-not-allowed hover:scale-100',
    className
  );

  const content = (
    <>
      {children}
      {icon && <span className="ml-2">{icon}</span>}
    </>
  );

  if (href) {
    return (
      <a href={href} className={baseClasses}>
        <span className="flex items-center gap-2">
          {content}
        </span>
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={baseClasses}
    >
      <span className="flex items-center gap-2">
        {content}
      </span>
    </button>
  );
};

// Feature Card Component
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: 'blue' | 'purple' | 'green' | 'orange' | 'indigo';
  className?: string;
  showArrow?: boolean;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  title,
  description,
  gradient,
  className,
  showArrow = true
}) => {
  return (
    <div className={cn("group relative", className)}>
      {/* Hover Glow Effect */}
      <div className={createGlowEffect(gradient)}></div>

      {/* Card */}
      <div className={cn(
        theme.components.card,
        "p-8 group-hover:transform group-hover:scale-105"
      )}>
        {/* Icon */}
        <div className={cn(
          theme.components.iconContainer,
          createIconGradient(gradient),
          "mb-6"
        )}>
          <div className="text-white">
            {icon}
          </div>
        </div>

        {/* Content */}
        <h3 className={cn(
          theme.typography.heading,
          "mb-4 group-hover:text-gray-100 transition-colors"
        )}>
          {title}
        </h3>
        <p className={cn(
          theme.typography.body,
          "leading-relaxed group-hover:text-gray-200 transition-colors"
        )}>
          {description}
        </p>

        {/* Arrow Indicator */}
        {showArrow && (
          <div className="flex items-center mt-6 text-gray-400 group-hover:text-white transition-colors">
            <span className={theme.typography.caption}>Learn more</span>
            <ArrowRightIcon className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </div>
        )}
      </div>
    </div>
  );
};

// Hero Badge Component
interface HeroBadgeProps {
  children: React.ReactNode;
  className?: string;
  status?: boolean;
}

export const HeroBadge: React.FC<HeroBadgeProps> = ({
  children,
  className,
  status = false
}) => {
  return (
    <div className={cn(
      theme.components.badge,
      createHoverScale('subtle'),
      theme.shadows.card,
      className
    )}>
      {status && (
        <div className="w-2 h-2 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full mr-3 animate-pulse"></div>
      )}
      <span className={cn(theme.typography.badge, "text-white")}>
        {children}
      </span>
    </div>
  );
};

// Section Header Component
interface SectionHeaderProps {
  badge?: string;
  title: string;
  description: string;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  badge,
  title,
  description,
  className
}) => {
  return (
    <div className={cn("text-center mb-20", className)}>
      {badge && (
        <div className="inline-flex items-center px-4 py-2 mb-6 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-full">
          <span className="text-sm text-blue-300 font-medium">{badge}</span>
        </div>
      )}
      <h2 className={cn(theme.typography.title, "mb-6 text-white")}>
        {title}
      </h2>
      <p className={cn(theme.typography.bodyLarge, "max-w-3xl mx-auto")}>
        {description}
      </p>
    </div>
  );
};

// Empty State Component (Enhanced)
interface ThemedEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonText?: string;
  onButtonClick?: () => void;
  className?: string;
}

export const ThemedEmptyState: React.FC<ThemedEmptyStateProps> = ({
  icon,
  title,
  description,
  buttonText,
  onButtonClick,
  className
}) => {
  return (
    <div className={cn(theme.components.emptyState, className)}>
      <GlassContainer variant="subtle" className="w-24 h-24 rounded-full flex items-center justify-center mb-6">
        <div className="w-12 h-12 text-body dark:text-bodydark2">
          {icon}
        </div>
      </GlassContainer>
      
      <h3 className={cn(theme.typography.subheading, "mb-2")}>
        {title}
      </h3>
      <p className={cn(theme.typography.body, "mb-6 max-w-md")}>
        {description}
      </p>
      
      {onButtonClick && buttonText && (
        <ThemedButton 
          variant="glass" 
          onClick={onButtonClick}
          icon={<ArrowRightIcon className="w-4 h-4" />}
        >
          {buttonText}
        </ThemedButton>
      )}
    </div>
  );
};

// Input Component
interface ThemedInputProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  type?: string;
}

export const ThemedInput: React.FC<ThemedInputProps> = ({
  placeholder,
  value,
  onChange,
  className,
  type = "text"
}) => {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className={cn(theme.components.input, className)}
    />
  );
};

// Floating Orbs Background
interface FloatingOrbsProps {
  className?: string;
}

export const FloatingOrbs: React.FC<FloatingOrbsProps> = ({ className }) => {
  return (
    <div className={cn("fixed inset-0 pointer-events-none z-10", className)}>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-pink-600/20 to-purple-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
    </div>
  );
};