# Claude Code CLI Implementation - Atomic Task Breakdown

This document breaks down the Claude Code CLI Headless Mode implementation into atomic units of work.

**Simplified Architecture:**

- Build worker talks directly to Supabase for token storage
- No separate control plane API needed
- No application-level token encryption (Supabase handles encryption at rest)

---

## Phase 1: Database Schema

| Task ID | Task                                        | Files                                                | Dependencies | Complexity |
| ------- | ------------------------------------------- | ---------------------------------------------------- | ------------ | ---------- |
| DB-001  | Create `user_claude_tokens` table migration | `supabase/migrations/xxx_add_user_claude_tokens.sql` | None         | Low        |
| DB-002  | Add RLS policies for user token access      | Same migration file                                  | DB-001       | Low        |
| DB-003  | Add TypeScript types for table              | `server/build-workers/types/supabase.ts`             | DB-001       | Low        |

**Schema:**

```sql
CREATE TABLE user_claude_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  oauth_token TEXT NOT NULL,
  is_valid BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  validation_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Users can only access their own tokens
ALTER TABLE user_claude_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tokens" ON user_claude_tokens
  FOR ALL USING (auth.uid() = user_id);
```

---

## Phase 2: Token Service (Build Worker)

| Task ID | Task                                    | Files                                                        | Dependencies | Complexity |
| ------- | --------------------------------------- | ------------------------------------------------------------ | ------------ | ---------- |
| TOK-001 | Create `ClaudeTokenService` class       | `server/build-workers/services/auth/claude-token-service.ts` | DB-003       | Low        |
| TOK-002 | Implement `getUserToken()` with caching | Same file                                                    | TOK-001      | Medium     |
| TOK-003 | Implement `saveToken()`                 | Same file                                                    | TOK-001      | Low        |
| TOK-004 | Implement `markTokenInvalid()`          | Same file                                                    | TOK-001      | Low        |
| TOK-005 | Implement `deleteToken()`               | Same file                                                    | TOK-001      | Low        |
| TOK-006 | Implement `getTokenStatus()`            | Same file                                                    | TOK-001      | Low        |

---

## Phase 3: CLI Query Handler

### 3.1 Core Handler

| Task ID | Task                                                              | Files                                                                 | Dependencies | Complexity |
| ------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- | ------------ | ---------- |
| CLI-001 | Create `ClaudeCodeCliQueryHandler` class structure                | `server/build-workers/services/chat/claude-code-cli-query-handler.ts` | TOK-001      | Medium     |
| CLI-002 | Implement `buildAuthEnvironment()` (use `delete` not `undefined`) | Same file                                                             | CLI-001      | Medium     |
| CLI-003 | Implement `executeCliProcess()` with spawn                        | Same file                                                             | CLI-001      | High       |
| CLI-004 | Implement stdout JSON line parsing                                | Same file                                                             | CLI-003      | Medium     |
| CLI-005 | Implement stderr auth error detection                             | Same file                                                             | CLI-003      | Low        |
| CLI-006 | Implement `abort()` for process termination                       | Same file                                                             | CLI-003      | Low        |

### 3.2 Message Transformation

| Task ID | Task                                  | Files              | Dependencies | Complexity |
| ------- | ------------------------------------- | ------------------ | ------------ | ---------- |
| CLI-007 | Define `ClaudeCodeMessage` interface  | Same file or types | CLI-001      | Low        |
| CLI-008 | Implement `handleCliMessage()` router | Same file          | CLI-004      | Medium     |
| CLI-009 | Map `assistant` → `AGENT_MESSAGE`     | Same file          | CLI-008      | Low        |
| CLI-010 | Map `tool_use` → `TOOL_START`         | Same file          | CLI-008      | Low        |
| CLI-011 | Map `tool_result` → `TOOL_COMPLETE`   | Same file          | CLI-008      | Low        |
| CLI-012 | Map `result` → `QUERY_COMPLETE`       | Same file          | CLI-008      | Low        |
| CLI-013 | Map `error` → `ERROR`                 | Same file          | CLI-008      | Low        |

### 3.3 Hook Equivalents (Stream Parsing)

| Task ID | Task                                       | Files     | Dependencies     | Complexity |
| ------- | ------------------------------------------ | --------- | ---------------- | ---------- |
| CLI-014 | Track pending tool calls in session state  | Same file | CLI-010          | Low        |
| CLI-015 | Track modified files from Write/Edit tools | Same file | CLI-011          | Medium     |
| CLI-016 | Persist tool events to database            | Same file | CLI-010, CLI-011 | Medium     |

---

## Phase 4: Setup Token Parser

| Task ID   | Task                                     | Files                                                             | Dependencies | Complexity |
| --------- | ---------------------------------------- | ----------------------------------------------------------------- | ------------ | ---------- |
| PARSE-001 | Create parser file with regex patterns   | `server/build-workers/services/auth/claude-setup-token-parser.ts` | None         | Low        |
| PARSE-002 | Implement OAuth URL extraction regex     | Same file                                                         | PARSE-001    | Low        |
| PARSE-003 | Implement code prompt detection regex    | Same file                                                         | PARSE-001    | Low        |
| PARSE-004 | Implement token capture regex            | Same file                                                         | PARSE-001    | Medium     |
| PARSE-005 | Implement `SetupTokenStreamParser` class | Same file                                                         | PARSE-001    | Medium     |
| PARSE-006 | Implement `processChunk()` for streaming | Same file                                                         | PARSE-005    | Medium     |

---

## Phase 5: Terminal Service Integration

| Task ID  | Task                                                 | Files                                                        | Dependencies | Complexity |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------ | ------------ | ---------- |
| TERM-001 | Add `setupSessions` Map for per-user tracking        | `server/build-workers/services/terminals/TerminalService.ts` | PARSE-005    | Low        |
| TERM-002 | Implement `startClaudeSetupToken()`                  | Same file                                                    | TERM-001     | High       |
| TERM-003 | Implement `submitSetupTokenCode()` with sanitization | Same file                                                    | TERM-002     | Medium     |
| TERM-004 | Implement `cleanupSetupTokenSession()`               | Same file                                                    | TERM-001     | Low        |
| TERM-005 | Add 5-minute session timeout                         | Same file                                                    | TERM-002     | Low        |

---

## Phase 6: WebSocket Setup Route

| Task ID | Task                                            | Files                                                | Dependencies    | Complexity |
| ------- | ----------------------------------------------- | ---------------------------------------------------- | --------------- | ---------- |
| WS-001  | Create `claude-setup-routes.ts`                 | `server/build-workers/routes/claude-setup-routes.ts` | TERM-002        | Medium     |
| WS-002  | Add WebSocket authentication                    | Same file                                            | WS-001          | Medium     |
| WS-003  | Forward `oauth_url` event to client             | Same file                                            | WS-001          | Low        |
| WS-004  | Forward `code_prompt` event to client           | Same file                                            | WS-001          | Low        |
| WS-005  | Capture token and save via `ClaudeTokenService` | Same file                                            | WS-001, TOK-003 | Medium     |
| WS-006  | Handle `submit_code` from client                | Same file                                            | TERM-003        | Low        |
| WS-007  | Cleanup on disconnect                           | Same file                                            | TERM-004        | Low        |

### Event Types

| Task ID | Task                                    | Files                                     | Dependencies | Complexity |
| ------- | --------------------------------------- | ----------------------------------------- | ------------ | ---------- |
| EVT-001 | Add setup event types to `ChatTypes.ts` | `server/build-workers/types/ChatTypes.ts` | None         | Low        |

---

## Phase 7: Frontend - Manual Token Entry

| Task ID | Task                                   | Files                                                                   | Dependencies     | Complexity |
| ------- | -------------------------------------- | ----------------------------------------------------------------------- | ---------------- | ---------- |
| FE-001  | Create `ClaudeSubscriptionConnect.tsx` | `web-application/src/components/settings/ClaudeSubscriptionConnect.tsx` | TOK-003, TOK-006 | Medium     |
| FE-002  | Token input field with connect button  | Same file                                                               | FE-001           | Low        |
| FE-003  | Display connection status              | Same file                                                               | FE-001           | Low        |
| FE-004  | Disconnect button                      | Same file                                                               | TOK-005          | Low        |
| FE-005  | Add component to Settings page         | Settings page file                                                      | FE-001           | Low        |

---

## Phase 8: Frontend - Setup Wizard

| Task ID | Task                                   | Files                                                           | Dependencies | Complexity |
| ------- | -------------------------------------- | --------------------------------------------------------------- | ------------ | ---------- |
| WIZ-001 | Create `ClaudeSetupWizard.tsx`         | `web-application/src/components/settings/ClaudeSetupWizard.tsx` | WS-001       | Medium     |
| WIZ-002 | WebSocket connection to setup endpoint | Same file                                                       | WIZ-001      | Medium     |
| WIZ-003 | Idle state UI (start button)           | Same file                                                       | WIZ-001      | Low        |
| WIZ-004 | OAuth URL display with "Open" button   | Same file                                                       | WIZ-001      | Low        |
| WIZ-005 | Code input and submit                  | Same file                                                       | WIZ-001      | Low        |
| WIZ-006 | Success/error states                   | Same file                                                       | WIZ-001      | Low        |
| WIZ-007 | Handle all WebSocket events            | Same file                                                       | WIZ-002      | Medium     |

---

## Phase 9: Chat Interface Updates

| Task ID  | Task                                                                  | Files                            | Dependencies | Complexity |
| -------- | --------------------------------------------------------------------- | -------------------------------- | ------------ | ---------- |
| CHAT-001 | Show auth method indicator ("Using your subscription" vs "Using API") | `ClaudeCodePanel.tsx` or related | CLI-001      | Low        |
| CHAT-002 | Handle token invalid error with link to Settings                      | Same file                        | CLI-001      | Low        |

---

## Phase 10: Testing

| Task ID  | Task                                  | Files     | Dependencies | Complexity |
| -------- | ------------------------------------- | --------- | ------------ | ---------- |
| TEST-001 | Token service unit tests              | Test file | TOK-001      | Medium     |
| TEST-002 | Setup token parser unit tests         | Test file | PARSE-005    | Medium     |
| TEST-003 | CLI handler unit tests                | Test file | CLI-001      | Medium     |
| TEST-004 | WebSocket setup flow integration test | Test file | WS-001       | High       |

---

## Phase 11: Deployment

| Task ID | Task                               | Files      | Dependencies | Complexity |
| ------- | ---------------------------------- | ---------- | ------------ | ---------- |
| DEP-001 | Run database migration             | -          | DB-001       | Low        |
| DEP-002 | Ensure Claude CLI in Fargate image | Dockerfile | CLI-001      | Low        |

---

## Dependency Graph

```
DB-001 ─> DB-002, DB-003
              │
              └─> TOK-001 ─> TOK-002...TOK-006
                      │
                      └─> CLI-001 ─> CLI-002...CLI-016
                            │
PARSE-001...PARSE-006 ──────┼─> TERM-001...TERM-005 ─> WS-001...WS-007
                            │
                            └─> CHAT-001, CHAT-002

FE-001...FE-005 (uses TOK-003, TOK-005, TOK-006)
WIZ-001...WIZ-007 (uses WS-001)
```

---

## Task Summary

| Phase            | Tasks  |
| ---------------- | ------ |
| Database         | 3      |
| Token Service    | 6      |
| CLI Handler      | 16     |
| Setup Parser     | 6      |
| Terminal Service | 5      |
| WebSocket Route  | 8      |
| Frontend Manual  | 5      |
| Frontend Wizard  | 7      |
| Chat Interface   | 2      |
| Testing          | 4      |
| Deployment       | 2      |
| **Total**        | **64** |

---

## Critical Path (MVP)

Minimum tasks for working Claude Code CLI with user tokens:

1. **DB-001, DB-002, DB-003** - Database setup (3 tasks)
2. **TOK-001, TOK-002, TOK-003** - Token service basics (3 tasks)
3. **CLI-001, CLI-002, CLI-003, CLI-004, CLI-008** - Core CLI handler (5 tasks)
4. **FE-001, FE-002, FE-003** - Manual token entry UI (3 tasks)

**MVP: 14 tasks**

---

## Recommended Order

### Week 1: Core Backend

- DB-001 to DB-003
- TOK-001 to TOK-006
- CLI-001 to CLI-016

### Week 2: Manual Token Entry (Ship MVP)

- FE-001 to FE-005
- CHAT-001, CHAT-002
- TEST-001, TEST-003
- DEP-001, DEP-002

### Week 3: In-App Setup Flow (Enhanced UX)

- PARSE-001 to PARSE-006
- TERM-001 to TERM-005
- WS-001 to WS-007, EVT-001
- WIZ-001 to WIZ-007
- TEST-002, TEST-004
