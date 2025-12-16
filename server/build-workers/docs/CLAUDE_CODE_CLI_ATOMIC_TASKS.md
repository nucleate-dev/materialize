# Claude Code CLI Implementation - Atomic Task Breakdown

This document breaks down the Claude Code CLI Headless Mode implementation plan into atomic units of work, organized by phase with clear dependencies.

---

## Phase 1: Database Schema & Core Infrastructure

### 1.1 Database Migration
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| DB-001 | Create `user_claude_tokens` table migration with encrypted fields | `supabase/migrations/xxx_add_user_claude_tokens.sql` | None | Low |
| DB-002 | Add RLS policies for user token access | Same migration file | DB-001 | Low |
| DB-003 | Create index on `user_id` column | Same migration file | DB-001 | Low |
| DB-004 | Add TypeScript types for `user_claude_tokens` table | `server/build-workers/types/supabase.ts` | DB-001 | Low |

**Schema:**
```sql
CREATE TABLE user_claude_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  encrypted_token TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_tag TEXT NOT NULL,
  token_type TEXT DEFAULT 'setup-token',
  is_valid BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  validation_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Phase 2: Token Encryption Service

### 2.1 Token Encryption Implementation
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| ENC-001 | Create `token-encryption.ts` utility with AES-256-GCM | `server/build-workers/services/auth/token-encryption.ts` | None | Medium |
| ENC-002 | Implement `encryptToken()` function | Same file | ENC-001 | Low |
| ENC-003 | Implement `decryptToken()` function | Same file | ENC-001 | Low |
| ENC-004 | Add `TOKEN_ENCRYPTION_SECRET` to environment variables | `.env.example`, deployment configs | ENC-001 | Low |
| ENC-005 | Write unit tests for encryption functions | `server/build-workers/services/auth/__tests__/token-encryption.test.ts` | ENC-002, ENC-003 | Medium |

---

## Phase 3: Control Plane API Endpoints

### 3.1 Token Management Routes
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| API-001 | Create `claude-token-routes.ts` file with route structure | `server/control-plane/routes/claude-token-routes.ts` | DB-001 | Low |
| API-002 | Implement `POST /api/user/claude-token` - save/update token | Same file | API-001, ENC-001 | Medium |
| API-003 | Implement `GET /api/user/claude-token/status` - get token status | Same file | API-001 | Low |
| API-004 | Implement `DELETE /api/user/claude-token` - disconnect token | Same file | API-001 | Low |
| API-005 | Register routes in main server entry point | `server/control-plane/index.ts` or routes registry | API-001 | Low |
| API-006 | Add request body validation with Zod/TypeBox | `server/control-plane/routes/claude-token-routes.ts` | API-002 | Low |

---

## Phase 4: Build Worker - Token Service

### 4.1 Claude Token Service
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| TOK-001 | Create `ClaudeTokenService` class structure | `server/build-workers/services/auth/claude-token-service.ts` | DB-004, ENC-001 | Medium |
| TOK-002 | Implement `getUserToken()` with caching | Same file | TOK-001 | Medium |
| TOK-003 | Implement `saveToken()` with encryption | Same file | TOK-001, ENC-002 | Medium |
| TOK-004 | Implement `markTokenInvalid()` | Same file | TOK-001 | Low |
| TOK-005 | Implement `clearCache()` | Same file | TOK-001 | Low |
| TOK-006 | Add token cache cleanup interval (prevent memory leaks) | Same file | TOK-002 | Low |
| TOK-007 | Add `destroy()` method for cleanup | Same file | TOK-006 | Low |
| TOK-008 | Write unit tests for ClaudeTokenService | `server/build-workers/services/auth/__tests__/claude-token-service.test.ts` | TOK-001 to TOK-007 | Medium |

---

## Phase 5: CLI Query Handler

### 5.1 Core CLI Handler
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| CLI-001 | Create `ClaudeCodeCliQueryHandler` class structure | `server/build-workers/services/chat/claude-code-cli-query-handler.ts` | TOK-001 | Medium |
| CLI-002 | Implement `buildAuthEnvironment()` with proper env handling (fix `undefined` bug) | Same file | CLI-001 | Medium |
| CLI-003 | Implement `buildCliArgs()` | Same file | CLI-001 | Low |
| CLI-004 | Implement `extractPrompt()` | Same file | CLI-001 | Low |
| CLI-005 | Implement `executeCliProcess()` with spawn | Same file | CLI-001 | High |
| CLI-006 | Implement CLI stdout JSON line parsing | Same file | CLI-005 | Medium |
| CLI-007 | Implement stderr monitoring for auth errors | Same file | CLI-005 | Medium |
| CLI-008 | Implement `handleCliMessage()` for message transformation | Same file | CLI-006 | Medium |
| CLI-009 | Implement `isAuthError()` detection | Same file | CLI-007 | Low |
| CLI-010 | Implement `abort()` for process termination | Same file | CLI-005 | Low |

### 5.2 CLI Message Type Mapping
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| CLI-011 | Define `ClaudeCodeMessage` interface for CLI JSON types | Same file or types file | CLI-001 | Low |
| CLI-012 | Map CLI `assistant` messages to `AGENT_MESSAGE` events | CLI-008 | CLI-011 | Low |
| CLI-013 | Map CLI `tool_use` to `TOOL_START` events | CLI-008 | CLI-011 | Low |
| CLI-014 | Map CLI `tool_result` to `TOOL_COMPLETE` events | CLI-008 | CLI-011 | Low |
| CLI-015 | Map CLI `result` to `QUERY_COMPLETE` events | CLI-008 | CLI-011 | Low |
| CLI-016 | Map CLI `error` to `ERROR` events | CLI-008 | CLI-011 | Low |

### 5.3 Hook Equivalents (Stream Parsing)
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| HOOK-001 | Add `SessionState` tracking for pending tool calls | CLI-001 | CLI-001 | Low |
| HOOK-002 | Implement `handlePreToolUse()` - tool start tracking & DB persistence | CLI-001 | CLI-013, HOOK-001 | Medium |
| HOOK-003 | Implement `handleToolResult()` - tool complete tracking & file modification tracking | CLI-001 | CLI-014, HOOK-001 | Medium |
| HOOK-004 | Add `ToolPermissionService` integration (monitoring mode) | CLI-001 | HOOK-002 | Medium |
| HOOK-005 | Implement `handleQueryComplete()` - report modified files | CLI-001 | HOOK-003 | Low |

---

## Phase 6: Setup Token Flow - Terminal Parsing

### 6.1 Setup Token Parser
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| PARSE-001 | Create `SetupTokenParseResult` interface | `server/build-workers/services/auth/claude-setup-token-parser.ts` | None | Low |
| PARSE-002 | Define regex patterns for OAuth URL detection | Same file | PARSE-001 | Low |
| PARSE-003 | Define regex patterns for code prompt detection | Same file | PARSE-001 | Low |
| PARSE-004 | Define regex patterns for token capture | Same file | PARSE-001 | Medium |
| PARSE-005 | Define regex patterns for error detection | Same file | PARSE-001 | Low |
| PARSE-006 | Implement `parseSetupTokenOutput()` function | Same file | PARSE-002 to PARSE-005 | Medium |
| PARSE-007 | Implement `SetupTokenStreamParser` class for streaming | Same file | PARSE-006 | High |
| PARSE-008 | Implement `processChunk()` in stream parser | Same file | PARSE-007 | Medium |
| PARSE-009 | Implement `getState()` and `reset()` in stream parser | Same file | PARSE-007 | Low |
| PARSE-010 | Write unit tests for parser (OAuth URL, code prompt, token, error, malformed) | `server/build-workers/services/auth/__tests__/claude-setup-token-parser.test.ts` | PARSE-006, PARSE-007 | Medium |

---

## Phase 7: Setup Token Flow - Terminal Service Integration

### 7.1 Terminal Service Additions
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| TERM-001 | Add `setupSessions` Map for per-user session tracking | `server/build-workers/services/terminals/TerminalService.ts` | PARSE-007 | Low |
| TERM-002 | Implement `startClaudeSetupToken()` method | Same file | TERM-001, PARSE-007 | High |
| TERM-003 | Add 5-minute timeout for setup sessions | Same file | TERM-002 | Low |
| TERM-004 | Implement `submitSetupTokenCode()` with sanitization | Same file | TERM-002 | Medium |
| TERM-005 | Implement `cleanupSetupTokenSession()` | Same file | TERM-001 | Low |
| TERM-006 | Implement `sanitizeAuthCode()` helper function | Same file | TERM-004 | Low |
| TERM-007 | Implement `checkClaudeCLIAvailable()` pre-flight check | Same file | None | Low |

---

## Phase 8: Setup Token Flow - WebSocket Route

### 8.1 Claude Setup Routes
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| WS-001 | Create `claude-setup-routes.ts` file | `server/build-workers/routes/claude-setup-routes.ts` | TERM-002 | Medium |
| WS-002 | Add WebSocket authentication middleware | Same file | WS-001 | Medium |
| WS-003 | Implement user authorization check (can only access own setup) | Same file | WS-002 | Low |
| WS-004 | Implement `oauth_url` event forwarding to client | Same file | WS-001 | Low |
| WS-005 | Implement `code_prompt` event forwarding to client | Same file | WS-001 | Low |
| WS-006 | Implement `token` capture and auto-save to database (await save!) | Same file | WS-001, TOK-003 | Medium |
| WS-007 | Implement `error` event forwarding to client | Same file | WS-001 | Low |
| WS-008 | Handle `submit_code` message from client | Same file | TERM-004 | Low |
| WS-009 | Handle `cancel` message from client | Same file | TERM-005 | Low |
| WS-010 | Cleanup session on WebSocket close | Same file | TERM-005 | Low |
| WS-011 | Add rate limiting for setup attempts (1 per minute per user) | Same file | WS-001 | Medium |

### 8.2 New WebSocket Event Types
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| EVT-001 | Add `CLAUDE_SETUP_OAUTH_URL` event type | `server/build-workers/types/ChatTypes.ts` | None | Low |
| EVT-002 | Add `CLAUDE_SETUP_CODE_PROMPT` event type | Same file | None | Low |
| EVT-003 | Add `CLAUDE_SETUP_TOKEN_CAPTURED` event type | Same file | None | Low |
| EVT-004 | Add `CLAUDE_SETUP_ERROR` event type | Same file | None | Low |
| EVT-005 | Add `CLAUDE_SETUP_COMPLETE` event type | Same file | None | Low |
| EVT-006 | Add event payload interfaces | Same file | EVT-001 to EVT-005 | Low |

---

## Phase 9: Frontend - Manual Token Entry

### 9.1 Settings Page Component
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| FE-001 | Create `ClaudeSubscriptionConnect.tsx` component | `web-application/src/components/settings/ClaudeSubscriptionConnect.tsx` | API-002, API-003 | Medium |
| FE-002 | Implement token input field (password type) | Same file | FE-001 | Low |
| FE-003 | Implement connect button with loading state | Same file | FE-001 | Low |
| FE-004 | Implement API call to save token | Same file | FE-001, API-002 | Low |
| FE-005 | Add token status display (connected/disconnected) | Same file | API-003 | Low |
| FE-006 | Add disconnect button | Same file | API-004 | Low |
| FE-007 | Add instructions for getting token (claude setup-token) | Same file | FE-001 | Low |
| FE-008 | Add error message display | Same file | FE-001 | Low |
| FE-009 | Add `ClaudeSubscriptionConnect` to Settings page | `web-application/src/pages/Settings.tsx` or equivalent | FE-001 | Low |

---

## Phase 10: Frontend - In-App Setup Wizard

### 10.1 Setup Wizard Component
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| WIZ-001 | Create `ClaudeSetupWizard.tsx` component structure | `web-application/src/components/settings/ClaudeSetupWizard.tsx` | WS-001 | Medium |
| WIZ-002 | Add `userId` prop (fix missing prop from original plan) | Same file | WIZ-001 | Low |
| WIZ-003 | Implement WebSocket connection to setup endpoint | Same file | WIZ-001 | Medium |
| WIZ-004 | Implement idle state UI (start button) | Same file | WIZ-001 | Low |
| WIZ-005 | Implement starting state UI (spinner) | Same file | WIZ-001 | Low |
| WIZ-006 | Implement waiting_for_code state UI with OAuth URL button | Same file | WIZ-001 | Medium |
| WIZ-007 | Implement pop-up blocker detection and warning | Same file | WIZ-006 | Low |
| WIZ-008 | Implement code input field and submit | Same file | WIZ-006 | Low |
| WIZ-009 | Implement processing state UI | Same file | WIZ-001 | Low |
| WIZ-010 | Implement success state UI | Same file | WIZ-001 | Low |
| WIZ-011 | Implement error state UI with retry | Same file | WIZ-001 | Low |
| WIZ-012 | Handle WebSocket event: `claude_setup_oauth_url` | Same file | WIZ-003, EVT-001 | Low |
| WIZ-013 | Handle WebSocket event: `claude_setup_code_prompt` | Same file | WIZ-003, EVT-002 | Low |
| WIZ-014 | Handle WebSocket event: `claude_setup_token_captured` | Same file | WIZ-003, EVT-003 | Low |
| WIZ-015 | Handle WebSocket event: `claude_setup_complete` | Same file | WIZ-003, EVT-005 | Low |
| WIZ-016 | Handle WebSocket event: `claude_setup_error` | Same file | WIZ-003, EVT-004 | Low |
| WIZ-017 | Cleanup WebSocket on component unmount | Same file | WIZ-003 | Low |

---

## Phase 11: Chat Interface Updates

### 11.1 Auth Status Display
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| CHAT-001 | Add subscription status indicator in chat panel | `web-application/src/components/chat/ClaudeCodePanel.tsx` or related | CLI-001 | Medium |
| CHAT-002 | Display "Using your Claude subscription" vs "Using API" | Same file | CHAT-001 | Low |
| CHAT-003 | Handle `auth_info` system event from backend | Same file | CLI-001 | Low |
| CHAT-004 | Handle `auth_fallback` system event (token failed, using API) | Same file | CLI-001 | Low |
| CHAT-005 | Add link to Settings when token is invalid | Same file | CHAT-004 | Low |

---

## Phase 12: File-Based Hooks (Optional Security)

### 12.1 Hook Scripts
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| FHOOK-001 | Create `hooks/` directory in build-workers | `server/build-workers/hooks/` | None | Low |
| FHOOK-002 | Create `validate-file-write.sh` script | `server/build-workers/hooks/validate-file-write.sh` | FHOOK-001 | Medium |
| FHOOK-003 | Create `validate-bash-command.sh` script | `server/build-workers/hooks/validate-bash-command.sh` | FHOOK-001 | Medium |
| FHOOK-004 | Create `post-file-write.sh` script (optional) | `server/build-workers/hooks/post-file-write.sh` | FHOOK-001 | Low |
| FHOOK-005 | Create `.claude/settings.json` template for hooks | `server/build-workers/.claude/settings.json` | FHOOK-002, FHOOK-003 | Low |
| FHOOK-006 | Update Dockerfile to copy hooks directory | `server/build-workers/Dockerfile` | FHOOK-001 | Low |
| FHOOK-007 | Make hook scripts executable in Dockerfile | Same file | FHOOK-006 | Low |

---

## Phase 13: Testing

### 13.1 Unit Tests
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| TEST-001 | Token encryption tests | ENC-005 | ENC-002, ENC-003 | Medium |
| TEST-002 | Token service tests | TOK-008 | TOK-001 to TOK-007 | Medium |
| TEST-003 | Setup token parser tests | PARSE-010 | PARSE-006, PARSE-007 | Medium |
| TEST-004 | CLI query handler tests | `server/build-workers/services/chat/__tests__/claude-code-cli-query-handler.test.ts` | CLI-001 to CLI-016 | High |

### 13.2 Integration Tests
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| TEST-005 | WebSocket setup flow tests (auth, rate limit, timeout) | Integration test file | WS-001 to WS-011 | High |
| TEST-006 | End-to-end token save and retrieval test | Integration test file | API-002, TOK-002 | Medium |
| TEST-007 | CLI execution with mock process tests | Integration test file | CLI-005 | High |

### 13.3 Security Tests
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| TEST-008 | Code sanitization tests | Test file | TERM-006 | Low |
| TEST-009 | Token not logged verification | Test file | TOK-001, CLI-001 | Low |
| TEST-010 | Rate limiting tests | Test file | WS-011 | Medium |

---

## Phase 14: Deployment & Configuration

### 14.1 Environment & Deployment
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| DEP-001 | Add `TOKEN_ENCRYPTION_SECRET` to all environments | Deployment configs | ENC-001 | Low |
| DEP-002 | Ensure Claude CLI is installed in Fargate image | Dockerfile | CLI-001 | Low |
| DEP-003 | Update Fargate task definition with new env vars | Infrastructure config | DEP-001 | Low |
| DEP-004 | Run database migration in staging | - | DB-001 | Low |
| DEP-005 | Run database migration in production | - | DEP-004 | Low |

---

## Phase 15: Monitoring & Analytics

### 15.1 Observability
| Task ID | Task | Files | Dependencies | Complexity |
|---------|------|-------|--------------|------------|
| MON-001 | Add `claude_cli_auth` metric logging | CLI-001 | CLI-001 | Low |
| MON-002 | Add token adoption rate dashboard query | Documentation | DB-001 | Low |
| MON-003 | Add token failure rate dashboard query | Documentation | DB-001 | Low |
| MON-004 | Add alerts for high token failure rate | Monitoring system | MON-003 | Medium |

---

## Dependency Graph Summary

```
DB-001 ─┬─> DB-002, DB-003, DB-004
        │
        └─> API-001 ─> API-002 ─> API-003, API-004, API-005, API-006
                          │
ENC-001 ─> ENC-002 ─┬─────┴──> TOK-001 ─> TOK-002...TOK-008
           ENC-003 ─┘                          │
                                               └─> CLI-001 ─> CLI-002...CLI-016
                                                      │
                                                      └─> HOOK-001...HOOK-005

PARSE-001...PARSE-010 ─> TERM-001...TERM-007 ─> WS-001...WS-011
                                                      │
EVT-001...EVT-006 ─────────────────────────────────────┘
                                                      │
FE-001...FE-009                                       │
WIZ-001...WIZ-017 <───────────────────────────────────┘

CHAT-001...CHAT-005 <── CLI-001

FHOOK-001...FHOOK-007 (optional, parallel)

TEST-001...TEST-010 (after respective implementations)

DEP-001...DEP-005 (after all implementation)
MON-001...MON-004 (after deployment)
```

---

## Recommended Implementation Order

### Sprint 1: Foundation (Highest Priority)
1. DB-001 to DB-004 (Database)
2. ENC-001 to ENC-005 (Encryption)
3. TOK-001 to TOK-008 (Token Service)
4. API-001 to API-006 (Control Plane API)

### Sprint 2: CLI Handler (Core Feature)
5. CLI-001 to CLI-016 (CLI Query Handler)
6. HOOK-001 to HOOK-005 (Hook Equivalents)
7. EVT-001 to EVT-006 (Event Types)

### Sprint 3: Manual Token Entry (MVP)
8. FE-001 to FE-009 (Manual Token UI)
9. CHAT-001 to CHAT-005 (Chat Status Display)
10. TEST-001 to TEST-004 (Unit Tests)

### Sprint 4: In-App Setup Flow (Enhanced UX)
11. PARSE-001 to PARSE-010 (Token Parser)
12. TERM-001 to TERM-007 (Terminal Service)
13. WS-001 to WS-011 (WebSocket Route)
14. WIZ-001 to WIZ-017 (Setup Wizard)
15. TEST-005 to TEST-010 (Integration Tests)

### Sprint 5: Polish & Deployment
16. FHOOK-001 to FHOOK-007 (Optional Hooks)
17. DEP-001 to DEP-005 (Deployment)
18. MON-001 to MON-004 (Monitoring)

---

## Total Task Count

| Phase | Task Count |
|-------|------------|
| Database | 4 |
| Encryption | 5 |
| Control Plane API | 6 |
| Token Service | 8 |
| CLI Handler Core | 10 |
| CLI Message Mapping | 6 |
| Hook Equivalents | 5 |
| Setup Token Parser | 10 |
| Terminal Service | 7 |
| WebSocket Route | 11 |
| Event Types | 6 |
| Frontend Manual Entry | 9 |
| Frontend Setup Wizard | 17 |
| Chat Interface | 5 |
| File-Based Hooks | 7 |
| Testing | 10 |
| Deployment | 5 |
| Monitoring | 4 |
| **Total** | **135** |

---

## Critical Path

The minimum viable path to get Claude Code CLI working with user tokens:

1. **DB-001** - Create table
2. **ENC-001, ENC-002, ENC-003** - Token encryption
3. **TOK-001, TOK-002, TOK-003** - Token service (get/save)
4. **API-002** - Save token endpoint
5. **CLI-001, CLI-002, CLI-005, CLI-006, CLI-008** - Core CLI handler
6. **FE-001 to FE-004** - Manual token entry UI

**Critical path: ~20 tasks for MVP**
