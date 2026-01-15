# Removed Blog Posts

This file captures titles and outlines for blog posts removed from `src/content/blog`.


## AI Has Replaced React Native Boilerplates

- Slug: ai-replaced-react-native-boilerplates
- Outline:
- AI Has Replaced React Native Boilerplates
  - The Boilerplate Problem
  - What Changed
  - What Boilerplates Actually Solved
  - The New Workflow
  - What Still Matters
  - Letting Go of the Old Way
  - Where This Goes

## AI Tools That Actually Help You Build React Native Apps

- Slug: ai-tools-react-native-apps
- Outline:
- AI Tools That Actually Help You Build React Native Apps
  - The Reality Check
  - Code Completion: GitHub Copilot and Cursor
    - What They're Good At
    - Where They Break
    - Practical Use
  - Coding Agents: Claude Code, Devin, GPT Pilot
    - Claude Code
    - Devin
    - GPT Pilot
    - Practical Use
  - Design-to-Code: RapidNative, Screenshot to Code
    - What They're Good At
    - Where They Break
    - Practical Use
  - Debugging Assistants: Workik AI, Traditional Tools
    - Workik AI
    - Traditional Debugging (React Native Debugger, Flipper)
    - Practical Use
  - Where Humans Still Matter
    - Product Decisions
    - UX and Edge Cases
    - Performance Optimization
    - Code Review and Architecture
  - The Realistic Workflow
  - Tools to Try
  - What's Overhyped
  - Conclusion

## Best Databases for React Native in 2025

- Slug: best-databases-react-native-2025
- Outline:
- Best Databases for React Native in 2025
  - What Actually Matters
  - Supabase: SQL Power with Real-Time Extras
    - When Supabase Makes Sense
    - The Tradeoffs
    - DX Notes
  - Convex: Real-Time by Default
    - When Convex Makes Sense
    - The Tradeoffs
    - DX Notes
  - InstantDB: Local-First, Less Complexity
    - When InstantDB Makes Sense
    - The Tradeoffs
    - DX Notes
  - Realm: The Mobile-First Veteran
    - When Realm Makes Sense
    - The Tradeoffs
    - DX Notes
  - Custom Backend: When and Why
    - When a Custom Backend Makes Sense
    - The Tradeoffs
    - DX Notes
  - Decision Framework
  - What Breaks at Scale
  - Conclusion

## Common Performance Mistakes in React Native Apps

- Slug: common-performance-mistakes-react-native
- Outline:
- Common Performance Mistakes in React Native Apps
  - Why Performance Matters
  - The Most Common Mistake: Unnecessary Re-Renders
    - The Problem
    - How to Spot It
    - How to Fix It
  - Second Most Common: Poorly Optimized Lists
    - The Problem: Using ScrollView for Long Lists
    - The Fix: Use FlatList (or Better)
    - Optimize FlatList Further
    - Go Further: Use FlashList or LegendList
  - Third: Image Loading and Caching
    - The Problem
    - The Fix
  - Fourth: Animations Running on the JS Thread
    - The Problem
    - The Fix: Use Native-Driven Animations
    - Better: Use React Native Reanimated
  - Fifth: Heavy Operations on the JS Thread
    - The Problem
    - The Fix: Move Heavy Work Off-Thread
  - Sixth: Not Measuring Performance
    - Tools to Use
    - What to Look For
  - When NOT to Optimize
  - Quick Performance Checklist
  - Conclusion

## How to Design Good Mobile UIs Without Being a Designer

- Slug: design-mobile-ui-without-designer
- Outline:
- How to Design Good Mobile UIs Without Being a Designer
  - The Core Principle: Consistency Over Creativity
  - Spacing: The 8pt Grid System
    - The 8pt Grid
    - In Practice
    - Why 8?
    - Apply It Everywhere
  - Typography: A Simple, Reliable Scale
    - The Basic Scale
    - Font Weights
    - Line Height
    - Platform Defaults
    - In Code
  - Color: Keep It Simple
    - The Minimal Palette
    - Contrast
    - Semantic Colors
  - Visual Hierarchy: Make Important Things Obvious
    - How to Create Hierarchy
    - Example
  - Touch Targets: Make Buttons Tappable
    - The 44px Rule
    - Common Mistakes
    - Fix: Add Press States
  - Alignment: Pick a Side and Stick to It
    - Left-Align Text (for LTR Languages)
    - Align Elements to a Grid
  - Common Mobile UI Mistakes
    - 1. Too Much on One Screen
    - 2. Ignoring Platform Conventions
    - 3. Not Designing for Different Screen Sizes
    - 4. Poor Form UX
    - 5. No Loading or Empty States
  - Use a Component Library
    - React Native Paper
    - NativeBase
    - GlueStack UI
  - Real Example: Before and After
    - Before (No Design Principles)
    - After (Design Principles Applied)
  - Quick Checklist
  - Conclusion

## Do You Need a Backend to Launch Your First App

- Slug: do-you-need-backend-first-app
- Outline:
- Do You Need a Backend to Launch Your First App
  - What a Backend Does
  - When Local State Is Enough
  - When Third-Party APIs Are Enough
  - Backend-as-a-Service (BaaS)
  - The BaaS Tradeoffs
  - When You Actually Need a Custom Backend
  - A Decision Framework
  - The Actual Risk

## Expo Is No Longer Optional for React Native Developers

- Slug: expo-no-longer-optional-react-native
- Outline:
- Expo Is No Longer Optional for React Native Developers
  - The New Architecture Changed Everything
  - Expo Isn't Limiting Anymore
  - What You Actually Get
  - The Holdouts
  - Where This Is Headed

## The Best Alternative to Expo Snack

- Slug: expo-snack-alternatives
- Outline:
- The Best Alternative to Expo Snack
  - What Is Expo Snack?
  - The Limitations of Expo Snack
    - Limited Native Module Support
    - No File-Based Routing (Expo Router)
    - No Git Integration
    - Limited Sharing and Deployment
  - What to Look for in an Expo Snack Alternative
  - The Alternative: Nucleate
    - Full Native Module Support
    - Expo Router and File-Based Routing
    - Git Integration
    - Share, Fork, Clone, and Deploy
    - AI-Powered Development
    - Backend Integration
  - Expo Snack vs. Nucleate: Feature Comparison
  - When to Use Each Tool
  - Getting Started with Nucleate
  - Conclusion

## Expo vs React Native CLI in 2025

- Slug: expo-vs-react-native-cli-2025
- Outline:
- Expo vs React Native CLI in 2025
  - The Core Difference
  - When Expo Is the Right Choice
    - You Want to Ship Fast
    - You're Building Standard Apps
    - You Value Over-the-Air Updates
    - You Need Cross-Platform Consistency
    - Your Team Is Small
  - When React Native CLI Makes Sense
    - You Need Custom Native Code
    - You Have Existing Native Code
    - You Want Maximum Build Control
    - You're Optimizing for Performance at the Native Layer
  - The Expo Managed vs Bare Workflow Confusion
  - What About Native Modules?
    - Expo Supports Custom Native Modules
    - Development Builds
  - Build Pipelines: EAS Build vs Local Builds
    - EAS Build (Expo's Cloud Build Service)
    - Local Builds (CLI Approach)
  - Over-the-Air Updates
    - Expo Updates
    - CodePush (CLI Alternative)
  - Long-Term Maintenance Tradeoffs
    - Expo Maintenance
    - CLI Maintenance
  - What the Ecosystem Looks Like in 2025
  - Decision Framework
    - Choose Expo if:
    - Choose React Native CLI if:
    - Start with Expo, Migrate If Needed
  - Common Misconceptions
  - The Practical Recommendation

## The Fastest Way to Prototype a React Native App

- Slug: fastest-way-prototype-react-native
- Outline:
- The Fastest Way to Prototype a React Native App
  - Why Speed Matters for Prototyping
  - The Stack: Expo, Not Bare React Native
  - The Workflow: Idea to Interactive App
    - Step 1: Create the Project (2 minutes)
    - Step 2: Decide What You're Testing (5 minutes)
    - Step 3: Sketch the UI (5 minutes)
    - Step 4: Build the Skeleton (10 minutes)
    - Step 5: Add Interactivity (15 minutes)
    - Step 6: Use AI to Speed Up UI (10 minutes)
    - Step 7: Make It Feel Real (10 minutes)
    - Step 8: Test on a Real Device (5 minutes)
    - Step 9: Get Feedback (The Rest of Your Time)
  - What to Skip (For Now)
  - Tools That Speed You Up
    - Expo
    - Expo Go App
    - React Navigation or Expo Router
    - AI Code Assistants
    - Placeholder Assets
  - Iteration Is the Whole Point
  - When to Stop Prototyping and Build Properly
  - Real Example: Under an Hour
  - Common Mistakes
  - Conclusion

## FlatList vs FlashList vs LegendList

- Slug: flatlist-vs-flashlist-vs-legendlist
- Outline:
- FlatList vs FlashList vs LegendList
  - FlatList
    - What It Is
    - Where It Works Well
    - Where It Breaks Down
    - Reality
  - FlashList
    - What It Is
    - Why It's Better Than FlatList
    - Limitations
    - Reality
  - LegendList
    - What It Is
    - Why It Stands Out
    - What This Means in Practice
    - Reality
  - Side-by-Side Summary
  - The Updated Take
  - Practical Recommendation
  - Migration Examples
    - From FlatList to LegendList
    - From FlashList to LegendList
  - Real-World Performance
  - When FlatList or FlashList Still Make Sense
  - Conclusion

## How to Store Local Data with React Native Apps

- Slug: how-to-store-local-data-react-native
- Outline:
    - 1. AsyncStorage
    - 2. Expo SecureStore
    - 3. Expo-SQLite (Key-Value Store)
    - 4. MMKV
    - 5. Expo-SQLite (Relational Usage)
    - Summary: When to use what?
    - Final Recommendation

## Should You Build a Mobile App or a Web App for Your Business

- Slug: mobile-app-vs-web-app-for-business
- Outline:
- Should You Build a Mobile App or a Web App for Your Business
  - Start With Distribution
  - User Behavior Is Different
  - The Cost Reality
  - Speed to Market
  - Progressive Web Apps: The Middle Ground
  - A Framework for Deciding
  - The Honest Answer

## React Native App Architecture That Actually Scales

- Slug: react-native-architecture-that-scales
- Outline:
- React Native App Architecture That Actually Scales
  - The Problem with Over-Engineering Early
  - Start Here: Simple Folder Structure
  - What Breaks First: Feature Isolation
    - Feature-Based Structure
    - When to Make the Switch
  - State Management: Start with Context, Migrate When It Hurts
    - Start with useState and Context
    - When Context Breaks
    - Migrate to Zustand or Jotai
  - API Layer: Keep It Simple Until You Can't
  - Navigation: Expo Router vs React Navigation
  - What Actually Breaks at Scale
    - Global State Everywhere
    - Tight Coupling Between Features
    - No Boundaries Between Layers
    - Premature Abstractions
  - The Scalable Mindset
  - Recommended Structure for Production Apps
  - Conclusion

## Is React Native a Good Choice for a Startup App

- Slug: react-native-for-startup-app
- Outline:
- Is React Native a Good Choice for a Startup App
  - The Startup Reality
  - The Hiring Advantage
  - Proven at Scale
  - The Tradeoffs
  - React Native vs. Flutter
  - When React Native Isn't Right
  - The Right Default

## How to Turn App Screenshots Into React Native Code

- Slug: screenshot-to-react-native-code
- Outline:
- How to Turn App Screenshots Into React Native Code
  - Why This Matters
  - The Current State of Screenshot-to-Code Tools
    - RapidNative
    - Screenshot to Code (Open Source)
    - GPT-4 Vision (Custom Prompts)
  - The Workflow: Screenshot to Working UI
    - 1. Start with a Screenshot or Mockup
    - 2. Generate the Initial Code
    - 3. Review Layout Fidelity
    - 4. Clean Up the Code
    - 5. Make It Interactive
    - 6. Test on Real Devices
  - What Works Well
  - What Doesn't Work (Yet)
  - Limitations and Gotchas
    - Layout Fidelity Isn't Perfect
    - Colors and Assets
    - Typography
    - Responsive Design
  - From Generated Code to Production-Ready
    - Before (Generated):
    - After (Production-Ready):
  - Tips for Better Results
  - Tools and Resources
  - The Future: Better, Not Perfect

## A Simple Security and Performance Checklist Before You Launch

- Slug: security-performance-checklist-before-launch
- Outline:
- A Simple Security and Performance Checklist Before You Launch
  - Web Apps
    - 1. Are users and data protected at a basic level?
    - 2. Are secrets actually secret?
    - 3. Is basic abuse prevented?
    - 4. Does the app feel fast enough?
    - 5. Will you know if something breaks?
    - 6. Can you recover if something goes wrong?
  - Mobile Apps
    - 1. Are accounts and sessions safe?
    - 2. Is user data treated carefully?
    - 3. Does the app feel responsive?
    - 4. Will crashes be visible?
    - 5. Will app store reviewers reject it?
  - The Final Gut Check
  - The Mindset

## How to Structure a React Native App for Fast Iteration

- Slug: structure-react-native-fast-iteration
- Outline:
- How to Structure a React Native App for Fast Iteration
  - The Core Principle: Optimize for Change
  - Start Simple: The Minimal Structure
  - Scale Up: Feature-Based Structure
    - Why This Works
  - Screen Patterns: Keep It Flat
    - Bad Screen (Too Much Logic)
    - Good Screen (Thin Orchestration)
  - Component Patterns: Local Until Shared
    - Local Components First
    - Share When Reused
  - Hook Patterns: Extract Logic, Not Everything
    - What Should Be a Hook
    - What Shouldn't Be a Hook
  - API Layer: Centralize Requests
    - Feature-Specific API Files
  - Navigation: File-Based or Declarative
    - File-Based Routing (Expo Router)
    - Declarative Routing (React Navigation)
  - Shared Code: Be Intentional
    - What Goes in /shared
    - What Doesn't Go in /shared
  - Theme and Design Tokens
  - TypeScript: Types Per Feature
  - Testing: Colocate Tests
  - The Full Structure (Practical Example)
  - Refactoring: When to Reorganize
  - Conclusion

## The 5 Best React Native UI Libraries in 2025

- Slug: top-5-react-native-ui-libraries
- Outline:
- The 5 Best React Native UI Libraries in 2025
  - Why Use a UI Library in React Native?
  - 1. Tamagui
  - 2. Gluestack UI
  - 3. HeroUI Native
  - 4. React Native Paper
  - 5. React Native UI Kitten
  - Quick Comparison
  - Conclusion
