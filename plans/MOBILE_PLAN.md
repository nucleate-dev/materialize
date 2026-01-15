# Nucleate Mobile App - Comprehensive Implementation Plan

## Overview
Create an Expo React Native app (`mobile-app/`) that allows users to:
1. View their projects in a list
2. Edit projects through a chat interface (like InternalPrototypePage)
3. View project previews (like PublicPrototypePage)

**Scope**: Core features only - skip file browser, terminal, deployment for v1

---

## Part 1: Shared Design System Package

### Why a Shared Package?
The web app uses a comprehensive design system with:
- HSL-based CSS variables for theming
- Tailwind config with custom colors, spacing, typography
- Dark mode support via `next-themes`

To maintain consistency, we'll create a shared package that both apps consume.

### Package Structure
```
packages/
└── design-tokens/
    ├── package.json
    ├── src/
    │   ├── colors.ts          # Color palette (HSL values)
    │   ├── typography.ts      # Font sizes, weights, line heights
    │   ├── spacing.ts         # Spacing scale
    │   ├── shadows.ts         # Shadow definitions
    │   ├── animations.ts      # Animation durations/easings
    │   └── index.ts           # Barrel export
    ├── tailwind.preset.js     # Tailwind preset for web
    └── nativewind.preset.js   # NativeWind preset for mobile
```

### Color Tokens (from web-application/tailwind.config.ts)
```typescript
// packages/design-tokens/src/colors.ts
export const colors = {
  // Semantic colors (HSL format for web, converted to hex for mobile)
  primary: { light: '217 91% 60%', dark: '217 91% 60%', hex: '#3b82f6' },
  secondary: { light: '214 32% 91%', dark: '215 28% 17%', hex: '#e2e8f0' },
  background: { light: '0 0% 98%', dark: '240 8% 6%', hex: { light: '#fafafa', dark: '#0f0f11' } },
  foreground: { light: '224 71% 4%', dark: '210 20% 98%', hex: { light: '#030712', dark: '#f8fafc' } },
  muted: { light: '210 40% 96%', dark: '215 28% 17%', hex: { light: '#f1f5f9', dark: '#27272a' } },
  destructive: { light: '0 84% 60%', dark: '0 62% 30%', hex: '#ef4444' },
  success: { light: '142 76% 36%', dark: '142 76% 36%', hex: '#22c55e' },
  warning: { light: '38 92% 50%', dark: '38 92% 50%', hex: '#f59e0b' },

  // Static colors
  white: '#ffffff',
  black: '#000000',

  // Chart colors (for data visualization)
  chart: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e'],
};

// For NativeWind, export as flat object
export const nativeWindColors = {
  primary: '#3b82f6',
  'primary-foreground': '#ffffff',
  secondary: '#e2e8f0',
  // ... etc
};
```

### Typography Tokens
```typescript
// packages/design-tokens/src/typography.ts
export const typography = {
  fontFamily: {
    sans: 'Satoshi, system-ui, sans-serif',  // Web
    sansMobile: 'System',  // Mobile uses system font
  },
  fontSize: {
    xs: { size: 12, lineHeight: 16 },
    sm: { size: 14, lineHeight: 20 },
    base: { size: 16, lineHeight: 24 },
    lg: { size: 18, lineHeight: 28 },
    xl: { size: 20, lineHeight: 28 },
    '2xl': { size: 24, lineHeight: 32 },
    '3xl': { size: 30, lineHeight: 36 },
    '4xl': { size: 36, lineHeight: 40 },
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
};
```

### Integration
- **Web**: Import Tailwind preset, CSS variables continue to work
- **Mobile**: Import NativeWind preset, use same class names
- **Sync**: Single source of truth for design decisions

---

## Part 2: Mobile App Architecture

### Tech Stack
| Category | Technology | Rationale |
|----------|------------|-----------|
| Framework | Expo SDK 52+ | Managed workflow, OTA updates, easy native access |
| Navigation | Expo Router v4 | File-based routing, matches web mental model |
| State | Zustand | Simple, performant, works with React Native |
| Data | TanStack Query v5 | Same as web, great caching/offline support |
| Auth | Supabase Auth | Shared with web, built-in React Native support |
| Styling | NativeWind v4 | Tailwind for RN, uses shared design tokens |
| Storage | expo-secure-store | Secure token storage (Keychain/Keystore) |
| Offline | @tanstack/query-persist-client-sync | Persist queries to AsyncStorage |

### Navigation Structure
```
app/
├── _layout.tsx                    # Root: providers, auth guard
├── (auth)/
│   ├── _layout.tsx               # Auth layout (no tabs)
│   ├── login.tsx                 # Login screen
│   ├── signup.tsx                # Signup screen
│   └── forgot-password.tsx       # Password reset
├── (tabs)/
│   ├── _layout.tsx               # Tab navigator
│   ├── index.tsx                 # Projects list (home tab)
│   ├── create.tsx                # Create project (plus tab)
│   └── settings.tsx              # Settings (gear tab)
└── project/
    └── [id]/
        ├── _layout.tsx           # Project layout
        ├── index.tsx             # View-only mode
        └── edit.tsx              # Edit mode (chat + preview)
```

---

## Part 3: Screen-by-Screen UX Specifications

### 3.1 Authentication Screens

#### Login Screen
```
┌─────────────────────────────────┐
│                                 │
│         [Nucleate Logo]         │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Email                     │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ Password              👁  │  │
│  └───────────────────────────┘  │
│                                 │
│  [      Sign In Button      ]   │
│                                 │
│  ─────── or continue with ───── │
│                                 │
│  [Google]         [GitHub]      │
│                                 │
│  Don't have an account? Sign up │
│  Forgot password?               │
└─────────────────────────────────┘
```

**States & Edge Cases:**
| State | Behavior |
|-------|----------|
| Loading | Button shows spinner, inputs disabled |
| Invalid email format | Red border, inline error below field |
| Wrong credentials | Toast: "Invalid email or password" |
| Network error | Toast: "Check your connection", retry button |
| Rate limited | Toast: "Too many attempts, try again later" |
| OAuth error | Toast with specific error message |

**Validation (from AuthFormValidationUtils.ts):**
- Email: `^[^\s@]+@[^\s@]+\.[^\s@]+$`
- Password: Show/hide toggle, no client-side requirements for login

#### Signup Screen
```
┌─────────────────────────────────┐
│         [Nucleate Logo]         │
│                                 │
│  ┌───────────────────────────┐  │
│  │ First name               │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ Last name                │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ Email                     │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ Password              👁  │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ Confirm Password      👁  │  │
│  └───────────────────────────┘  │
│                                 │
│  [     Create Account       ]   │
│                                 │
│  Already have an account? Log in│
└─────────────────────────────────┘
```

**Password Requirements (strict):**
- 12+ characters
- At least 1 lowercase, 1 uppercase, 1 digit, 1 symbol
- Show real-time checklist as user types

---

### 3.2 Projects List Screen (Home Tab)

```
┌─────────────────────────────────┐
│ Projects            [Team ▼]   │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 🔍 Search projects...       │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ [Screenshot]                │ │
│ │ My Shopping App             │ │
│ │ Updated 2 hours ago         │ │
│ │ 📱 Mobile  •  👁 Public     │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ [Screenshot]                │ │
│ │ Portfolio Website           │ │
│ │ Updated yesterday           │ │
│ │ 🌐 Web  •  🔒 Private       │ │
│ └─────────────────────────────┘ │
│                                 │
│ (Pull to refresh)               │
└─────────────────────────────────┘
│  [Projects]  [Create]  [Settings]│
└─────────────────────────────────┘
```

**Project Card Component:**
```typescript
interface ProjectCardProps {
  id: string;
  name: string;
  screenshot_url: string | null;
  framework: 'mobile_expo_react_native' | 'web_nextjs_react';
  visibility: 'PUBLIC' | 'TEAM' | 'SELF';
  updated_at: string;
  onPress: () => void;
  onLongPress: () => void; // Context menu
}
```

**States & Edge Cases:**
| State | Behavior |
|-------|----------|
| Loading initial | Skeleton cards (3-4 placeholders) |
| Empty (no projects) | Illustration + "Create your first project" CTA |
| Pull to refresh | Spinner at top, refetch data |
| Offline | Show cached data, banner: "You're offline" |
| Team switch | Immediate UI update, fetch new team's projects |
| Search | Filter locally first, debounce server search |
| Long press | Bottom sheet: Edit, Duplicate, Delete |
| Delete confirm | Alert dialog with project name confirmation |

**Team Switcher:**
- Dropdown in header
- Shows team avatar + name
- Personal team always first
- Smooth transition animation

---

### 3.3 Create Project Screen (Create Tab)

```
┌─────────────────────────────────┐
│ New Project                    │
├─────────────────────────────────┤
│                                 │
│  What would you like to build? │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │ Describe your app idea... │  │
│  │                           │  │
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
│  Platform                       │
│  ┌─────────┐ ┌─────────┐       │
│  │ 📱      │ │ 🌐      │       │
│  │ Mobile  │ │ Web     │       │
│  │    ✓    │ │         │       │
│  └─────────┘ └─────────┘       │
│                                 │
│  Design Style                   │
│  ┌─────────────────────────────┐│
│  │ NativeWind (Tailwind)    ▼ ││
│  └─────────────────────────────┘│
│                                 │
│  Visibility                     │
│  ○ Public  ○ Team  ● Private   │
│                                 │
│  [       Create Project       ] │
│                                 │
└─────────────────────────────────┘
```

**States & Edge Cases:**
| State | Behavior |
|-------|----------|
| Empty prompt | Create button disabled |
| Creating | Full-screen loading with animated logo |
| Success | Navigate to edit screen immediately |
| Limit reached | Show upgrade modal (port ProPlanUpsellModal) |
| Network error | Toast with retry option |
| Free user + Team visibility | Show "Upgrade to Pro" inline |

---

### 3.4 Project Edit Screen (Split View - Key Screen)

This is the most complex screen - combines chat with live preview.

```
┌─────────────────────────────────┐
│ ← My Shopping App    [⋮]       │  <- Header with back + menu
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │                             │ │  <- Preview WebView (40%)
│ │      [Live Preview]         │ │     Tap to expand full-screen
│ │                             │ │
│ │   ⟳ Refresh  ⤢ Expand      │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤  <- Draggable divider
│ ┌─────────────────────────────┐ │
│ │ 🤖 How can I help?         │ │  <- Chat area (60%)
│ │                             │ │
│ │ [User message bubble]       │ │
│ │                             │ │
│ │ [Assistant response...]     │ │
│ │                             │ │
│ │ ✓ Reading package.json     │ │  <- Tool indicators
│ │ ● Writing App.tsx          │ │
│ │                             │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ 📎  Message...          ➤  │ │  <- Input bar
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**Layout Behavior:**
- Default split: 40% preview, 60% chat
- Preview tap: Expands to full screen with close button
- Keyboard open: Preview collapses to ~20%, chat expands
- Landscape: Side-by-side 50/50 option

**Message Types (port from ClaudeCodePanelUI.tsx):**
| Type | Visual |
|------|--------|
| User | Right-aligned, primary color bubble |
| Assistant | Left-aligned, markdown rendered |
| Tool (running) | Compact card with spinner: "Writing App.tsx..." |
| Tool (done) | Green check, collapsed by default |
| Tool (error) | Red X, tap to expand error details |
| Thinking | Collapsible "Processing..." with pulse animation |
| Error | Red alert box with error message |
| Credits | Small muted text: "1.2 credits used" |

**Input Area:**
- Multiline text input (auto-grow, max 200px)
- Paperclip button for image attachment
- Send button (blue) / Stop button (red when processing)
- Keyboard avoiding behavior

**Connection States:**
| State | UI Indicator |
|-------|--------------|
| Connecting | Yellow dot + "Connecting..." in header |
| Connected | Green dot (subtle) |
| Disconnected | Red dot + "Reconnecting..." + retry button |
| Sandbox starting | "Starting environment..." overlay on preview |
| Sandbox error | Error message in preview area |

**WebSocket Handling:**
- Auto-reconnect on disconnect (exponential backoff)
- Queue messages while disconnected
- 2-minute timeout for queued messages
- Show queued indicator on message bubbles

**Image Attachment:**
- expo-image-picker for camera/gallery
- Preview thumbnails before sending
- Upload progress bar
- 3MB limit per image
- Support paste from clipboard (if technically feasible)

---

### 3.5 Project View Screen (Read-only)

```
┌─────────────────────────────────┐
│ ← My Shopping App  [Share][⋮]  │
├─────────────────────────────────┤
│                                 │
│                                 │
│                                 │
│        [Full WebView]           │
│                                 │
│                                 │
│                                 │
│                                 │
│           ⟳ Refresh             │
│                                 │
└─────────────────────────────────┘
│      [View]     [Edit]          │  <- Segmented control
└─────────────────────────────────┘
```

**Features:**
- Full-screen WebView with device frame option
- Refresh button
- Share button (native share sheet)
- Edit button to switch to edit mode
- Loading indicator while WebView loads

---

### 3.6 Settings Screen

```
┌─────────────────────────────────┐
│ Settings                        │
├─────────────────────────────────┤
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 👤 [Avatar]                 │ │
│ │ John Doe                    │ │
│ │ john@example.com            │ │
│ │                          >  │ │
│ └─────────────────────────────┘ │
│                                 │
│ Account                         │
│ ┌─────────────────────────────┐ │
│ │ Subscription     Pro Plan > │ │
│ │ Team             Personal > │ │
│ └─────────────────────────────┘ │
│                                 │
│ Preferences                     │
│ ┌─────────────────────────────┐ │
│ │ Theme            System   > │ │
│ │ Notifications           🔘  │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Sign Out]                      │
│                                 │
│ Version 1.0.0                   │
└─────────────────────────────────┘
```

---

## Part 4: Offline Support & Caching

### Strategy: Offline-Aware with Caching

**React Query Persist:**
```typescript
// lib/queryClient.ts
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const persister = createSyncStoragePersister({
  storage: {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
    removeItem: AsyncStorage.removeItem,
  },
});

// Persist queries for 24 hours
persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24,
});
```

**Offline Behavior by Feature:**
| Feature | Offline Behavior |
|---------|-----------------|
| Projects list | Show cached list, "Offline" banner |
| Project view | Show cached preview if available, else error |
| Project edit | Queue messages, show "Will send when online" |
| Create project | Disabled, show "Requires connection" |
| Settings | Profile cached, subscription may be stale |

**Network Status Hook:**
```typescript
// hooks/useNetworkStatus.ts
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    return NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? false);
    });
  }, []);

  return { isOnline };
}
```

**Offline Banner Component:**
```
┌─────────────────────────────────┐
│ ⚠️ You're offline              │
└─────────────────────────────────┘
```
- Sticky at top of screen
- Yellow/amber background
- Auto-dismisses when back online with "Back online" toast

---

## Part 5: Error Handling Patterns

### Global Error Boundary
```typescript
// components/ErrorBoundary.tsx
export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundaryPrimitive
      FallbackComponent={({ error, resetErrorBoundary }) => (
        <View className="flex-1 items-center justify-center p-4">
          <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
          <Text className="text-lg font-semibold mb-2">Something went wrong</Text>
          <Text className="text-muted-foreground text-center mb-4">{error.message}</Text>
          <Button onPress={resetErrorBoundary}>Try Again</Button>
        </View>
      )}
    >
      {children}
    </ErrorBoundaryPrimitive>
  );
}
```

### Toast Notifications
Use `react-native-toast-message` or `burnt` for native toasts:
- Success: Green, auto-dismiss 3s
- Error: Red, tap to dismiss, includes retry action when applicable
- Warning: Yellow, auto-dismiss 5s
- Info: Blue, auto-dismiss 3s

### Specific Error Scenarios

| Error | Handling |
|-------|----------|
| Auth expired | Clear session, redirect to login |
| 401 on API call | Refresh token, retry, else logout |
| 403 (no permission) | Toast: "You don't have access to this project" |
| 404 (project gone) | Redirect to projects list, toast: "Project not found" |
| 429 (rate limit) | Toast with countdown: "Try again in X seconds" |
| 500 (server error) | Toast: "Server error, please try again" |
| Network timeout | Toast: "Request timed out", retry button |
| WebSocket error | Auto-reconnect, show status in header |

---

## Part 6: Implementation Phases

### Phase 1: Foundation
**Goal**: Runnable app with auth

1. Initialize Expo project with Expo Router
2. Set up NativeWind with shared design tokens
3. Implement Supabase client with secure storage
4. Build auth screens (login, signup, forgot password)
5. Set up auth state management (Zustand)
6. Implement protected route wrapper

**Key files:**
- `mobile-app/app/_layout.tsx`
- `mobile-app/app/(auth)/*.tsx`
- `mobile-app/lib/supabase.ts`
- `mobile-app/stores/authStore.ts`
- `packages/design-tokens/*`

### Phase 2: Projects & Teams
**Goal**: View and manage projects

1. Build projects list with FlashList
2. Implement team context and switcher
3. Add pull-to-refresh and search
4. Build project card component
5. Add delete/duplicate actions
6. Set up React Query with persistence

**Key files:**
- `mobile-app/app/(tabs)/index.tsx`
- `mobile-app/components/ProjectCard.tsx`
- `mobile-app/stores/teamStore.ts`
- `mobile-app/hooks/usePrototypes.ts`

### Phase 3: Project Viewing
**Goal**: View projects in WebView

1. Build WebView wrapper component
2. Implement viewing URL fetching
3. Handle loading/error states
4. Add refresh and share actions
5. Build full-screen expand mode

**Key files:**
- `mobile-app/app/project/[id]/index.tsx`
- `mobile-app/components/PreviewWebView.tsx`
- `mobile-app/hooks/useViewingUrl.ts`

### Phase 4: Chat Interface
**Goal**: Full editing capability

1. Port WebSocket hook from web
2. Build message components (all types)
3. Implement split-view layout
4. Add keyboard handling
5. Build image picker integration
6. Handle connection states
7. Implement message queueing

**Key files:**
- `mobile-app/app/project/[id]/edit.tsx`
- `mobile-app/components/chat/*.tsx`
- `mobile-app/hooks/useClaudeCodeWebSocket.ts`

### Phase 5: Create & Polish
**Goal**: Complete core loop

1. Build create project screen
2. Implement framework/style selectors
3. Add subscription limit handling
4. Build settings screen
5. Add offline support
6. Polish animations and transitions
7. Test and fix edge cases

**Key files:**
- `mobile-app/app/(tabs)/create.tsx`
- `mobile-app/app/(tabs)/settings.tsx`
- `mobile-app/hooks/useCreatePrototype.ts`

---

## Part 7: Directory Structure (Final)

```
materialize/
├── packages/
│   └── design-tokens/
│       ├── package.json
│       ├── src/
│       │   ├── colors.ts
│       │   ├── typography.ts
│       │   ├── spacing.ts
│       │   └── index.ts
│       ├── tailwind.preset.js
│       └── nativewind.preset.js
│
├── mobile-app/
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── (auth)/
│   │   │   ├── _layout.tsx
│   │   │   ├── login.tsx
│   │   │   ├── signup.tsx
│   │   │   └── forgot-password.tsx
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx
│   │   │   ├── create.tsx
│   │   │   └── settings.tsx
│   │   └── project/
│   │       └── [id]/
│   │           ├── _layout.tsx
│   │           ├── index.tsx
│   │           └── edit.tsx
│   ├── components/
│   │   ├── ui/                    # Shared UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   └── Toast.tsx
│   │   ├── chat/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ToolIndicator.tsx
│   │   │   └── ChatInput.tsx
│   │   ├── project/
│   │   │   ├── ProjectCard.tsx
│   │   │   ├── ProjectList.tsx
│   │   │   └── PreviewWebView.tsx
│   │   ├── OfflineBanner.tsx
│   │   └── ErrorBoundary.tsx
│   ├── hooks/
│   │   ├── useUser.ts
│   │   ├── usePrototypes.ts
│   │   ├── useCreatePrototype.ts
│   │   ├── useViewingUrl.ts
│   │   ├── useClaudeCodeWebSocket.ts
│   │   ├── useNetworkStatus.ts
│   │   └── useSubscriptionAccess.ts
│   ├── stores/
│   │   ├── authStore.ts
│   │   └── teamStore.ts
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── queryClient.ts
│   │   ├── storage.ts           # Secure storage wrapper
│   │   └── types/
│   │       ├── serverAPITypes.ts
│   │       ├── ChatTypes.ts
│   │       └── database.types.ts
│   ├── app.json
│   ├── package.json
│   ├── tailwind.config.js
│   ├── nativewind-env.d.ts
│   └── tsconfig.json
│
└── web-application/
    └── (existing, update tailwind.config.ts to use preset)
```

---

## Part 8: Key Files to Reference

| Mobile File | Web Reference | Purpose |
|-------------|---------------|---------|
| `hooks/useUser.ts` | `src/hooks/useUser.ts` | Auth state |
| `hooks/useClaudeCodeWebSocket.ts` | `src/hooks/useClaudeCodeWebSocket.ts` | WebSocket |
| `hooks/usePrototypes.ts` | `src/app/dashboard/projects/ProjectsPageContainer.tsx` | List fetch |
| `hooks/useCreatePrototype.ts` | `src/hooks/useCreatePrototype.ts` | Create |
| `stores/teamStore.ts` | `src/contexts/TeamContext.tsx` | Team state |
| `lib/types/ChatTypes.ts` | `src/lib/types/ChatTypes.ts` | Message types |
| `components/chat/ChatPanel.tsx` | `src/components/prototype-editor/ClaudeCodePanelUI.tsx` | Chat UI |

---

## Part 9: Success Criteria

### MVP Checklist
- [x] User can sign up and log in (email/password)
- [ ] User can view their projects list
- [ ] User can switch between teams
- [ ] User can create a new project with prompt
- [ ] User can view project preview in WebView
- [ ] User can edit project via chat interface
- [ ] Chat shows all message types correctly
- [ ] WebSocket reconnects on disconnect
- [ ] Offline mode shows cached data with banner
- [ ] App handles all error states gracefully

### Quality Bars
- **Performance**: 60fps scrolling, <100ms tap response
- **Reliability**: No crashes in normal usage
- **Offline**: Cached data available within 24 hours
- **Accessibility**: VoiceOver/TalkBack basic support

---

## TODOs / Future Enhancements

### Authentication
- [ ] **Google OAuth** - Add Google sign-in using `expo-auth-session` with Supabase OAuth flow
- [ ] **GitHub OAuth** - Add GitHub sign-in using `expo-auth-session`
- [ ] **Apple Sign-In** - Required for iOS App Store if other social logins are present
- [ ] **Biometric Auth** - Optional Face ID / Touch ID for returning users

### Features (Post-MVP)
- [ ] Push notifications for build completion, chat responses
- [ ] Deep linking to specific projects
- [ ] File browser within projects
- [ ] Terminal access (via WebView or native PTY)
