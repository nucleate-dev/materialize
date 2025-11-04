# Claude Code File Synchronization Plan

## Overview

This document outlines the strategy for synchronizing file changes between Claude Code (CodeService) and the frontend editor (FileTree/CodeEditor) in real-time.

## Problem Statement

- **CodeService**: Claude Agent SDK manipulates files in `/tmp/materialize-dev-server/` on the build worker
- **Frontend Editor**: Reads/writes files from Supabase database
- **Challenge**: Changes made by Claude Code need to be reflected in the frontend editor without:
  - Heavy polling
  - Expensive Supabase Realtime connections
  - Write amplification (100s of events during rapid LLM edits)

## Architecture Decision

### Rejected Approaches

❌ **Supabase Realtime on Both Ends**
- Too heavy: Claude can make 10-20 file changes per second
- Each triggers: DB write → Realtime event → Frontend update
- Expensive and causes UI thrashing

❌ **File System Watcher (chokidar)**
- Fires on every intermediate state
- No semantic awareness of when Claude is "done"
- Catches temp/build files
- Needs complex debouncing

❌ **Simple Polling**
- Wasteful when no changes
- Latency issues
- Doesn't know what changed

### ✅ Chosen Approach: Hybrid Frontend + Hook-Based Backend

## Implementation Plan

---

## Part 1: Backend - Hook-Based File Tracking (CodeService)

### 1.1 Track File Changes During Query

```typescript
// In CodeService class
class CodeService {
  private changedFilesDuringQuery = new Map<string, Set<string>>(); // connectionId -> Set<filePaths>
  private deletedFilesDuringQuery = new Map<string, Set<string>>(); // connectionId -> Set<filePaths>

  private isFileModifyingTool(toolName: string): boolean {
    const normalized = toolName.toLowerCase();
    return ['write', 'edit', 'search_replace', 'delete'].some(
      t => normalized.includes(t)
    );
  }

  private trackChangedFile(connectionId: string, hookInput: HookInput): void {
    const toolName = hookInput.tool_name.toLowerCase();
    const toolInput = hookInput.tool_input as any;

    // Initialize sets if needed
    if (!this.changedFilesDuringQuery.has(connectionId)) {
      this.changedFilesDuringQuery.set(connectionId, new Set());
    }
    if (!this.deletedFilesDuringQuery.has(connectionId)) {
      this.deletedFilesDuringQuery.set(connectionId, new Set());
    }

    const changed = this.changedFilesDuringQuery.get(connectionId)!;
    const deleted = this.deletedFilesDuringQuery.get(connectionId)!;

    // Extract file path from tool input (normalize different tool formats)
    const filePath = toolInput?.file_path || 
                     toolInput?.target_file || 
                     toolInput?.path;
    
    if (!filePath) return;

    if (toolName.includes('delete')) {
      // Track deletions
      deleted.add(filePath);
      changed.delete(filePath); // Remove from changed if deleted
    } else if (toolName.includes('write') || 
               toolName.includes('edit') || 
               toolName.includes('replace')) {
      // Track modifications/creations
      changed.add(filePath);
    }
  }
}
```

### 1.2 Update PostToolUse Hook

```typescript
// In handleQuery() where hooks are defined
hooks: {
  PostToolUse: [
    {
      hooks: [
        async (
          input: HookInput,
          toolUseID: string | undefined,
          _options: { signal: AbortSignal },
        ): Promise<HookJSONOutput> => {
          try {
            // Existing tool complete notification
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  type: "tool_complete",
                  data: {
                    tool_name: input.tool_name,
                    tool_input: input.tool_input,
                    tool_response: input.tool_response,
                    tool_call_id: toolUseID,
                  },
                }),
              );
            }

            // NEW: Track file changes
            if (this.isFileModifyingTool(input.tool_name)) {
              this.trackChangedFile(connectionId, input);
            }
          } catch (error) {
            this.logger.error(
              error instanceof Error ? error : new Error(String(error)),
              "PostToolUse hook error",
            );
          }
          return { continue: true };
        },
      ],
    },
  ],
}
```

### 1.3 Sync Files to Supabase After Query

```typescript
private async handleQuery(
  socket: WebSocket,
  data: QueryData,
  prototypeId: string,
): Promise<void> {
  const connectionId = this.getConnectionId(socket); // Track by connection

  try {
    // Reset tracking for this query
    this.changedFilesDuringQuery.set(connectionId, new Set());
    this.deletedFilesDuringQuery.set(connectionId, new Set());

    // ... existing query execution logic ...

    for await (const msg of response) {
      // ... existing message handling ...
    }

    // Send completion message
    this.sendMessage(socket, {
      type: "query_complete",
      data: { sessionId: this.sessionState.sessionId },
    });

  } catch (error) {
    // ... error handling ...
  } finally {
    // ALWAYS sync files, even on error/interrupt
    await this.syncFilesToSupabase(connectionId, prototypeId, socket);
  }
}

private async syncFilesToSupabase(
  connectionId: string,
  prototypeId: string,
  socket: WebSocket,
): Promise<void> {
  const changed = this.changedFilesDuringQuery.get(connectionId) || new Set();
  const deleted = this.deletedFilesDuringQuery.get(connectionId) || new Set();

  if (changed.size === 0 && deleted.size === 0) {
    return; // Nothing to sync
  }

  try {
    // Read changed files from disk
    const fileUpdates = [];
    for (const filePath of changed) {
      const fullPath = path.join(this.workDir, filePath);
      try {
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        fileUpdates.push({
          prototype_id: prototypeId,
          name: filePath,
          contents: content,
          updated_at: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.warn(`Failed to read file ${filePath}`, { error });
      }
    }

    // Batch upsert to Supabase
    if (fileUpdates.length > 0) {
      const { error } = await this.supabaseClient
        .from('prototype_files')
        .upsert(fileUpdates, { 
          onConflict: 'prototype_id,name',
          ignoreDuplicates: false 
        });

      if (error) {
        throw error;
      }
    }

    // Handle deletions
    if (deleted.size > 0) {
      const { error } = await this.supabaseClient
        .from('prototype_files')
        .delete()
        .eq('prototype_id', prototypeId)
        .in('name', Array.from(deleted));

      if (error) {
        throw error;
      }
    }

    this.logger.info('Synced files to Supabase', {
      prototypeId,
      updated: fileUpdates.length,
      deleted: deleted.size,
    });

    // Notify frontend via WebSocket
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "files_changed",
          data: {
            changedFiles: Array.from(changed),
            deletedFiles: Array.from(deleted),
          },
        }),
      );
    }

  } catch (error) {
    this.logger.error(
      error instanceof Error ? error : new Error(String(error)),
      'Failed to sync files to Supabase',
      { prototypeId }
    );
    // Don't throw - we don't want to break the query flow
  } finally {
    // Cleanup tracking
    this.changedFilesDuringQuery.delete(connectionId);
    this.deletedFilesDuringQuery.delete(connectionId);
  }
}
```

### 1.4 Add Supabase Client to CodeService

```typescript
// In CodeService constructor
constructor(
  fastifyApp: FastifyInstance,
  workDir: string,
  logger: SystemLogger,
  supabaseClient: SupabaseClient, // NEW: Add Supabase client
) {
  this.workDir = workDir;
  this.fastifyApp = fastifyApp;
  this.logger = logger.child({ service: "CodeService" });
  this.supabaseClient = supabaseClient; // NEW
}
```

---

## Part 2: Frontend - Hybrid WebSocket + Polling (ClaudeCodePanel)

### 2.1 Handle files_changed WebSocket Message

```typescript
// In ClaudeCodePanel handleServerMessage()
case "files_changed":
  // Claude Code has finished editing files
  if (message.data?.changedFiles || message.data?.deletedFiles) {
    const { changedFiles = [], deletedFiles = [] } = message.data;
    
    this.logger.debug("log", "Files changed by Claude Code", {
      changed: changedFiles.length,
      deleted: deletedFiles.length,
    });

    // Refetch affected files from Supabase
    await this.refetchFilesFromSupabase(changedFiles, deletedFiles);
    
    // Show toast notification (optional)
    this.showFileUpdateNotification(changedFiles.length, deletedFiles.length);
  }
  break;
```

### 2.2 Add File Refetch Method

```typescript
// In ClaudeCodePanel
private async refetchFilesFromSupabase(
  changedFiles: string[],
  deletedFiles: string[],
): Promise<void> {
  if (!prototypeId) return;

  try {
    // Fetch updated file contents
    if (changedFiles.length > 0) {
      const { data: updatedFiles, error } = await supabase
        .from('prototype_files')
        .select('*')
        .eq('prototype_id', prototypeId)
        .in('name', changedFiles);

      if (error) throw error;

      // Update fileSystem state (pass to parent via callback)
      if (onFilesUpdate && updatedFiles) {
        const filesMap = Object.fromEntries(
          updatedFiles.map(f => [f.name, f])
        );
        onFilesUpdate({
          updatedFiles: filesMap,
          deletedFiles: deletedFiles,
          applyUpdatesToServer: false, // Already synced
        });
      }
    } else if (deletedFiles.length > 0) {
      // Just deletions
      onFilesUpdate?.({
        updatedFiles: {},
        deletedFiles: deletedFiles,
        applyUpdatesToServer: false,
      });
    }

  } catch (error) {
    this.logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Failed to refetch files after Claude Code changes"
    );
  }
}
```

### 2.3 Add Polling Fallback

```typescript
// In ClaudeCodePanel
useEffect(() => {
  let pollTimer: NodeJS.Timeout | null = null;

  // Only poll when:
  // 1. Processing a query
  // 2. WebSocket is disconnected or unstable
  const shouldPoll = isProcessing && (!isConnected || hasWebSocketIssues);

  if (shouldPoll) {
    pollTimer = setInterval(async () => {
      // Check if files have been updated recently
      const { data } = await supabase
        .from('prototype_files')
        .select('name, updated_at')
        .eq('prototype_id', prototypeId)
        .gt('updated_at', lastPollTime.toISOString());

      if (data && data.length > 0) {
        const changedFiles = data.map(f => f.name);
        await refetchFilesFromSupabase(changedFiles, []);
      }
      
      setLastPollTime(new Date());
    }, 3000); // Poll every 3 seconds
  }

  return () => {
    if (pollTimer) clearInterval(pollTimer);
  };
}, [isProcessing, isConnected, prototypeId]);
```

### 2.4 Update InternalPrototypePage Props

```typescript
// Pass file update handler to ClaudeCodePanel
<ClaudeCodePanel
  prototypeId={prototypeId}
  baseTunnelUrl={baseTunnelUrl}
  prototype={prototype}
  canEditPrototype={canEditPrototype}
  onPrototypeUpdate={setPrototype}
  onFilesUpdate={fileSystem.applyAndPersistFileUpdates} // NEW: Add this
/>
```

### 2.5 Add onFilesUpdate to ClaudeCodePanel Props

```typescript
// In ClaudeCodePanel.tsx
interface ClaudeCodePanelProps {
  prototypeId: string;
  baseTunnelUrl: string | null;
  prototype?: Prototype | null;
  canEditPrototype?: boolean;
  onPrototypeUpdate?: (updatedPrototype: Prototype) => void;
  onFilesUpdate?: (params: {  // NEW
    updatedFiles: Record<string, PrototypeFile>;
    deletedFiles?: string[];
    applyUpdatesToServer: boolean;
  }) => void;
}
```

---

## Part 3: UI/UX Considerations

### 3.1 Show File Update Indicator

```typescript
// In ClaudeCodePanel
const [filesBeingUpdated, setFilesBeingUpdated] = useState<string[]>([]);

// When files_changed received
setFilesBeingUpdated(changedFiles);

// Show badge in file tree
setTimeout(() => {
  setFilesBeingUpdated([]);
}, 2000); // Clear after 2s
```

### 3.2 Lock CodeEditor During Active Claude Code Session

```typescript
// In CodeEditor
const isClaudeCodeActive = isProcessing && showClaudeCode;

// Disable save button when Claude is working
const canSave = !isClaudeCodeActive && saveButtonState.enabled;

// Show warning banner
{isClaudeCodeActive && (
  <Alert>
    <AlertDescription>
      Claude Code is editing files. Manual saves are disabled.
    </AlertDescription>
  </Alert>
)}
```

### 3.3 Toast Notification (Optional)

```typescript
// After refetching files
if (changedFiles.length > 0) {
  toast({
    title: "Files updated by Claude Code",
    description: `${changedFiles.length} file(s) modified`,
    duration: 3000,
  });
}
```

---

## Benefits of This Approach

✅ **Efficient**: One sync per query, not per tool call
✅ **Accurate**: SDK hooks know exactly which files changed
✅ **Real-time**: WebSocket provides instant updates
✅ **Resilient**: Polling fallback if WebSocket fails
✅ **Cost-effective**: No Supabase Realtime connections
✅ **Simple**: Leverages existing infrastructure
✅ **Robust**: Syncs in finally block (even on errors)
✅ **Batched**: Natural batching reduces write amplification
✅ **Single-user optimized**: Appropriate for current use case

---

## Testing Checklist

- [ ] Files created by Claude Code appear in FileTree
- [ ] Files edited by Claude Code update in CodeEditor
- [ ] Files deleted by Claude Code disappear from FileTree
- [ ] WebSocket disconnect triggers polling fallback
- [ ] Rapid file changes (10+ files) batch correctly
- [ ] Query interruption still syncs files
- [ ] CodeEditor locked during Claude Code execution
- [ ] Toast notifications work (if implemented)
- [ ] No race conditions between manual saves and Claude edits
- [ ] Supabase sync errors don't break Claude Code queries

---

## Future Enhancements

1. **Optimistic UI Updates**: Show files immediately, sync in background
2. **Conflict Resolution**: Merge changes if user edits during Claude execution
3. **Change Preview**: Show diff before applying Claude's changes
4. **Undo Stack**: Revert Claude's changes if needed
5. **Multi-user Support**: If adding collaboration, then consider Supabase Realtime

---

## Implementation Order

1. ✅ Backend: Add hook-based tracking to CodeService
2. ✅ Backend: Implement syncFilesToSupabase()
3. ✅ Backend: Add Supabase client to CodeService constructor
4. ✅ Backend: Send files_changed WebSocket message
5. ✅ Frontend: Handle files_changed in ClaudeCodePanel
6. ✅ Frontend: Implement refetchFilesFromSupabase()
7. ✅ Frontend: Add polling fallback
8. ✅ Frontend: Lock CodeEditor during Claude Code session
9. ✅ Testing: Verify all scenarios
10. ✅ Polish: Add UI indicators and notifications

