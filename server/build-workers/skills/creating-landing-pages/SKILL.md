## name: creating-landing-pages

description: Creates distinctive, award-winning landing pages as single-file HTML with embedded CSS/JS. Generates production-ready marketing pages, startup websites, product launch pages, and conversion funnels with bold typography, orchestrated animations, and memorable aesthetics. Avoids generic AI patterns. Use when asked to build a landing page, marketing site, product page, startup website, or conversion-focused webpage.

# Creating Landing Pages

Generates distinctive landing pages that avoid generic AI aesthetics. Output is a single HTML file with embedded CSS and JavaScript.

## Before Coding

Gather from user (or infer from context):

- Company/product name and one-line description
- Target audience
- Primary CTA (e.g., “Start Free Trial”)
- Secondary CTA (e.g., “Watch Demo”)

## Aesthetic Direction

Commit fully to ONE direction:

| Direction       | When to Use                                              |
| --------------- | -------------------------------------------------------- |
| Ink & Paper     | B2B, content, publishing — serif drama, high contrast    |
| Neon Terminal   | Dev tools, tech — CRT glow, monospace, dark theme        |
| Brutalist Mono  | Creative agencies — raw textures, exposed structure      |
| Soft Luxury     | Premium products — warm neutrals, refined serifs         |
| Retro-Future    | Consumer apps — Y2K gradients, metallics                 |
| Swiss Precision | Enterprise, fintech — rigid grids, functional sans       |
| Organic Flow    | Wellness, sustainability — nature palettes, fluid shapes |

Choose the most unexpected yet appropriate option.

## Required Sections

1. **Hero**: Intriguing hook, interactive element, ≤12-word value prop, primary CTA, trust signals
2. **Problem/Solution**: Story-driven narrative with scroll-triggered reveals
3. **Product Showcase**: Animated mockup or interactive demo preview
4. **Social Proof**: Testimonials, metrics, customer grid with hover states
5. **Technical Differentiators**: Feature comparison, integrations, security badges
6. **Conversion**: Secondary CTA, minimal form (Name, Email, Company)
7. **Footer**: Minimal links, newsletter capture

## Anti-Patterns

Never use:

- Purple/blue gradients on white backgrounds
- Inter, Roboto, Arial, Open Sans, system-ui fonts
- Generic hero-CTA-features-testimonials template flow
- Abstract blobs or generic geometric shapes
- #6366F1 or similar overused accent colors
- 16px border-radius on everything
- Drop shadows on all cards
- Lorem ipsum placeholder text

## Technical Output

Single HTML file containing:

- CSS in `<style>` tag with CSS custom properties
- JavaScript in `<script>` tag (Intersection Observer for scroll reveals)
- Google Fonts via `<link>`
- Mobile-responsive with fluid typography
- Orchestrated page-load animations (staggered with animation-delay)
- Hover micro-interactions

## Design Tokens Template

```css
:root {
  --font-display: "Playfair Display", serif;
  --font-body: "Source Serif Pro", serif;
  --color-bg: #0a0a0f;
  --color-text: #ffffff;
  --color-muted: #a0a0a0;
  --color-accent: #00ff88;
  --ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
}
```

## Pre-Code Checklist

Before writing code, decide:

1. Aesthetic direction
2. Font pairing (display + body)
3. Color palette (max 5 hex values)
4. Hero hook concept
5. One unique interactive element

Generate realistic placeholder content appropriate to the company context.
