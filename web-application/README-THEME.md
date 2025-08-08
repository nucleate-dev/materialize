# Premium Theme System

A comprehensive, generalizable theme system for consistent glassmorphic design across the Materialize web app.

## Overview

This theme system provides:
- **Glassmorphism effects** with backdrop blur and transparency
- **Gradient systems** for text, backgrounds, and interactive elements  
- **Dark/light mode support** throughout all components
- **Animation patterns** for micro-interactions and hover states
- **Typography hierarchy** with consistent scaling
- **Layout utilities** for common patterns
- **Interactive states** with smooth transitions

## Quick Start

```tsx
import { 
  ThemedButton, 
  FeatureCard, 
  GlassContainer, 
  HeroText,
  Section,
  Container
} from '@/components/ui';

// Use themed components
<Section background="hero">
  <Container>
    <HeroText color="gradient" align="center">
      Materialize
    </HeroText>
    <ThemedButton variant="primary" href="/dashboard">
      Get Started
    </ThemedButton>
  </Container>
</Section>
```

## Core Theme Utilities

### Glass Effects
```tsx
import { theme } from '@/components/ui';

// Apply glassmorphism
<div className={theme.glass.primary}>Primary glass effect</div>
<div className={theme.glass.secondary}>Secondary glass effect</div>
<div className={theme.glass.subtle}>Subtle glass effect</div>
```

### Gradients
```tsx
// Text gradients
<h1 className={theme.gradients.text}>Gradient text</h1>
<span className={theme.gradients.textAccent}>Accent gradient</span>

// Background gradients  
<div className={theme.backgrounds.hero}>Hero background</div>
<div className={theme.gradients.primary}>Primary gradient</div>
```

### Interactive States
```tsx
// Hover effects
<button className={theme.interactive.hover}>Hover me</button>
<div className={theme.interactive.hoverSubtle}>Subtle hover</div>
```

## Components

### ThemedButton
Primary action buttons with consistent styling:

```tsx
<ThemedButton variant="primary" size="lg">
  Primary Button
</ThemedButton>

<ThemedButton variant="secondary" icon={<ArrowRightIcon />}>
  Secondary with Icon
</ThemedButton>

<ThemedButton variant="glass" href="/dashboard">
  Glass Button Link
</ThemedButton>
```

### FeatureCard
Cards for features, benefits, or content blocks:

```tsx
<FeatureCard
  icon={<CodeBracketIcon className="w-8 h-8" />}
  title="Live Code Export"
  description="Export clean, production-ready code instantly"
  gradient="blue"
/>
```

### GlassContainer
Flexible glassmorphic containers:

```tsx
<GlassContainer variant="primary" hover>
  <p>Content with glass effect and hover animation</p>
</GlassContainer>
```

### Typography Components
Consistent text hierarchy:

```tsx
<HeroText color="gradient">Main Hero Text</HeroText>
<TitleText color="white">Section Title</TitleText>
<BodyText color="secondary">Body content</BodyText>
<CaptionText>Small caption text</CaptionText>
```

### Layout Components
Responsive layout utilities:

```tsx
<Section background="hero" variant="compact">
  <Container variant="wide">
    <Grid variant="wide">
      <FeatureCard />
      <FeatureCard />
      <FeatureCard />
    </Grid>
  </Container>
</Section>
```

## Advanced Usage

### Custom Glow Effects
```tsx
import { createGlowEffect, createIconGradient } from '@/components/ui';

<div className="group relative">
  <div className={createGlowEffect('purple')}></div>
  <div className={createIconGradient('blue')}>
    <Icon />
  </div>
</div>
```

### Floating Background Orbs
```tsx
import { FloatingOrbs } from '@/components/ui';

<div className="relative">
  <FloatingOrbs />
  <YourContent />
</div>
```

### Theme Variants
All components support dark/light mode automatically through Tailwind's dark mode system.

## Color System

### Gradients Available:
- `blue`: Blue to cyan
- `purple`: Purple to pink  
- `green`: Green to emerald
- `orange`: Orange to red
- `indigo`: Indigo to purple

### Glass Variants:
- `primary`: High opacity, strong backdrop blur
- `secondary`: Medium opacity, moderate blur
- `subtle`: Low opacity, light blur
- `overlay`: Dark overlay for modals/dropdowns

## Migration Guide

### From Existing Components
Replace existing components with themed equivalents:

```tsx
// Before
<button className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded">
  Click me
</button>

// After  
<ThemedButton variant="primary">
  Click me
</ThemedButton>
```

### From Custom CSS
Replace custom styles with theme utilities:

```tsx
// Before
<div className="bg-white/20 backdrop-blur-lg border border-white/10">
  Content
</div>

// After
<GlassContainer variant="secondary">
  Content  
</GlassContainer>
```

## Best Practices

1. **Consistency**: Use theme components instead of custom styles
2. **Dark Mode**: All components automatically support dark mode
3. **Performance**: Components are optimized for minimal re-renders
4. **Accessibility**: Built-in focus states and semantic HTML
5. **Responsive**: Mobile-first responsive design patterns

## Extending the Theme

Add new variants to the theme object in `/src/lib/theme.ts`:

```tsx
export const theme = {
  // Add new glass variants
  glass: {
    // existing variants...
    custom: "bg-custom/80 backdrop-blur-2xl border border-custom/20"
  },
  // Add new gradients
  gradients: {
    feature: {
      // existing gradients...
      custom: "from-custom-500 to-custom-600"
    }
  }
}
```