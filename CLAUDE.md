# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Technology Stack

This is a Next.js 14 application with the following key technologies:
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS with extensive custom design system
- **Authentication**: Supabase Auth
- **Analytics**: PostHog
- **Payments**: Stripe
- **Email**: Resend with React Email components
- **UI Components**: Custom component library with dashboard theme

## Common Development Commands

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# No test command is configured in package.json
```

## Project Architecture

### App Structure
The project uses Next.js App Router with the following key patterns:

- **Route Groups**: Uses `(auth)` and `(callbacks)` route groups to organize authentication-related pages
- **Landing vs Dashboard**: Separate UI patterns for public landing pages vs authenticated dashboard
- **Authentication Flow**: Comprehensive auth system with login, register, password reset, and OAuth
- **Payment Integration**: Stripe integration with subscription management

### Key Directories

**`src/app/`** - Next.js App Router pages
- `(auth)/` - Authentication pages (login, register, forgot password, reset password)
- `(callbacks)/` - OAuth callback handlers
- `dashboard/` - Protected dashboard area with sidebar navigation
- `landing_components/` - Public landing page components

**`src/lib/utils/`** - Utility modules organized by domain
- `auth/` - Supabase authentication wrappers and validation
- `payments/` - Stripe checkout and subscription management
- `emails/` - Email utilities using Resend

**`src/components/`** - Shared components
- Form components (Button, Fields, ErrorModal)
- Email templates using React Email

### Authentication System
The app uses Supabase Auth with comprehensive wrapper utilities in `src/lib/utils/auth/SupabaseAuthUtils.ts`:
- `useUser()` - Get current user without refreshing token
- `useRequireAuth()` - Enforce authentication with automatic redirect
- OAuth providers supported
- Password reset and update flows

### Design System
Extensive Tailwind configuration with:
- Custom color palette (primary, secondary, meta colors, dark mode variants)
- Custom spacing scale (4.5rem to 292.5rem)
- Custom typography scale (title-xxl to title-xsm)
- Custom shadows, animations, and component styles

#### Modern UI Design Rules
Based on the dashboard landing page (`/src/app/dashboard/page.tsx`), follow these comprehensive design rules for consistent, premium UI across the application:

**1. Layout & Structure**
- Full viewport containers: Use `h-screen` with `overflow-hidden` for contained layouts
- Flex centering: `flex flex-col items-center justify-center` for primary content areas
- Responsive spacing: `px-6 py-6` base padding with responsive variants
- Max-width constraints: `max-w-4xl` for main content, `max-w-6xl` for grids
- Grid systems: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` for responsive layouts

**2. Background & Atmosphere**
- Gradient backgrounds: Multi-stop gradients using design tokens
  ```
  bg-gradient-to-br from-gray-2 via-whiter to-gray-3 
  dark:from-boxdark-2 dark:via-boxdark dark:to-meta-4
  ```
- Animated background orbs: Multiple floating elements with different animations
- Layered depth: `absolute` positioned elements with `z-10` content overlay
- Blur effects: `blur-3xl` for atmospheric backgrounds, `blur-2xl` for glows

**3. Glassmorphism Effects**
- Primary containers: `bg-white/80 dark:bg-boxdark/80 backdrop-blur-xl`
- Secondary containers: `bg-white/60 dark:bg-boxdark/60 backdrop-blur-sm`
- Subtle borders: `border border-white/20 dark:border-strokedark/30`
- Inner glow overlays: Gradient overlays with low opacity for depth

**4. Typography Hierarchy**
- Hero headings: `text-5xl md:text-6xl font-bold` with gradient text
- Section headings: `text-2xl font-bold`
- Body text: `text-xl` for hero descriptions, `text-sm` for secondary
- Color system: `text-black dark:text-white` for primary, `text-body dark:text-bodydark` for secondary

**5. Interactive Elements**
- Primary CTA buttons: Gradient backgrounds with glow effects
  ```
  bg-gradient-to-r from-primary via-secondary to-meta-5
  shadow-2xl shadow-primary/40 hover:shadow-primary/60
  ```
- Hover animations: `hover:scale-110` with smooth transitions
- Ring effects: `ring-2 ring-white/30 dark:ring-primary/30`
- Input fields: Animated gradient borders that appear on hover/focus
- Cards: `hover:scale-105` for lift effect with gradient overlays

**6. Animation Rules**
- Entrance animations: Staggered delays for list items
- Micro-interactions: Icon scaling, text color changes
- Loading states: Consistent spinner animations
- Background animations: Slow, subtle movements (`20s` duration)
- Transition timing: `duration-300` for most interactions

**7. Color & Gradient System**
- Primary gradients: `from-primary via-secondary to-meta-5`
- Status colors: `meta-3` (success), `meta-1` (error), `meta-6` (warning)
- Opacity variations: `/80`, `/60`, `/40`, `/20`, `/10` for layering
- Context-aware colors: Different gradients for different interaction states

**8. Dark Mode Considerations**
- Consistent dual theming: Every color has dark mode variant
- Enhanced contrast: Stronger shadows and glows in dark mode
- Adapted opacity: Lower opacity values for dark backgrounds
- Glow adjustments: More pronounced glow effects in dark mode

**Implementation Priority:**
1. Start with background system (gradients + animated orbs)
2. Apply glassmorphism containers for main content areas
3. Implement typography hierarchy consistently
4. Add interactive animations for buttons and cards
5. Ensure dark mode parity for all elements
6. Test responsive behavior across breakpoints

### Dashboard Structure
The dashboard area (`src/app/dashboard/`) includes:
- Sidebar navigation with collapsible groups
- Header with user dropdown and notifications
- Chart components using ApexCharts
- Table components for data display
- Form elements and UI components
- Dark mode support

### Payment Integration
Stripe integration handles:
- One-time payments and subscriptions
- Checkout flow with webhook handling
- Billing management
- Payment validation utilities

## Important Files

- `src/GlobalConstants.ts` - Global configuration and constants
- `src/LoggingEvents.ts` - Event tracking definitions
- `tailwind.config.ts` - Extensive design system configuration
- `src/app/providers.tsx` - PostHog analytics provider setup

## Development Notes

- The app has both public landing pages and protected dashboard areas
- Supabase is configured for auth, ensure environment variables are set
- PostHog analytics is integrated for event tracking
- Custom Satoshi font family is used throughout
- Extensive TypeScript interfaces defined in `src/app/dashboard/types/`