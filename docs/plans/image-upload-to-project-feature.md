# Image Upload to Project Feature Plan

## Overview

Allow users to upload images for use in their final app (saved to the project repository), in addition to the existing chat image functionality (AI context only).

## Current State

### Chat Images (Existing)
- **Storage**: `chat-images` Supabase bucket
- **Database**: `prototype_chat_messages.event_data`
- **Purpose**: AI context only - images are sent to Claude for understanding
- **Sync to sandbox**: No
- **Max size**: 5MB

### Project Assets (Existing Infrastructure)
- **Storage**: `prototype-assets` Supabase bucket
- **Database**: `prototype_assets` table
- **Purpose**: Actual app files that become part of the codebase
- **Sync to sandbox**: Yes (via FileSyncService)
- **Max size**: 10MB

## Existing Infrastructure (Already Implemented)

| Component | Location | Status |
|-----------|----------|--------|
| `FileTree` drag-and-drop | `web-application/src/components/prototype-editor/FileTree.tsx` | ✅ Working |
| `handleFileUpload` | `InternalPrototypePage.tsx:1157` | ✅ Working |
| `syncFilesAndAssets` | `useFileSystem.ts` | ✅ Working |
| Asset type detection | `handleFileUpload` (by extension) | ✅ Working |
| Bulk upload support | `handleFileUpload` (File[] array) | ✅ Working |
| Path targeting | Drop location in FileTree | ✅ Working |

### Supported Asset Extensions
```
png, jpg, jpeg, gif, svg, webp, ico, ttf, otf, woff, woff2, md, txt, env, gitignore, npmrc, prettierrc, eslintrc, editorconfig, watchmanconfig, xml
```

## What's Missing

### 1. Chat Panel Integration
Users uploading images via the chat panel can only share with AI. They need an option to add images directly to the project.

### 2. AI Tool
Users should be able to say "add this image to my project" in chat and have the AI handle it.

---

## UX Design

### Option A: Dropdown on Paperclip Button (Recommended)

```
┌─────────────────────────────────────────────────┐
│ [Image previews if any]                         │
│ ┌─────────────────────────────────────────────┐ │
│ │ Ask Nucleate to edit code...                │ │
│ └─────────────────────────────────────────────┘ │
│ [📎 ▼] [Send]                                   │
│    └── Dropdown Menu:                           │
│        ┌────────────────────────────────┐       │
│        │ 🤖 Share with AI               │       │
│        │    (context for your question) │       │
│        ├────────────────────────────────┤       │
│        │ 📁 Add to project              │       │
│        │    (save to project files)     │       │
│        └────────────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

### Flow: "Add to Project"

1. User clicks paperclip dropdown → "Add to project"
2. File picker opens (multi-select enabled)
3. Images uploaded to project via existing `handleFileUpload`
4. Toast notification: "Added 3 images to /public/images/"
5. Files appear in FileTree immediately

### Flow: AI Tool

```
User: "Add this screenshot to my project as hero.png"
[attaches image via normal flow]

AI: [calls save_image_to_project tool internally]
    "Done! I've saved the image to /public/images/hero.png.
     You can reference it in your code as '/images/hero.png'"
```

---

## Technical Implementation

### Phase 1: Chat Panel Dropdown (Frontend)

#### Files to Modify

1. **`ClaudeCodePanelUI.tsx`** - Add dropdown menu to paperclip button
2. **`ClaudeCodePanel.tsx`** - Add handler for project uploads
3. **`InternalPrototypePage.tsx`** - Pass `handleFileUpload` as prop

#### New Props for ClaudeCodePanel

```typescript
interface ClaudeCodePanelProps {
  // ... existing props
  onUploadToProject?: (files: File[], targetPath?: string) => void;
}
```

#### UI Component Changes

```tsx
// ClaudeCodePanelUI.tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageSquare, FolderPlus, Paperclip } from "lucide-react";

// Replace existing paperclip button with:
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
    >
      <Paperclip className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start">
    <DropdownMenuItem onClick={() => chatFileInputRef.current?.click()}>
      <MessageSquare className="mr-2 h-4 w-4" />
      <div className="flex flex-col">
        <span>Share with AI</span>
        <span className="text-xs text-muted-foreground">
          Use as context for your question
        </span>
      </div>
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => projectFileInputRef.current?.click()}>
      <FolderPlus className="mr-2 h-4 w-4" />
      <div className="flex flex-col">
        <span>Add to project</span>
        <span className="text-xs text-muted-foreground">
          Save to project files
        </span>
      </div>
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>

{/* Hidden file input for project uploads */}
<input
  type="file"
  ref={projectFileInputRef}
  className="hidden"
  accept="image/*"
  multiple
  onChange={handleProjectFileSelect}
/>
```

#### Auto-Path Detection

```typescript
function getDefaultImagePath(starterType: string): string {
  switch (starterType) {
    case 'nextjs':
    case 'vite':
      return 'public/images';
    case 'expo':
    case 'react-native':
      return 'assets/images';
    default:
      return 'public/images';
  }
}
```

---

### Phase 2: AI Tool (Backend)

#### New File: `server/build-workers/services/chat/tools/save-image-to-project.ts`

```typescript
import { SupabaseClientService } from "../../SupabaseClientService";

export const saveImageToProjectToolDefinition = {
  name: "save_image_to_project",
  description:
    "Saves an image that the user shared in this message to the project's file system. " +
    "Use this when the user asks to add an image to their project, save it for use in the app, " +
    "or similar requests. The image will be saved to the appropriate directory based on the project type.",
  input_schema: {
    type: "object" as const,
    properties: {
      imageIndex: {
        type: "number",
        description: "Which image from the user's message to save (0 = first image, 1 = second, etc.)",
      },
      fileName: {
        type: "string",
        description: "The filename to save as (e.g., 'logo.png', 'hero-image.jpg'). Include the extension.",
      },
      subdirectory: {
        type: "string",
        description:
          "Optional subdirectory within the images folder (e.g., 'icons', 'backgrounds'). " +
          "Leave empty to save directly in the main images folder.",
      },
    },
    required: ["imageIndex", "fileName"],
  },
};

export interface SaveImageToProjectInput {
  imageIndex: number;
  fileName: string;
  subdirectory?: string;
}

export interface SaveImageToProjectResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export async function handleSaveImageToProject(
  input: SaveImageToProjectInput,
  context: {
    supabaseClientService: SupabaseClientService;
    prototypeId: string;
    imageMetadata: Array<{ storage_path: string; media_type: string }>;
    starterType: string;
  }
): Promise<SaveImageToProjectResult> {
  const { imageIndex, fileName, subdirectory } = input;
  const { supabaseClientService, prototypeId, imageMetadata, starterType } = context;

  // Validate image index
  if (imageIndex < 0 || imageIndex >= imageMetadata.length) {
    return {
      success: false,
      error: `Invalid image index. User provided ${imageMetadata.length} image(s).`,
    };
  }

  const sourceImage = imageMetadata[imageIndex];

  // Determine target path based on starter type
  const baseDir = getDefaultImagePath(starterType);
  const targetDir = subdirectory ? `${baseDir}/${subdirectory}` : baseDir;
  const targetPath = `${targetDir}/${fileName}`;

  try {
    // 1. Download image from chat-images bucket
    const { data: imageData, error: downloadError } = await supabaseClientService
      .getClient()
      .storage
      .from("chat-images")
      .download(sourceImage.storage_path);

    if (downloadError || !imageData) {
      return {
        success: false,
        error: `Failed to retrieve image: ${downloadError?.message}`,
      };
    }

    // 2. Upload to prototype-assets bucket
    const assetStoragePath = `${prototypeId}/${targetPath}`;
    const { error: uploadError } = await supabaseClientService
      .getClient()
      .storage
      .from("prototype-assets")
      .upload(assetStoragePath, imageData, {
        contentType: sourceImage.media_type,
        upsert: true,
      });

    if (uploadError) {
      return {
        success: false,
        error: `Failed to save image: ${uploadError.message}`,
      };
    }

    // 3. Insert/update prototype_assets table
    const { error: dbError } = await supabaseClientService
      .getClient()
      .from("prototype_assets")
      .upsert({
        prototype_id: prototypeId,
        asset_path: targetPath,
        storage_path: assetStoragePath,
        mime_type: sourceImage.media_type,
        file_size: imageData.size,
      }, {
        onConflict: "prototype_id,asset_path",
      });

    if (dbError) {
      return {
        success: false,
        error: `Failed to register asset: ${dbError.message}`,
      };
    }

    // 4. Trigger file sync (will be picked up by FileSyncService)
    // This happens automatically when the sandbox polls for changes

    return {
      success: true,
      filePath: targetPath,
    };
  } catch (error) {
    return {
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function getDefaultImagePath(starterType: string): string {
  switch (starterType) {
    case "nextjs":
    case "vite":
      return "public/images";
    case "expo":
    case "react-native":
      return "assets/images";
    default:
      return "public/images";
  }
}
```

#### Register Tool in ChatService

Add to `server/build-workers/services/chat/chat-engines/chat-query-handler.ts`:

```typescript
import {
  saveImageToProjectToolDefinition,
  handleSaveImageToProject
} from "../tools/save-image-to-project";

// In the tools array:
tools: [
  // ... existing tools
  saveImageToProjectToolDefinition,
],

// In the tool handler switch:
case "save_image_to_project":
  const result = await handleSaveImageToProject(toolInput, {
    supabaseClientService: this.supabaseClientService,
    prototypeId: this.prototypeId,
    imageMetadata: currentMessageImageMetadata,
    starterType: this.starterType,
  });

  if (result.success) {
    return {
      type: "tool_result",
      content: `Successfully saved image to ${result.filePath}. The file is now available in the project and can be referenced in code.`,
    };
  } else {
    return {
      type: "tool_result",
      content: `Failed to save image: ${result.error}`,
      is_error: true,
    };
  }
```

---

## Data Flow Diagrams

### Flow 1: Chat Panel → Project Upload

```
User clicks "Add to project"
         │
         ▼
┌─────────────────────┐
│   File Picker       │
│   (multi-select)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ handleFileUpload()  │  ← Existing function in InternalPrototypePage
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ syncFilesAndAssets()│  ← Existing function in useFileSystem
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌─────────┐ ┌─────────────┐
│Supabase │ │ prototype   │
│Storage  │ │ _assets     │
│(bucket) │ │ (table)     │
└────┬────┘ └──────┬──────┘
     │             │
     └──────┬──────┘
            │
            ▼
┌─────────────────────┐
│  FileSyncService    │  ← Syncs to sandbox disk
└──────────┬──────────┘
            │
            ▼
┌─────────────────────┐
│ /tmp/materialize-   │
│ dev-server/public/  │
│ images/myfile.png   │
└─────────────────────┘
```

### Flow 2: AI Tool → Project Upload

```
User: "Add this image to my project as logo.png"
[attaches image]
         │
         ▼
┌─────────────────────┐
│ Image uploaded to   │
│ chat-images bucket  │  ← Normal chat flow
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Claude processes    │
│ message + image     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Claude calls        │
│ save_image_to_      │
│ project tool        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Tool handler:       │
│ 1. Download from    │
│    chat-images      │
│ 2. Upload to        │
│    prototype-assets │
│ 3. Insert DB record │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  FileSyncService    │
│  syncs to sandbox   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Claude responds:    │
│ "Saved to /public/  │
│  images/logo.png"   │
└─────────────────────┘
```

---

## Implementation Checklist

### Phase 1: Frontend Dropdown
- [ ] Add `onUploadToProject` prop to ClaudeCodePanel
- [ ] Pass `handleFileUpload` from InternalPrototypePage
- [ ] Replace paperclip button with dropdown in ClaudeCodePanelUI
- [ ] Add hidden file input for project uploads
- [ ] Add handler for project file selection
- [ ] Add toast notification for success/failure
- [ ] Test multi-file upload
- [ ] Test with different project types (Next.js, Expo)

### Phase 2: AI Tool
- [ ] Create `save-image-to-project.ts` tool file
- [ ] Implement tool handler
- [ ] Register tool in chat-query-handler
- [ ] Pass image metadata context to tool
- [ ] Test with various user prompts
- [ ] Test error handling (invalid index, upload failures)

### Phase 3: Polish
- [ ] Add loading state during upload
- [ ] Handle filename conflicts (append -1, -2, etc.)
- [ ] Validate file types and sizes
- [ ] Add analytics/logging events
- [ ] Update any relevant documentation

---

## Edge Cases

| Case | Handling |
|------|----------|
| Duplicate filename | Append timestamp or increment (-1, -2) |
| Invalid file type | Show error toast, reject upload |
| File too large (>10MB) | Show error toast with size limit |
| Upload failure | Show error toast, allow retry |
| AI tool - no images in message | Return helpful error message |
| AI tool - invalid image index | Return error with valid range |

---

## Future Enhancements (Out of Scope)

- [ ] Image compression/optimization before upload
- [ ] Image preview in FileTree
- [ ] Drag image from chat to FileTree
- [ ] Path customization dialog
- [ ] Remember preferred upload mode per user

---

## Questions Resolved

| Question | Decision |
|----------|----------|
| Should AI see project images? | No - separate from chat context |
| Allow bulk upload? | Yes - multi-select enabled |
| Image management UI? | No - use existing FileTree |
| Path selection? | Auto-detect based on framework type |

---

## References

- `web-application/src/components/prototype-editor/FileTree.tsx` - Existing drag-drop
- `web-application/src/app/dashboard/projects/[prototype_id]/InternalPrototypePage.tsx:1157` - `handleFileUpload`
- `web-application/src/hooks/useFileSystem.ts` - `syncFilesAndAssets`
- `web-application/src/lib/utils/chatImageUpload.ts` - Chat image utilities
- `server/build-workers/services/FileSyncService.ts` - Sandbox file sync
