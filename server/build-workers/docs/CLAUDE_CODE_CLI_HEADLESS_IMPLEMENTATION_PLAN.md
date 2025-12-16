# Claude Code CLI Headless Mode Implementation Plan

## Overview

This document outlines the plan for implementing a new `claude-code-cli-query-handler.ts` in the build-workers folder that uses Claude Code CLI's headless mode with **user subscription tokens as the primary authentication method**.

## Strategy: User Tokens First, API Key Fallback

**Why this approach:**
- **Cost:** API keys are ~10x more expensive than subscription usage
- **Safety:** Reduces risk of being flagged for high-volume API usage
- **User Value:** Users with Max subscriptions ($100-200/mo) get unlimited usage

**Authentication Priority:**
1. **Primary:** User's `CLAUDE_CODE_OAUTH_TOKEN` (from their Pro/Max subscription)
2. **Fallback:** Our `ANTHROPIC_API_KEY` (only when user hasn't connected their subscription)

---

## User Flow

### How Users Connect Their Subscription

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER'S LOCAL MACHINE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. User runs: claude setup-token                                   │
│                                                                      │
│  2. Browser opens → User logs into Claude                           │
│                                                                      │
│  3. Token is generated and displayed:                               │
│     "Your token: clc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"              │
│                                                                      │
│  4. User copies token                                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         NUCLEATE WEB APP                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  5. User goes to Settings → "Connect Claude Subscription"           │
│                                                                      │
│  6. User pastes token into input field                              │
│                                                                      │
│  7. We validate and store token (encrypted) in Supabase             │
│                                                                      │
│  8. User sees: "✓ Claude Max subscription connected"                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         FARGATE CONTAINER                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  9. When user starts a chat session:                                │
│     - Fetch user's token from Supabase                              │
│     - Set CLAUDE_CODE_OAUTH_TOKEN environment variable              │
│     - Execute Claude CLI in headless mode                           │
│                                                                      │
│  10. If no token → Fall back to ANTHROPIC_API_KEY                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Database Schema

**New table: `user_claude_tokens`**

```sql
-- Migration: add_user_claude_tokens_table.sql
CREATE TABLE user_claude_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,

  -- The token from `claude setup-token`
  oauth_token TEXT NOT NULL,

  -- Token metadata
  token_type TEXT DEFAULT 'setup-token',  -- 'setup-token' or 'oauth'

  -- Status tracking
  is_valid BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  validation_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE user_claude_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own tokens
CREATE POLICY "Users can view own tokens" ON user_claude_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens" ON user_claude_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens" ON user_claude_tokens
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens" ON user_claude_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_user_claude_tokens_user_id ON user_claude_tokens(user_id);
```

---

### Phase 2: Control Plane API Endpoints

**File: `server/control-plane/routes/claude-token-routes.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';

interface SaveTokenBody {
  oauth_token: string;
}

export function registerClaudeTokenRoutes(
  app: FastifyInstance,
  supabase: SupabaseClient,
) {
  // Save/update user's Claude token
  app.post<{ Body: SaveTokenBody }>(
    '/api/user/claude-token',
    async (request, reply) => {
      const user = request.user; // From auth middleware
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const { oauth_token } = request.body;

      // Basic validation - tokens from setup-token start with specific prefixes
      if (!oauth_token || oauth_token.length < 20) {
        return reply.status(400).send({ error: 'Invalid token format' });
      }

      // Upsert the token
      const { data, error } = await supabase
        .from('user_claude_tokens')
        .upsert({
          user_id: user.id,
          oauth_token,
          is_valid: true,
          validation_error: null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: 'Failed to save token' });
      }

      return { success: true, connected: true };
    },
  );

  // Get user's token status (not the token itself)
  app.get('/api/user/claude-token/status', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .from('user_claude_tokens')
      .select('is_valid, last_used_at, last_validated_at, validation_error, created_at')
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return { connected: false };
    }

    return {
      connected: true,
      is_valid: data.is_valid,
      last_used_at: data.last_used_at,
      validation_error: data.validation_error,
      connected_at: data.created_at,
    };
  });

  // Delete user's token (disconnect)
  app.delete('/api/user/claude-token', async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { error } = await supabase
      .from('user_claude_tokens')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      return reply.status(500).send({ error: 'Failed to delete token' });
    }

    return { success: true, connected: false };
  });
}
```

---

### Phase 3: Build Worker - Token Fetching Service

**File: `server/build-workers/services/auth/claude-token-service.ts`**

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import { Database } from '../../types/supabase.js';

interface UserClaudeToken {
  oauth_token: string;
  is_valid: boolean;
}

export class ClaudeTokenService {
  private readonly supabase: SupabaseClient<Database>;
  private readonly logger: SystemLogger;

  // Cache tokens briefly to avoid repeated DB calls within same session
  private tokenCache = new Map<string, { token: string; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(supabase: SupabaseClient<Database>, logger: SystemLogger) {
    this.supabase = supabase;
    this.logger = logger.child({ service: 'ClaudeTokenService' });
  }

  /**
   * Get user's OAuth token if available and valid
   */
  async getUserToken(userId: string): Promise<string | null> {
    // Check cache first
    const cached = this.tokenCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    try {
      const { data, error } = await this.supabase
        .from('user_claude_tokens')
        .select('oauth_token, is_valid')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        this.logger.debug('No Claude token found for user', { userId });
        return null;
      }

      if (!data.is_valid) {
        this.logger.debug('User Claude token is marked invalid', { userId });
        return null;
      }

      // Cache the token
      this.tokenCache.set(userId, {
        token: data.oauth_token,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      // Update last_used_at (fire and forget)
      void this.supabase
        .from('user_claude_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('user_id', userId);

      return data.oauth_token;
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'Failed to fetch user Claude token',
        { userId },
      );
      return null;
    }
  }

  /**
   * Mark a user's token as invalid (e.g., after auth failure)
   */
  async markTokenInvalid(userId: string, error: string): Promise<void> {
    // Clear from cache
    this.tokenCache.delete(userId);

    try {
      await this.supabase
        .from('user_claude_tokens')
        .update({
          is_valid: false,
          validation_error: error,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      this.logger.info('Marked user Claude token as invalid', { userId, error });
    } catch (err) {
      this.logger.error(
        err instanceof Error ? err : new Error(String(err)),
        'Failed to mark token as invalid',
        { userId },
      );
    }
  }

  /**
   * Clear cache for a user (e.g., when they update their token)
   */
  clearCache(userId: string): void {
    this.tokenCache.delete(userId);
  }
}
```

---

### Phase 4: CLI Query Handler

**File: `server/build-workers/services/chat/claude-code-cli-query-handler.ts`**

```typescript
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import { SystemLogger } from '../../loggers/SystemLogger.js';
import {
  ChatEvent,
  ChatQueryData,
  ChatServerMessage,
} from '../../types/ChatTypes.js';
import { ClaudeTokenService } from '../auth/claude-token-service.js';

interface ClaudeCodeMessage {
  type: 'system' | 'assistant' | 'user' | 'result' | 'error';
  subtype?: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
  session_id?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  total_cost_usd?: number;
}

interface QueryContext {
  socket: WebSocket;
  data: ChatQueryData;
  prototypeId: string;
  userId: string;
  sendMessage: (socket: WebSocket, message: ChatServerMessage) => void;
}

export class ClaudeCodeCliQueryHandler {
  private readonly workDir: string;
  private readonly logger: SystemLogger;
  private readonly tokenService: ClaudeTokenService;
  private readonly getApiKey: () => string | null;
  private activeProcess: ChildProcess | null = null;

  constructor(
    workDir: string,
    logger: SystemLogger,
    tokenService: ClaudeTokenService,
    getApiKey: () => string | null,
  ) {
    this.workDir = workDir;
    this.logger = logger.child({ service: 'ClaudeCodeCliQueryHandler' });
    this.tokenService = tokenService;
    this.getApiKey = getApiKey;
  }

  async handleQuery(context: QueryContext): Promise<void> {
    const { socket, data, prototypeId, userId, sendMessage } = context;

    const prompt = this.extractPrompt(data);
    if (!prompt) {
      sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: { message: 'No prompt provided' },
      });
      return;
    }

    // Build environment with auth - USER TOKEN FIRST, API KEY FALLBACK
    const { env, authMethod } = await this.buildAuthEnvironment(userId);
    const args = this.buildCliArgs(prompt, data);

    this.logger.info('Starting Claude Code CLI process', {
      prototypeId,
      userId,
      authMethod, // 'user_token' or 'api_key'
      argsCount: args.length,
    });

    // Notify client which auth method is being used
    sendMessage(socket, {
      type: ChatEvent.SYSTEM,
      subtype: 'auth_info',
      data: {
        authMethod,
        usingSubscription: authMethod === 'user_token',
      },
    });

    try {
      await this.executeCliProcess(context, args, env, authMethod);
    } catch (error) {
      // If using user token and it fails with auth error, mark token invalid
      if (authMethod === 'user_token' && this.isAuthError(error)) {
        await this.tokenService.markTokenInvalid(
          userId,
          error instanceof Error ? error.message : String(error),
        );

        // Notify user their token is invalid
        sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: 'Your Claude subscription token has expired or is invalid',
            details: 'Please reconnect your subscription in Settings',
            code: 'TOKEN_INVALID',
          },
        });
        return;
      }

      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        'Claude Code CLI execution failed',
        { prototypeId, authMethod },
      );

      sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: 'CLI execution failed',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * Build authentication environment
   * PRIORITY: User OAuth token > API key fallback
   */
  private async buildAuthEnvironment(userId: string): Promise<{
    env: NodeJS.ProcessEnv;
    authMethod: 'user_token' | 'api_key';
  }> {
    const baseEnv = { ...process.env };

    // 1. Try user's OAuth token first (from their subscription)
    const userToken = await this.tokenService.getUserToken(userId);
    if (userToken) {
      this.logger.debug('Using user OAuth token for authentication', { userId });
      return {
        env: {
          ...baseEnv,
          CLAUDE_CODE_OAUTH_TOKEN: userToken,
          // Explicitly unset API key when using OAuth token
          ANTHROPIC_API_KEY: undefined,
        },
        authMethod: 'user_token',
      };
    }

    // 2. Fall back to API key
    const apiKey = this.getApiKey();
    if (apiKey) {
      this.logger.debug('Falling back to API key (no user token)', { userId });
      return {
        env: {
          ...baseEnv,
          ANTHROPIC_API_KEY: apiKey,
          // Explicitly unset OAuth token when using API key
          CLAUDE_CODE_OAUTH_TOKEN: undefined,
        },
        authMethod: 'api_key',
      };
    }

    // 3. No authentication available
    throw new Error('No authentication available - user has no token and no API key configured');
  }

  private buildCliArgs(prompt: string, data: ChatQueryData): string[] {
    const args = ['-p', prompt, '--output-format', 'stream-json'];

    if (data.options?.model) {
      args.push('--model', String(data.options.model));
    }

    if (data.options?.maxTurns) {
      args.push('--max-turns', String(data.options.maxTurns));
    }

    return args;
  }

  private extractPrompt(data: ChatQueryData): string | null {
    if (data.prompt) return data.prompt;
    if (Array.isArray(data.content)) {
      return data.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text || '')
        .join('\n');
    }
    return null;
  }

  private executeCliProcess(
    context: QueryContext,
    args: string[],
    env: NodeJS.ProcessEnv,
    authMethod: 'user_token' | 'api_key',
  ): Promise<void> {
    const { socket, sendMessage } = context;

    return new Promise((resolve, reject) => {
      this.activeProcess = spawn('claude', args, {
        env,
        cwd: this.workDir,
        shell: false,
      });

      let buffer = '';
      let hasAuthError = false;

      this.activeProcess.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line) as ClaudeCodeMessage;
              this.handleCliMessage(socket, message, sendMessage);
            } catch {
              this.logger.warn('Failed to parse CLI output line', { line });
            }
          }
        }
      });

      this.activeProcess.stderr?.on('data', (chunk: Buffer) => {
        const output = chunk.toString();
        this.logger.warn('Claude CLI stderr', { output });

        // Detect auth errors
        if (
          output.includes('Invalid API key') ||
          output.includes('OAuth') ||
          output.includes('authentication') ||
          output.includes('unauthorized')
        ) {
          hasAuthError = true;
        }
      });

      this.activeProcess.on('error', (error) => {
        this.activeProcess = null;
        reject(error);
      });

      this.activeProcess.on('close', (code) => {
        this.activeProcess = null;

        if (buffer.trim()) {
          try {
            const message = JSON.parse(buffer) as ClaudeCodeMessage;
            this.handleCliMessage(socket, message, sendMessage);
          } catch {
            // Ignore
          }
        }

        if (code === 0) {
          sendMessage(socket, {
            type: ChatEvent.QUERY_COMPLETE,
            data: { exitCode: code, authMethod },
          });
          resolve();
        } else {
          const error = new Error(`CLI exited with code ${code}`);
          if (hasAuthError) {
            (error as Error & { isAuthError: boolean }).isAuthError = true;
          }
          reject(error);
        }
      });
    });
  }

  private handleCliMessage(
    socket: WebSocket,
    message: ClaudeCodeMessage,
    sendMessage: (socket: WebSocket, message: ChatServerMessage) => void,
  ): void {
    sendMessage(socket, {
      type: ChatEvent.AGENT_MESSAGE,
      data: message,
    });
  }

  private isAuthError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'isAuthError' in error) {
      return (error as { isAuthError: boolean }).isAuthError;
    }
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('Invalid API key') ||
      message.includes('OAuth') ||
      message.includes('authentication') ||
      message.includes('unauthorized')
    );
  }

  abort(): void {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      this.activeProcess = null;
    }
  }
}
```

---

### Phase 5: Frontend Components

**Token Connection UI in Settings:**

```tsx
// web-application/src/components/settings/ClaudeSubscriptionConnect.tsx

import { useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

export function ClaudeSubscriptionConnect() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'disconnected' | 'connected' | 'loading'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const { supabase } = useSupabase();

  const handleConnect = async () => {
    if (!token.trim()) {
      setError('Please enter your token');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const response = await fetch('/api/user/claude-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oauth_token: token }),
      });

      if (!response.ok) {
        throw new Error('Failed to save token');
      }

      setStatus('connected');
      setToken(''); // Clear for security
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setStatus('disconnected');
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="font-semibold mb-2">Connect Claude Subscription</h3>

      <p className="text-sm text-gray-600 mb-4">
        Use your own Claude Pro/Max subscription for unlimited usage.
        This is optional - we'll use our API if you don't connect.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            How to get your token:
          </label>
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
            <li>Open your terminal</li>
            <li>Run: <code className="bg-gray-100 px-1">claude setup-token</code></li>
            <li>Complete the login in your browser</li>
            <li>Copy the token that appears</li>
            <li>Paste it below</li>
          </ol>
        </div>

        <div>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your token here"
            className="w-full p-2 border rounded"
          />
        </div>

        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}

        <button
          onClick={handleConnect}
          disabled={status === 'loading'}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {status === 'loading' ? 'Connecting...' : 'Connect Subscription'}
        </button>

        {status === 'connected' && (
          <p className="text-green-600 text-sm">
            ✓ Your Claude subscription is connected
          </p>
        )}
      </div>
    </div>
  );
}
```

---

## Token Lifecycle & Error Handling

### Token States

```
┌──────────────┐     User provides     ┌──────────────┐
│ DISCONNECTED │ ─────────────────────▶│  CONNECTED   │
│  (no token)  │        token          │  (is_valid)  │
└──────────────┘                       └──────┬───────┘
       ▲                                      │
       │                               Token fails
       │                               (auth error)
       │                                      │
       │         User provides         ┌──────▼───────┐
       └────────── new token ──────────│   INVALID    │
                                       │ (!is_valid)  │
                                       └──────────────┘
```

### Error Recovery Flow

```typescript
// In claude-code-cli-query-handler.ts

async handleQueryWithRetry(context: QueryContext): Promise<void> {
  const { userId, socket, sendMessage } = context;

  try {
    await this.handleQuery(context);
  } catch (error) {
    if (this.isAuthError(error)) {
      // Mark token invalid
      await this.tokenService.markTokenInvalid(userId, String(error));

      // Try again with API key fallback
      this.logger.info('Retrying with API key after token failure', { userId });

      sendMessage(socket, {
        type: ChatEvent.SYSTEM,
        subtype: 'auth_fallback',
        data: {
          message: 'Your subscription token failed, using API fallback',
          previousAuthMethod: 'user_token',
          newAuthMethod: 'api_key',
        },
      });

      // Retry with API key
      const { env } = await this.buildAuthEnvironment(userId); // Will now return api_key
      await this.executeCliProcess(context, this.buildCliArgs(...), env, 'api_key');
    } else {
      throw error;
    }
  }
}
```

---

## Security Considerations

### Token Storage

1. **Encryption at Rest:** Supabase encrypts data at rest by default
2. **RLS Policies:** Users can only access their own tokens
3. **Never Log Tokens:** Tokens should never appear in logs
4. **Clear After Use:** Frontend clears token input after submission

### Token Validation

```typescript
// Basic validation before storing
function validateToken(token: string): boolean {
  // Tokens from setup-token have specific formats
  // This is a basic check - actual validation happens when used
  return (
    token.length >= 20 &&
    token.length <= 500 &&
    !token.includes(' ') &&
    !token.includes('\n')
  );
}
```

---

## Monitoring & Analytics

### Metrics to Track

```typescript
// Log authentication method usage
this.logger.metric('claude_cli_auth', {
  userId,
  prototypeId,
  authMethod: 'user_token' | 'api_key',
  success: boolean,
  durationMs: number,
  tokensUsed: number,
});
```

### Dashboard Queries

```sql
-- User token adoption rate
SELECT
  COUNT(DISTINCT user_id) as users_with_tokens,
  (SELECT COUNT(DISTINCT id) FROM auth.users) as total_users
FROM user_claude_tokens
WHERE is_valid = true;

-- Token failure rate
SELECT
  DATE_TRUNC('day', updated_at) as day,
  COUNT(*) FILTER (WHERE is_valid = false) as failed,
  COUNT(*) as total
FROM user_claude_tokens
GROUP BY 1
ORDER BY 1 DESC;
```

---

## Rollout Plan

### Phase 1: MVP (Week 1)
- [ ] Create database migration for `user_claude_tokens` table
- [ ] Implement `ClaudeTokenService` in build-workers
- [ ] Implement basic `ClaudeCodeCliQueryHandler`
- [ ] Add API endpoints for token management

### Phase 2: Frontend (Week 2)
- [ ] Build token connection UI in Settings
- [ ] Add token status indicator in chat interface
- [ ] Show which auth method is being used

### Phase 3: Polish (Week 3)
- [ ] Add error recovery with API key fallback
- [ ] Implement token refresh notifications
- [ ] Add analytics/monitoring
- [ ] Documentation for users

---

## References

### Official Documentation
- [Claude Code Headless Mode](https://code.claude.com/docs/en/headless)
- [Claude Code IAM](https://code.claude.com/docs/en/iam)
- [Claude Help Center: Pro/Max Plans](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)

### GitHub Issues
- [Headless/Remote Authentication - Issue #7100](https://github.com/anthropics/claude-code/issues/7100)
- [setup-token Bug - Issue #8938](https://github.com/anthropics/claude-code/issues/8938)

### Key Command
```bash
# User runs this locally to get their token
claude setup-token

# Token is then set as environment variable in Fargate
export CLAUDE_CODE_OAUTH_TOKEN=<user's token>

# CLI automatically uses the token
claude -p "your prompt" --output-format stream-json
```

---

## Open Questions

1. **Token Expiration:** How long do `setup-token` tokens last? Need to monitor and notify users when refresh is needed.

2. **Rate Limits:** Are subscription rate limits different from API key limits? Need to handle rate limit errors gracefully.

3. **Multiple Sessions:** If a user has multiple Fargate containers, will the same token work across all of them simultaneously?

4. **Token Revocation:** If a user revokes access from Claude's side, how quickly do we detect and handle it?
