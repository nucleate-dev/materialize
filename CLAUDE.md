# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Technology Stack

This is a Next.js 14 application with the following key technologies:
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui component library
- **Authentication**: Supabase Auth
- **Analytics**: PostHog
- **Payments**: Stripe
- **Email**: Resend with React Email components

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
- shadcn/ui components in `src/components/ui/`

### Authentication System
The app uses Supabase Auth with comprehensive wrapper utilities in `src/lib/utils/auth/SupabaseAuthUtils.ts`:
- `useUser()` - Get current user without refreshing token
- `useRequireAuth()` - Enforce authentication with automatic redirect
- OAuth providers supported
- Password reset and update flows

### UI Component System
The project uses shadcn/ui for consistent, accessible UI components:
- Components are located in `src/components/ui/`
- Uses Radix UI primitives under the hood
- Fully customizable with Tailwind CSS
- Dark mode support built-in
- Accessible by default

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
- `tailwind.config.ts` - Tailwind configuration
- `src/app/providers.tsx` - PostHog analytics provider setup
- `components.json` - shadcn/ui configuration

## Development Notes

- The app has both public landing pages and protected dashboard areas
- Supabase is configured for auth, ensure environment variables are set
- PostHog analytics is integrated for event tracking
- shadcn/ui components should be used for consistent UI patterns
- Extensive TypeScript interfaces defined in `src/app/dashboard/types/`