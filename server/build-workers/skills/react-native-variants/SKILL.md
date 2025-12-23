---
name: react-native-variants
description: Creates multiple design variants of React Native screens, components, or flows. Use when users want to explore different visual directions, layouts, or interaction patterns for the same UI concept. Outputs separate files for side-by-side comparison.
license: Complete terms in LICENSE.txt
---

This skill generates multiple distinct design variants of React Native UI elements. Each variant represents a holistic different "take" on the same concept—varying aesthetics, layout approaches, and interaction patterns.

## When to Use

- User asks to "try different versions" or "explore options" for a screen/component
- User wants to compare design directions before committing
- User explicitly requests variants, alternatives, or options
- User is in ideation/exploration mode for a new feature

## Inputs

Gather from user (or infer from context):

1. **Source**: Existing file to vary OR concept description for new UI
2. **Number of variants**: User-specified, otherwise default to **2**
3. **Scope of variation**: What should differ between variants?
   - Full aesthetic overhaul (default assumption)
   - Specific aspects only (e.g., "just colors", "layout only", "interaction patterns")

## Variant Strategy

Before generating, plan each variant's direction. Variants should be **meaningfully different**—not just color swaps (unless that's specifically requested).

### Dimensions to Vary

Pick 2-3 dimensions per variant to create distinct takes:

| Dimension | Examples |
|-----------|----------|
| **Aesthetic** | Minimalist vs. Bold, Light vs. Dark, Playful vs. Professional |
| **Layout** | Card-based vs. List, Grid vs. Carousel, Stacked vs. Tabbed |
| **Density** | Spacious/airy vs. Compact/dense |
| **Typography** | Large headlines vs. Subtle text, Serif vs. Sans |
| **Interaction** | Swipe-based vs. Tap-based, Bottom sheet vs. Modal, Inline vs. Expandable |
| **Visual weight** | Heavy borders/shadows vs. Flat/borderless |
| **Navigation pattern** | Tab bar vs. Drawer, Segmented control vs. Dropdown |

### Respecting User Intent

**CRITICAL**: Match the scope of variation to what the user actually wants:

- If user says "try different colors" → vary color palette only, keep layout/structure identical
- If user says "explore layouts" → vary arrangement, keep aesthetic similar
- If user says "different approaches" or gives no specifics → create holistically different takes

## Output Format

### File Naming & Location

Place variant files in the **same directory** as the original (or inferred appropriate location):

```
Original: app/(tabs)/home.tsx
Variants: app/(tabs)/HomeVariantA.tsx
          app/(tabs)/HomeVariantB.tsx
```

For new UI (no existing file):
```
Variants: app/(tabs)/ProfileVariantA.tsx
          app/(tabs)/ProfileVariantB.tsx
```

### Code Requirements

Each variant must be:

- **Self-contained**: Fully functional, not dependent on other variants
- **Production-grade**: Uses StyleSheet, proper hooks, TypeScript
- **Same functionality**: Core behavior and data structure preserved across variants
- **Properly exported**: Default export with clear component name

Inherit best practices from the `designing-react-native-uis` skill:
- Spring-based animations (avoid linear easing)
- Haptic feedback for interactions
- Safe area handling
- 60fps performance target

## Workflow

### Varying an Existing Screen

1. Read and understand the existing component
2. Identify core functionality to preserve (data flow, navigation, state)
3. Plan distinct aesthetic/layout directions for each variant
4. Generate variants that keep functionality but reimagine presentation
5. If you see potential UX improvements, **mention them in the summary** but don't implement unless asked

### Creating Variants from Scratch

1. Clarify the concept if ambiguous
2. Plan distinct directions for each variant
3. Generate variants with shared data structure but different presentations

## Summary Output

After generating variants, provide a brief comparison:

```
## Variant Summary

**VariantA** — [2-3 word aesthetic label]
[1 sentence describing the key design choices]

**VariantB** — [2-3 word aesthetic label]
[1 sentence describing the key design choices]

**Suggested next steps**: [Optional: mention if you noticed UX improvements worth exploring]
```

Example:
```
## Variant Summary

**VariantA** — Clean Minimalist
Uses generous whitespace, subtle shadows, and a muted color palette. Cards float with soft elevation.

**VariantB** — Bold Editorial
High-contrast typography with large section headers, vibrant accent colors, and edge-to-edge imagery.

**Suggested next steps**: Consider adding pull-to-refresh—the current implementation requires manual reload.
```

## Anti-Patterns

NEVER do:

- Generate variants that are superficially different (same layout, different button color)—unless that's what user requested
- Change core functionality between variants (data fetching, navigation targets, business logic)
- Implement UX flow changes without being asked (suggest in summary instead)
- Create more variants than requested
- Put variants in a separate "variants" folder unless user specifies

## Example Interaction

**User**: "Create some variants of this settings screen"

**Response**:
1. Read the existing settings screen
2. Identify: list of toggles, account section, logout button (preserve these)
3. Plan:
   - VariantA: Grouped cards with icons, spacious padding, subtle separators
   - VariantB: Compact list with inline toggles, section headers, dense layout
4. Generate both files in same directory
5. Output summary comparing the two approaches
