/**
 * Theme UI Components - Main Export
 * Centralized export for all premium theme components
 */

// Theme utilities
export { theme, cn, createGlowEffect, createIconGradient, createHoverScale, createFloatingOrb } from '@/lib/theme';

// Layout components
export {
  Container,
  Section,
  Grid,
  Flex,
  Center,
  Stack,
  Spacer
} from './Layout';

// Typography components
export {
  Text,
  HeroText,
  TitleText,
  HeadingText,
  SubheadingText,
  BodyText,
  BodyLargeText,
  CaptionText,
  BadgeText
} from './Typography';

// Theme components
export {
  GlassContainer,
  ThemedButton,
  FeatureCard,
  HeroBadge,
  SectionHeader,
  ThemedEmptyState,
  ThemedInput,
  FloatingOrbs
} from './ThemeComponents';

// Types
export type { 
  // Add component prop types as needed
} from './ThemeComponents';