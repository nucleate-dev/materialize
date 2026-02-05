# Nucleate Brand Guide

> **Brand Personality:** Warm, approachable, creative, professional
> **Target Audience:** Designers & Product Managers
> **Core Concept:** Growth from a central point — the genesis of ideas  

---

## Brand Essence

**Nucleate** means to form around a central point. Our brand reflects this through:

- **Warmth** — Human, not robotic
- **Energy** — The creative spark at the core
- **Growth** — Ideas evolving into reality
- **Craft** — Thoughtful, intentional design

---

## Color System

### Primary: Terracotta

Our signature color evokes warmth, creativity, and the energy of making.

| Token                  | Light Mode   | Dark Mode    | Hex (Light) |
| ---------------------- | ------------ | ------------ | ----------- |
| `--primary`            | `15 80% 55%` | `15 75% 60%` | `#E86A45`   |
| `--primary-foreground` | `0 0% 100%`  | `0 0% 100%`  | `#FFFFFF`   |

### Accent: Amber Gold

A warm complement for highlights and notifications.

| Token                 | Light Mode   | Dark Mode    | Hex (Light) |
| --------------------- | ------------ | ------------ | ----------- |
| `--accent`            | `35 90% 55%` | `35 85% 50%` | `#F5A623`   |
| `--accent-foreground` | `25 25% 12%` | `0 0% 100%`  | `#231D18`   |

### Semantic Colors

| Token           | Purpose                | Light Mode    | Dark Mode     |
| --------------- | ---------------------- | ------------- | ------------- |
| `--destructive` | Errors, delete actions | `0 72% 51%`   | `0 68% 56%`   |
| `--success`     | Success states         | `158 64% 40%` | `158 60% 45%` |
| `--warning`     | Warnings               | `38 92% 50%`  | `38 88% 55%`  |
| `--info`        | Information            | `199 89% 48%` | `199 85% 52%` |

### Neutral Palette (Warm Grays)

| Token                | Light Mode   | Dark Mode    | Usage              |
| -------------------- | ------------ | ------------ | ------------------ |
| `--background`       | `30 20% 98%` | `25 15% 8%`  | Page background    |
| `--foreground`       | `25 25% 12%` | `30 15% 92%` | Primary text       |
| `--card`             | `0 0% 100%`  | `25 12% 11%` | Card backgrounds   |
| `--muted`            | `30 15% 94%` | `25 12% 16%` | Subtle backgrounds |
| `--muted-foreground` | `25 10% 45%` | `25 10% 55%` | Secondary text     |
| `--border`           | `30 15% 88%` | `25 12% 20%` | Borders            |

---

## Typography

### Font Stack

| Role           | Font     | CSS Class    | Usage                           |
| -------------- | -------- | ------------ | ------------------------------- |
| **Sans-serif** | Inter    | `font-sans`  | UI, body text, buttons, forms   |
| **Serif**      | Fraunces | `font-serif` | Headlines, hero text, marketing |

### Type Scale

```css
/* Headlines - Use font-serif */
text-6xl    /* 60px - Hero headlines */
text-5xl    /* 48px - Page titles */
text-4xl    /* 36px - Section headers */
text-3xl    /* 30px - Large headings */
text-2xl    /* 24px - Card titles */
text-xl     /* 20px - Subsections */

/* Body - Use font-sans (default) */
text-lg     /* 18px - Lead paragraphs */
text-base   /* 16px - Body text */
text-sm     /* 14px - Secondary text */
text-xs     /* 12px - Captions, labels */
```

### Usage Examples

```tsx
// Hero headline
<h1 className="text-5xl font-serif font-medium">
  Design Anything
</h1>

// Body text
<p className="text-base text-muted-foreground">
  Describe your app, screen, or flow.
</p>

// Button text
<Button className="text-sm font-medium">
  Get Started
</Button>
```

---

## Component Patterns

### Buttons

```tsx
// Primary action (terracotta)
<Button>Create Project</Button>

// Secondary action
<Button variant="secondary">Cancel</Button>

// Destructive action
<Button variant="destructive">Delete</Button>

// Ghost/subtle action
<Button variant="ghost">Learn More</Button>
```

### Cards

```tsx
<div className="bg-card border border-border rounded-xl p-6 shadow-sm">
  <h3 className="font-serif text-xl">Card Title</h3>
  <p className="text-muted-foreground">Card content...</p>
</div>
```

### Inputs

```tsx
<input
  className="bg-background border border-border rounded-lg px-3 py-2
  text-foreground placeholder:text-muted-foreground/50
  focus:border-primary focus:ring-1 focus:ring-primary/20"
/>
```

### Glow Effects

For emphasis on important elements, use the primary color glow:

```tsx
<div className="relative group">
  {/* Glow */}
  <div
    className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-accent/20
    rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition"
  />

  {/* Content */}
  <div className="relative bg-card rounded-xl p-6">...</div>
</div>
```

---

## Spacing & Layout

### Border Radius

| Token          | Value          | Usage                |
| -------------- | -------------- | -------------------- |
| `rounded-sm`   | 0.375rem (6px) | Small elements, tags |
| `rounded`      | 0.5rem (8px)   | Buttons, inputs      |
| `rounded-lg`   | 0.75rem (12px) | Cards, dropdowns     |
| `rounded-xl`   | 1rem (16px)    | Large cards, modals  |
| `rounded-2xl`  | 1.5rem (24px)  | Hero sections        |
| `rounded-full` | 9999px         | Pills, avatars       |

### Shadows

```css
shadow-sm     /* Subtle elevation */
shadow        /* Default cards */
shadow-md     /* Elevated cards */
shadow-lg     /* Modals, dropdowns */
shadow-xl     /* Hero elements */

/* Primary color shadow for CTAs */
shadow-lg shadow-primary/25
```

---

## Icons

### Library: Lucide React

```tsx
import { Sparkles, Rocket, Wand2 } from "lucide-react";
```

### Sizing

| Context           | Size    | Class                    |
| ----------------- | ------- | ------------------------ |
| Inline with text  | 16px    | `h-4 w-4`                |
| Buttons           | 16-18px | `h-4 w-4`                |
| Navigation        | 20px    | `h-5 w-5`                |
| Feature cards     | 24px    | `h-6 w-6`                |
| Hero/Empty states | 32-48px | `h-8 w-8` to `h-12 w-12` |

---

## Dark Mode

Dark mode uses warm charcoal backgrounds to maintain brand warmth:

| Element    | Light                | Dark                     |
| ---------- | -------------------- | ------------------------ |
| Background | Warm cream `#FBF9F7` | Warm charcoal `#161413`  |
| Cards      | Pure white `#FFFFFF` | Dark brown `#1D1A18`     |
| Primary    | Terracotta `#E86A45` | Brighter coral `#E07A52` |
| Text       | Near black `#231D18` | Warm white `#EDE9E5`     |

The warm undertones in dark mode complement the terracotta primary, creating a cohesive experience across themes.

---

## Implementation Files

| File                           | Purpose                                    |
| ------------------------------ | ------------------------------------------ |
| `src/app/globals.css`          | CSS variables (source of truth for colors) |
| `tailwind.config.ts`           | Font families, extended theme              |
| `src/app/layout.tsx`           | Font loading                               |
| `src/components/ui/button.tsx` | Button variants                            |

### Changing Colors

To update any color, edit `globals.css`:

```css
:root {
  --primary: 15 80% 55%; /* Change this HSL value */
}

.dark {
  --primary: 15 75% 60%; /* Dark mode variant */
}
```

---

## Brand Voice

When writing UI copy:

- **Be direct** — "Create project" not "Click here to create a new project"
- **Be warm** — "Welcome back" not "User authenticated"
- **Be encouraging** — "Design anything" not "Enter prompt"
- **Avoid jargon** — "Your app" not "Your prototype instance"

---

## Logo

- **Icon:** Atom (from Lucide)
- **Text:** "Nucleate" in Inter Medium
- **Color:** Uses `text-primary` in headers

```tsx
<div className="flex items-center gap-2">
  <Atom className="h-6 w-6 text-primary" />
  <span className="font-medium text-foreground">Nucleate</span>
</div>
```
