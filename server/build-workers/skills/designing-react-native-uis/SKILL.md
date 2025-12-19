---
name: designing-react-native-uis
description: Creates distinctive, production-grade mobile interfaces using React Native and Expo. Use when users ask to build mobile screens, components, or app flows; emphasizes native feel and avoids generic "default app" aesthetics.
license: Complete terms in LICENSE.txt
---

This skill guides the creation of distinctive, production-grade mobile interfaces using React Native and Expo. It avoids generic "default UI" aesthetics by implementing real, working code with exceptional attention to touch physics, haptics, and mobile-first creative choices.

The user provides requirements: a screen, component, navigation flow, or app concept.

Design Thinking
Before coding, commit to a BOLD aesthetic direction suitable for a handheld device:

Purpose: Is this a utility used in 3-second bursts, or a media experience used for hours?

Tone: Pick an extreme: neo-brutalist data, soft claymorphism, ethereal glass, cinematic dark mode, high-fidelity tactile (skeuomorphic touches), joyful/bouncy, or strict Swiss editorial.

Mobile Constraints: Thumb reachability, safe areas (notches/home indicators), and battery/performance efficiency.

Differentiation: What makes the feel of this app unforgettable? Is it the way the cards stack? The fluid transitions?

CRITICAL: Mobile design is about feel as much as looks. A minimalist app must feel snappy and precise; a maximalist app must feel fluid and immersive.

Then implement working code (React Native, Expo) that is:

Production-grade: Uses StyleSheet, functional components, and proper hooks.

Fluid: Runs at 60fps+ (utilizing the UI thread where possible).

Tactile: Responds instantly to touch.

Cohesive: Distinctive aesthetic point-of-view.

Platform Coverage: Always describe how the design will look on web and on mobile.

React Native Aesthetics & Technical Guidelines
Focus on:

1. Typography & Layout
Font Choice: It's possible, though not required, to use @expo-google-fonts to load distinctive typefaces. Pair a characterful header font with a highly readable geometric sans for body text.

Layout: Use react-native-safe-area-context intelligently--sometimes bleeding backgrounds into the status bar creates a more immersive feel.

Whitespace: Mobile screens are small; use generous padding and whitespace to reduce cognitive load. Don't crowd the interface.

1. Motion & Physics (The "Secret Sauce")
Library: Use animations like the Animated API in React Native.

Physics: Avoid linear easing. Use fast spring-based animations (mass, damping, stiffness) that feel natural under the finger.

Transitions: Elements should not just "appear." They should slide, scale, or fade in with staggered delays. Shared Element Transitions (where an image expands from a list to a detail view) are highly encouraged for polish.

Micro-interactions: Animate icons on press. Scale buttons down slightly (0.95) on touch to provide "weight."

1. Tactility & Feedback
Haptics: Integrate expo-haptics (Light, Medium, Heavy, Selection) to reinforce interactions. A UI should "click" when you use it.

Gestures: Use react-native-gesture-handler. Don't rely solely on taps. Swipe-to-dismiss, long-press actions, and pan gestures make an app feel native and premium.

2. Visual Depth & Styling
Shadows & Gradients: Use expo-linear-gradient. React Native shadows on Android are limited (elevation), so consider using SVGs or gradients to create custom, soft shadows that look consistent across platforms.

Blur: Use expo-blur to create glassmorphism effects (e.g., a frosted bottom tab bar or modal overlay).

Shapes: Use borderRadius aggressively--hyper-round for friendly apps, sharp/zero for brutalist apps. Masked views for non-standard image shapes.

1. Implementation Details
Icons: Use @expo/vector-icons (Feather, Ionicons, MaterialCommunityIcons) but style them creatively (e.g., inside a circle container, with a glow, or rotated).

Structure: Keep the component tree clean. Separate styles into StyleSheet.create.

Status Bar: explicitly handle <StatusBar /> style (light/dark) to match the theme.

NEVER do the following:

Ignore the "Notch" or Home Indicator area.

Create a static, flat UI with no feedback on press.

IMPORTANT: Interpret the user's request creatively. If they ask for a "Task App," don't build a boring list. Build a fluid, gesture-driven interface where completed tasks dissolve into particles or slide away with a satisfying haptic "thud."
