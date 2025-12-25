# Chat Engine Shared Responsibilities

This document captures the cross-cutting responsibilities that every `ChatEngine` must support. Centralizing them inside `ChatService` lets each engine focus on provider-specific logic.

## Interface baseline

- `server/build-workers/services/chat/chat-engines/chat-engine.ts` defines `ChatEngine`, `ChatEngineContext`, and `ChatEngineSessionState`. Every query handler should implement this minimal contract so that `ChatService` can wire common orchestration before/after delegating to a concrete engine, and the context now carries the active `prototypeChatSessionId` so engines can call shared persistence utilities directly.

## Candidates for centralization inside `ChatService`

- **Orchestration lifecycle notifications** – Both engines call `notifyOrchestrationStartChat` before work begins and `notifyOrchestrationEndChat` afterward (`chat-query-handler.ts:469-536`, `claude-code-cli-query-handler.ts:104-254`). ChatService can own this lifecycle (and dev-server invalidation) by wrapping `ChatEngine.handleQuery`, ensuring the control plane is always notified even if an engine throws.

- **Request validation and error surfacing** – SDK handler validates the payload structure (`chat-query-handler.ts:541-565`) and CLI handler raises on missing prompt/content (`claude-code-cli-query-handler.ts:146-189`). A ChatService-level validator could guarantee a consistent error surface before any engine runs.

- **Authentication + Supabase client wiring** – SDK handler refreshes the Supabase client with the user JWT (`chat-query-handler.ts:566-613`) and CLI mode rebuilds an authenticated client plus Claude token service (`claude-code-cli-query-handler.ts:120-175`). ChatService can refresh clients once per request and pass the hydrated services to the engines.

- **Paywall / entitlement checks** – Credits and plan limits are enforced in SDK mode via `performCreditCheck` (`chat-query-handler.ts:749-818`), whereas CLI mode enforces Claude subscription ownership through `buildAuthEnvironment` (`claude-code-cli-query-handler.ts:263-312`). Consolidating a paywall gate in ChatService would let engines trust that billing requirements are satisfied.

- **Session lifecycle + persistence** – SDK mode normalizes session IDs, caches “first message” state, and persists metadata (`chat-query-handler.ts:614-848`, `chat-query-handler.ts:1280-1398`). CLI mode mirrors this inside `handleSystemInitMessage`/`persistSessionToDatabase` (`claude-code-cli-query-handler.ts:713-820`). ChatService can own prototype chat session management so engines only care about provider-level session IDs.

- **Design system loading & prompt augmentation** – Both engines fetch `design_systems` records and append the resulting rules to the system prompt (`chat-query-handler.ts:657-748`, `claude-code-cli-query-handler.ts:289-358`). ChatService can precompute the prompt append + metadata and include it inside the context it passes to each engine.

- **User request persistence + attachment handling** – SDK handler persists the user query (plus images) before execution (`chat-query-handler.ts:1280-1398`). CLI mode will need the same behavior. ChatService could capture the user event (regardless of engine) so downstream analytics stay consistent.

- **Assistant message persistence + tool telemetry** – SDK mode streams assistant output and records tool usage (`chat-query-handler.ts:1635-1907`), while CLI mode mirrors this in `handleAssistantMessage`, `handlePreToolUse`, and `handleToolResult` (`claude-code-cli-query-handler.ts:536-711`). ChatService can offer helper utilities (e.g., `recordAssistantChunk`, `recordToolEvent`) so each engine only forwards raw provider payloads.

- **Tool permission enforcement** – Both engines defer to `ToolPermissionService` prior to executing filesystem/Bash actions (`chat-query-handler.ts:1514-1722`, `claude-code-cli-query-handler.ts:576-642`). ChatService could vet tool calls centrally (or expose a shared helper) to avoid duplication and keep policies consistent.

- **Post-run bookkeeping (file sync, usage, credits)** – SDK mode synchronizes filesystem changes, emits modified file lists, and records API usage/credits (`chat-query-handler.ts:2165-2336`). CLI mode will need the same sequence once feature-complete. ChatService can execute this stack after the engine resolves and feed results back over the socket.

- **Git commit automation** – Both engines run identical add/commit logic with shared helper methods (`chat-query-handler.ts:2058-2164`, `claude-code-cli-query-handler.ts:863-917`). Moving this into ChatService avoids duplicate shell invocations and ensures the commit message format stays aligned.

- **Path normalization helpers** – Each handler re-implements `getRelativePath` (`chat-query-handler.ts:2296-2302`, `claude-code-cli-query-handler.ts:853-861`). A single utility inside ChatService (or a shared helper module) would prevent drift in how file paths are reported to the client/UI.

Centralizing the responsibilities above will let future engines (e.g., the Claude CLI variant or other providers) plug into ChatService by simply implementing the provider-specific `handleQuery` logic and delegating the rest to shared utilities.
