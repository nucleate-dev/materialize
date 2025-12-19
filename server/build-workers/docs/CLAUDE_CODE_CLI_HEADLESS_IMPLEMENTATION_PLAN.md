# NOTE DO NOT USE this.logger. USE THE baseLogger from worker.ts OR YOU WILL NOT HAVE ALL THE RIGHT INFO IN THE LOGGER.

## NEVER EVER EVER USE this.logger AND NEVER CREATE YOUR OWN LOGGER. You can only ADD context to an existing logger inside a function, but never create a class variable with a new logger during class initialization. YOU WILL FUCK EVERYTHING UP.

Even though this document uses "this.logger" you MUST NOT USE IT.

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
│  7. We validate and store token in Supabase                         │
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

## Alternative Flow: In-App Terminal Token Setup (Recommended UX)

Instead of requiring users to have Claude Code installed locally, we can let them run `claude setup-token` directly in the Nucleate terminal. Since the Fargate container can't open a browser, we parse the terminal output, extract the OAuth URL, and display it in the web app for the user to click.

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NUCLEATE WEB APP                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      SETTINGS PAGE                                   │   │
│  │                                                                      │   │
│  │   ┌────────────────────────────────────────────────────────────┐    │   │
│  │   │  Connect Claude Subscription                                │    │   │
│  │   │                                                             │    │   │
│  │   │  [Option A: Manual Token Entry]  [Option B: Setup in App]  │    │   │
│  │   │                                    ◀── CLICK                │    │   │
│  │   └────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   SETUP WIZARD MODAL                                │   │
│  │                                                                      │   │
│  │   Step 1: Starting setup...                                         │   │
│  │   ┌────────────────────────────────────────────────────────────┐    │   │
│  │   │  $ claude setup-token                                       │    │   │
│  │   │  Welcome to Claude Code v2.0.70                             │    │   │
│  │   │  ...                                                        │    │   │
│  │   │  Browser didn't open? Use the url below to sign in:         │    │   │
│  │   │  https://claude.ai/oauth/authorize?code=true&client_id=...  │    │   │
│  │   └────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  │   ┌────────────────────────────────────────────────────────────┐    │   │
│  │   │  🔗 Click here to authorize with Claude                     │    │   │
│  │   │     (Opens in new tab)                                      │    │   │
│  │   └────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
└─────────────────────────────────────│───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER (NEW TAB)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   claude.ai/oauth/authorize?...                                             │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                                                                      │  │
│   │   Sign in to authorize this application                              │  │
│   │                                                                      │  │
│   │   [Continue with Google]  [Continue with Email]                      │  │
│   │                                                                      │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                     │                                       │
│                              User logs in                                   │
│                                     │                                       │
│                                     ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                                                                      │  │
│   │   Authorization successful!                                          │  │
│   │                                                                      │  │
│   │   Your code: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX                    │  │
│   │                                                                      │  │
│   │   Copy this code and paste it in your terminal.                      │  │
│   │                                                                      │  │
│   │   [📋 Copy Code]                                                     │  │
│   │                                                                      │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                              User copies code
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NUCLEATE WEB APP                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   SETUP WIZARD MODAL (Step 2)                       │   │
│  │                                                                      │   │
│  │   Step 2: Paste the authorization code                              │   │
│  │                                                                      │   │
│  │   ┌────────────────────────────────────────────────────────────┐    │   │
│  │   │  Paste code here: [________________________] [Submit]       │    │   │
│  │   └────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  │   OR paste directly in the terminal below:                          │   │
│  │   ┌────────────────────────────────────────────────────────────┐    │   │
│  │   │  Paste code here if prompted > _                            │    │   │
│  │   └────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                        User pastes code (either way)                        │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   SETUP WIZARD MODAL (Step 3)                       │   │
│  │                                                                      │   │
│  │   ✓ Success! Your Claude subscription is now connected.             │   │
│  │                                                                      │   │
│  │   Token has been securely saved.                                    │   │
│  │                                                                      │   │
│  │   [Done]                                                            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Terminal Output Parsing

The `claude setup-token` command outputs specific patterns we need to detect:

**Pattern 1: OAuth URL Detection**

```
Browser didn't open? Use the url below to sign in:

https://claude.ai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=...
```

**Pattern 2: Code Prompt Detection**

```
Paste code here if prompted >
```

**Pattern 3: Success Token Output**

```
Authentication successful!
Your token: eyJhbGciOiJIUzI1NiIs...
```

OR

```
Token saved successfully.
CLAUDE_CODE_OAUTH_TOKEN=eyJhbGciOiJIUzI1NiIs...
```

### Implementation: Terminal Output Parser

**File: `server/build-workers/services/auth/claude-setup-token-parser.ts`**

```typescript
/**
 * Parses terminal output from `claude setup-token` command
 * to extract OAuth URLs, detect prompts, and capture tokens.
 */

export interface SetupTokenParseResult {
  type: "oauth_url" | "code_prompt" | "token" | "error" | "unknown";
  data?: {
    url?: string;
    token?: string;
    error?: string;
  };
}

// Regex patterns for parsing claude setup-token output
const OAUTH_URL_PATTERN = /https:\/\/claude\.ai\/oauth\/authorize\?[^\s\n]+/;
const CODE_PROMPT_PATTERN = /Paste code here if prompted\s*>/i;
const TOKEN_PATTERNS = [
  // Pattern: "Your token: <token>"
  /Your token:\s*([A-Za-z0-9_\-\.]+)/i,
  // Pattern: "CLAUDE_CODE_OAUTH_TOKEN=<token>"
  /CLAUDE_CODE_OAUTH_TOKEN=([A-Za-z0-9_\-\.]+)/i,
  // Pattern: JWT-like token on its own line after success message
  /Authentication successful[^\n]*\n+\s*([A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/i,
  // Pattern: Generic long token after "token" keyword
  /token[:\s]+([A-Za-z0-9_\-\.]{50,})/i,
];
const ERROR_PATTERNS = [
  /error:\s*(.+)/i,
  /failed:\s*(.+)/i,
  /invalid code/i,
  /authentication failed/i,
  /expired/i,
];

export function parseSetupTokenOutput(output: string): SetupTokenParseResult {
  // Check for OAuth URL
  const urlMatch = output.match(OAUTH_URL_PATTERN);
  if (urlMatch) {
    return {
      type: "oauth_url",
      data: { url: urlMatch[0] },
    };
  }

  // Check for code prompt
  if (CODE_PROMPT_PATTERN.test(output)) {
    return {
      type: "code_prompt",
    };
  }

  // Check for token
  for (const pattern of TOKEN_PATTERNS) {
    const tokenMatch = output.match(pattern);
    if (tokenMatch && tokenMatch[1]) {
      // Validate token looks reasonable (not a command or error)
      const token = tokenMatch[1].trim();
      if (token.length >= 20 && !token.includes(" ")) {
        return {
          type: "token",
          data: { token },
        };
      }
    }
  }

  // Check for errors
  for (const pattern of ERROR_PATTERNS) {
    const errorMatch = output.match(pattern);
    if (errorMatch) {
      return {
        type: "error",
        data: { error: errorMatch[1] || errorMatch[0] },
      };
    }
  }

  return { type: "unknown" };
}

/**
 * Incrementally parse streaming output, maintaining state
 */
export class SetupTokenStreamParser {
  private buffer = "";
  private detectedUrl: string | null = null;
  private detectedToken: string | null = null;
  private isWaitingForCode = false;
  private hasError = false;
  private errorMessage: string | null = null;

  /**
   * Feed new output chunk and get any detected events
   */
  processChunk(chunk: string): SetupTokenParseResult[] {
    this.buffer += chunk;
    const results: SetupTokenParseResult[] = [];

    // Check for OAuth URL (only report once)
    if (!this.detectedUrl) {
      const urlMatch = this.buffer.match(OAUTH_URL_PATTERN);
      if (urlMatch) {
        this.detectedUrl = urlMatch[0];
        results.push({
          type: "oauth_url",
          data: { url: this.detectedUrl },
        });
      }
    }

    // Check for code prompt
    if (!this.isWaitingForCode && CODE_PROMPT_PATTERN.test(this.buffer)) {
      this.isWaitingForCode = true;
      results.push({ type: "code_prompt" });
    }

    // Check for token (only after URL was detected, suggesting flow completion)
    if (this.detectedUrl && !this.detectedToken) {
      for (const pattern of TOKEN_PATTERNS) {
        const tokenMatch = this.buffer.match(pattern);
        if (tokenMatch && tokenMatch[1]) {
          const token = tokenMatch[1].trim();
          if (token.length >= 20 && !token.includes(" ")) {
            this.detectedToken = token;
            results.push({
              type: "token",
              data: { token },
            });
            break;
          }
        }
      }
    }

    // Check for errors
    if (!this.hasError) {
      for (const pattern of ERROR_PATTERNS) {
        const errorMatch = this.buffer.match(pattern);
        if (errorMatch) {
          this.hasError = true;
          this.errorMessage = errorMatch[1] || errorMatch[0];
          results.push({
            type: "error",
            data: { error: this.errorMessage },
          });
          break;
        }
      }
    }

    // Trim buffer to prevent unbounded growth (keep last 2KB)
    if (this.buffer.length > 2048) {
      this.buffer = this.buffer.slice(-2048);
    }

    return results;
  }

  getState() {
    return {
      detectedUrl: this.detectedUrl,
      detectedToken: this.detectedToken,
      isWaitingForCode: this.isWaitingForCode,
      hasError: this.hasError,
      errorMessage: this.errorMessage,
    };
  }

  reset() {
    this.buffer = "";
    this.detectedUrl = null;
    this.detectedToken = null;
    this.isWaitingForCode = false;
    this.hasError = false;
    this.errorMessage = null;
  }
}
```

### WebSocket Events for Setup Flow

**New event types in `ChatTypes.ts`:**

```typescript
// Add to ChatEvent enum
export enum ChatEvent {
  // ... existing events ...

  // Claude token setup events
  CLAUDE_SETUP_OAUTH_URL = "claude_setup_oauth_url",
  CLAUDE_SETUP_CODE_PROMPT = "claude_setup_code_prompt",
  CLAUDE_SETUP_TOKEN_CAPTURED = "claude_setup_token_captured",
  CLAUDE_SETUP_ERROR = "claude_setup_error",
  CLAUDE_SETUP_COMPLETE = "claude_setup_complete",
}

// Event payloads
export interface ClaudeSetupOAuthUrlEvent {
  type: ChatEvent.CLAUDE_SETUP_OAUTH_URL;
  data: {
    url: string;
  };
}

export interface ClaudeSetupCodePromptEvent {
  type: ChatEvent.CLAUDE_SETUP_CODE_PROMPT;
  data: {
    message: string;
  };
}

export interface ClaudeSetupTokenCapturedEvent {
  type: ChatEvent.CLAUDE_SETUP_TOKEN_CAPTURED;
  data: {
    // Token is NOT sent to frontend for security
    // Instead, we auto-save and confirm
    saved: boolean;
  };
}

export interface ClaudeSetupErrorEvent {
  type: ChatEvent.CLAUDE_SETUP_ERROR;
  data: {
    error: string;
    canRetry: boolean;
  };
}
```

### Terminal Service Integration

**File: `server/build-workers/services/terminals/TerminalService.ts` (additions)**

```typescript
import {
  SetupTokenStreamParser,
  SetupTokenParseResult,
} from "../auth/claude-setup-token-parser.js";

export class TerminalService {
  // ... existing code ...

  private setupTokenParser: SetupTokenStreamParser | null = null;
  private setupTokenSessionId: string | null = null;

  /**
   * Start the claude setup-token process and monitor output
   */
  async startClaudeSetupToken(
    userId: string,
    onEvent: (event: SetupTokenParseResult) => void,
  ): Promise<{ sessionId: string }> {
    // Create dedicated terminal session for setup
    const sessionId = `claude-setup-${userId}-${Date.now()}`;
    this.setupTokenSessionId = sessionId;
    this.setupTokenParser = new SetupTokenStreamParser();

    // Spawn terminal with setup-token command
    const pty = this.createPty(sessionId, {
      command: "claude",
      args: ["setup-token"],
      cwd: "/tmp",
      env: {
        ...process.env,
        // Ensure no existing auth interferes
        CLAUDE_CODE_OAUTH_TOKEN: undefined,
        ANTHROPIC_API_KEY: undefined,
      },
    });

    // Monitor output for OAuth URL and token
    pty.onData((data: string) => {
      if (this.setupTokenParser) {
        const events = this.setupTokenParser.processChunk(data);
        for (const event of events) {
          onEvent(event);
        }
      }
    });

    return { sessionId };
  }

  /**
   * Send the authorization code to the setup-token process
   */
  async submitSetupTokenCode(sessionId: string, code: string): Promise<void> {
    const pty = this.getPty(sessionId);
    if (!pty) {
      throw new Error("Setup session not found");
    }

    // Validate code format (UUID-like)
    if (!/^[A-Za-z0-9\-]{20,50}$/.test(code)) {
      throw new Error("Invalid code format");
    }

    // Send code to terminal (with newline to submit)
    pty.write(code + "\n");
  }

  /**
   * Clean up setup-token session
   */
  cleanupSetupTokenSession(sessionId: string): void {
    this.killPty(sessionId);
    if (this.setupTokenSessionId === sessionId) {
      this.setupTokenParser?.reset();
      this.setupTokenParser = null;
      this.setupTokenSessionId = null;
    }
  }
}
```

### API Endpoint for In-App Setup

**File: `server/build-workers/routes/claude-setup-routes.ts`**

```typescript
import { FastifyInstance, FastifyRequest } from "fastify";
import WebSocket from "ws";
import { TerminalService } from "../services/terminals/TerminalService.js";
import { ClaudeTokenService } from "../services/auth/claude-token-service.js";
import { ChatEvent } from "../types/ChatTypes.js";

interface SetupTokenSubmitBody {
  sessionId: string;
  code: string;
}

export function registerClaudeSetupRoutes(
  app: FastifyInstance,
  terminalService: TerminalService,
  tokenService: ClaudeTokenService,
) {
  // WebSocket endpoint for setup-token flow
  app.get(
    "/claude-setup/ws/:userId",
    { websocket: true },
    async (
      socket: WebSocket,
      req: FastifyRequest<{ Params: { userId: string } }>,
    ) => {
      const { userId } = req.params;

      let sessionId: string | null = null;
      let capturedToken: string | null = null;

      try {
        // Start the setup-token process
        const result = await terminalService.startClaudeSetupToken(
          userId,
          (event) => {
            switch (event.type) {
              case "oauth_url":
                socket.send(
                  JSON.stringify({
                    type: ChatEvent.CLAUDE_SETUP_OAUTH_URL,
                    data: { url: event.data?.url },
                  }),
                );
                break;

              case "code_prompt":
                socket.send(
                  JSON.stringify({
                    type: ChatEvent.CLAUDE_SETUP_CODE_PROMPT,
                    data: { message: "Please paste your authorization code" },
                  }),
                );
                break;

              case "token":
                capturedToken = event.data?.token || null;
                // Auto-save token to database
                if (capturedToken) {
                  void tokenService
                    .saveToken(userId, capturedToken)
                    .then((saved) => {
                      socket.send(
                        JSON.stringify({
                          type: ChatEvent.CLAUDE_SETUP_TOKEN_CAPTURED,
                          data: { saved },
                        }),
                      );
                      socket.send(
                        JSON.stringify({
                          type: ChatEvent.CLAUDE_SETUP_COMPLETE,
                          data: { success: true },
                        }),
                      );
                    });
                }
                break;

              case "error":
                socket.send(
                  JSON.stringify({
                    type: ChatEvent.CLAUDE_SETUP_ERROR,
                    data: {
                      error: event.data?.error || "Unknown error",
                      canRetry: true,
                    },
                  }),
                );
                break;
            }
          },
        );

        sessionId = result.sessionId;

        // Send session started confirmation
        socket.send(
          JSON.stringify({
            type: "setup_started",
            data: { sessionId },
          }),
        );
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: ChatEvent.CLAUDE_SETUP_ERROR,
            data: {
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to start setup",
              canRetry: true,
            },
          }),
        );
        return;
      }

      // Handle messages from client
      socket.on("message", async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === "submit_code" && sessionId) {
            await terminalService.submitSetupTokenCode(sessionId, message.code);
          }

          if (message.type === "cancel" && sessionId) {
            terminalService.cleanupSetupTokenSession(sessionId);
            socket.close();
          }
        } catch (error) {
          socket.send(
            JSON.stringify({
              type: ChatEvent.CLAUDE_SETUP_ERROR,
              data: {
                error:
                  error instanceof Error
                    ? error.message
                    : "Failed to process message",
                canRetry: false,
              },
            }),
          );
        }
      });

      // Cleanup on close
      socket.on("close", () => {
        if (sessionId) {
          terminalService.cleanupSetupTokenSession(sessionId);
        }
      });
    },
  );
}
```

### Frontend: Setup Wizard Component

**File: `web-application/src/components/settings/ClaudeSetupWizard.tsx`**

```tsx
import { useState, useEffect, useRef } from "react";

type SetupStep =
  | "idle"
  | "starting"
  | "waiting_for_url"
  | "waiting_for_code"
  | "processing"
  | "success"
  | "error";

interface SetupState {
  step: SetupStep;
  oauthUrl: string | null;
  error: string | null;
}

export function ClaudeSetupWizard({ onComplete }: { onComplete: () => void }) {
  const [state, setState] = useState<SetupState>({
    step: "idle",
    oauthUrl: null,
    error: null,
  });
  const [code, setCode] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  const startSetup = () => {
    setState({ step: "starting", oauthUrl: null, error: null });

    // Connect to setup WebSocket
    const ws = new WebSocket(
      `wss://${window.location.host}/claude-setup/ws/${userId}`,
    );
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case "claude_setup_oauth_url":
          setState((s) => ({
            ...s,
            step: "waiting_for_code",
            oauthUrl: message.data.url,
          }));
          break;

        case "claude_setup_code_prompt":
          // Already waiting for code, just confirm
          break;

        case "claude_setup_token_captured":
          setState((s) => ({ ...s, step: "processing" }));
          break;

        case "claude_setup_complete":
          setState((s) => ({ ...s, step: "success" }));
          setTimeout(onComplete, 1500);
          break;

        case "claude_setup_error":
          setState((s) => ({
            ...s,
            step: "error",
            error: message.data.error,
          }));
          break;
      }
    };

    ws.onerror = () => {
      setState((s) => ({
        ...s,
        step: "error",
        error: "Connection failed. Please try again.",
      }));
    };
  };

  const submitCode = () => {
    if (wsRef.current && code.trim()) {
      wsRef.current.send(
        JSON.stringify({
          type: "submit_code",
          code: code.trim(),
        }),
      );
      setState((s) => ({ ...s, step: "processing" }));
    }
  };

  const openOAuthUrl = () => {
    if (state.oauthUrl) {
      window.open(state.oauthUrl, "_blank", "noopener,noreferrer");
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: "cancel" }));
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h2 className="text-xl font-bold mb-4">
        Connect Your Claude Subscription
      </h2>

      {state.step === "idle" && (
        <div className="space-y-4">
          <p className="text-gray-600">
            Connect your Claude Pro or Max subscription to use your own account
            for AI interactions. This gives you unlimited usage based on your
            plan.
          </p>
          <button
            onClick={startSetup}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Start Setup
          </button>
        </div>
      )}

      {state.step === "starting" && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3">Starting setup...</span>
        </div>
      )}

      {state.step === "waiting_for_code" && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="font-medium text-blue-800 mb-2">
              Step 1: Authorize with Claude
            </p>
            <p className="text-sm text-blue-700 mb-3">
              Click the button below to open Claude's authorization page in a
              new tab. After logging in, you'll receive a code to paste here.
            </p>
            <button
              onClick={openOAuthUrl}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center justify-center"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              Open Claude Authorization
            </button>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="font-medium text-gray-800 mb-2">
              Step 2: Paste the code
            </p>
            <p className="text-sm text-gray-600 mb-3">
              After authorizing, copy the code from Claude and paste it here:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste your authorization code"
                className="flex-1 px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={submitCode}
                disabled={!code.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {state.step === "processing" && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3">Verifying and saving token...</span>
        </div>
      )}

      {state.step === "success" && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="text-green-600 text-4xl mb-2">✓</div>
          <p className="font-medium text-green-800">Successfully connected!</p>
          <p className="text-sm text-green-700 mt-1">
            Your Claude subscription is now linked to your account.
          </p>
        </div>
      )}

      {state.step === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-medium text-red-800">Setup failed</p>
          <p className="text-sm text-red-700 mt-1">{state.error}</p>
          <button
            onClick={() =>
              setState({ step: "idle", oauthUrl: null, error: null })
            }
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
```

### Security Considerations for In-App Flow

1. **Token Never Sent to Frontend**
   - Token is captured server-side and saved directly to database
   - Frontend only receives confirmation of success/failure

2. **Session Isolation**
   - Each setup session has unique ID
   - Sessions are cleaned up on completion/error/disconnect

3. **Code Validation**
   - Authorization codes are validated before submission
   - Prevents injection attacks through terminal

4. **Timeout Handling**
   - Setup sessions timeout after 5 minutes of inactivity
   - Prevents orphaned processes

5. **Rate Limiting**
   - Users can only have one active setup session
   - Prevents abuse of setup endpoint

```typescript
// Rate limiting example
const activeSetupSessions = new Map<string, number>();
const SETUP_COOLDOWN_MS = 60000; // 1 minute between attempts

function canStartSetup(userId: string): boolean {
  const lastAttempt = activeSetupSessions.get(userId);
  if (lastAttempt && Date.now() - lastAttempt < SETUP_COOLDOWN_MS) {
    return false;
  }
  activeSetupSessions.set(userId, Date.now());
  return true;
}
```

### Error Scenarios and Handling

| Scenario                         | Detection          | User Message                                  | Recovery                 |
| -------------------------------- | ------------------ | --------------------------------------------- | ------------------------ |
| OAuth URL not detected after 30s | Timeout            | "Setup is taking too long. Please try again." | Restart                  |
| Invalid authorization code       | CLI error output   | "Invalid code. Please copy the code again."   | Re-enter code            |
| Token not captured after code    | Timeout            | "Failed to receive token. Please try again."  | Restart                  |
| Network disconnect               | WebSocket close    | "Connection lost. Please try again."          | Restart                  |
| User already has valid token     | Check before start | "You already have a connected subscription."  | Show status              |
| Claude CLI not installed         | spawn error        | "Claude CLI not available."                   | Show manual instructions |

---

## Critical Implementation Notes (Review Findings)

The following issues were identified during technical review and **MUST be addressed** during implementation:

### 1. Environment Variable Handling Bug

**Problem:** Setting env vars to `undefined` doesn't remove them in Node.js - it sets them to string `"undefined"`.

**Wrong:**

```typescript
env: {
  ...baseEnv,
  CLAUDE_CODE_OAUTH_TOKEN: userToken,
  ANTHROPIC_API_KEY: undefined,  // ❌ Sets to string "undefined"
}
```

**Correct:**

```typescript
private async buildAuthEnvironment(userId: string): Promise<{
  env: NodeJS.ProcessEnv;
  authMethod: 'user_token' | 'api_key';
}> {
  const env = { ...process.env };

  // 1. Try user's OAuth token first
  const userToken = await this.tokenService.getUserToken(userId);
  if (userToken) {
    env.CLAUDE_CODE_OAUTH_TOKEN = userToken;
    delete env.ANTHROPIC_API_KEY;  // ✅ Actually removes the key
    return { env, authMethod: 'user_token' };
  }

  // 2. Fall back to API key
  const apiKey = this.getApiKey();
  if (apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;  // ✅ Actually removes the key
    return { env, authMethod: 'api_key' };
  }

  throw new Error('No authentication available');
}
```

### 2. WebSocket Authentication Required

**Problem:** The WebSocket route must verify the user is authenticated and authorized.

**Fix:**

```typescript
app.get(
  "/claude-setup/ws/:userId",
  {
    websocket: true,
    preValidation: [app.authenticate], // Add auth middleware
  },
  async (
    socket: WebSocket,
    req: FastifyRequest<{ Params: { userId: string } }>,
  ) => {
    const authenticatedUserId = req.user?.id;
    const { userId } = req.params;

    // Verify user can only access their own setup
    if (!authenticatedUserId || authenticatedUserId !== userId) {
      socket.close(1008, "Unauthorized");
      return;
    }

    // ... rest of implementation
  },
);
```

### 3. Per-User Setup Session Management

**Problem:** Global `setupTokenParser` causes race conditions with multiple users.

**Fix:** Use Map for per-user sessions:

```typescript
export class TerminalService {
  // ✅ Per-user session tracking
  private setupSessions = new Map<
    string,
    {
      parser: SetupTokenStreamParser;
      sessionId: string;
      ptyProcess: IPty;
      createdAt: number;
      timeoutId: NodeJS.Timeout;
    }
  >();

  async startClaudeSetupToken(
    userId: string,
    onEvent: (event: SetupTokenParseResult) => void,
  ): Promise<{ sessionId: string }> {
    // Cleanup any existing session for this user
    if (this.setupSessions.has(userId)) {
      this.cleanupSetupTokenSession(userId);
    }

    const sessionId = `claude-setup-${userId}-${Date.now()}`;
    const parser = new SetupTokenStreamParser();

    const pty = this.createPty(sessionId, {
      command: "claude",
      args: ["setup-token"],
      cwd: "/tmp",
      env: { ...process.env },
    });

    // Set 5-minute timeout
    const timeoutId = setTimeout(
      () => {
        this.cleanupSetupTokenSession(userId);
        onEvent({
          type: "error",
          data: { error: "Setup timed out. Please try again." },
        });
      },
      5 * 60 * 1000,
    );

    this.setupSessions.set(userId, {
      parser,
      sessionId,
      ptyProcess: pty,
      createdAt: Date.now(),
      timeoutId,
    });

    pty.onData((data: string) => {
      const session = this.setupSessions.get(userId);
      if (session) {
        const events = session.parser.processChunk(data);
        events.forEach(onEvent);
      }
    });

    return { sessionId };
  }

  cleanupSetupTokenSession(userId: string): void {
    const session = this.setupSessions.get(userId);
    if (session) {
      clearTimeout(session.timeoutId);
      this.killPty(session.sessionId);
      this.setupSessions.delete(userId);
    }
  }
}
```

### 4. Stricter Code Sanitization

**Problem:** Regex validation alone isn't sufficient for terminal input.

**Fix:**

```typescript
function sanitizeAuthCode(code: string): string {
  // Strip everything except alphanumeric and hyphens
  const cleaned = code.replace(/[^A-Za-z0-9\-]/g, '');

  // Validate length and format
  if (cleaned.length < 20 || cleaned.length > 50) {
    throw new Error('Invalid authorization code length');
  }

  if (!/^[A-Za-z0-9\-]+$/.test(cleaned)) {
    throw new Error('Invalid authorization code format');
  }

  return cleaned;
}

async submitSetupTokenCode(userId: string, code: string): Promise<void> {
  const session = this.setupSessions.get(userId);
  if (!session) {
    throw new Error('No active setup session');
  }

  const sanitized = sanitizeAuthCode(code);
  session.ptyProcess.write(sanitized + '\n');
}
```

### 5. Await Token Save Before Confirming

**Problem:** Race condition if WebSocket disconnects during async save.

**Fix:**

```typescript
case 'token':
  capturedToken = event.data?.token || null;
  if (capturedToken) {
    try {
      // ✅ Await the save operation
      const saved = await tokenService.saveToken(userId, capturedToken);
      socket.send(JSON.stringify({
        type: ChatEvent.CLAUDE_SETUP_TOKEN_CAPTURED,
        data: { saved },
      }));
      socket.send(JSON.stringify({
        type: ChatEvent.CLAUDE_SETUP_COMPLETE,
        data: { success: true },
      }));
    } catch (saveError) {
      socket.send(JSON.stringify({
        type: ChatEvent.CLAUDE_SETUP_ERROR,
        data: {
          error: 'Failed to save token. Please try again.',
          canRetry: true,
        },
      }));
    }
  }
  break;
```

### 6. Frontend: Missing userId Prop

**Problem:** `userId` is used but not defined in the component.

**Fix:**

```tsx
interface ClaudeSetupWizardProps {
  userId: string; // ✅ Add required prop
  onComplete: () => void;
}

export function ClaudeSetupWizard({
  userId,
  onComplete,
}: ClaudeSetupWizardProps) {
  // ... rest of implementation

  const startSetup = () => {
    // Now userId is defined
    const ws = new WebSocket(
      `wss://${window.location.host}/claude-setup/ws/${userId}`,
    );
    // ...
  };
}

// Usage:
<ClaudeSetupWizard userId={currentUser.id} onComplete={handleComplete} />;
```

### 7. Claude CLI Availability Check

**Add pre-flight check:**

```typescript
async function checkClaudeCLIAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("which", ["claude"]);
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

// Before starting setup:
const cliAvailable = await checkClaudeCLIAvailable();
if (!cliAvailable) {
  socket.send(
    JSON.stringify({
      type: ChatEvent.CLAUDE_SETUP_ERROR,
      data: {
        error: "Claude CLI is not available. Please use manual token entry.",
        canRetry: false,
      },
    }),
  );
  return;
}
```

### 8. Pop-up Blocker Handling

```tsx
const openOAuthUrl = () => {
  if (state.oauthUrl) {
    const newWindow = window.open(
      state.oauthUrl,
      "_blank",
      "noopener,noreferrer",
    );

    // Check if blocked
    if (
      !newWindow ||
      newWindow.closed ||
      typeof newWindow.closed === "undefined"
    ) {
      setState((s) => ({
        ...s,
        error:
          "Pop-up was blocked. Please allow pop-ups for this site and try again.",
      }));
    }
  }
};
```

### 9. Token Cache Cleanup

**Add periodic cleanup to prevent memory leaks:**

```typescript
export class ClaudeTokenService {
  private tokenCache = new Map<string, { token: string; expiresAt: number }>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(supabase: SupabaseClient<Database>, logger: SystemLogger) {
    this.supabase = supabase;
    this.logger = logger.child({ service: "ClaudeTokenService" });

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [userId, entry] of this.tokenCache.entries()) {
        if (entry.expiresAt < now) {
          this.tokenCache.delete(userId);
        }
      }
    }, 60000);
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.tokenCache.clear();
  }
}
```

---

## UI Integration: Reusing ClaudeCodePanel

**Good news:** The existing `ClaudeCodePanel` and `ClaudeCodePanelUI` components can be reused for Claude Code CLI output with minimal modifications.

### Key Components Analyzed

| Component                   | Purpose                                    | Lines  |
| --------------------------- | ------------------------------------------ | ------ |
| `InternalPrototypePage.tsx` | Central orchestrator, WebSocket management | ~1,200 |
| `ClaudeCodePanel.tsx`       | Message processing, handler registry       | ~2,270 |
| `ClaudeCodePanelUI.tsx`     | Message rendering                          | ~1,043 |
| `Terminal.tsx`              | xterm.js terminal (for setup-token only)   | ~352   |

### CLI JSON → Existing Message Type Mapping

The CLI's `--output-format stream-json` produces JSON lines that map directly to existing message handlers:

| CLI JSON Event Type        | Maps To         | Rendered By                  |
| -------------------------- | --------------- | ---------------------------- |
| `assistant` (text content) | `AGENT_MESSAGE` | `AssistantMessage` component |
| `tool_use`                 | `TOOL_START`    | `ToolCallMessage` component  |
| `tool_result`              | `TOOL_COMPLETE` | `ToolCallMessage` component  |
| `result` (final)           | `RESULT`        | `ResultMessage` component    |
| `system`                   | `STATUS`        | Status indicator             |
| `error`                    | `ERROR`         | Error alert component        |

### Message Handler Registry (Already Extensible)

`ClaudeCodePanel.tsx` already uses a handler registry pattern:

```typescript
// Existing pattern in ClaudeCodePanel.tsx
const messageHandlers: Record<string, (message: any) => void> = {
  [ChatEvent.AGENT_MESSAGE]: handleAgentMessage,
  [ChatEvent.TOOL_START]: handleToolStart,
  [ChatEvent.TOOL_COMPLETE]: handleToolComplete,
  // ... etc
};

// Messages are routed through:
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const handler = messageHandlers[message.type];
  if (handler) handler(message);
};
```

**No changes needed** - the CLI handler on the backend transforms CLI output to these existing event types.

### Backend Transformer: CLI JSON → WebSocket Messages

The `claude-code-cli-query-handler.ts` transforms CLI output to match existing frontend expectations:

```typescript
// In handleCliMessage method
private handleCliMessage(
  socket: WebSocket,
  cliMessage: ClaudeCodeMessage,
  sendMessage: (socket: WebSocket, message: ChatServerMessage) => void,
): void {
  // Transform CLI message to match existing frontend message types
  switch (cliMessage.type) {
    case 'assistant':
      // Extract text from content blocks
      const text = cliMessage.message?.content
        ?.filter(c => c.type === 'text')
        .map(c => c.text)
        .join('') || '';

      sendMessage(socket, {
        type: ChatEvent.AGENT_MESSAGE,
        data: {
          role: 'assistant',
          content: text,
          // Include any tool use blocks
          toolCalls: cliMessage.message?.content?.filter(c => c.type === 'tool_use'),
        },
      });
      break;

    case 'result':
      sendMessage(socket, {
        type: ChatEvent.RESULT,
        data: {
          sessionId: cliMessage.session_id,
          usage: cliMessage.usage,
          cost: cliMessage.total_cost_usd,
        },
      });
      break;

    case 'system':
      sendMessage(socket, {
        type: ChatEvent.STATUS,
        data: {
          subtype: cliMessage.subtype,
          message: cliMessage.message,
        },
      });
      break;

    case 'error':
      sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: cliMessage.message?.content?.[0]?.text || 'Unknown error',
        },
      });
      break;

    default:
      // Pass through unknown types for debugging
      sendMessage(socket, {
        type: ChatEvent.AGENT_MESSAGE,
        data: cliMessage,
      });
  }
}
```

### CLI Tool Call Format → Existing ToolCallMessage

The CLI outputs tool calls in this format:

```json
{
  "type": "assistant",
  "message": {
    "content": [
      { "type": "text", "text": "Let me edit the file..." },
      { "type": "tool_use", "id": "toolu_123", "name": "Edit", "input": {...} }
    ]
  }
}
```

This maps to the existing `ToolCallMessage` component which already handles:

- Tool name display
- Expandable input parameters
- Status indicators (pending, running, complete)
- Result display

### Minimal Frontend Changes Required

1. **No changes to ClaudeCodePanelUI.tsx** - All message types already supported
2. **No changes to AssistantMessage component** - Already handles markdown content
3. **No changes to ToolCallMessage component** - Already displays tool calls

**Optional enhancements:**

- Add subscription status indicator (show "Using your Claude Pro subscription" vs "Using API")
- Add cost tracking display if user wants to see usage

### Terminal.tsx Usage

`Terminal.tsx` (xterm.js-based) is a **separate component** only needed for:

- The `claude setup-token` flow (displays raw terminal output for OAuth URL)
- NOT needed for regular chat - messages go through ClaudeCodePanel

### Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    InternalPrototypePage.tsx                            │
│                                                                         │
│  ┌─────────────────┐     WebSocket      ┌─────────────────────────────┐│
│  │                 │ ◄───────────────── │                             ││
│  │ ClaudeCodePanel │   (same format)    │  Build Worker (Fargate)     ││
│  │                 │                    │                             ││
│  │ ┌─────────────┐ │                    │  ┌───────────────────────┐  ││
│  │ │ Handler     │ │                    │  │ claude-code-cli-      │  ││
│  │ │ Registry    │ │                    │  │ query-handler.ts      │  ││
│  │ │             │ │                    │  │                       │  ││
│  │ │ AGENT_MSG ──┼─┼──────────────────┐ │  │ CLI JSON → ChatEvent  │  ││
│  │ │ TOOL_START ─┼─┼─────────────────┐│ │  │                       │  ││
│  │ │ TOOL_DONE ──┼─┼────────────────┐││ │  └───────────────────────┘  ││
│  │ │ RESULT ─────┼─┼───────────────┐│││ │            ▲                ││
│  │ └─────────────┘ │               ││││ │            │                ││
│  │                 │               ││││ │  ┌─────────┴─────────────┐  ││
│  └─────────────────┘               ││││ │  │ claude CLI process    │  ││
│           │                        ││││ │  │ --output-format       │  ││
│           ▼                        ││││ │  │   stream-json         │  ││
│  ┌────────────────────────────┐    ││││ │  └───────────────────────┘  ││
│  │    ClaudeCodePanelUI       │◄───┘│││ │                             ││
│  │                            │◄────┘││ └─────────────────────────────┘│
│  │  ┌──────────────────────┐  │◄─────┘│                                │
│  │  │ AssistantMessage     │  │◄──────┘                                │
│  │  │ ToolCallMessage      │  │                                        │
│  │  │ ResultMessage        │  │                                        │
│  │  └──────────────────────┘  │                                        │
│  └────────────────────────────┘                                        │
│                                                                         │
│  ┌────────────────────────────┐                                        │
│  │    Terminal.tsx            │  ◄── Only for setup-token flow         │
│  │    (xterm.js)              │                                        │
│  └────────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Integration Checklist

- [x] CLI JSON output format analyzed
- [x] Existing message types identified
- [x] Handler registry pattern confirmed
- [x] No frontend changes required for basic functionality
- [ ] Backend transformer implemented in `claude-code-cli-query-handler.ts`
- [ ] Test with real CLI output to verify mapping
- [ ] Add subscription status indicator (optional)

---

## Hooks: Matching chat-query-handler.ts Behavior

The existing `chat-query-handler.ts` uses SDK hooks for important functionality. We need equivalent behavior in the CLI handler.

### Current SDK Hooks in chat-query-handler.ts

| Hook            | Purpose                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| **PreToolUse**  | Evaluate permissions, deny tools, update inputs, send `TOOL_START` event, persist to DB |
| **PostToolUse** | Track file modifications, send `TOOL_COMPLETE` event, persist to DB                     |

### Two Approaches for CLI Hooks

**Option A: Parse CLI Stream (Recommended)**

- CLI's `--output-format stream-json` includes tool events in output
- Parse these events and call our hook logic directly
- No external dependencies, all in-process

**Option B: File-Based Hooks**

- Configure hooks in `.claude/settings.json`
- CLI executes shell scripts that communicate back via IPC/HTTP
- More complex, more moving parts

**Recommendation: Option A** - The CLI stream already contains all the information we need.

### CLI Stream Events for Tool Calls

The CLI outputs these event types for tool operations:

```json
// Tool start (within assistant message)
{
  "type": "assistant",
  "message": {
    "content": [
      { "type": "text", "text": "Let me edit..." },
      { "type": "tool_use", "id": "toolu_123", "name": "Edit", "input": {...} }
    ]
  }
}

// Tool result
{
  "type": "tool_result",
  "tool_use_id": "toolu_123",
  "content": "File edited successfully"
}
```

### Hook Implementation in claude-code-cli-query-handler.ts

```typescript
import {
  ToolPermissionService,
  ToolName,
  ToolInput,
} from "../permissions/tool-permission-service.js";

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultEvent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface SessionState {
  modifiedFilesThisQuery: Set<string>;
  pendingToolCalls: Map<string, ToolUseBlock>;
}

export class ClaudeCodeCliQueryHandler {
  private readonly toolPermissionService: ToolPermissionService;
  private sessionState: SessionState;

  constructor(
    workDir: string,
    logger: SystemLogger,
    tokenService: ClaudeTokenService,
    getApiKey: () => string | null,
    toolPermissionService: ToolPermissionService,
  ) {
    this.workDir = workDir;
    this.logger = logger.child({ service: "ClaudeCodeCliQueryHandler" });
    this.tokenService = tokenService;
    this.getApiKey = getApiKey;
    this.toolPermissionService = toolPermissionService;
    this.sessionState = {
      modifiedFilesThisQuery: new Set(),
      pendingToolCalls: new Map(),
    };
  }

  /**
   * Handle CLI message - equivalent to SDK hooks
   */
  private handleCliMessage(
    socket: WebSocket,
    cliMessage: ClaudeCodeMessage,
    sendMessage: (socket: WebSocket, message: ChatServerMessage) => void,
    handlers: MessageHandlers,
  ): void {
    switch (cliMessage.type) {
      case "assistant":
        this.handleAssistantMessage(socket, cliMessage, sendMessage, handlers);
        break;

      case "tool_result":
        this.handleToolResult(
          socket,
          cliMessage as ToolResultEvent,
          sendMessage,
          handlers,
        );
        break;

      case "result":
        this.handleQueryComplete(socket, cliMessage, sendMessage);
        break;

      default:
        // Pass through other message types
        sendMessage(socket, {
          type: ChatEvent.AGENT_MESSAGE,
          data: cliMessage,
        });
    }
  }

  /**
   * Handle assistant message - extract tool calls and apply PreToolUse logic
   */
  private async handleAssistantMessage(
    socket: WebSocket,
    message: ClaudeCodeMessage,
    sendMessage: (socket: WebSocket, message: ChatServerMessage) => void,
    handlers: MessageHandlers,
  ): Promise<void> {
    const content = message.message?.content || [];

    // Process text content
    const textParts = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text);

    if (textParts.length > 0) {
      const text = textParts.join("");
      sendMessage(socket, {
        type: ChatEvent.AGENT_MESSAGE,
        data: { role: "assistant", content: text },
      });

      // Persist text to database
      await handlers.persistMessage("assistant", text, "text");
    }

    // Process tool calls - apply PreToolUse hook logic
    const toolUses = content.filter(
      (c): c is ToolUseBlock => c.type === "tool_use",
    );

    for (const toolUse of toolUses) {
      await this.handlePreToolUse(socket, toolUse, sendMessage, handlers);
    }
  }

  /**
   * PreToolUse hook equivalent - runs before tool execution
   */
  private async handlePreToolUse(
    socket: WebSocket,
    toolUse: ToolUseBlock,
    sendMessage: (socket: WebSocket, message: ChatServerMessage) => void,
    handlers: MessageHandlers,
  ): Promise<void> {
    const { id: toolUseId, name: toolName, input: toolInput } = toolUse;

    this.logger.debug(`PreToolUse: ${toolName}`, { toolUseId, toolInput });

    // 1. Evaluate tool permission (same as SDK hook)
    const permission = this.toolPermissionService.evaluateToolPermission(
      toolName as ToolName,
      toolInput as ToolInput,
    );

    if (permission.behavior === "deny") {
      const message = permission.message ?? "Tool denied by policy";
      this.logger.warn(`Tool denied: ${toolName}`, { message });

      // Send denial to WebSocket
      sendMessage(socket, {
        type: ChatEvent.TOOL_DENIED,
        data: {
          tool_name: toolName,
          tool_call_id: toolUseId,
          reason: message,
        },
      });

      // Note: CLI doesn't support blocking tool calls mid-execution
      // This is a monitoring/notification only in CLI mode
      return;
    }

    // 2. Normalize tool input (apply any updates from permission service)
    const normalizedInput = permission.updatedInput ?? toolInput;

    // 3. Track pending tool call
    this.sessionState.pendingToolCalls.set(toolUseId, {
      ...toolUse,
      input: normalizedInput as Record<string, unknown>,
    });

    // 4. Send TOOL_START event to WebSocket (same as SDK hook)
    sendMessage(socket, {
      type: ChatEvent.TOOL_START,
      data: {
        tool_name: toolName,
        tool_input: normalizedInput,
        tool_call_id: toolUseId,
      },
    });

    // 5. Persist tool start to database (same as SDK hook)
    const displayName = getToolDisplayName(
      toolName,
      normalizedInput as ToolInput,
    );
    await handlers.persistMessage(
      "assistant",
      displayName,
      "tool_use",
      "tool_start",
      {
        tool_name: toolName,
        tool_input: normalizedInput,
        tool_call_id: toolUseId,
      },
    );
  }

  /**
   * PostToolUse hook equivalent - runs after tool execution
   */
  private async handleToolResult(
    socket: WebSocket,
    result: ToolResultEvent,
    sendMessage: (socket: WebSocket, message: ChatServerMessage) => void,
    handlers: MessageHandlers,
  ): Promise<void> {
    const { tool_use_id: toolUseId, content, is_error: isError } = result;

    // Get the original tool call
    const toolUse = this.sessionState.pendingToolCalls.get(toolUseId);
    if (!toolUse) {
      this.logger.warn("Tool result for unknown tool call", { toolUseId });
      return;
    }

    const { name: toolName, input: toolInput } = toolUse;

    this.logger.debug(`PostToolUse: ${toolName}`, { toolUseId, isError });

    // 1. Track file modifications (same as SDK hook)
    const fileModifyingTools = ["Write", "Edit", "NotebookEdit", "SafeWrite"];
    if (fileModifyingTools.includes(toolName)) {
      const filePath =
        (toolInput as { file_path?: string; notebook_path?: string })
          .file_path || (toolInput as { notebook_path?: string }).notebook_path;

      if (filePath) {
        const relativePath = this.getRelativePath(filePath);
        this.sessionState.modifiedFilesThisQuery.add(relativePath);
        this.logger.debug("File modified", { relativePath });
      }
    }

    // 2. Send TOOL_COMPLETE event to WebSocket (same as SDK hook)
    sendMessage(socket, {
      type: ChatEvent.TOOL_COMPLETE,
      data: {
        tool_name: toolName,
        tool_input: toolInput,
        tool_response: content,
        tool_call_id: toolUseId,
        is_error: isError,
      },
    });

    // 3. Persist tool completion to database (same as SDK hook)
    await handlers.persistMessage(
      "assistant",
      `Tool completed: ${toolName}`,
      "tool_result",
      "tool_complete",
      {
        tool_name: toolName,
        tool_input: toolInput,
        tool_response: content,
        tool_call_id: toolUseId,
        is_error: isError,
      },
    );

    // 4. Clean up pending tool call
    this.sessionState.pendingToolCalls.delete(toolUseId);
  }

  /**
   * Handle query completion - report modified files
   */
  private handleQueryComplete(
    socket: WebSocket,
    message: ClaudeCodeMessage,
    sendMessage: (socket: WebSocket, message: ChatServerMessage) => void,
  ): void {
    const modifiedFiles = Array.from(this.sessionState.modifiedFilesThisQuery);

    sendMessage(socket, {
      type: ChatEvent.QUERY_COMPLETE,
      data: {
        sessionId: message.session_id,
        usage: message.usage,
        cost: message.total_cost_usd,
        modifiedFiles,
      },
    });

    // Reset session state for next query
    this.sessionState.modifiedFilesThisQuery.clear();
    this.sessionState.pendingToolCalls.clear();
  }

  private getRelativePath(absolutePath: string): string {
    if (absolutePath.startsWith(this.workDir)) {
      return absolutePath.slice(this.workDir.length).replace(/^\//, "");
    }
    return absolutePath;
  }
}
```

### Hook Feature Comparison: SDK vs CLI

| Feature                              | SDK (chat-query-handler) | CLI (claude-code-cli-query-handler)       |
| ------------------------------------ | ------------------------ | ----------------------------------------- |
| **PreToolUse: Evaluate Permissions** | ✅ Can deny/allow        | ⚠️ Monitor only (CLI executes regardless) |
| **PreToolUse: Update Inputs**        | ✅ Can modify inputs     | ❌ Not possible (CLI already has inputs)  |
| **PreToolUse: Send TOOL_START**      | ✅                       | ✅ Parse from stream                      |
| **PreToolUse: Persist to DB**        | ✅                       | ✅                                        |
| **PostToolUse: Track Files**         | ✅                       | ✅ Parse from stream                      |
| **PostToolUse: Send TOOL_COMPLETE**  | ✅                       | ✅ Parse from stream                      |
| **PostToolUse: Persist to DB**       | ✅                       | ✅                                        |

### Important Limitation: CLI Cannot Block Tools

Unlike the SDK, **the CLI cannot be stopped mid-execution**. When we detect a tool call in the stream, the CLI has already executed it. Our PreToolUse hook equivalent can:

- ✅ Log the tool call
- ✅ Send events to WebSocket
- ✅ Persist to database
- ❌ **Cannot block or modify the tool call**

**Workaround: Use `.claude/settings.json` for critical blocking**

If you need to actually block tools (e.g., prevent writes outside project dir), configure file-based hooks:

```json
// .claude/settings.json in the project directory
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "/app/hooks/validate-file-write.sh"
          }
        ]
      }
    ]
  }
}
```

**validate-file-write.sh:**

```bash
#!/bin/bash
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // ""')

# Block writes outside /tmp/materialize-dev-server
if [[ ! "$file_path" =~ ^/tmp/materialize-dev-server ]]; then
  echo '{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"Write outside allowed directory"}}'
  exit 0
fi

# Allow
exit 0
```

### Full Hooks Configuration for CLI Mode

**File: `.claude/settings.json` (deployed to Fargate)**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|NotebookEdit|SafeWrite",
        "hooks": [
          {
            "type": "command",
            "command": "/app/hooks/validate-file-write.sh"
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/app/hooks/validate-bash-command.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "/app/hooks/post-file-write.sh"
          }
        ]
      }
    ]
  },
  "permissions": {
    "allow": ["Read", "Glob", "Grep", "LS"],
    "deny": ["mcp__*"]
  }
}
```

### Deploying Hook Scripts to Fargate

Add to Dockerfile:

```dockerfile
# Copy hook scripts
COPY hooks/ /app/hooks/
RUN chmod +x /app/hooks/*.sh
```

**Hook script structure:**

```
server/build-workers/
├── hooks/
│   ├── validate-file-write.sh
│   ├── validate-bash-command.sh
│   └── post-file-write.sh
└── ...
```

### Hooks Implementation Checklist

- [ ] Implement stream parsing for tool_use blocks in CLI output
- [ ] Implement handlePreToolUse for TOOL_START events and DB persistence
- [ ] Implement handleToolResult for TOOL_COMPLETE events and file tracking
- [ ] Add ToolPermissionService integration (monitoring mode)
- [ ] Create `.claude/settings.json` template for file-based blocking hooks
- [ ] Create hook shell scripts for critical security checks
- [ ] Update Dockerfile to include hooks directory
- [ ] Test hook execution in headless mode
- [ ] Document hook configuration in README

---

## Testing Strategy (Required)

Before deployment, implement these test suites:

```typescript
describe("Claude Token Service", () => {
  describe("Token Validation", () => {
    it("should reject tokens that are too short");
    it("should reject tokens with whitespace");
    it("should accept valid token formats");
  });

  describe("Token Storage", () => {
    it("should save token to database");
    it("should retrieve token from database");
    it("should cache tokens briefly");
    it("should mark invalid tokens");
  });
});

describe("Setup Token Parser", () => {
  it("should extract OAuth URL from CLI output");
  it('should detect "Paste code here" prompt');
  it("should capture token from success output");
  it("should handle malformed output without crashing");
  it("should not match partial URLs");
});

describe("WebSocket Setup Flow", () => {
  it("should reject unauthenticated connections");
  it("should reject connections for other users");
  it("should handle concurrent setup sessions");
  it("should timeout after 5 minutes");
  it("should cleanup on disconnect");
});

describe("Security", () => {
  it("should sanitize authorization codes");
  it("should not log tokens");
  it("should rate limit setup attempts");
});
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

### Phase 2: Build Worker - Token Service

**File: `server/build-workers/services/auth/claude-token-service.ts`**

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import { Database } from "../../types/supabase.js";

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
    this.logger = logger.child({ service: "ClaudeTokenService" });
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
        .from("user_claude_tokens")
        .select("oauth_token, is_valid")
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        this.logger.debug("No Claude token found for user", { userId });
        return null;
      }

      if (!data.is_valid) {
        this.logger.debug("User Claude token is marked invalid", { userId });
        return null;
      }

      // Cache the token
      this.tokenCache.set(userId, {
        token: data.oauth_token,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      // Update last_used_at (fire and forget)
      void this.supabase
        .from("user_claude_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("user_id", userId);

      return data.oauth_token;
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Failed to fetch user Claude token",
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
        .from("user_claude_tokens")
        .update({
          is_valid: false,
          validation_error: error,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      this.logger.info("Marked user Claude token as invalid", {
        userId,
        error,
      });
    } catch (err) {
      this.logger.error(
        err instanceof Error ? err : new Error(String(err)),
        "Failed to mark token as invalid",
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

### Phase 3: CLI Query Handler

**File: `server/build-workers/services/chat/claude-code-cli-query-handler.ts`**

```typescript
import { spawn, ChildProcess } from "child_process";
import WebSocket from "ws";
import { SystemLogger } from "../../loggers/SystemLogger.js";
import {
  ChatEvent,
  ChatQueryData,
  ChatServerMessage,
} from "../../types/ChatTypes.js";
import { ClaudeTokenService } from "../auth/claude-token-service.js";

interface ClaudeCodeMessage {
  type: "system" | "assistant" | "user" | "result" | "error";
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
    this.logger = logger.child({ service: "ClaudeCodeCliQueryHandler" });
    this.tokenService = tokenService;
    this.getApiKey = getApiKey;
  }

  async handleQuery(context: QueryContext): Promise<void> {
    const { socket, data, prototypeId, userId, sendMessage } = context;

    const prompt = this.extractPrompt(data);
    if (!prompt) {
      sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: { message: "No prompt provided" },
      });
      return;
    }

    // Build environment with auth - USER TOKEN FIRST, API KEY FALLBACK
    const { env, authMethod } = await this.buildAuthEnvironment(userId);
    const args = this.buildCliArgs(prompt, data);

    this.logger.info("Starting Claude Code CLI process", {
      prototypeId,
      userId,
      authMethod, // 'user_token' or 'api_key'
      argsCount: args.length,
    });

    // Notify client which auth method is being used
    sendMessage(socket, {
      type: ChatEvent.SYSTEM,
      subtype: "auth_info",
      data: {
        authMethod,
        usingSubscription: authMethod === "user_token",
      },
    });

    try {
      await this.executeCliProcess(context, args, env, authMethod);
    } catch (error) {
      // If using user token and it fails with auth error, mark token invalid
      if (authMethod === "user_token" && this.isAuthError(error)) {
        await this.tokenService.markTokenInvalid(
          userId,
          error instanceof Error ? error.message : String(error),
        );

        // Notify user their token is invalid
        sendMessage(socket, {
          type: ChatEvent.ERROR,
          error: {
            message: "Your Claude subscription token has expired or is invalid",
            details: "Please reconnect your subscription in Settings",
            code: "TOKEN_INVALID",
          },
        });
        return;
      }

      this.logger.error(
        error instanceof Error ? error : new Error(String(error)),
        "Claude Code CLI execution failed",
        { prototypeId, authMethod },
      );

      sendMessage(socket, {
        type: ChatEvent.ERROR,
        error: {
          message: "CLI execution failed",
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
    authMethod: "user_token" | "api_key";
  }> {
    const baseEnv = { ...process.env };

    // 1. Try user's OAuth token first (from their subscription)
    const userToken = await this.tokenService.getUserToken(userId);
    if (userToken) {
      this.logger.debug("Using user OAuth token for authentication", {
        userId,
      });
      return {
        env: {
          ...baseEnv,
          CLAUDE_CODE_OAUTH_TOKEN: userToken,
          // Explicitly unset API key when using OAuth token
          ANTHROPIC_API_KEY: undefined,
        },
        authMethod: "user_token",
      };
    }

    // 2. Fall back to API key
    const apiKey = this.getApiKey();
    if (apiKey) {
      this.logger.debug("Falling back to API key (no user token)", { userId });
      return {
        env: {
          ...baseEnv,
          ANTHROPIC_API_KEY: apiKey,
          // Explicitly unset OAuth token when using API key
          CLAUDE_CODE_OAUTH_TOKEN: undefined,
        },
        authMethod: "api_key",
      };
    }

    // 3. No authentication available
    throw new Error(
      "No authentication available - user has no token and no API key configured",
    );
  }

  private buildCliArgs(prompt: string, data: ChatQueryData): string[] {
    const args = ["-p", prompt, "--output-format", "stream-json"];

    if (data.options?.model) {
      args.push("--model", String(data.options.model));
    }

    if (data.options?.maxTurns) {
      args.push("--max-turns", String(data.options.maxTurns));
    }

    return args;
  }

  private extractPrompt(data: ChatQueryData): string | null {
    if (data.prompt) return data.prompt;
    if (Array.isArray(data.content)) {
      return data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text || "")
        .join("\n");
    }
    return null;
  }

  private executeCliProcess(
    context: QueryContext,
    args: string[],
    env: NodeJS.ProcessEnv,
    authMethod: "user_token" | "api_key",
  ): Promise<void> {
    const { socket, sendMessage } = context;

    return new Promise((resolve, reject) => {
      this.activeProcess = spawn("claude", args, {
        env,
        cwd: this.workDir,
        shell: false,
      });

      let buffer = "";
      let hasAuthError = false;

      this.activeProcess.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line) as ClaudeCodeMessage;
              this.handleCliMessage(socket, message, sendMessage);
            } catch {
              this.logger.warn("Failed to parse CLI output line", { line });
            }
          }
        }
      });

      this.activeProcess.stderr?.on("data", (chunk: Buffer) => {
        const output = chunk.toString();
        this.logger.warn("Claude CLI stderr", { output });

        // Detect auth errors
        if (
          output.includes("Invalid API key") ||
          output.includes("OAuth") ||
          output.includes("authentication") ||
          output.includes("unauthorized")
        ) {
          hasAuthError = true;
        }
      });

      this.activeProcess.on("error", (error) => {
        this.activeProcess = null;
        reject(error);
      });

      this.activeProcess.on("close", (code) => {
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
    if (error && typeof error === "object" && "isAuthError" in error) {
      return (error as { isAuthError: boolean }).isAuthError;
    }
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("Invalid API key") ||
      message.includes("OAuth") ||
      message.includes("authentication") ||
      message.includes("unauthorized")
    );
  }

  abort(): void {
    if (this.activeProcess) {
      this.activeProcess.kill("SIGTERM");
      this.activeProcess = null;
    }
  }
}
```

---

### Phase 4: Frontend Components

**Token Connection UI in Settings:**

```tsx
// web-application/src/components/settings/ClaudeSubscriptionConnect.tsx

import { useState } from "react";
import { useSupabase } from "@/hooks/useSupabase";

export function ClaudeSubscriptionConnect() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<
    "disconnected" | "connected" | "loading"
  >("disconnected");
  const [error, setError] = useState<string | null>(null);
  const { supabase } = useSupabase();

  const handleConnect = async () => {
    if (!token.trim()) {
      setError("Please enter your token");
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/user/claude-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oauth_token: token }),
      });

      if (!response.ok) {
        throw new Error("Failed to save token");
      }

      setStatus("connected");
      setToken(""); // Clear for security
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setStatus("disconnected");
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="font-semibold mb-2">Connect Claude Subscription</h3>

      <p className="text-sm text-gray-600 mb-4">
        Use your own Claude Pro/Max subscription for unlimited usage. This is
        optional - we'll use our API if you don't connect.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            How to get your token:
          </label>
          <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
            <li>Open your terminal</li>
            <li>
              Run: <code className="bg-gray-100 px-1">claude setup-token</code>
            </li>
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

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          onClick={handleConnect}
          disabled={status === "loading"}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {status === "loading" ? "Connecting..." : "Connect Subscription"}
        </button>

        {status === "connected" && (
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
    !token.includes(" ") &&
    !token.includes("\n")
  );
}
```

---

## Monitoring & Analytics

### Metrics to Track

```typescript
// Log authentication method usage
this.logger.metric("claude_cli_auth", {
  userId,
  prototypeId,
  authMethod: "user_token" | "api_key",
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

### Phase 1: Database & Core Services (Week 1)

- [ ] Create database migration for `user_claude_tokens` table
- [ ] Implement `ClaudeTokenService` in build-workers (direct Supabase access)
- [ ] Implement basic `ClaudeCodeCliQueryHandler`

### Phase 2: Manual Token Entry (Week 2)

- [ ] Build manual token connection UI in Settings
- [ ] Add token status indicator in chat interface
- [ ] Show which auth method is being used
- [ ] Test end-to-end with manually provided tokens

### Phase 3: In-App Setup Flow (Week 3)

- [ ] Implement `SetupTokenStreamParser` for terminal output parsing
- [ ] Add setup-token methods to `TerminalService`
- [ ] Create WebSocket endpoint for setup flow
- [ ] Build `ClaudeSetupWizard` frontend component
- [ ] Add rate limiting and session timeout handling

### Phase 4: Polish & Error Handling (Week 4)

- [ ] Add error recovery with API key fallback
- [ ] Implement token expiration detection and refresh notifications
- [ ] Add analytics/monitoring for auth method usage
- [ ] User documentation and help tooltips
- [ ] E2E testing of all flows

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
