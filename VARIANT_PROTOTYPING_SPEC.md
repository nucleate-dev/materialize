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

## Technical Approach: Route-Based Variants (Option A)

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

### What Needs to Change 🔧

#### 1. UI/UX Enhancements
- [ ] "Create Variants" workflow button
- [ ] Variant labeling (not just paths)
- [ ] Visual grouping of related variants
- [ ] Quick actions: duplicate variant, compare mode
- [ ] Export/share all variants functionality

#### 2. Chat Integration
- [ ] AI understands variant creation requests
- [ ] AI can target specific variants for editing
- [ ] Chat prompt mode for variant workflows
- [ ] Batch variant generation

#### 3. File Management
- [ ] Auto-suggest `(variants)/` route group
- [ ] Variant naming conventions
- [ ] Template/starter variant code

## User Workflows

### Workflow 1: Create Variants from Scratch

1. User types in chat: "Create 3 paywall variations with different pricing emphases"
2. AI generates execution plan:
   - Create `app/(variants)/paywall-v1.tsx` (monthly/yearly toggle)
   - Create `app/(variants)/paywall-v2.tsx` (free trial emphasis)
   - Create `app/(variants)/paywall-v3.tsx` (minimalist)
3. UI automatically populates 3 mobile screens showing:
   - `/paywall-v1`
   - `/paywall-v2`
   - `/paywall-v3`
4. User can interact with each variant independently

### Workflow 2: Create Variants from Existing Screen

1. User is viewing `/settings` screen
2. User clicks "Create Variants" button
3. Modal appears: "How many variants?" + description prompt
4. AI duplicates and modifies the screen into N variants
5. Multi-screen view auto-populates

### Workflow 3: Iterate on Specific Variant

1. User has 3 variants showing
2. User types: "Make the middle one use dark mode colors"
3. AI detects context or user uses "@variant-2" syntax
4. Only the specified variant updates

## Chat Integration: Explicit Mode Toggle (Option A)

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
| **Spec Expansion** | ✅ Yes | ❌ No (adds latency) |
| **Execution Plan** | Detailed, step-by-step | Lightweight, per-variant |
| **Design Polish** | High (spacing, typography, etc.) | Medium (functional focus) |
| **File Organization** | Feature-based | `(variants)/` grouping |
| **Mock Data** | Realistic, diverse | Quick placeholders OK |
| **Target Output** | Single cohesive feature | Multiple explorations |
| **Speed** | Thorough | Fast iteration |

### UI/UX for Mode Toggle

**Location:** Chat window header, next to "Chat" title

**Visual Design:**
```
┌─────────────────────────────────────┐
│ 💬 Chat  [Standard ▼] [Prototyping] │
│                                      │
│ Toggle switch or segmented control   │
└─────────────────────────────────────┘
```

**States:**
- **Standard Mode** (default): Blue/primary color
- **Prototyping Mode**: Purple/accent color (distinct from standard)
- Tooltip on hover explaining each mode

### Prototyping Mode Workflow

**1. User Switches to Prototyping Mode**
```
User clicks toggle → Mode switches to Prototyping
```

**2. User Requests Variants**
```
User: "Create 3 paywall variations with different pricing strategies"
```

**3. AI Generates Variants** (No Spec Expansion)
- Creates execution plan (lightweight)
- Generates files in `app/(variants)/`
- Calls `show_variants` tool with paths

**4. AI Sends Event to Client**
```json
{
  "type": "show_variants",
  "paths": ["/paywall-v1", "/paywall-v2", "/paywall-v3"],
  "labels": ["Monthly/Yearly Toggle", "Free Trial Focus", "Minimalist"]
}
```

**5. Client Shows Confirmation Modal**
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

**6. User Confirms**
- Replaces current screens with variant paths
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
"@paywall-v2 make the button larger"
"Update variant 2: change primary color to blue"
```
Uses existing `@[filepath]` pattern for disambiguation.

**Ambiguity Handling:**
If unclear, AI asks:
```
"Which variant did you mean?
 1. /paywall-v1 (Monthly/Yearly Toggle)
 2. /paywall-v2 (Free Trial Focus)
 3. /paywall-v3 (Minimalist)"
```

## Implementation Plan

### Phase 1: Backend Changes

#### 1.1 Add Mode to Request Body
**File:** `server/control-plane/types/PublicAPITypes.ts`
```typescript
export interface ChatRequestBody {
  messages: ChatMessage[];
  inputFiles: Record<string, PrototypeFile> | null;
  inputAssets: Record<string, PrototypeAsset> | null;
  chat_session_id: string;
  prototype_id: string;
  imageUrl?: string;
  currentViewingPath?: string;
  mode?: 'standard' | 'prototyping'; // NEW
}
```

#### 1.2 Create Prototyping System Prompt
**File:** `server/control-plane/services/chat/prompts/PROMPTS.ts`

Add new function:
```typescript
const buildPrototypingPrompt = (
  style: StyleDetail,
  designRules?: string | null,
  currentViewingPath?: string | null,
): string => {
  const sections = [
    'You are an expert React Native engineer creating quick prototype variations for comparison.',
    style.systemIntro,
    'Your goal is to create multiple meaningfully different variations that explore different UX approaches.',
    'CRITICAL RULES:',
    '- Create variants in app/(variants)/ route group',
    '- Each variant should explore a genuinely different approach (not just color changes)',
    '- Focus on functional differences over pixel-perfect polish',
    '- Use realistic content, but quick placeholders are acceptable',
    '- After creating variants, ALWAYS call the show_variants tool with the route paths',
    PLANNING_WORKFLOW,
    buildFileContextBlock(currentViewingPath),
    EFFICIENT_FILE_OPERATIONS_BLOCK,
    buildCommonFixes(style),
  ];
  return appendDesignRules(sections.join('\n\n'), designRules);
};

// Update buildPromptConfig to support prototyping mode
export const buildPromptConfig = ({
  designStyle,
  designRules,
  currentViewingPath,
  mode = 'standard', // NEW
}: {
  designStyle: DesignStyleKey;
  designRules?: string | null;
  currentViewingPath?: string | null;
  mode?: 'standard' | 'prototyping'; // NEW
}): PromptConfig => {
  const styleDetail = STYLE_DETAILS[designStyle] ?? STYLE_DETAILS.tamagui;

  return {
    system: mode === 'prototyping'
      ? buildPrototypingPrompt(styleDetail, designRules, currentViewingPath)
      : buildSystemPrompt(styleDetail, designRules, currentViewingPath),
    errorFixing: buildErrorFixingPrompt(styleDetail, designRules, currentViewingPath),
    specExpansion: mode === 'prototyping'
      ? '' // Skip spec expansion in prototyping mode
      : buildSpecExpansionPrompt(styleDetail, designRules),
  };
};
```

#### 1.3 Add `show_variants` Tool
**File:** `server/control-plane/services/chat/engines/ChatEngineV1.ts`

Add to tools array:
```typescript
{
  name: 'show_variants',
  description: 'Display multiple variant screens in the preview. Call this after creating variant files in app/(variants)/ to show them side-by-side.',
  input_schema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of route paths to display (e.g., ["/paywall-v1", "/paywall-v2", "/paywall-v3"])',
        minItems: 2,
        maxItems: 5,
      },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional labels describing each variant (e.g., ["Monthly/Yearly", "Free Trial", "Minimalist"])',
      }
    },
    required: ['paths']
  }
}
```

Add handler in tool execution:
```typescript
case 'show_variants': {
  const { paths, labels } = toolInput as { paths: string[]; labels?: string[] };

  // Send event to client
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({
        type: 'show_variants',
        paths,
        labels: labels || paths,
      })}\n\n`
    )
  );

  toolResult = {
    success: true,
    message: `Variants will be displayed: ${paths.join(', ')}`,
  };
  break;
}
```

#### 1.4 Pass Mode Through Chat Pipeline
**File:** `server/control-plane/services/chat/ChatService.ts`

Extract mode from request:
```typescript
const {
  messages,
  inputFiles,
  inputAssets,
  chat_session_id,
  prototype_id,
  imageUrl,
  currentViewingPath,
  mode = 'standard', // NEW - default to standard
} = request.body;
```

Pass mode to chat engine:
```typescript
await this.chatEngine.executeChat({
  messages: enhancedMessages,
  userMessage: fileContext.enhancedMessage,
  originalUserMessage,
  fileManager,
  inputFiles,
  inputAssets,
  prototype_id,
  token,
  chat_session_id,
  controller,
  encoder,
  supabase,
  log2: request.log2,
  imageUrl: imageUrl ?? null,
  currentViewingPath: currentViewingPath ?? null,
  mode, // NEW
});
```

**File:** `server/control-plane/services/chat/engines/ChatEngineV1.ts`

Update executeChat signature and use mode:
```typescript
async executeChat({
  // ... existing params
  mode = 'standard',
}: {
  // ... existing params
  mode?: 'standard' | 'prototyping';
}): Promise<void> {
  // ... existing code

  // When building prompts, pass mode
  const promptConfig = buildPromptConfig({
    designStyle,
    designRules,
    currentViewingPath,
    mode, // NEW
  });

  // Skip spec expansion if in prototyping mode
  if (mode === 'standard' && promptConfig.specExpansion) {
    // Do spec expansion
  }

  // ... rest of implementation
}
```

### Phase 2: Frontend Changes

#### 2.1 Add Mode State to Chat Component
**File:** `web-application/src/components/prototype-editor/PrototypeChatWindow.tsx`

```typescript
// Add state for mode
const [chatMode, setChatMode] = useState<'standard' | 'prototyping'>('standard');

// Add state for show variants modal
const [showVariantsModal, setShowVariantsModal] = useState(false);
const [pendingVariants, setPendingVariants] = useState<{
  paths: string[];
  labels: string[];
} | null>(null);
```

#### 2.2 Add Mode Toggle UI
In the header section of PrototypeChatWindow:
```tsx
<div className="flex items-center justify-between p-4 border-b">
  <div className="flex items-center gap-2">
    <ChatBubbleLeftRightIcon className="w-5 h-5" />
    <h2 className="text-lg font-semibold">Chat</h2>

    {/* NEW: Mode Toggle */}
    <div className="ml-4 flex items-center gap-1 bg-muted rounded-lg p-1">
      <Button
        variant={chatMode === 'standard' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setChatMode('standard')}
        className="text-xs"
      >
        Standard
      </Button>
      <Button
        variant={chatMode === 'prototyping' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setChatMode('prototyping')}
        className="text-xs"
      >
        Prototyping
      </Button>
    </div>
  </div>
  {/* ... rest of header */}
</div>
```

#### 2.3 Pass Mode in Chat Request
In `handleSendMessage`:
```typescript
const requestBody: ChatRequestBody = {
  messages: serverMessages,
  inputFiles: files,
  inputAssets: assets,
  chat_session_id: prototypeChatSession.id,
  prototype_id: prototypeId || "",
  imageUrl: imageUrl,
  currentViewingPath: currentViewingPath,
  mode: chatMode, // NEW
};
```

#### 2.4 Handle `show_variants` Event
In `processStreamingResponse`, add new case:
```typescript
case "show_variants":
  // Store variants and show confirmation modal
  const { paths, labels } = event as { paths: string[]; labels: string[] };
  setPendingVariants({ paths, labels });
  setShowVariantsModal(true);
  break;
```

#### 2.5 Add Variants Confirmation Modal
```tsx
{/* Show Variants Confirmation Modal */}
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
            // Trigger render section update
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

#### 2.6 Add Callback to Parent Component
**File:** `web-application/src/app/dashboard/prototypes/[prototype_id]/InternalPrototypePage.tsx`

```typescript
// Add handler for showing variants
const handleShowVariants = useCallback((paths: string[]) => {
  // This will be passed down to MaterializeRenderSection
  // to update the mobile screens
}, []);

// Pass to PrototypeChatWindow
<PrototypeChatWindow
  // ... existing props
  onShowVariants={handleShowVariants}
/>
```

#### 2.7 Update MaterializeRenderSection
**File:** `web-application/src/components/prototype-editor/MaterializeRenderSection.tsx`

Add prop and handler:
```typescript
interface MaterializeRenderSectionProps {
  // ... existing props
  onShowVariants?: (paths: string[]) => void;
}

// In component body
useEffect(() => {
  if (onShowVariants) {
    // Expose handler to parent
    onShowVariants((paths: string[]) => {
      setMobileScreens(paths.map((path, idx) => ({
        id: nextMobileScreenId.current++,
        path,
      })));
    });
  }
}, [onShowVariants]);
```

## Technical Considerations

### Performance
- **Multiple iframes**: 3-5 iframes should be fine, all loading from same dev server
- **Memory**: Each iframe maintains separate state (good for testing isolation)
- **Lazy loading**: Could implement if needed, but probably not necessary

### State Management
- Each iframe is isolated (desired behavior for variant testing)
- Shared state (auth, user data) could be injected via localStorage if needed
- For most prototyping, isolation is a feature, not a bug

### Export/Share
- Generate shareable link that opens with multi-screen layout
- Preserve screen paths in URL params: `/prototype/123?screens=/v1,/v2,/v3`
- Allow commenting/voting per variant (future enhancement)

## Success Metrics

- Time to create 3 variants < 2 minutes
- Users create variants for 30%+ of prototypes
- Variants feature used in design reviews (qualitative feedback)
- Reduced back-and-forth in user messages (comparative exploration)

## Next Steps

1. **Finalize Chat Integration Approach** (this discussion)
2. Design UI mockups for variant workflows
3. Update system prompts for variant awareness
4. Implement "Create Variants" button and flow
5. Add variant-specific chat targeting
6. Test with real use cases (paywalls, onboarding, etc.)
