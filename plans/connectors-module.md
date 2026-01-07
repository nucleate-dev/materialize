# Nucleate Connectors Module - Implementation Plan

## Overview

Enable generated app code to make AI API calls through a centralized proxy. Users can bring their own API keys (BYOK) or use platform credits.

**Supported Capabilities:** Vision/Image Analysis, Text Generation, Image Generation, Speech/Audio

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────────┐
│  Generated App (Expo/Next.js in sandbox or deployed)         │
│  fetch(`${NUCLEATE_CONNECTOR_URL}/vision/analyze`, {...})    │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  Control-Plane: ConnectorProxyService                        │
│  - Validates auth (JWT or connector token)                   │
│  - Resolves BYOK vs platform credits                         │
│  - Routes to provider (OpenAI/Anthropic/Google)              │
│  - Tracks usage, consumes credits                            │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  AI Providers: OpenAI, Anthropic, Google, ElevenLabs         │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. Database Schema

### New Tables

**`team_api_keys`** - BYOK storage (encrypted)
```sql
CREATE TABLE public.team_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'elevenlabs', 'replicate')),
  encrypted_api_key TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  display_hint TEXT,  -- "...sk-abcd"
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(team_id, provider)
);
```

**`connector_usage`** - Usage tracking
```sql
CREATE TABLE public.connector_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id),
  prototype_id UUID REFERENCES prototypes(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  connector_type TEXT NOT NULL CHECK (connector_type IN ('text', 'vision', 'image_gen', 'speech', 'audio')),
  billing_mode TEXT NOT NULL CHECK (billing_mode IN ('byok', 'platform_credits')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd NUMERIC(10,6),
  credits_consumed NUMERIC(10,4),
  is_deployed_app BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**`prototype_connector_tokens`** - Auth tokens for deployed apps
```sql
CREATE TABLE public.prototype_connector_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prototype_id UUID NOT NULL REFERENCES prototypes(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 2. API Endpoints

Base path: `/connectors/*`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/connectors/text/generate` | Chat completions (GPT, Claude, Gemini) |
| POST | `/connectors/vision/analyze` | Image analysis |
| POST | `/connectors/image/generate` | Image generation (DALL-E) |
| POST | `/connectors/speech/synthesize` | Text-to-speech |
| POST | `/connectors/audio/transcribe` | Speech-to-text (Whisper) |
| GET | `/connectors/providers` | List available providers |

### Request Format

```typescript
// Headers
{
  'Authorization': 'Bearer <jwt_or_connector_token>',
  'X-Prototype-Id': '<prototype_id>',
  'X-Team-Id': '<team_id>'
}

// Body (text generation example)
{
  provider: 'openai' | 'anthropic' | 'google',
  model: 'gpt-4o' | 'claude-3-5-sonnet-20241022' | 'gemini-1.5-pro',
  messages: [{ role: 'user', content: 'Hello' }],
  temperature?: number,
  max_tokens?: number
}
```

### Response Format

```typescript
{
  data: T | null,
  error: { code: string, message: string } | null,
  usage?: {
    input_tokens: number,
    output_tokens: number,
    cost_usd: number,
    credits_consumed: number
  }
}
```

---

## 3. File Structure

### Control-Plane (new files)

```
server/control-plane/services/connectors/
├── ConnectorProxyService.ts      # Main service, route registration
├── handlers/
│   ├── handleTextGeneration.ts
│   ├── handleVisionAnalysis.ts
│   ├── handleImageGeneration.ts
│   ├── handleSpeechGeneration.ts
│   └── handleAudioTranscription.ts
├── providers/
│   ├── OpenAIProvider.ts
│   ├── AnthropicProvider.ts
│   ├── GoogleProvider.ts
│   └── ElevenLabsProvider.ts
└── utils/
    ├── keyEncryption.ts          # AES-256 / KMS encryption
    ├── costCalculation.ts        # Model pricing table
    └── tokenValidation.ts        # JWT + connector token auth
```

### Web Application (new files)

```
web-application/src/app/dashboard/connectors/
└── page.tsx                      # API key management page

web-application/src/components/connectors/
├── ConnectorApiKeyManager.tsx
├── ConnectorUsageChart.tsx
├── ProviderCard.tsx
└── AddApiKeyModal.tsx
```

---

## 4. Authentication Flow

### Development (Sandbox)
1. App code includes JWT from sandbox context
2. Proxy validates JWT via Supabase
3. Looks up team from prototype → checks for BYOK → falls back to platform credits

### Deployed Apps
1. Deployment generates `prototype_connector_token` (1-year expiry)
2. Token stored in deployed app's environment
3. Proxy validates token hash, uses associated team for billing

---

## 5. BYOK vs Platform Credits

```typescript
async function resolveApiKey(teamId: string, provider: string) {
  // 1. Check for BYOK
  const teamKey = await supabase
    .from('team_api_keys')
    .select('encrypted_api_key')
    .eq('team_id', teamId)
    .eq('provider', provider)
    .eq('is_active', true)
    .single();

  if (teamKey.data) {
    return { mode: 'byok', apiKey: decrypt(teamKey.data.encrypted_api_key) };
  }

  // 2. Fall back to platform key
  return { mode: 'platform_credits', apiKey: PLATFORM_KEYS[provider] };
}
```

---

## 6. Credit Integration

Reuse existing `consume_credits_teams` RPC:

```typescript
if (billingMode === 'platform_credits') {
  const credits = costUsd / 0.15;  // $0.15 = 1 credit
  await supabase.rpc('consume_credits_teams', {
    p_team_id: teamId,
    p_prototype_id: prototypeId,
    p_credits: credits,
  });
}

// Always record usage for analytics
await supabase.from('connector_usage').insert({...});
```

---

## 7. Claude Prompt Update

Add to `ClaudeCodePrompts.ts`:

```typescript
const CONNECTOR_GUIDANCE = `
When adding AI capabilities, use Nucleate Connectors:

**Text Generation:**
const response = await fetch(\`\${process.env.NUCLEATE_CONNECTOR_URL}/text/generate\`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${process.env.NUCLEATE_CONNECTOR_TOKEN}\`,
    'X-Prototype-Id': process.env.NUCLEATE_PROTOTYPE_ID,
  },
  body: JSON.stringify({
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    messages: [{ role: 'user', content: userInput }],
  }),
});

**Vision Analysis:**
body: JSON.stringify({
  provider: 'openai',
  model: 'gpt-4o',
  image: base64ImageData,
  prompt: 'Analyze this image',
})

Environment variables are auto-injected:
- NUCLEATE_CONNECTOR_URL
- NUCLEATE_CONNECTOR_TOKEN
- NUCLEATE_PROTOTYPE_ID
`;
```

---

## 8. Key Files to Modify

| File | Changes |
|------|---------|
| `server/control-plane/server.ts` | Register ConnectorProxyService |
| `server/control-plane/types/PublicAPITypes.ts` | Add connector types |
| `server/build-workers/services/chat/prompts/ClaudeCodePrompts.ts` | Add connector guidance |
| `web-application/src/app/dashboard/account/page.tsx` | Link to connectors page |

---

## 9. Token Generation Strategy

**Lazy generation on first connector use:**
1. User asks Claude to add AI features
2. Claude generates code with connector calls
3. On first request to `/connectors/*`, check if token exists for prototype
4. If not, generate token and store in `prototype_connector_tokens`
5. Return token in response header for app to cache
6. Inject `NUCLEATE_CONNECTOR_*` env vars into sandbox `.env` file

```typescript
// In ConnectorProxyService
if (!existingToken) {
  const token = await generateConnectorToken(prototypeId, teamId);
  // Write to sandbox .env via orchestration
  await notifyOrchestrationInjectEnvVars(prototypeId, {
    NUCLEATE_CONNECTOR_URL: CONNECTOR_BASE_URL,
    NUCLEATE_CONNECTOR_TOKEN: token,
    NUCLEATE_PROTOTYPE_ID: prototypeId,
  });
}
```

---

## 10. Implementation Phases

### Phase 1: Database & Core
- [ ] Create database migrations (3 tables + RLS)
- [ ] Implement key encryption utilities (AES-256)
- [ ] Create ConnectorProxyService skeleton
- [ ] Register in server.ts
- [ ] Add lazy token generation logic

### Phase 2: All Providers + Text/Vision
- [ ] OpenAI provider (GPT-4o, GPT-4o-mini)
- [ ] Anthropic provider (Claude 3.5 Sonnet, Opus, Haiku)
- [ ] Google provider (Gemini 1.5 Pro, Flash)
- [ ] Text generation handler
- [ ] Vision analysis handler
- [ ] Credit consumption integration
- [ ] Env var injection to sandbox

### Phase 3: Media Endpoints
- [ ] Image generation (DALL-E 3)
- [ ] Speech synthesis (OpenAI TTS, ElevenLabs)
- [ ] Audio transcription (Whisper)

### Phase 4: Deployed App Support
- [ ] Token included during deployment build
- [ ] Update deployment service
- [ ] Validate deployed app requests

### Phase 5: Dashboard & Integration
- [ ] API key management UI (BYOK)
- [ ] Usage statistics per provider
- [ ] Update Claude prompts with connector guidance
- [ ] End-to-end testing

---

## 11. Security Considerations

1. **Key Encryption**: AES-256-GCM locally, AWS KMS in production
2. **Never Log Keys**: Mask in all logging
3. **Validate Inputs**: Sanitize all prompts before forwarding
4. **Audit Trail**: Log all requests (without sensitive data)
5. **CORS**: Restrict to known origins
6. **Pre-validate Credits**: Check balance before making API call
