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