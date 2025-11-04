# Claude Code Message Persistence - Implementation Plan

## Overview
Add message persistence for ClaudeCodePanel using the existing `prototype_chat_sessions` and `prototype_chat_messages` tables. This allows users to see their Claude Code conversation history after page refreshes.

## Key Principles
1. **Lazy session creation**: Session only created when user sends first message (not on connect)
2. **Immediate persistence**: Messages saved to DB as they flow through CodeService
3. **Reset = Delete + Fresh start**: Reset button deletes old session/messages, next query creates new session
4. **Ordering by created_at**: No sequence field management needed
5. **Message completion**: Only persist assistant text messages when complete (not streaming deltas)

## Database Schema Changes

### Migration SQL
```sql
-- Add Claude session tracking to existing table
ALTER TABLE prototype_chat_sessions
  ADD COLUMN claude_session_id TEXT,
  ADD COLUMN session_type TEXT DEFAULT 'chat'
    CHECK (session_type IN ('chat', 'claude_code'));

-- Index for faster lookups
CREATE INDEX idx_chat_sessions_claude
  ON prototype_chat_sessions(prototype_id, user_id, session_type, created_at DESC)
  WHERE session_type = 'claude_code';

-- Note: Keep existing prototype_chat_messages table as-is
-- It already has all fields we need
```

### Schema Field Mapping

**prototype_chat_sessions:**
- `id` - UUID primary key
- `user_id` - Foreign key to users table
- `prototype_id` - Foreign key to prototypes table
- `session_type` - NEW: 'chat' or 'claude_code' to differentiate
- `claude_session_id` - NEW: Session ID from Claude Agent SDK
- `chat_context` - JSON, not used for claude_code type
- `created_at` - Timestamp

**prototype_chat_messages:**
- `id` - UUID primary key
- `chat_session_id` - Foreign key to prototype_chat_sessions
- `role` - 'user' | 'assistant'
- `content` - String (text content)
- `message_type` - String: 'text', 'tool', 'thinking', 'error'
- `event_type` - String: 'tool_start', 'tool_complete', null
- `event_data` - JSON: Tool metadata (tool_name, tool_input, tool_response, tool_call_id)
- `phase` - Not used for claude_code
- `sequence` - Not used (rely on created_at)
- `image_url` - Not used for now (future feature)
- `created_at` - Timestamp for ordering

### Message Type Mapping

| UI Message Type | DB role | DB message_type | DB event_type | DB event_data |
|-----------------|---------|-----------------|---------------|---------------|
| User text | user | text | null | null |
| Assistant text | assistant | text | null | null |
| Tool start | assistant | tool | tool_start | {tool_name, tool_input, tool_call_id} |
| Tool complete | assistant | tool | tool_complete | {tool_name, tool_input, tool_response, tool_call_id} |
| Thinking | assistant | thinking | null | {tool_name, tool_input, tool_call_id} |
| Error | assistant | error | null | {error message details} |
| System (NOT SAVED) | - | - | - | - |

---

## Implementation: CodeService.ts

### File Location
`server/build-workers/services/CodeService.ts`

### New Instance Variables
```typescript
export class CodeService {
  // ... existing variables ...

  private chatSessionId: string | null = null; // DB session ID
  private pendingAssistantMessage: string = ''; // Accumulate streaming text

  // ... rest of class ...
}
```

### New Imports
```typescript
import { getSupabaseClient } from '../worker.js';
```

### New Private Methods

#### 1. Get or Create Chat Session
```typescript
/**
 * Checks if a Claude Code chat session exists for this user/prototype.
 * Returns existing session info or null if no session exists yet.
 * Does NOT create a new session - that happens on first SDK init.
 */
private async getOrCreateChatSession(
  userId: string,
  prototypeId: string
): Promise<{ chatSessionId: string | null; claudeSessionId: string | null }> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    this.logger.error('Supabase client not available');
    return { chatSessionId: null, claudeSessionId: null };
  }

  try {
    // Check for existing active session
    const { data: existingSession, error } = await supabase
      .from('prototype_chat_sessions')
      .select('id, claude_session_id')
      .eq('user_id', userId)
      .eq('prototype_id', prototypeId)
      .eq('session_type', 'claude_code')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      this.logger.error(error, 'Error checking for existing session');
      return { chatSessionId: null, claudeSessionId: null };
    }

    if (existingSession) {
      this.logger.info('Found existing Claude Code session', {
        chatSessionId: existingSession.id,
        claudeSessionId: existingSession.claude_session_id
      });

      return {
        chatSessionId: existingSession.id,
        claudeSessionId: existingSession.claude_session_id
      };
    }

    // No session exists yet
    this.logger.info('No existing Claude Code session found');
    return { chatSessionId: null, claudeSessionId: null };
  } catch (error) {
    this.logger.error(
      error instanceof Error ? error : new Error(String(error)),
      'Error in getOrCreateChatSession'
    );
    return { chatSessionId: null, claudeSessionId: null };
  }
}
```

#### 2. Create New Chat Session
```typescript
/**
 * Creates a new chat session record in the database.
 * Called when Claude Agent SDK returns a session_id for the first time.
 */
private async createChatSession(
  userId: string,
  prototypeId: string,
  claudeSessionId: string
): Promise<string | null> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    this.logger.error('Supabase client not available');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('prototype_chat_sessions')
      .insert({
        user_id: userId,
        prototype_id: prototypeId,
        session_type: 'claude_code',
        claude_session_id: claudeSessionId,
        chat_context: null
      })
      .select('id')
      .single();

    if (error || !data) {
      this.logger.error(error, 'Failed to create chat session');
      return null;
    }

    this.logger.info('Created new chat session', {
      chatSessionId: data.id,
      claudeSessionId
    });

    return data.id;
  } catch (error) {
    this.logger.error(
      error instanceof Error ? error : new Error(String(error)),
      'Error in createChatSession'
    );
    return null;
  }
}
```

#### 3. Update Session with Claude ID
```typescript
/**
 * Updates an existing chat session with a new Claude SDK session_id.
 * Used when resuming creates a new Claude session but we want to keep same chat session.
 */
private async updateChatSessionClaudeId(
  chatSessionId: string,
  claudeSessionId: string
): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    this.logger.error('Supabase client not available');
    return;
  }

  try {
    const { error } = await supabase
      .from('prototype_chat_sessions')
      .update({ claude_session_id: claudeSessionId })
      .eq('id', chatSessionId);

    if (error) {
      this.logger.error(error, 'Failed to update chat session with Claude session ID');
    } else {
      this.logger.info('Updated chat session with new Claude session ID', {
        chatSessionId,
        claudeSessionId
      });
    }
  } catch (error) {
    this.logger.error(
      error instanceof Error ? error : new Error(String(error)),
      'Error in updateChatSessionClaudeId'
    );
  }
}
```

#### 4. Persist Message
```typescript
/**
 * Saves a message to the database.
 * Called immediately for user messages, tool events, errors.
 * Called on completion for assistant text messages.
 */
private async persistMessage(
  chatSessionId: string,
  role: 'user' | 'assistant',
  content: string,
  messageType: string,
  eventType?: string | null,
  eventData?: any
): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    this.logger.error('Supabase client not available');
    return;
  }

  try {
    const { error } = await supabase
      .from('prototype_chat_messages')
      .insert({
        chat_session_id: chatSessionId,
        role,
        content,
        message_type: messageType,
        event_type: eventType || null,
        event_data: eventData || null,
        phase: null,
        sequence: null,
        image_url: null
      });

    if (error) {
      this.logger.error(error, 'Failed to persist message', {
        chatSessionId,
        messageType,
        eventType
      });
    } else {
      this.logger.debug('Persisted message', {
        chatSessionId,
        role,
        messageType,
        eventType,
        contentLength: content.length
      });
    }
  } catch (error) {
    this.logger.error(
      error instanceof Error ? error : new Error(String(error)),
      'Error in persistMessage'
    );
  }
}
```

#### 5. Load Message History
```typescript
/**
 * Loads all messages for a chat session, ordered by creation time.
 */
private async loadMessageHistory(chatSessionId: string): Promise<any[]> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    this.logger.error('Supabase client not available');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('prototype_chat_messages')
      .select('*')
      .eq('chat_session_id', chatSessionId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(error, 'Failed to load message history');
      return [];
    }

    this.logger.info('Loaded message history', {
      chatSessionId,
      messageCount: data?.length || 0
    });

    return data || [];
  } catch (error) {
    this.logger.error(
      error instanceof Error ? error : new Error(String(error)),
      'Error in loadMessageHistory'
    );
    return [];
  }
}
```

#### 6. Delete Session
```typescript
/**
 * Deletes a chat session and all its messages.
 * Used when user clicks "Reset Session".
 */
private async deleteSession(chatSessionId: string): Promise<void> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    this.logger.error('Supabase client not available');
    return;
  }

  try {
    // Delete messages first (foreign key constraint)
    const { error: messagesError } = await supabase
      .from('prototype_chat_messages')
      .delete()
      .eq('chat_session_id', chatSessionId);

    if (messagesError) {
      this.logger.error(messagesError, 'Failed to delete messages');
    }

    // Then delete session
    const { error: sessionError } = await supabase
      .from('prototype_chat_sessions')
      .delete()
      .eq('id', chatSessionId);

    if (sessionError) {
      this.logger.error(sessionError, 'Failed to delete session');
    } else {
      this.logger.info('Deleted chat session and messages', { chatSessionId });
    }
  } catch (error) {
    this.logger.error(
      error instanceof Error ? error : new Error(String(error)),
      'Error in deleteSession'
    );
  }
}
```

### Modified handleQuery Method

**Location in file:** Replace the existing `handleQuery` method (starts around line 194)

**Key changes:**
1. Check for existing session at start
2. Load and send message history if session exists
3. Resume Claude SDK session if we have a claude_session_id
4. Persist user message immediately (if we have chatSessionId)
5. Handle session creation when SDK sends init message
6. Persist assistant messages when complete

```typescript
private async handleQuery(
  socket: WebSocket,
  data: QueryData,
  prototypeId: string,
): Promise<void> {
  const { prompt, content, options = {} } = data;

  // Support both old format (prompt) and new format (content)
  if (!prompt && !content) {
    this.sendMessage(socket, {
      type: "error",
      error: { message: "prompt or content is required" },
    });
    return;
  }

  // Validate content if provided
  if (content && (!Array.isArray(content) || content.length === 0)) {
    this.sendMessage(socket, {
      type: "error",
      error: { message: "content must be a non-empty array" },
    });
    return;
  }

  // Get user context
  const context = getWorkerContext();
  const userId = context.userId;

  if (!userId) {
    this.logger.error('User context not available');
    this.sendMessage(socket, {
      type: 'error',
      error: { message: 'User context not available' }
    });
    return;
  }

  this.logger.info("Starting Claude Code query", {
    prototypeId,
    userId,
    hasSession: !!this.sessionState.sessionId,
    hasChatSession: !!this.chatSessionId,
    hasPrompt: !!prompt,
    hasContent: !!content,
    contentLength: content?.length,
  });

  try {
    // Check for existing session or prepare to create new one
    if (!this.chatSessionId) {
      const sessionInfo = await this.getOrCreateChatSession(userId, prototypeId);

      if (sessionInfo.chatSessionId) {
        // We have an existing session
        this.chatSessionId = sessionInfo.chatSessionId;

        // Load and send message history
        const history = await this.loadMessageHistory(this.chatSessionId);
        this.sendMessage(socket, {
          type: 'message_history',
          data: {
            chat_session_id: this.chatSessionId,
            messages: history
          }
        });

        // If we have a Claude session ID, prepare to resume
        if (sessionInfo.claudeSessionId) {
          this.sessionState.sessionId = sessionInfo.claudeSessionId;
          this.logger.info('Will resume Claude SDK session', {
            claudeSessionId: sessionInfo.claudeSessionId
          });
        }
      }
      // If no session exists, we'll create one when SDK returns session_id
    }

    // Persist user message
    if (this.chatSessionId) {
      const userContent = content
        ? content.map(block => {
            if (block.type === 'text') return block.text || '';
            if (block.type === 'image') return '[image]';
            return '';
          }).join(' ')
        : prompt || '';

      await this.persistMessage(
        this.chatSessionId,
        'user',
        userContent,
        'text'
      );
    }

    // Create a new AbortController for this query
    const abortController = new AbortController();
    this.sessionState.abortController = abortController;

    // Prepare message content - support both text and image content blocks
    const messageContent: string | Array<{ type: string; text?: string; source?: unknown }> = content
      ? content.map((block) => {
          if (block.type === "text") {
            return {
              type: "text",
              text: block.text || "",
            };
          } else if (block.type === "image") {
            return {
              type: "image",
              source: block.source,
            };
          }
          return block;
        })
      : prompt!;

    // Create async generator for streaming input
    async function* generateMessages(): AsyncGenerator<{
      type: "user";
      message: { role: "user"; content: string | Array<{ type: string; text?: string; source?: unknown }> };
    }> {
      yield {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: messageContent,
        },
      };
    }

    // Query Claude with session resumption if available
    const queryOptions = {
      ...options,
      includePartialMessages: false,
      cwd: this.workDir,
      maxTurns: options?.maxTurns ?? 50,
      allowedTools: options?.allowedTools ?? [
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "Bash",
      ],
      model: options?.model ?? "claude-sonnet-4-5",
      systemPrompt: "claude_code",
      permissionMode: "bypassPermissions" as PermissionMode,
      abortController,
      // Add hooks to stream tool usage to WebSocket clients AND persist to DB
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (
                input: HookInput,
                toolUseID: string | undefined,
                _options: { signal: AbortSignal },
              ): Promise<HookJSONOutput> => {
                try {
                  if (input.hook_event_name === "PreToolUse") {
                    // Send tool start event to WebSocket client
                    if (socket.readyState === WebSocket.OPEN) {
                      socket.send(
                        JSON.stringify({
                          type: "tool_start",
                          data: {
                            tool_name: input.tool_name,
                            tool_input: input.tool_input,
                            tool_call_id: toolUseID,
                          },
                        }),
                      );
                    }

                    // Persist to database
                    if (this.chatSessionId) {
                      await this.persistMessage(
                        this.chatSessionId,
                        'assistant',
                        '', // No text content for tool start
                        'tool',
                        'tool_start',
                        {
                          tool_name: input.tool_name,
                          tool_input: input.tool_input,
                          tool_call_id: toolUseID
                        }
                      );
                    }
                  }
                } catch (error) {
                  // Log but don't fail the hook
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
        PostToolUse: [
          {
            hooks: [
              async (
                input: HookInput,
                toolUseID: string | undefined,
                _options: { signal: AbortSignal },
              ): Promise<HookJSONOutput> => {
                try {
                  if (input.hook_event_name === "PostToolUse") {
                    // Send tool complete event to WebSocket client
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

                    // Persist to database
                    if (this.chatSessionId) {
                      await this.persistMessage(
                        this.chatSessionId,
                        'assistant',
                        '', // No text content for tool complete
                        'tool',
                        'tool_complete',
                        {
                          tool_name: input.tool_name,
                          tool_input: input.tool_input,
                          tool_response: input.tool_response,
                          tool_call_id: toolUseID
                        }
                      );
                    }
                  }
                } catch (error) {
                  // Log but don't fail the hook
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
      },
      // Resume existing session if available
      ...(this.sessionState.sessionId && {
        resume: this.sessionState.sessionId,
      }),
    };

    this.logger.info("Querying Claude Agent SDK", {
      hasResume: !!queryOptions.resume,
      resumeSessionId: queryOptions.resume,
      model: queryOptions.model,
      cwd: this.workDir,
    });

    // Stream responses back to client
    const response = query({
      prompt: generateMessages() as AsyncIterable<SDKUserMessage>,
      options: queryOptions,
    });

    // Reset pending message accumulator
    this.pendingAssistantMessage = '';

    for await (const msg of response) {
      // Capture session ID from init message
      if (msg.type === "system" && msg.subtype === "init") {
        const isNewSession = this.sessionState.sessionId !== msg.session_id;
        const previousSessionId = this.sessionState.sessionId;

        this.sessionState.sessionId = msg.session_id;
        this.sessionState.isActive = true;
        if (isNewSession) {
          this.sessionState.createdAt = Date.now();
        }
        this.sessionState.lastActiveAt = Date.now();

        // Create or update chat session in DB
        if (!this.chatSessionId) {
          // First query, create new session
          this.chatSessionId = await this.createChatSession(
            userId,
            prototypeId,
            msg.session_id
          );

          if (this.chatSessionId) {
            // Send session info to client
            this.sendMessage(socket, {
              type: 'session_initialized',
              data: {
                chat_session_id: this.chatSessionId,
                claude_session_id: msg.session_id
              }
            });
          }
        } else if (isNewSession) {
          // Resumed but got a new Claude session ID
          await this.updateChatSessionClaudeId(
            this.chatSessionId,
            msg.session_id
          );
        }

        this.logger.info("Claude Code session initialized", {
          sessionId: msg.session_id,
          isNewSession,
          previousSessionId,
          chatSessionId: this.chatSessionId
        });
      }

      // Accumulate assistant text content (will persist when complete)
      if (msg.type === "stream_event" && msg.event?.type === "content_block_delta") {
        if (msg.event.delta?.type === "text_delta") {
          const textDelta = msg.event.delta.text || "";
          if (textDelta) {
            this.pendingAssistantMessage += textDelta;
          }
        }
      }

      // Persist assistant message when complete
      if (msg.type === "stream_event" && msg.event?.type === "message_stop") {
        if (this.chatSessionId && this.pendingAssistantMessage) {
          await this.persistMessage(
            this.chatSessionId,
            'assistant',
            this.pendingAssistantMessage,
            'text'
          );
          this.logger.debug('Persisted complete assistant message', {
            length: this.pendingAssistantMessage.length
          });
          this.pendingAssistantMessage = ''; // Reset for next message
        }
      }

      // Update last active time
      this.sessionState.lastActiveAt = Date.now();

      // Forward message to client
      this.sendMessage(socket, {
        type: "agent_message",
        data: msg,
      });
    }

    // Clear the abort controller
    this.sessionState.abortController = null;

    // Send completion message
    this.sendMessage(socket, {
      type: "query_complete",
      data: {
        sessionId: this.sessionState.sessionId,
      },
    });
  } catch (error) {
    // Clear the abort controller on error
    this.sessionState.abortController = null;

    this.logger.error(
      error instanceof Error ? error : new Error(String(error)),
      "Claude Code query failed",
      { prototypeId },
    );

    this.sendMessage(socket, {
      type: "error",
      error: {
        message: "Query failed",
        details: error instanceof Error ? error.message : String(error),
      },
    });

    // Persist error message
    if (this.chatSessionId) {
      await this.persistMessage(
        this.chatSessionId,
        'assistant',
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    }
  }
}
```

### Modified handleResetSession Method

**Location in file:** Replace the existing `handleResetSession` method (around line 483)

```typescript
private async handleResetSession(socket: WebSocket): Promise<void> {
  this.logger.info("Resetting Claude Code session", {
    oldSessionId: this.sessionState.sessionId,
    oldChatSessionId: this.chatSessionId,
  });

  // Abort any active query before resetting
  if (this.sessionState.abortController) {
    this.sessionState.abortController.abort();
  }

  // Delete old session and messages from database
  if (this.chatSessionId) {
    try {
      await this.deleteSession(this.chatSessionId);
      this.logger.info('Deleted chat session from database', {
        chatSessionId: this.chatSessionId
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'Failed to delete chat session'
      );
    }
  }

  // Reset all session state
  this.sessionState = {
    sessionId: null,
    isActive: false,
    createdAt: 0,
    lastActiveAt: 0,
    abortController: null,
  };
  this.chatSessionId = null;
  this.pendingAssistantMessage = '';

  this.sendMessage(socket, {
    type: "session_reset",
    data: {
      message: "Session has been reset - messages and history cleared",
    },
  });
}
```

---

## Implementation: ClaudeCodePanel.tsx

### File Location
`web-application/src/components/prototype-editor/ClaudeCodePanel.tsx`

### New State Variables

**Add after existing useState declarations (around line 94):**

```typescript
const [chatSessionId, setChatSessionId] = useState<string | null>(null);
const [isLoadingHistory, setIsLoadingHistory] = useState(false);
```

### Update ServerMessage Interface

**Location:** Around line 56, update the interface:

```typescript
interface ServerMessage {
  type: string;
  error?: string;
  userId?: string;
  prototype_id?: string;
  timestamp?: string;
  data?: {
    connectionId?: string;
    sessionId?: string;
    message?: string;
    tool_name?: string;
    tool_call_id?: string;
    tool_input?: unknown;
    tool_response?: unknown;
    // NEW: Session initialization
    chat_session_id?: string;
    claude_session_id?: string;
    // NEW: Message history
    messages?: any[];
  };
  subtype?: string;
}
```

### New Helper Function: Convert DB Messages to UI Messages

**Add before the main component (around line 79):**

```typescript
/**
 * Converts database message records to UI message format
 */
function convertDBMessagesToUIMessages(dbMessages: any[]): Message[] {
  return dbMessages.map(dbMsg => {
    const timestamp = new Date(dbMsg.created_at).getTime();

    // Tool messages
    if (dbMsg.message_type === 'tool') {
      const isComplete = dbMsg.event_type === 'tool_complete';
      const toolName = dbMsg.event_data?.tool_name || 'Tool';
      const toolInput = dbMsg.event_data?.tool_input;

      return {
        id: dbMsg.id,
        type: 'tool',
        content: getToolDisplayName(toolName, toolInput),
        timestamp,
        toolName,
        toolCallId: dbMsg.event_data?.tool_call_id,
        toolInput,
        isComplete,
        status: isComplete ? 'success' : 'running'
      } as Message;
    }

    // Thinking messages
    if (dbMsg.message_type === 'thinking') {
      return {
        id: dbMsg.id,
        type: 'thinking',
        content: dbMsg.content || 'Thinking...',
        timestamp,
        toolName: dbMsg.event_data?.tool_name,
        toolCallId: dbMsg.event_data?.tool_call_id,
        toolInput: dbMsg.event_data?.tool_input,
        isComplete: true,
        status: 'success'
      } as Message;
    }

    // Error messages
    if (dbMsg.message_type === 'error') {
      return {
        id: dbMsg.id,
        type: 'error',
        content: dbMsg.content,
        timestamp
      } as Message;
    }

    // User and assistant text messages
    return {
      id: dbMsg.id,
      type: dbMsg.role as 'user' | 'assistant',
      content: dbMsg.content,
      timestamp
    } as Message;
  });
}

// Note: getToolDisplayName is already defined in the component
```

### Modified handleServerMessage Function

**Location:** Around line 370, update the function:

```typescript
// Handle messages from server
const handleServerMessage = (message: ServerMessage) => {
  logger.debug("log", "Server message received", { message });

  switch (message.type) {
    case "session_initialized":
      // Server created/found a chat session
      if (message.data?.chat_session_id) {
        setChatSessionId(message.data.chat_session_id);
        logger.debug("log", "Chat session initialized", {
          chatSessionId: message.data.chat_session_id,
          claudeSessionId: message.data.claude_session_id
        });
      }
      if (message.data?.claude_session_id) {
        setSessionId(message.data.claude_session_id);
      }
      break;

    case "message_history":
      // Server sent historical messages - load them
      setIsLoadingHistory(true);
      try {
        const historyMessages = convertDBMessagesToUIMessages(message.data?.messages || []);
        setMessages(historyMessages);
        logger.debug("log", "Loaded message history", {
          messageCount: historyMessages.length
        });
      } catch (error) {
        logger.debug("error", "Failed to convert message history", { error });
      } finally {
        setIsLoadingHistory(false);
      }
      break;

    case "authenticated":
      // Server confirmed authentication
      if (message.userId) {
        setSessionId(message.userId);
        addMessage(
          "system",
          `Authenticated as user: ${message.userId.slice(0, 8)}...`,
        );
      }
      break;

    case "message_received":
      // Server acknowledged receipt of our message - don't show in chat
      break;

    case "ready":
      // Server acknowledged the connection establishment
      break;

    case "error":
      setIsProcessing(false);
      addMessage("error", `Error: ${JSON.stringify(message.error) || "Unknown error"}`);
      break;

    // Keep old handlers for backward compatibility during transition
    case "system":
      if (message.subtype === "connection") {
        // Connection established
      }
      break;

    case "agent_message":
      if (message.data) {
        handleAgentMessage(message.data);
      }
      break;

    case "query_complete":
      setIsProcessing(false);
      break;

    case "interrupted":
      setIsProcessing(false);
      addMessage("system", message.data?.message || "Query interrupted");
      break;

    case "session_reset":
      setMessages([]);
      setChatSessionId(null);
      sessionIdRef.current = null;
      setSessionId(null);
      addMessage("system", "Session has been reset");
      break;

    case "tool_start":
      // Handle tool start
      setHasReceivedResponse(true);
      if (message.data?.tool_name) {
        const toolName = message.data.tool_name;
        const toolCallId = message.data?.tool_call_id || `tool-${Date.now()}`;
        const toolInput = message.data?.tool_input;

        // Handle "thinking" tools (Task) separately
        if (isThinkingTool(toolName)) {
          // Clean up any incomplete read-only tools
          setMessages((prev) =>
            prev.filter(msg =>
              !(msg.type === "tool" && !msg.isComplete && msg.toolName && isReadOnlyTool(msg.toolName))
            )
          );
          addThinkingMessage(toolName, toolCallId, toolInput, "running");
        } else if (isReadOnlyTool(toolName)) {
          // For read-only tools, check if we can consolidate with the last message
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];

            // If the last message is an incomplete read-only tool of the same type, update it with history
            if (
              lastMessage &&
              lastMessage.type === "tool" &&
              !lastMessage.isComplete &&
              lastMessage.toolName &&
              isReadOnlyTool(lastMessage.toolName) &&
              lastMessage.toolName.toLowerCase() === toolName.toLowerCase()
            ) {
              // Consolidate - update the existing message with new tool input in history
              const updatedHistory = [...(lastMessage.toolHistory || []), toolInput];
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  toolInput, // Update to show most recent
                  toolHistory: updatedHistory,
                },
              ];
            }

            // Otherwise, remove any incomplete read-only tools and add this one
            const filtered = prev.filter(msg =>
              !(msg.type === "tool" && !msg.isComplete && msg.toolName && isReadOnlyTool(msg.toolName))
            );

            return [
              ...filtered,
              {
                id: `tool-${toolCallId}`,
                type: "tool" as const,
                content: getToolDisplayName(toolName, toolInput),
                timestamp: Date.now(),
                toolName,
                toolCallId,
                isComplete: false,
                status: "running" as const,
                toolInput,
                toolHistory: [toolInput], // Start history with first invocation
              },
            ];
          });
        } else {
          // For action tools, add them to the chat as persistent badges
          // First, clean up any incomplete read-only tools
          setMessages((prev) =>
            prev.filter(msg =>
              !(msg.type === "tool" && !msg.isComplete && msg.toolName && isReadOnlyTool(msg.toolName))
            )
          );
          addToolMessage(toolName, toolCallId, toolInput, "running");
        }
      }
      break;

    case "tool_complete":
      // Handle tool completion
      if (message.data?.tool_name) {
        const toolName = message.data.tool_name;
        const toolCallId = message.data?.tool_call_id || "";

        if (isThinkingTool(toolName)) {
          // For thinking tools, mark as complete
          updateThinkingMessage(toolCallId, "success");
        } else if (isReadOnlyTool(toolName)) {
          // For read-only tools, remove them from the chat when complete
          setMessages((prev) =>
            prev.filter(msg =>
              !(msg.type === "tool" && msg.toolCallId === toolCallId)
            )
          );
        } else {
          // For action tools, update their status to success
          updateToolMessage(toolCallId, "success");
        }
      }
      break;

    default:
      logger.debug("log", "Unknown message type", {
        messageType: message.type,
      });
  }
};
```

### Modified resetSession Function

**Location:** Around line 865, update the function:

```typescript
// Reset session
const resetSession = () => {
  if (!ws || !isConnected) {
    addMessage("error", "Not connected");
    return;
  }

  // Send reset command to server - it handles DB deletion
  ws.send(
    JSON.stringify({
      type: "reset_session",
    }),
  );

  // Clear local state immediately for better UX
  setMessages([]);
  setChatSessionId(null);
  sessionIdRef.current = null;
  setSessionId(null);
};
```

### Add Loading Indicator for History

**Location:** In the JSX, around line 1198 (in the "Thinking..." indicator section), add before it:

```typescript
{/* Show loading indicator when loading history */}
{isLoadingHistory && (
  <div className="flex justify-center py-4">
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="relative flex items-center justify-center">
        <div
          className="w-2 h-2 bg-primary rounded-full animate-pulse"
          style={{
            filter:
              "drop-shadow(0 0 4px hsl(var(--primary) / 0.8)) drop-shadow(0 0 8px hsl(var(--primary) / 0.5))",
          }}
        ></div>
      </div>
      <span className="text-sm font-medium text-muted-foreground">
        Loading conversation history...
      </span>
    </div>
  </div>
)}
```

---

## Testing Plan

### 1. First Time User (No Session)
**Steps:**
1. Open ClaudeCodePanel
2. Click "Connect"
3. Send a message
4. Verify:
   - Message appears in UI
   - Check DB: `prototype_chat_sessions` has new record with `session_type='claude_code'`
   - Check DB: `prototype_chat_messages` has user message
5. Wait for Claude response
6. Verify:
   - Assistant message appears in UI
   - Check DB: Messages persisted

### 2. Returning User (Has Session)
**Steps:**
1. Open ClaudeCodePanel (after test 1)
2. Click "Connect"
3. Verify:
   - Previous messages load from DB and display
   - Session ID shows in header
4. Send new message
5. Verify:
   - New messages persist to same session
   - Same `chat_session_id` used

### 3. Page Refresh
**Steps:**
1. During active conversation, refresh page
2. Click "Connect"
3. Verify:
   - All previous messages reappear
   - Can continue conversation
   - Messages still persist to same session

### 4. Reset Session
**Steps:**
1. Have an active conversation
2. Click "Reset Session"
3. Verify:
   - Messages clear from UI
   - Check DB: Old session and messages deleted
4. Send new message
5. Verify:
   - New session created in DB
   - New messages go to new session

### 5. Tool Usage
**Steps:**
1. Send message that triggers tools (e.g., "Read the package.json file")
2. Verify:
   - Tool messages appear in UI
   - Check DB: Tool messages persisted with correct `event_type` and `event_data`
3. Refresh page
4. Verify:
   - Tool messages reload correctly with proper formatting

### 6. Error Handling
**Steps:**
1. Trigger an error (disconnect server mid-query)
2. Verify:
   - Error message appears in UI
   - Check DB: Error message persisted
3. Refresh page
4. Verify:
   - Error message appears in history

### 7. Multi-User (Different Prototypes)
**Steps:**
1. User A: Create conversation in Prototype 1
2. User A: Open Prototype 2, create conversation
3. Verify:
   - Each prototype has separate session
   - Messages don't mix between prototypes

---

## Message Flow Diagrams

### First Query (No Session)
```
1. User sends query
2. CodeService: getOrCreateChatSession() → returns null
3. CodeService: Skip persisting user message (no chatSessionId yet)
4. Claude SDK: Start query, returns init message with session_id
5. CodeService: createChatSession() → creates DB record
6. CodeService: Persist user message (now we have chatSessionId)
7. CodeService: Send "session_initialized" to client
8. Client: Save chatSessionId and sessionId to state
9. Messages stream, get persisted immediately
10. Claude SDK: message_stop event
11. CodeService: Persist complete assistant message
```

### Subsequent Query (Session Exists)
```
1. User sends query
2. CodeService: Already has chatSessionId in memory
3. CodeService: Persist user message immediately
4. Claude SDK: Resume with existing session_id
5. Messages stream, get persisted immediately
6. Claude SDK: message_stop event
7. CodeService: Persist complete assistant message
```

### User Refreshes Page (CodeService Still Running)
```
1. User clicks Connect
2. WebSocket opens (CodeService lost reference to socket)
3. CodeService: Still has chatSessionId in memory from previous queries
4. User sends first query after reconnect
5. CodeService: Has chatSessionId, business as usual
6. Continue as "Subsequent Query" flow
```

### User Refreshes Page (CodeService Restarted)
```
1. User clicks Connect
2. WebSocket opens (CodeService has no memory of session)
3. User sends first query
4. CodeService: getOrCreateChatSession() → finds existing session
5. CodeService: Load message history, send to client
6. Client: Display all historical messages
7. CodeService: Resume Claude SDK session with claude_session_id
8. Continue as "Subsequent Query" flow
```

### Reset Session
```
1. User clicks Reset
2. Client sends "reset_session"
3. CodeService: deleteSession() → removes from DB
4. CodeService: Clears in-memory state (chatSessionId = null)
5. CodeService: Sends "session_reset" to client
6. Client: Clears UI state (messages, chatSessionId, sessionId)
7. Next query triggers "First Query" flow
```

---

## Configuration & Environment

### Required Environment Variables
No new environment variables needed. Uses existing:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### Database Access
Uses `getSupabaseClient()` from `worker.ts` - ensure this is set up by control plane before CodeService handles requests.

---

## Migration Checklist

- [ ] Run database migration SQL
- [ ] Update CodeService.ts with new methods
- [ ] Update CodeService.ts handleQuery method
- [ ] Update CodeService.ts handleResetSession method
- [ ] Update ClaudeCodePanel.tsx state variables
- [ ] Update ClaudeCodePanel.tsx ServerMessage interface
- [ ] Add convertDBMessagesToUIMessages helper
- [ ] Update ClaudeCodePanel.tsx handleServerMessage
- [ ] Update ClaudeCodePanel.tsx resetSession
- [ ] Add loading indicator to ClaudeCodePanel.tsx
- [ ] Test: First time user flow
- [ ] Test: Returning user flow
- [ ] Test: Page refresh flow
- [ ] Test: Reset session flow
- [ ] Test: Tool usage persistence
- [ ] Test: Error message persistence
- [ ] Test: Multi-prototype separation

---

## Notes & Considerations

1. **Session Expiration**: Claude Agent SDK sessions may expire. If resume fails, CodeService will start a fresh session and update the `claude_session_id` in DB.

2. **Message Order**: Relies on `created_at` timestamp. Potential race condition if two messages persist at exact same millisecond, but unlikely in practice.

3. **Large Messages**: No size limit enforcement. Monitor for very long assistant messages causing DB issues.

4. **Concurrency**: Single user per prototype at a time assumed. Multi-tab support deferred.

5. **Image Messages**: Schema supports `image_url` field but not implemented yet. Future enhancement.

6. **System Messages**: Connection/disconnection messages NOT persisted (intentional).

7. **Stream Events**: Content block deltas NOT persisted individually, only complete messages.

8. **Session Type**: Uses `session_type='claude_code'` to differentiate from PrototypeChatWindow sessions (which use `session_type='chat'`).

9. **Error Recovery**: If CodeService crashes, in-memory state lost but all messages already persisted, so minimal data loss.

10. **Performance**: Message history load happens once per session initialization. For very long conversations (1000+ messages), may want pagination.
