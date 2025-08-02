/**
 * Premium Theme System
 * Generalizable theme utilities for consistent glassmorphic design across the app
 */

export const theme = {
  // Core glassmorphism patterns
  glass: {
    primary:
      "bg-white/80 dark:bg-boxdark/80 backdrop-blur-xl border border-white/20 dark:border-strokedark/30",
    secondary:
      "bg-white/60 dark:bg-boxdark/60 backdrop-blur-sm border border-white/10 dark:border-strokedark/20",
    subtle:
      "bg-white/10 dark:bg-boxdark/10 backdrop-blur-md border border-white/5 dark:border-strokedark/10",
    overlay:
      "bg-black/80 dark:bg-boxdark/90 backdrop-blur-xl border border-white/20 dark:border-strokedark/30",
  },

  // Background systems
  backgrounds: {
    hero: "bg-gradient-to-br from-gray-2 via-whiter to-gray-3 dark:from-boxdark-2 dark:via-boxdark dark:to-meta-4",
    section: "dark:from-boxdark to-boxdark-2",
    card: "bg-gradient-to-br from-white/10 to-white/5 dark:from-boxdark/20 dark:to-boxdark/10",
    solid: "bg-black dark:bg-boxdark-2",
  },

  // Gradient systems
  gradients: {
    primary: "bg-gradient-to-r from-primary via-secondary to-meta-5",
    text: "bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-transparent",
    textAccent:
      "bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent",
    glow: "bg-gradient-to-r from-purple-600/20 to-pink-600/20",
    feature: {
      blue: "from-blue-500 to-cyan-500",
      purple: "from-purple-500 to-pink-500",
      green: "from-green-500 to-emerald-500",
      orange: "from-orange-500 to-red-500",
      indigo: "from-indigo-500 to-purple-500",
    },
  },

  // Interactive states
  interactive: {
    hover: "hover:scale-105 hover:shadow-2xl transition-all duration-300",
    hoverSubtle: "hover:scale-102 transition-transform duration-200",
    hoverGlow: "hover:shadow-primary/60 hover:glow-lg",
    focus: "focus:ring-2 focus:ring-primary/50 focus:outline-none",
    active: "active:scale-95 transition-transform duration-150",
  },

  // Typography hierarchy
  typography: {
    hero: "text-7xl md:text-8xl lg:text-9xl font-black leading-tight",
    title: "text-5xl md:text-6xl font-bold",
    heading: "text-2xl font-bold text-black dark:text-white",
    subheading: "text-xl font-semibold text-black dark:text-white",
    body: "text-lg text-body dark:text-bodydark",
    bodyLarge: "text-xl text-gray-300 dark:text-bodydark",
    caption: "text-sm text-body dark:text-bodydark2",
    badge: "text-sm font-medium",
  },

  // Layout patterns
  layout: {
    container: "container mx-auto px-6",
    containerWide: "max-w-7xl mx-auto px-6",
    containerNarrow: "max-w-4xl mx-auto px-6",
    section: "relative py-32",
    sectionCompact: "relative py-20",
    centerContent: "flex flex-col items-center justify-center",
    grid: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8",
    gridWide: "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8",
  },

  // Animation patterns
  animations: {
    float: "animate-pulse",
    floatDelay: "animate-pulse delay-1000",
    fadeIn: "animate-fade-in",
    slideUp: "animate-slide-up",
    glow: "animate-glow",
    spin: "animate-spin",
  },

  // Shadow systems
  shadows: {
    glow: "shadow-2xl shadow-primary/40",
    glowHover: "hover:shadow-primary/60",
    card: "shadow-xl hover:shadow-2xl transition-shadow duration-300",
    floating: "shadow-2xl hover:shadow-white/10 transition-all duration-500",
  },

  // Border patterns
  borders: {
    primary: "border border-white/20 dark:border-strokedark/30",
    secondary: "border border-white/10 dark:border-strokedark/20",
    accent: "border border-primary/30",
    glow: "border border-white/30 dark:border-primary/30",
  },

  // Component-specific patterns
  components: {
    badge:
      "inline-flex items-center px-6 py-3 bg-gradient-to-r from-white/10 to-white/5 border border-white/20 rounded-full backdrop-blur-xl",
    card: "relative bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-3xl backdrop-blur-xl hover:border-white/30 transition-all duration-500",
    button: {
      primary:
        "px-10 py-4 bg-white text-black font-bold rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-white/20 hover:bg-gray-50",
      secondary:
        "px-8 py-4 bg-white/10 text-white font-semibold rounded-2xl border border-white/20 backdrop-blur-xl transition-all duration-300 hover:bg-white/20 hover:scale-105",
      glass:
        "inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-white hover:bg-primary/90 transition-colors duration-200",
    },
    input:
      "bg-white/10 dark:bg-boxdark/20 border border-white/20 dark:border-strokedark/30 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-200",
    iconContainer: "inline-flex p-4 rounded-2xl shadow-lg",
    emptyState:
      "col-span-full flex flex-col items-center justify-center py-20 text-center",
  },
} as const;

// Utility function to combine theme classes
export function cn(
  ...classes: (string | undefined | null | boolean)[]
): string {
  return classes.filter(Boolean).join(" ");
}

// Helper functions for common patterns
export const createGlowEffect = (
  gradient: keyof typeof theme.gradients.feature,
) =>
  `absolute inset-0 bg-gradient-to-r ${theme.gradients.feature[gradient]} opacity-0 group-hover:opacity-20 rounded-3xl blur-xl transition-opacity duration-500`;

export const createIconGradient = (
  gradient: keyof typeof theme.gradients.feature,
) => `bg-gradient-to-r ${theme.gradients.feature[gradient]}`;

export const createHoverScale = (
  scale: "subtle" | "normal" | "large" = "normal",
) => {
  const scales = {
    subtle: "hover:scale-102",
    normal: "hover:scale-105",
    large: "hover:scale-110",
  };
  return `${scales[scale]} transition-transform duration-300`;
};

// Floating orb generator for backgrounds
export const createFloatingOrb = (
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right",
  size: "sm" | "md" | "lg" = "md",
) => {
  const positions = {
    "top-left": "top-1/4 left-1/4",
    "top-right": "top-1/4 right-1/4",
    "bottom-left": "bottom-1/4 left-1/4",
    "bottom-right": "bottom-1/4 right-1/4",
  };

  const sizes = {
    sm: "w-64 h-64",
    md: "w-80 h-80",
    lg: "w-96 h-96",
  };

  return `absolute ${positions[position]} ${sizes[size]} bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-full blur-3xl animate-pulse pointer-events-none`;
};
