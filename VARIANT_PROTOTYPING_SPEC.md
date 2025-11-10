# Variant Prototyping Feature Specification

## Overview

This document outlines the design and implementation plan for adding variant prototyping capabilities to Materialize. This feature enables users to prototype and compare 3-5 different variations of UI components or screens simultaneously.

## Use Cases

### Primary Use Cases
- **Paywall Testing**: Create 3-5 different paywall designs and compare them side-by-side
- **Component Variations**: Test different layouts, color schemes, or interaction patterns for a single component
- **A/B Testing Exploration**: Visualize multiple options before committing to implementation
- **Design Reviews**: Present multiple options to stakeholders in a single view
- **Iteration Speed**: Quickly explore different design directions without losing context

### Example Scenarios
```
"Create 3 paywall variations:
 1. One with monthly/yearly toggle
 2. One with free trial emphasis
 3. One minimalist"

"Show me 4 different onboarding flows"

"Create variations of the profile screen with different layouts"
```

## Technical Approach: Route-Based Variants

### Why Route-Based?
1. **Simple Mental Model**: Users already understand routes in Expo Router
2. **AI-Friendly**: Easy to prompt and generate
3. **Low Friction**: Works with existing multi-screen infrastructure
4. **Visual Clarity**: Each screen badge shows exactly what route it's rendering
5. **Minimal Changes**: Leverages existing `mobileScreens` functionality
6. **Single Dev Server**: All variants share one dev server, no performance concerns

### File Structure Pattern

Variants will be organized using Expo Router's file-based routing:

```
app/
├── (tabs)/
│   └── index.tsx          # Main home screen
├── (variants)/            # Route group for variants
│   ├── paywall-v1.tsx     # Variant 1
│   ├── paywall-v2.tsx     # Variant 2
│   └── paywall-v3.tsx     # Variant 3
└── profile.tsx            # Regular screen
```

**Why `(variants)` route group?**
- Keeps variants organized and separate from main app routes
- Doesn't create a visible route segment (parentheses = route group in Expo Router)
- Easy to identify variant files vs production code
- Can be ignored in production builds if needed

### URL Structure

Each variant has a clean route path:
```
/paywall-v1
/paywall-v2
/paywall-v3
```

The multi-screen preview shows these routes simultaneously in separate mobile frames.

## Current Implementation Status

### What Already Exists ✅

From `MaterializeRenderSection.tsx`:
- Multi-screen rendering (`mobileScreens` array)
- Independent navigation per screen
- Path editing per screen with route autocomplete
- Iframe ref tracking per screen
- Route detection from file system
- Add/remove screen functionality

From `CodeService.ts`:
- File system watcher that tracks ALL file changes (lines 1605-1694)
- WebSocket-based communication with frontend
- Tool hooks (PreToolUse, PostToolUse) for custom behavior
- System prompt configuration with design system support

### What Needs to Change 🔧

#### 1. Backend (CodeService.ts)
- [ ] Add `mode` parameter to `ChatQueryData` type
- [ ] Build different system prompts for prototyping mode
- [ ] Add `show_variants` custom tool/event
- [ ] Send WebSocket event when AI calls show_variants

#### 2. Frontend (ClaudeCodePanel.tsx)
- [ ] Mode toggle UI (Standard vs Prototyping)
- [ ] Handle `show_variants` WebSocket event
- [ ] Variant confirmation modal
- [ ] Communication with parent to update mobile screens

#### 3. State Management & Integration
- [ ] How ClaudeCodePanel communicates with MaterializeRenderSection
- [ ] Parent component (InternalPrototypePage) orchestrates state
- [ ] Callback pattern or shared state context

#### 4. UI/UX Enhancements (Future)
- [ ] "Create Variants" button workflow
- [ ] Variant labeling (not just paths)
- [ ] Visual grouping of related variants
- [ ] Quick actions: duplicate variant, compare mode

## User Workflows

### Workflow 1: Create Variants from Scratch

1. User switches to **Prototyping Mode** in ClaudeCodePanel
2. User types in chat: "Create 3 paywall variations with different pricing emphases"
3. AI generates files in `app/(variants)/`:
   - Create `app/(variants)/paywall-v1.tsx` (monthly/yearly toggle)
   - Create `app/(variants)/paywall-v2.tsx` (free trial emphasis)
   - Create `app/(variants)/paywall-v3.tsx` (minimalist)
4. AI calls `show_variants` tool with paths and labels
5. ClaudeCodePanel shows confirmation modal
6. User confirms → 3 mobile screens populate with:
   - `/paywall-v1`
   - `/paywall-v2`
   - `/paywall-v3`
7. User can interact with each variant independently

### Workflow 2: Iterate on Specific Variant

1. User has 3 variants showing
2. User types: "Make the middle one use dark mode colors"
3. AI detects context or user uses "@paywall-v2" syntax
4. Only the specified variant updates
5. File watcher tracks changes → syncs to Supabase

## Chat Integration: Explicit Mode Toggle

### Decision: Explicit "Prototyping Mode" Toggle

**Why Explicit Mode?**
- Crystal clear behavior - no ambiguity
- Users know exactly what to expect in each mode
- No room for detection errors or edge cases
- Easy to understand and explain

### Mode Comparison

| Aspect | Standard Mode | Prototyping Mode |
|--------|--------------|------------------|
| **Purpose** | Build polished features | Quick variant exploration |
| **Execution Plan** | Detailed, step-by-step | Lightweight, per-variant |
| **Design Polish** | High (spacing, typography, etc.) | Medium (functional focus) |
| **File Organization** | Feature-based | `(variants)/` grouping |
| **Mock Data** | Realistic, diverse | Quick placeholders OK |
| **Target Output** | Single cohesive feature | Multiple explorations |
| **Speed** | Thorough | Fast iteration |
| **System Prompt** | Full Claude Code prompt | Variant-focused prompt |

### UI/UX for Mode Toggle

**Location:** ClaudeCodePanel header, near connection status

**Visual Design:**
```
┌─────────────────────────────────────────┐
│ ● Project  [Session ▼] [+]             │
│                                          │
│ [Standard] [Prototyping] ← Segmented    │
│                             control      │
│ [Stop] [Reset] [ℹ️]                      │
└─────────────────────────────────────────┘
```

**States:**
- **Standard Mode** (default): Primary color
- **Prototyping Mode**: Distinct accent color (e.g., purple)
- Tooltip on hover explaining each mode

### Prototyping Mode Workflow

**1. User Switches to Prototyping Mode**
```
User clicks "Prototyping" → Mode state updates → Badge shows "Prototyping Mode"
```

**2. User Requests Variants**
```
User: "Create 3 paywall variations with different pricing strategies"
```

**3. AI Generates Variants**
- Uses prototyping-focused system prompt
- Creates files in `app/(variants)/`
- Calls custom `show_variants` tool

**4. AI Calls show_variants Tool**
The AI invokes a custom tool (not a standard Claude Code SDK tool):
```json
{
  "name": "show_variants",
  "input": {
    "paths": ["/paywall-v1", "/paywall-v2", "/paywall-v3"],
    "labels": ["Monthly/Yearly Toggle", "Free Trial Focus", "Minimalist"]
  }
}
```

**5. Backend Sends WebSocket Event**
CodeService.ts detects the tool call and sends:
```json
{
  "type": "show_variants",
  "data": {
    "paths": ["/paywall-v1", "/paywall-v2", "/paywall-v3"],
    "labels": ["Monthly/Yearly Toggle", "Free Trial Focus", "Minimalist"]
  }
}
```

**6. Frontend Shows Confirmation Modal**
ClaudeCodePanel displays:
```
┌──────────────────────────────────────────┐
│  🎨 Show 3 Variants?                     │
│                                          │
│  I created these variants:               │
│  • /paywall-v1 - Monthly/Yearly Toggle   │
│  • /paywall-v2 - Free Trial Focus        │
│  • /paywall-v3 - Minimalist              │
│                                          │
│  [Show Variants] [Keep Current Screens]  │
└──────────────────────────────────────────┘
```

**7. User Confirms**
- User clicks "Show Variants"
- ClaudeCodePanel calls parent callback: `onShowVariants(paths)`
- Parent updates MaterializeRenderSection's `mobileScreens` state
- All 3 variants render side-by-side

### How AI Targets Variants for Edits

**Hybrid Approach: Natural Language + Explicit References**

**Natural Language (Primary):**
```
"Make the middle one darker"
"Update the first paywall to emphasize annual savings"
"Change the minimalist version to use blue accents"
```
AI infers which variant based on:
- Position (left, middle, right, first, last)
- Description (minimalist, free trial, etc.)
- Context from previous generation

**Explicit References (Fallback):**
```
"@app/(variants)/paywall-v2.tsx make the button larger"
"Update variant 2: change primary color to blue"
```

**Ambiguity Handling:**
If unclear, AI asks:
```
"Which variant did you mean?
 1. /paywall-v1 (Monthly/Yearly Toggle)
 2. /paywall-v2 (Free Trial Focus)
 3. /paywall-v3 (Minimalist)"
```

## Implementation Plan

### Phase 1: Backend Changes (CodeService.ts)

#### 1.1 Add Mode to ChatQueryData Type
**File:** `server/build-workers/types/ChatTypes.ts`

```typescript
export interface ChatQueryData {
  prompt?: string;
  content?: Array<{ type: string; text?: string; source?: unknown }>;
  token?: string;
  session_id?: string | null;
  chat_session_id?: string | null;
  options?: Record<string, unknown>;
  custom_design_system_id?: string | null;
  mode?: 'standard' | 'prototyping'; // NEW
}
```

#### 1.2 Extract and Use Mode in handleQuery
**File:** `server/build-workers/services/CodeService.ts`

In `handleQuery` method (around line 262):
```typescript
const {
  prompt,
  content,
  token,
  session_id,
  chat_session_id,
  mode = 'standard', // NEW - extract mode, default to standard
} = data;
```

#### 1.3 Build Different System Prompts Based on Mode
**File:** `server/build-workers/utils/ClaudeCodePrompts.ts`

Add a new prototyping prompt:
```typescript
export const PROTOTYPING_MODE_PROMPT = `
You are an expert React Native engineer creating quick prototype variations for comparison.

Your goal is to create multiple meaningfully different variations that explore different UX approaches.

CRITICAL RULES:
- Create variants in app/(variants)/ route group
- Use descriptive names like: paywall-v1.tsx, paywall-v2.tsx, onboarding-v1.tsx, etc.
- Each variant should explore a genuinely different approach (not just color changes)
- Focus on functional differences over pixel-perfect polish
- Use realistic content, but quick placeholders are acceptable
- After creating variants, ALWAYS call the show_variants tool with the route paths

VARIANT NAMING:
- Use kebab-case: paywall-v1.tsx, not PaywallV1.tsx
- Include version number: v1, v2, v3
- Be descriptive: profile-card-v1.tsx, profile-list-v1.tsx

SHOW VARIANTS TOOL:
After creating variant files, you MUST call:
show_variants({
  paths: ["/paywall-v1", "/paywall-v2", "/paywall-v3"],
  labels: ["Monthly/Yearly Toggle", "Free Trial Focus", "Minimalist"]
})

The paths should match the route paths (without .tsx extension).
The labels should briefly describe what makes each variant unique.
`;
```

**File:** `server/build-workers/services/CodeService.ts`

Update system prompt building (around line 495):
```typescript
// Build system prompt with optional design system rules
const basePrompt = mode === 'prototyping'
  ? PROTOTYPING_MODE_PROMPT
  : SYSTEM_PROMPT;

const systemPromptAppend = this.sessionState.designSystemRules
  ? basePrompt + '\n\n## Custom Design System Rules:\n' + this.sessionState.designSystemRules
  : basePrompt;
```

#### 1.4 Add show_variants Custom Event Handler

The `show_variants` tool is NOT a standard Claude Code SDK tool. It needs to be handled via hooks.

**Option A: Handle in PreToolUse Hook** (Recommended)

In the `hooks` section of `queryOptions` (around line 520):
```typescript
PreToolUse: [
  {
    hooks: [
      async (
        input: HookInput,
        toolUseID: string | undefined,
        _options: { signal: AbortSignal },
      ): Promise<HookJSONOutput> => {
        try {
          // Check if this is the show_variants custom tool
          if (input.hook_event_name === "PreToolUse" && input.tool_name === "show_variants") {
            const toolInput = input.tool_input as { paths: string[]; labels?: string[] };

            // Send show_variants event to WebSocket client
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  type: ChatEvent.SHOW_VARIANTS, // NEW event type
                  data: {
                    paths: toolInput.paths,
                    labels: toolInput.labels || toolInput.paths,
                  },
                }),
              );
            }

            this.logger.info("show_variants tool called", {
              paths: toolInput.paths,
              labels: toolInput.labels,
            });

            // Block the tool from executing (it's just a signal to the client)
            return {
              continue: false,
              block_message: "Variants displayed in preview"
            };
          }

          // ... rest of existing PreToolUse logic
        } catch (error) {
          this.logger.error(
            error instanceof Error ? error : new Error(String(error)),
            "PreToolUse hook error",
          );
        }
        return { continue: true };
      },
    ],
  },
],
```

**Option B: Add to allowedTools and Handle in Claude SDK**

This requires Claude SDK to support custom tools, which may not be available. Option A is more reliable.

#### 1.5 Add SHOW_VARIANTS Event Type
**File:** `server/build-workers/types/ChatTypes.ts`

```typescript
export enum ChatEvent {
  // ... existing events
  SHOW_VARIANTS = "show_variants", // NEW
}

export interface ShowVariantsEvent {
  type: ChatEvent.SHOW_VARIANTS;
  data: {
    paths: string[];
    labels: string[];
  };
}

// Update ChatServerMessage union type
export type ChatServerMessage =
  | AuthenticatedEvent
  | MessageReceivedEvent
  // ... other event types
  | ShowVariantsEvent; // NEW
```

### Phase 2: Frontend Changes (ClaudeCodePanel.tsx)

#### 2.1 Add Mode State
**File:** `web-application/src/components/prototype-editor/ClaudeCodePanel.tsx`

After other state declarations (around line 144):
```typescript
// Mode state
const [chatMode, setChatMode] = useState<'standard' | 'prototyping'>('standard');

// Variants modal state
const [showVariantsModal, setShowVariantsModal] = useState(false);
const [pendingVariants, setPendingVariants] = useState<{
  paths: string[];
  labels: string[];
} | null>(null);
```

#### 2.2 Add Mode Toggle UI

In the header section (around line 1742), add mode toggle:
```tsx
<div className="flex items-center justify-between p-3 border-b">
  <div className="flex items-center gap-2 flex-1">
    <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-400"}`} />
    <span className="text-sm font-medium truncate max-w-[150px]">{prototypeTitle}</span>

    {/* NEW: Mode Toggle */}
    <div className="ml-2 flex items-center gap-0.5 bg-muted rounded-md p-0.5">
      <Button
        variant={chatMode === 'standard' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setChatMode('standard')}
        className="h-7 text-xs px-2"
      >
        Standard
      </Button>
      <Button
        variant={chatMode === 'prototyping' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setChatMode('prototyping')}
        className="h-7 text-xs px-2"
      >
        Prototyping
      </Button>
    </div>

    {/* Session Selector */}
    {allChatSessions.length > 0 && (
      // ... existing session selector
    )}

    {/* ... rest of header */}
  </div>
</div>
```

#### 2.3 Pass Mode in WebSocket Query

In `sendQuery` method (around line 1510):
```typescript
// Send message in the format expected by CodeService
ws.send(
  JSON.stringify({
    type: "query",
    data: {
      content,
      token,
      session_id: sessionIdRef.current,
      chat_session_id: chatSessionId,
      custom_design_system_id: prototype?.custom_design_system,
      mode: chatMode, // NEW
    },
  }),
);
```

#### 2.4 Handle SHOW_VARIANTS Event

In `handleServerMessage` method (around line 862), add new case:
```typescript
case ChatEvent.SHOW_VARIANTS: {
  const { paths, labels } = message.data;
  setPendingVariants({ paths, labels });
  setShowVariantsModal(true);
  break;
}
```

#### 2.5 Add Variants Confirmation Modal

At the end of the component (around line 2287), before the closing `</div>`:
```tsx
{/* Variants Confirmation Modal */}
<Dialog open={showVariantsModal} onOpenChange={setShowVariantsModal}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>🎨 Show Variants?</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        I created these variants:
      </p>
      <ul className="space-y-2">
        {pendingVariants?.paths.map((path, idx) => (
          <li key={path} className="flex items-center gap-2 text-sm">
            <Badge variant="outline">{path}</Badge>
            {pendingVariants.labels[idx] && (
              <span className="text-muted-foreground">
                - {pendingVariants.labels[idx]}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            // Trigger parent callback to update mobile screens
            if (pendingVariants && onShowVariants) {
              onShowVariants(pendingVariants.paths);
            }
            setShowVariantsModal(false);
            setPendingVariants(null);
          }}
          className="flex-1"
        >
          Show Variants
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setShowVariantsModal(false);
            setPendingVariants(null);
          }}
        >
          Keep Current Screens
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>
```

#### 2.6 Add onShowVariants Prop

Update the component props interface (around line 68):
```typescript
interface ClaudeCodePanelProps {
  prototypeId: string;
  baseTunnelUrl: string | null;
  prototype?: Prototype | null;
  canEditPrototype?: boolean;
  onPrototypeUpdate?: (updatedPrototype: Prototype) => void;
  onFileSyncComplete?: () => void;
  currentRenderStatus?: RenderStatus;
  externalWS?: WebSocket | null;
  externalWSConnected?: boolean;
  onConnect?: () => Promise<void>;
  onDisconnect?: () => void;
  onRegisterMessageHandler?: (
    id: string,
    handler: (msg: ChatServerMessage) => void,
  ) => void;
  onUnregisterMessageHandler?: (id: string) => void;
  onShowVariants?: (paths: string[]) => void; // NEW
}
```

Extract in component:
```typescript
export default function ClaudeCodePanel({
  prototypeId,
  baseTunnelUrl,
  prototype,
  canEditPrototype = false,
  onPrototypeUpdate,
  onFileSyncComplete,
  currentRenderStatus,
  externalWS,
  externalWSConnected,
  onConnect,
  onDisconnect,
  onRegisterMessageHandler,
  onUnregisterMessageHandler,
  onShowVariants, // NEW
}: ClaudeCodePanelProps) {
  // ... rest of component
}
```

### Phase 3: Parent Component Integration

#### 3.1 Update InternalPrototypePage

**File:** `web-application/src/app/dashboard/prototypes/[prototype_id]/InternalPrototypePage.tsx`

The parent component needs to:
1. Accept the `onShowVariants` callback from ClaudeCodePanel
2. Pass it down to MaterializeRenderSection (or manage state directly)

**Approach 1: Direct State Management (Recommended)**

```typescript
const handleShowVariants = useCallback((paths: string[]) => {
  // Directly update MaterializeRenderSection state
  // This requires MaterializeRenderSection to expose a way to update its screens
  // OR the parent manages mobileScreens state and passes it as a prop

  // TODO: Determine how MaterializeRenderSection's mobileScreens state is managed
  // Option A: MaterializeRenderSection exposes imperative handle
  // Option B: Parent owns mobileScreens state and passes it down

  console.log("Show variants requested:", paths);
}, []);

<ClaudeCodePanel
  // ... existing props
  onShowVariants={handleShowVariants}
/>
```

**Approach 2: Shared State Context**

If MaterializeRenderSection and ClaudeCodePanel are far apart in the component tree, consider:
- Creating a `PrototypeEditorContext` that holds `mobileScreens` state
- Both components consume the context
- ClaudeCodePanel updates context when variants are confirmed

#### 3.2 Questions for MaterializeRenderSection Integration

**Key Questions:**
1. **Who owns `mobileScreens` state?**
   - Currently seems to be internal to MaterializeRenderSection
   - Should it be lifted to parent (InternalPrototypePage)?
   - Or should MaterializeRenderSection expose a method to update it?

2. **How does state flow?**
   - ClaudeCodePanel → Parent → MaterializeRenderSection (via props)
   - ClaudeCodePanel → Shared Context ← MaterializeRenderSection
   - ClaudeCodePanel → Imperative handle on MaterializeRenderSection

3. **What happens to existing screens?**
   - Replace all screens with variants
   - Add variants alongside existing screens
   - Let user choose in the modal

**Recommended Approach:**
- Lift `mobileScreens` state to parent component
- Pass `mobileScreens` and `setMobileScreens` to MaterializeRenderSection
- `handleShowVariants` directly calls `setMobileScreens`

## Technical Considerations

### File System Watcher
The current implementation uses a file watcher (CodeService.ts:1605-1694) which is **perfect** for variants:
- Automatically tracks all variant files created
- No need for special handling in hooks
- Files are synced to Supabase after chat session ends
- Works regardless of which tool (Write, Edit, Bash) creates the files

### Performance
- **Multiple iframes**: 3-5 iframes should be fine, all loading from same dev server
- **Memory**: Each iframe maintains separate state (good for testing isolation)
- **Lazy loading**: Could implement if needed, but probably not necessary

### State Isolation
- Each iframe is isolated (desired behavior for variant testing)
- Shared state (auth, user data) could be injected via localStorage if needed
- For most prototyping, isolation is a feature, not a bug

### Tool Reliability
**Risk:** The AI might forget to call `show_variants` after creating files.

**Mitigations:**
1. Strong prompt instructions ("ALWAYS call show_variants")
2. Prototyping mode uses a focused, shorter prompt
3. User can manually trigger screen addition if needed
4. Future: Detect variant files and auto-suggest showing them

## Open Questions

1. **Mode Persistence:**
   - Should mode be saved per-session in `prototype_chat_sessions`?
   - Or is it ephemeral (resets on page reload)?
   - **Recommendation:** Ephemeral for now, always default to Standard

2. **Variant File Cleanup:**
   - Should there be a "Clear all variants" action?
   - How do users distinguish variant files from production code?
   - **Recommendation:** Manual cleanup for now, consider future folder badge in file tree

3. **Multi-screen State Management:**
   - See "Phase 3.2 Questions" above
   - **Recommendation:** Lift state to parent, pass as props

4. **Tool Validation:**
   - Should we validate that variant files exist before showing modal?
   - What if AI calls `show_variants` with invalid paths?
   - **Recommendation:** Show modal regardless, let iframes show 404 if paths are invalid

## Success Metrics

- Time to create 3 variants < 2 minutes
- Users create variants for 30%+ of prototypes
- Variants feature used in design reviews (qualitative feedback)
- Reduced back-and-forth in user messages (comparative exploration)

## Implementation Checklist

### Backend
- [ ] Add `mode` to `ChatQueryData` type (ChatTypes.ts)
- [ ] Add `PROTOTYPING_MODE_PROMPT` constant (ClaudeCodePrompts.ts)
- [ ] Extract `mode` in `handleQuery` (CodeService.ts:262)
- [ ] Conditional system prompt based on mode (CodeService.ts:495)
- [ ] Handle `show_variants` in PreToolUse hook (CodeService.ts:520)
- [ ] Add `ChatEvent.SHOW_VARIANTS` event type (ChatTypes.ts)

### Frontend
- [ ] Add mode state to ClaudeCodePanel (ClaudeCodePanel.tsx:144)
- [ ] Add mode toggle UI (ClaudeCodePanel.tsx:1742)
- [ ] Pass mode in WebSocket query (ClaudeCodePanel.tsx:1510)
- [ ] Handle SHOW_VARIANTS event (ClaudeCodePanel.tsx:862)
- [ ] Add variants confirmation modal (ClaudeCodePanel.tsx:2287)
- [ ] Add `onShowVariants` prop (ClaudeCodePanel.tsx:68)

### Integration
- [ ] Add `handleShowVariants` callback (InternalPrototypePage.tsx)
- [ ] Lift `mobileScreens` state to parent OR expose update method
- [ ] Pass callback to ClaudeCodePanel
- [ ] Update MaterializeRenderSection to accept screens prop

### Testing
- [ ] Test mode toggle UI
- [ ] Test prototyping prompt generates variant files
- [ ] Test `show_variants` tool call triggers modal
- [ ] Test modal confirmation updates mobile screens
- [ ] Test file watcher tracks variant files
- [ ] Test variant files sync to Supabase

## Next Steps

1. **Resolve state management question** - Decide on MaterializeRenderSection integration
2. **Implement backend** - Add mode parameter and show_variants handling
3. **Implement frontend** - Add mode toggle and modal
4. **Connect integration** - Wire up parent callbacks
5. **Test end-to-end** - Create variants and verify all pieces work
6. **Iterate on UX** - Gather feedback and refine
