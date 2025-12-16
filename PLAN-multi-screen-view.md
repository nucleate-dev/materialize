# Multi-Screen View Feature Plan

## Overview

Allow users to view multiple screens/pages of their app simultaneously within the MaterializeRenderSection. This enables viewing entire flows (e.g., onboarding sequences) or comparing different pages side-by-side.

## Current State Analysis

The codebase already has partial multi-screen infrastructure:

- **`mobileScreens: MobileScreenConfig[]`** - Array supporting multiple screen configs (lines 275-278)
- **`iframeRefs: Map<number, HTMLIFrameElement>`** - Tracks multiple iframe references (line 335)
- **Per-screen path tracking** - Each screen has independent `id`, `path`, and `isEditing` state
- **Path editing UI** - Editable path badges above each screen frame

**Key file:** `web-application/src/components/prototype-editor/MaterializeRenderSection.tsx`

## Proposed Implementation

### 1. UI Changes

#### A. Add Screen Button (Top Right Toolbar)
- Add a "+" button in the toolbar area (around line 1866-2134)
- Clicking adds a new screen to the `mobileScreens` array
- New screens default to "/" path

#### B. Screen Layout Grid
- Display screens in a responsive horizontal scroll or grid layout
- Each screen maintains the phone frame aesthetic
- Auto-scale screen sizes based on number of screens visible

#### C. Per-Screen Controls
- **Path input** (already exists) - Editable path above each screen
- **Remove button** (X) - Delete screen from view (minimum 1 screen required)
- **Refresh button** - Refresh individual screen

#### D. Screen Size Adjustments
- Dynamically scale phone frames when multiple screens are shown
- Options:
  - Fixed size with horizontal scroll
  - Auto-scale to fit viewport
  - User-configurable zoom level

### 2. State Management Changes

```typescript
// Existing - no changes needed
interface MobileScreenConfig {
  id: number;
  path: string;
  isEditing: boolean;
}

// May need to add:
interface MobileScreenConfig {
  id: number;
  path: string;
  isEditing: boolean;
  label?: string;        // Optional: custom label like "Login", "Dashboard"
  scrollPosition?: number; // Optional: preserve scroll position
}
```

### 3. New Functions to Add

```typescript
// Add new screen
const addScreen = useCallback(() => {
  const newId = Math.max(...mobileScreens.map(s => s.id), 0) + 1;
  setMobileScreens(prev => [...prev, { id: newId, path: '/', isEditing: false }]);
}, [mobileScreens]);

// Remove screen
const removeScreen = useCallback((screenId: number) => {
  if (mobileScreens.length <= 1) return; // Keep at least one
  setMobileScreens(prev => prev.filter(s => s.id !== screenId));
  iframeRefs.current.delete(screenId);
}, [mobileScreens]);

// Refresh individual screen
const refreshScreen = useCallback((screenId: number) => {
  const iframe = iframeRefs.current.get(screenId);
  if (iframe) {
    const currentSrc = iframe.src;
    iframe.src = 'about:blank';
    setTimeout(() => { iframe.src = currentSrc; }, 100);
  }
}, []);
```

### 4. Layout Implementation

```tsx
// Multi-screen container with horizontal scroll
<div className="flex gap-4 overflow-x-auto p-4 items-start justify-center">
  {mobileScreens.map((screen) => (
    <div key={screen.id} className="flex-shrink-0">
      {/* Screen controls */}
      <div className="flex items-center gap-2 mb-2">
        <PathInput screen={screen} />
        <Button size="sm" onClick={() => refreshScreen(screen.id)}>
          <RefreshCw size={14} />
        </Button>
        {mobileScreens.length > 1 && (
          <Button size="sm" onClick={() => removeScreen(screen.id)}>
            <X size={14} />
          </Button>
        )}
      </div>
      {/* Phone frame with iframe */}
      <PhoneFrame screen={screen} />
    </div>
  ))}
</div>
```

---

## Questions & Recommendations

### Q1: Maximum number of screens?

**Options:**
- A) Unlimited (let users add as many as they want)
- B) Hard limit (e.g., 6 screens max)
- C) Soft warning at threshold (e.g., warn at 4+, allow more)

**My Recommendation:** Option C - Soft warning at 4+ screens. This balances flexibility with performance. More than 4 iframes may slow down the browser, so we warn but don't restrict power users.

---

### Q2: Screen sizing behavior with multiple screens?

**Options:**
- A) **Fixed size** - Screens stay at default size, horizontal scroll for overflow
- B) **Auto-fit** - Shrink screens proportionally to fit all in viewport
- C) **Zoom control** - Add a zoom slider to manually adjust all screen sizes
- D) **Hybrid** - Auto-fit up to a minimum size, then scroll

**My Recommendation:** Option D - Hybrid approach. Auto-fit screens until they reach a minimum readable size (e.g., 200px width), then enable horizontal scroll. This keeps content readable while maximizing visible screens.

---

### Q3: Should screens sync navigation?

**Options:**
- A) **Independent** - Each screen navigates independently (current behavior)
- B) **Optional sync** - Toggle to sync all screens to same path
- C) **Leader/follower** - One "primary" screen, others follow its navigation

**My Recommendation:** Option A - Keep screens independent. The whole point is to view different pages simultaneously. Users can manually set paths if they want the same view.

---

### Q4: Persist screen configuration?

**Options:**
- A) **Session only** - Reset to single screen on page reload
- B) **Local storage** - Remember per-prototype screen setup
- C) **Database** - Store in prototype record for cross-device persistence

**My Recommendation:** Option B - Local storage per prototype. This is lightweight, doesn't require backend changes, and provides good UX. Screen layouts are personal preference, not collaborative state.

---

### Q5: Web preview mode support?

Currently there are two preview modes: "mobile" (phone frames) and "web" (browser frame).

**Options:**
- A) **Mobile only** - Multi-screen only for mobile preview mode
- B) **Both modes** - Support multi-screen in web preview too (multiple browser windows)
- C) **Mobile priority** - Launch with mobile only, add web later

**My Recommendation:** Option C - Start with mobile mode only. The phone frame UI is already set up for multiple screens. Web mode can be added in a follow-up if needed. This reduces initial scope.

---

### Q6: Screen labels/naming?

**Options:**
- A) **No labels** - Just show the path
- B) **Auto-labels** - Generate from path (e.g., "/login" → "Login")
- C) **Custom labels** - Let users name screens (e.g., "Step 1", "Step 2")
- D) **Both** - Show path with optional custom label

**My Recommendation:** Option A initially, Option D as enhancement. For MVP, the path is sufficient context. Custom labels add complexity and can be a follow-up feature.

---

### Q7: Add Screen button placement?

**Options:**
- A) **Toolbar** - In the top toolbar next to other actions
- B) **Inline** - "+" button after the last screen in the preview area
- C) **Both** - Toolbar button + inline visual hint

**My Recommendation:** Option C - Both locations. Toolbar for discoverability, inline for intuitive flow. The inline "+" after the last screen makes it obvious how to add more.

---

### Q8: Screen reordering?

**Options:**
- A) **No reordering** - Screens stay in order they were added
- B) **Drag and drop** - Let users reorder screens by dragging
- C) **Move buttons** - Left/right arrows to reorder

**My Recommendation:** Option A for MVP. Reordering is nice-to-have but adds complexity. Users can remove and re-add screens in desired order. Drag-and-drop can be a follow-up.

---

## Implementation Phases

### Phase 1: Core Multi-Screen (MVP)
- [ ] Add "Add Screen" button to toolbar
- [ ] Implement `addScreen()` function
- [ ] Add remove button (X) per screen
- [ ] Implement `removeScreen()` function
- [ ] Adjust layout for multiple screens (horizontal scroll)
- [ ] Scale screen sizes appropriately
- [ ] Individual screen refresh button

### Phase 2: Polish
- [ ] Add inline "+" button after last screen
- [ ] Implement hybrid sizing (auto-fit + scroll)
- [ ] Add soft warning for 4+ screens
- [ ] Persist configuration to localStorage

### Phase 3: Enhancements (Future)
- [ ] Custom screen labels
- [ ] Drag-and-drop reordering
- [ ] Web preview mode support
- [ ] Screen templates/presets (e.g., "Onboarding Flow" = 4 screens)

---

## Files to Modify

| File | Changes |
|------|---------|
| `web-application/src/components/prototype-editor/MaterializeRenderSection.tsx` | Add screen management functions, update layout, add UI controls |

---

## Technical Considerations

1. **Performance**: Each iframe is a separate browsing context. Monitor memory usage with 4+ screens.

2. **Path Polling**: Current implementation polls each iframe for path changes every 200ms. With multiple screens, this may need optimization.

3. **Refresh Key**: The `refreshKey` state forces all screens to reload. May need per-screen refresh keys for individual control.

4. **Cross-origin**: Ensure path detection works across all screens (same tunnel URL base).

---

## Waiting for Feedback

Please review the questions above and let me know your preferences. I've provided my recommendations, but happy to adjust based on your vision for the feature.

Once we align on the approach, I'll proceed with implementation.
