# Nucleate — Autonomous Product Creation & Growth Engine

## The Vision

**Nucleate is your product partner from ideation to creation to growth.**

It's not a coding assistant. It's not a design tool. It's not an analytics dashboard. It's the first platform that acts as a **co-founder-level partner** across the entire product lifecycle:

```
IDEATION ──────────► CREATION ──────────► GROWTH
                                            │
"What should       "Build it —             "Make it better —
 we build?          design, code,           measure, learn,
 Who's it for?      deploy"                 iterate"
 What exists?"                               │
                                             └──► loops forever
```

**Ideation:** Nucleate helps you research the market, understand competitors, synthesize user needs, and shape what to build — pulling from company context, Linear tickets, user feedback, analytics, and competitive intelligence.

**Creation:** Nucleate builds the product — design, frontend, backend, deploy — with real design quality, accessibility, and performance baked in. And it's not limited to apps: Nucleate creates slides, ad creatives, data visualizations, and images (via Nano Banana integration), so the same agent that builds your product also produces the assets around it. This is today's core strength.

**Growth:** Nucleate monitors how the product performs, identifies opportunities, generates variants, runs experiments, and continuously improves — with you approving every change.

The trust model: **Agent proposes, human approves.** Every autonomous action flows through an approval gate. The agent earns trust by being transparent about *what* it wants to do and *why*.

---

## The Autonomous Loop (End-to-End)

This is the north star. Every feature below should contribute to closing this loop:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   CONTEXT          ANALYZE          HYPOTHESIZE     │
│   (Company docs,   (Read metrics,   (Generate       │
│    brand, goals)    find issues)     variant ideas)  │
│        │               │                │           │
│        └───────┐       │       ┌────────┘           │
│                ▼       ▼       ▼                    │
│              ┌───────────────────┐                  │
│              │   AGENT PROPOSES  │                  │
│              │   (with rationale │                  │
│              │    + preview)     │                  │
│              └────────┬──────────┘                  │
│                       │                             │
│                       ▼                             │
│              ┌───────────────────┐                  │
│              │  HUMAN APPROVES   │◄── approval gate │
│              └────────┬──────────┘                  │
│                       │                             │
│                       ▼                             │
│              ┌───────────────────┐                  │
│              │     DEPLOY        │                  │
│              │  (with guardrails │                  │
│              │   + rollback)     │                  │
│              └────────┬──────────┘                  │
│                       │                             │
│                       ▼                             │
│              ┌───────────────────┐                  │
│              │    MEASURE        │──── loops back   │
│              │  (analytics,      │     to ANALYZE   │
│              │   user feedback)  │                  │
│              └───────────────────┘                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Deep Dive: Each Area

### 1. Auto-Analyze Metrics & Generate Variants

**Current state:** Zero analytics infrastructure. Usage tracking is credit-focused only.

**The vision:** Nucleate connects to your analytics, identifies underperforming pages, and proposes specific changes with reasoning.

**How it could work:**
- User connects PostHog/Amplitude/GA4 via OAuth connector
- Agent has read access to dashboards, funnels, event data
- Periodically (or on trigger), agent runs analysis:
  - "Your signup page has 67% bounce rate, above your 50% benchmark"
  - "Users on mobile spend 2.1s on the hero but only 0.3s on the CTA — it's likely below the fold"
  - "Your competitor [from company context] uses social proof above the fold, you don't"
- Agent generates 2-3 variant proposals with visual previews and rationale
- Human picks one (or says "try a different direction")
- Agent deploys the variant, measures for N days, reports back

**Key design question:** How granular should the analysis be? Page-level? Component-level? Copy-level? Probably start at page-level and let users drill down.

**What this needs from the stack:**
- Analytics connectors (#1)
- Company context for benchmarks/goals (#2)
- Deployment pipeline (#7)
- A/B framework or at minimum sequential testing (#8)
- Approval gates (#14)

---

### 2. Company Context Bucket

**Current state:** GitHub connector exists. That's it for organizational context.

**The vision:** A persistent knowledge layer per team that the agent always has access to. Think of it as the agent's "onboarding docs."

**Two types of context:**

**A) Connectors (live, syncing):**
- **Linear/Jira** — current sprint, priorities, product requirements
- **Google Docs/Notion/Confluence** — PRDs, specs, meeting notes
- **Slack** (read-only) — recent discussions, decisions, feedback
- **Figma** — source-of-truth designs, design tokens, component specs
- **Analytics tools** — funnels, metrics, user segments (overlaps with #1)
- **CRM** (Hubspot, Salesforce) — customer feedback, support tickets, feature requests

**B) Direct uploads (static or manually updated):**
- Brand guidelines (logo, colors, typography, voice & tone)
- Target audience personas
- Competitor analysis
- Product principles / design principles
- Legal/compliance constraints ("we can't say X in healthcare")

**How it's surfaced to the agent:**
- Not dumped into the system prompt (too large)
- Indexed and retrievable — agent queries it when relevant
- RAG-style: when agent is working on a signup page, it pulls "signup-related" context from the bucket
- Some documents flagged as "always relevant" (brand guidelines, design principles)

**Key design question:** How do you handle conflicts? If the brand doc says "use blue CTAs" but analytics shows green converts better, what does the agent do? Answer: surface both to the human with the data.

---

### 3. MCP — First-Party and User-Extensible

**Current state:** MCP is used internally (design tools, dev tools). External server at `mcp.nucleate.dev`. Users can't add their own.

**Two layers:**

**A) First-party MCP servers Nucleate ships:**
- Analytics MCP (PostHog, GA4, Amplitude read access)
- Project management MCP (Linear, Jira read access)
- Knowledge base MCP (Notion, Confluence, Google Docs read access)
- Design MCP (Figma read access — inspect mode, tokens, components)
- Deployment MCP (Vercel, Netlify deploy/rollback)
- Testing MCP (Lighthouse, axe-core, Playwright runners)

**B) User-extensible MCP:**
- Users provide an MCP server URL + auth
- Nucleate discovers available tools via MCP protocol
- Tools show up in the agent's toolkit automatically
- Use case: company has internal APIs, databases, or custom tooling
- Security model: MCP tools run in the sandbox, can't escape to the host

**Why this matters:** MCP is the extensibility layer that prevents Nucleate from having to build every integration. It's the app store equivalent.

---

### 4. Design Review Loops

**Current state:** GeminiDesignExpert is on-demand. No automated review. Build verification exists for code but design quality is unchecked.

**The vision:** After the agent generates/modifies UI, a review loop runs automatically:

**Review dimensions:**
- **Visual consistency:** Does this match the design system? Are spacing/sizing tokens used correctly?
- **Brand alignment:** Does this feel like the brand? (Cross-reference with company context)
- **Hierarchy & readability:** Is the information hierarchy clear? Is typography legible?
- **Responsiveness:** Does it work at all breakpoints? (agent checks mobile, tablet, desktop)
- **Interaction design:** Are hover states, transitions, loading states present?
- **Dark mode:** If the app supports it, does the new UI work in both modes?

**How it could work:**
- Agent makes UI changes
- "Design critic" sub-agent takes screenshots at multiple viewports
- Critic evaluates against design system rules + brand context
- If issues found: critic sends feedback, builder agent fixes, re-review
- If clean: proceed to human approval

**Multi-model approach:** Use a vision model (GPT-4V, Gemini Pro Vision) to actually *look* at the rendered output, not just read the code. Code can be "correct" but visually broken.

**Iteration limit:** 2-3 review cycles max, then escalate to human with the critic's notes. Don't burn tokens on infinite loops.

---

### 5. UX & Accessibility Audits

**Current state:** Nothing.

**The vision:** Automated UX and WCAG compliance checking after every significant UI change.

**Accessibility (automated):**
- WCAG 2.1 AA as baseline (configurable to AAA)
- Color contrast ratios (4.5:1 for normal text, 3:1 for large)
- Keyboard navigation: all interactive elements focusable, logical tab order
- Screen reader: semantic HTML, ARIA labels, alt text for images
- Focus management: focus traps in modals, focus restoration after close
- Motion: respect `prefers-reduced-motion`
- Touch targets: minimum 44x44px on mobile

**UX heuristics (more subjective, agent-evaluated):**
- Cognitive load: too many choices? Hick's law violations?
- Form UX: inline validation, clear error messages, logical grouping
- Navigation: is the IA intuitive? Can users find what they need?
- Loading states: skeleton screens, progress indicators, optimistic UI
- Error states: helpful error messages, recovery paths
- Empty states: what does the user see with no data?

**Implementation approach:**
- `axe-core` for automated WCAG checks (run in sandbox via Playwright)
- Lighthouse accessibility audit
- Vision model for subjective UX evaluation (screenshot + "evaluate this UI for...")
- Results formatted as actionable issues, not just pass/fail

**When to run:**
- After every UI change that touches layout or interactive elements
- As a pre-deployment gate (if accessibility score drops below threshold, block deploy)
- On-demand when user requests a full audit

---

### 6. User-Defined Subagents & Skills

**Current state:** Sub-agents are hardcoded (source-repo screen-extractor, theme-syncer, component-harvester, PR agent). Not user-extensible.

**The vision:** Users define custom agents with natural language instructions, tool access, and trigger conditions.

**What a user-defined agent looks like:**
```
Name: "Legal Review Agent"
Trigger: "Before any deploy to production"
Prompt: "Review all user-facing copy for compliance with HIPAA
         regulations. Flag any language that makes health claims,
         stores PII without disclosure, or lacks required disclaimers.
         Reference the compliance doc in our company context."
Tools: [Read files, Company context search]
Output: Approval / list of issues
```

**Another example:**
```
Name: "Performance Budget Agent"
Trigger: "After every build"
Prompt: "Run Lighthouse on the built app. If performance score
         drops below 90 or any Core Web Vital exceeds threshold,
         identify the cause and suggest a fix."
Tools: [Lighthouse MCP, Read files, SafeBash]
Output: Performance report + fix suggestions
```

**Key design decisions:**
- **Tool permissions per agent** — a legal review agent shouldn't have SafeBash access
- **Agent marketplace?** — share useful agents across teams ("Install the SEO audit agent")
- **Composability** — agents can invoke other agents? Or keep it flat?
- **Cost controls** — user-defined agents that loop infinitely would burn credits. Need token/turn limits.

**Skills vs Agents distinction:**
- **Skill** = a reusable prompt template / capability the main agent can invoke (like a function)
- **Agent** = an autonomous entity with its own trigger conditions, tools, and execution context
- Users probably want both. Skills for "do this specific thing when I ask." Agents for "watch for this condition and act."

---

### 7. Deployment & Environment Management

**Current state:** Everything runs in a Fargate sandbox with a Cloudflare tunnel. No production deployment.

**The vision:** Nucleate manages the full lifecycle: dev -> staging -> production.

**Near-term (most impactful):**
- **One-click deploy to Vercel/Netlify** from the prototype page
  - Agent runs build, passes output to deployment platform API
  - Stores deployment URL, maps to custom domain if configured
  - Preview deployments for every change (like Vercel preview branches)
- **Rollback** — agent can revert to any previous deployment
- **Environment variables** — managed per environment (dev/staging/prod)

**Medium-term:**
- **Staging environment** as a permanent preview
  - Every agent-proposed change deploys to staging first
  - Human reviews staging, approves for production
  - This IS the approval gate from #14
- **Multiple deploy targets** — same codebase deployed to Vercel (web) and EAS (mobile)

**Architecture question:** Does Nucleate own the deployment infra, or integrate with existing platforms?
- Probably integrate (Vercel, Netlify APIs) — don't reinvent hosting
- But own the orchestration: when to deploy, what to deploy, rollback decisions

**Connection to the autonomous loop:**
- Without deployment, the agent can only suggest. With deployment, it can act.
- Deployment + analytics = the agent can measure the impact of its own changes.

---

### 8. A/B Testing & Experimentation

**Current state:** Nothing.

**The vision:** The agent can deploy multiple variants, split traffic, and measure which wins.

**Two approaches:**

**A) Feature flag integration (simpler, near-term):**
- Integrate with LaunchDarkly, Statsig, or Optimizely
- Agent creates feature flags for variant components
- Traffic splitting handled by the flag service
- Agent monitors metrics per variant, reports results
- Pro: battle-tested infrastructure. Con: another SaaS dependency.

**B) Built-in lightweight experimentation (more control, more work):**
- Edge middleware (Next.js middleware or Cloudflare Workers) for traffic splitting
- Variant selection based on cookie/session
- Agent writes the variant code as conditional renders
- Metrics collection via analytics connectors
- Statistical significance calculation built-in
- Pro: zero dependency. Con: significant engineering.

**Recommendation:** Start with Statsig or PostHog experiments (they have good APIs and free tiers), build first-party later if it becomes a core differentiator.

**The full experiment lifecycle:**
1. Agent identifies opportunity from analytics
2. Agent generates 2-3 variants with rationale
3. Human approves experiment design
4. Agent deploys variants behind feature flags
5. Traffic splits 50/50 (or multi-arm bandit)
6. Agent monitors for N days, checks statistical significance
7. Agent reports: "Variant B increased signups by 14% (p < 0.05)"
8. Human approves: promote winner to 100%

---

### 9. Event-Driven Triggers

**Current state:** Everything is chat-initiated via WebSocket.

**The vision:** The agent runs in the background, reacting to signals.

**Trigger types:**

**Metric-based:**
- "Conversion rate dropped below X%" → investigate and propose fix
- "Page load time exceeded Xs" → run performance audit
- "Error rate spiked on /checkout" → investigate logs

**Connector-based:**
- "New Linear ticket tagged 'ux-bug'" → investigate and propose fix
- "Brand guidelines doc updated" → check all pages for compliance
- "New Figma design pushed" → sync to codebase
- "Competitor site changed" (web monitoring) → analyze and suggest response

**Scheduled:**
- "Every Monday: run full UX/accessibility audit"
- "Every day: check analytics for anomalies"
- "Every deploy: run performance benchmark"

**Manual (but not chat):**
- GitHub webhook: PR opened → agent reviews
- Deployment webhook: deploy completed → agent runs post-deploy checks
- Form submission: user feedback received → agent triages

**Architecture:**
- Need an event bus / trigger system in the control plane
- Triggers evaluate conditions and spin up sandbox + agent session
- Agent runs, produces a "proposal" (not a chat message)
- Proposal goes to approval queue (Slack notification, email, or in-app)
- Human approves/rejects from the queue

**Key insight:** This changes the primary UX from "chat with an agent" to "manage an agent's inbox." The chat becomes one of many interfaces, not THE interface.

---

### 10. Memory & Learning

**Current state:** Session resumption exists. `prototype_chat_messages` persisted. But no cross-session learning.

**The vision:** The agent gets smarter about your team over time.

**Types of memory:**

**A) Explicit preferences (user-configured):**
- "We always use Inter font"
- "CTAs should be green, not blue"
- "We prefer minimal animations"
- Stored in company context bucket, agent always references

**B) Learned patterns (observed from interactions):**
- "This team rejects dark backgrounds 80% of the time"
- "This user prefers detailed explanations over concise ones"
- "This project uses a specific naming convention for components"
- Requires tracking accept/reject patterns across sessions

**C) Outcome memory (requires analytics):**
- "The last time we simplified the pricing page, conversion went up 8%"
- "Hero images with people outperform abstract graphics for this brand"
- This is the most valuable but requires the full autonomous loop to generate data

**D) Cross-project learning (team-level):**
- "Across all your projects, pages with social proof convert 20% better"
- "Your mobile users prefer bottom navigation over hamburger menus"
- Sensitive: need to ensure data isolation between teams

**Implementation thinking:**
- Short-term: Explicit preferences in company context (manual, high value)
- Medium-term: Session summaries stored and retrievable ("what did we decide about the nav?")
- Long-term: Vectorized outcome data for pattern matching

---

### 11. Testing & Guardrails

**Current state:** Mandatory `bun run build` / `npm run build` after code changes. That's it.

**The vision:** A multi-layered guardrail system that prevents the agent from breaking things.

**Layers:**

1. **Build verification** (exists) — code compiles
2. **Type checking** — TypeScript strict mode, no `any` creep
3. **Visual regression** — screenshot comparison before/after (Percy, Chromatic, or built-in)
4. **E2E tests** — agent generates and runs Playwright tests for critical flows
5. **Performance budget** — Lighthouse scores, bundle size, Core Web Vitals
6. **Accessibility gate** — axe-core score must stay above threshold
7. **SEO checks** — meta tags present, structured data valid
8. **Security scan** — dependency vulnerabilities, XSS patterns

**When guardrails block:**
- Agent cannot deploy if any guardrail fails
- Agent tries to fix the issue automatically (up to 2 attempts)
- If still failing, escalates to human with diagnosis

**Auto-generated test coverage:**
- After building a new feature, agent writes basic E2E tests
- Tests become guardrails for future changes
- Over time, test coverage grows organically

---

### 12. SEO & Performance Agent

**The vision:** A specialized agent (or sub-agent) focused on search visibility and page speed.

**SEO capabilities:**
- Meta tags audit (title, description, OG tags, Twitter cards)
- Structured data generation (JSON-LD for Product, Article, FAQ, etc.)
- Internal linking suggestions
- Image alt text generation
- Canonical URL management
- Sitemap generation and validation
- Core Web Vitals optimization

**Performance capabilities:**
- Image optimization (format conversion, lazy loading, srcset)
- Code splitting recommendations
- Font loading strategy (display: swap, preloading)
- CSS/JS bundle analysis
- Server-side rendering verification
- Caching strategy recommendations

**How it fits the loop:**
- Connected to Google Search Console via connector
- Monitors keyword rankings and click-through rates
- Proposes changes when rankings drop or new opportunities appear
- Measures impact of changes on search performance

---

### 13. Content Layer / Headless CMS

**The insight:** For landing pages and marketing sites, most "variants" are copy changes, not code changes. Code deploys for copy changes are slow and wasteful.

**Options:**
- **Built-in content layer** — Nucleate manages structured content (JSON/MDX) separate from components
- **CMS integration** — connect to Contentful, Sanity, Storyblok
- **Hybrid** — agent generates components that read from a content source, copy lives in a config file

**Why this matters for the autonomous loop:**
- Copy experiments can run without code deploys
- Agent can iterate on messaging 10x faster
- A/B tests on copy become trivial (swap content, not components)
- Content versioning independent of code versioning

---

### 14. Approval Workflows

**The core trust mechanism.** Every autonomous action goes through an approval gate.

**Approval queue UX:**
- In-app notification center: "Nucleate has 3 pending proposals"
- Slack integration: proposal summary + approve/reject buttons
- Email: daily digest of pending proposals
- Each proposal includes: what changed, why, preview link, rollback plan

**Configurable trust levels (per team):**
```
Level 0: Agent can only suggest in chat (current state)
Level 1: Agent can propose changes with preview, human must approve
Level 2: Agent can auto-deploy to staging, human approves promotion to prod
Level 3: Agent can auto-deploy low-risk changes (copy, images), human approves structural changes
Level 4: Agent can auto-deploy everything, human gets notified (brave mode)
```

**Approval metadata:**
- Who approved, when, from what device/channel
- Full diff of changes
- Agent's reasoning for the change
- Expected impact (if analytics connected)
- Rollback instructions (one-click)

---

### 15. Multi-Agent Coordination

**The problem:** When you have a design agent, SEO agent, accessibility agent, performance agent, and analytics agent all having opinions, they'll conflict.

**Coordination patterns:**

**A) Sequential pipeline:**
- Design agent builds → Accessibility agent reviews → Performance agent optimizes → SEO agent checks → Human approves
- Simple, predictable, but slow

**B) Parallel with merge:**
- All agents review simultaneously, produce recommendations
- "PM agent" merges non-conflicting recommendations, flags conflicts for human
- Faster, but merge conflicts are hard

**C) Priority-weighted:**
- Each recommendation has a priority score
- Accessibility > Performance > SEO > Aesthetics (configurable)
- Lower-priority recommendation automatically yields when conflicting with higher-priority

**Recommendation:** Start with sequential pipeline (simple, debuggable), evolve to priority-weighted as the system matures.

---

### 16. Agent Observability

**The trust builder.** If teams can't see what the agent is doing, they won't let it do things.

**Dashboard:**
- Activity feed: every action the agent took, when, why
- Proposals: pending, approved, rejected (with rejection reasons)
- Impact metrics: "Agent's changes this month: +12% conversion, -0.3s load time"
- Cost: LLM credits used, deploy costs, analytics API calls
- Error log: what went wrong, what the agent tried, what it escalated

**Decision journal:**
- For every proposed change: structured rationale
  - "Observation: bounce rate on /pricing is 72%"
  - "Hypothesis: the pricing table is below the fold on mobile"
  - "Proposed change: move pricing table above testimonials section"
  - "Expected impact: 10-15% bounce rate reduction"
  - "Confidence: Medium (based on similar changes in other projects)"

---

### 17. Creative Assets: Slides, Ad Creatives, Visualizations

**Current state:** Nucleate already builds slides, generates images (Nano Banana), and can create rich data visualizations within prototypes. This is an underappreciated superpower.

**Why it matters for the lifecycle:**

This means Nucleate isn't just an app builder — it's a **creative production engine** that happens to also build apps. The same agent that understands your brand, your design system, and your company context can produce:

**Slides & Presentations:**
- PRD → polished slide deck (product reviews, board updates, investor decks)
- Voice memo → structured presentation
- Auto-generate sprint review decks from Linear/GitHub activity
- On-brand, consistent with company design language

**Ad Creatives & Marketing Assets:**
- Generate ad creative variants from a single brief
- Ties directly into the Growth loop: agent proposes ad variants, tests them, measures CTR
- Rapid iteration: "Give me 5 hero image variants for the Facebook campaign"
- Same brand context ensures every asset looks like it came from your team

**Data Visualizations:**
- Earnings report → visual dashboard or infographic
- Log data → clear visualization for stakeholders
- Analytics data → charts and graphs for the Growth Dashboard itself
- Product metrics → formatted reports for leadership

**How it fits the autonomous loop:**

```
IDEATION: Agent creates research slides summarizing market analysis
    ↓
CREATION: Agent builds the product AND the launch assets (ads, landing page, social)
    ↓
GROWTH: Agent generates ad creative variants, tests them, promotes winners
         Agent creates weekly performance reports as visual dashboards
         Agent produces updated pitch decks with latest metrics
```

The insight: most companies have separate workflows for "build the product" and "create the marketing/reporting assets around it." Nucleate collapses both into one agent that shares context across all of them. Your ad creatives are always consistent with your product's actual design because the same agent built both.

**Experiment example:**
> Agent reads ad campaign metrics, sees CTR dropping on Instagram ads. Generates 3 new creative variants using Nano Banana (same brand, different compositions). Deploys to ad platform via connector. Measures for 3 days. Reports: "Variant C with lifestyle imagery outperformed current creative by 34%. Promote?"

### 18-19. Multi-Channel & i18n

These are important but probably later-stage. Noting them as future areas:
- **Multi-channel:** Shared design tokens, content sync across web/mobile, platform-specific optimization
- **i18n:** Content generation in multiple languages, RTL support, per-locale testing and optimization

---

## Additional Areas Not Yet Covered

### 19. User Research Integration
- Connect to Hotjar/FullStory for session recordings and heatmaps
- Agent watches recordings, identifies UX friction points
- Heatmap analysis: "Users are clicking on this non-interactive element — maybe it should be a button?"
- Survey integration: agent reads NPS/CSAT responses, categorizes feedback, prioritizes fixes

### 20. Competitive Intelligence
- Monitor competitor websites for changes (visual diff, content diff)
- Agent alerts: "Competitor X just redesigned their pricing page"
- Agent analyzes competitor patterns and suggests adaptations
- Ethical boundaries: only public information, no scraping beyond robots.txt

### 21. Cost Controls & Budget Management
- LLM token budgets per project, per agent, per day
- Autonomous loop budgets: "Don't spend more than $X/month on experiments"
- ROI tracking: "This agent costs $50/month in compute but drove $500 in incremental revenue"
- Auto-pause agents if budget exceeded

### 22. Collaboration & Multi-User
- Multiple team members interact with the same agent
- Agent understands who's asking and their role (designer vs PM vs engineer)
- Approval routing: design changes go to design lead, copy to marketing
- Agent avoids contradictory instructions from different stakeholders by flagging conflicts

### 23. Templates & Playbooks
- Pre-built workflows: "Landing page optimization playbook"
  1. Run analytics audit
  2. Generate 3 variants
  3. Deploy A/B test
  4. Report after 7 days
- Teams create custom playbooks from successful workflows
- "We optimized 3 landing pages this way, save this as a playbook"
- Share playbooks across teams / marketplace

### 24. Rollback Intelligence
- Not just "revert to previous deploy"
- Agent understands *what* to rollback (just the header change, not everything)
- Automatic rollback triggers: "If error rate exceeds 5% within 1 hour of deploy, auto-rollback"
- Partial rollbacks: keep the footer change, revert the nav change

---

## How These All Connect — System Architecture

```
┌─────────────────────────────────────────────────┐
│              TRIGGER LAYER (#9)                  │
│  Scheduled │ Metric-based │ Webhook │ Chat      │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│           CONTEXT LAYER (#2, #10)               │
│  Company docs │ Brand │ Analytics │ Memory      │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│           AGENT LAYER (#6, #15)                 │
│  Design │ Code │ SEO │ UX/A11y │ Analytics      │
│  User-defined agents │ PM coordinator           │
│  ─── all using MCP tools (#3) ───               │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│          GUARDRAILS LAYER (#4, #5, #11)         │
│  Build │ Visual regression │ A11y │ Perf │ E2E  │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│          APPROVAL LAYER (#14)                   │
│  Proposal queue │ Preview │ Human decision      │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│          DEPLOYMENT LAYER (#7)                  │
│  Staging │ Production │ Rollback │ A/B (#8)     │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│          MEASUREMENT LAYER (#1, #16)            │
│  Analytics │ Agent observability │ ROI tracking  │
│  ─── feeds back to TRIGGER LAYER ───            │
└─────────────────────────────────────────────────┘
```

---

## Competitive Positioning: Why "Product Partner" Not "AI Builder"

### The Market Landscape

Every AI tool today lives in one phase of the product lifecycle:

```
IDEATION              CREATION              GROWTH
────────              ────────              ──────
ChatGPT               v0 / Lovable / Bolt   Optimizely
Perplexity            Cursor / Windsurf     Unbounce
Notion AI             Replit Agent          VWO
                      GitHub Copilot        Statsig
```

**The gap:** Nobody connects all three. You brainstorm in ChatGPT, build in Cursor, deploy on Vercel, A/B test in Optimizely, read analytics in PostHog, then go back to Cursor to make changes. The human is the glue between 6 tools.

### Why Existing Categories Are Wrong

**"AI coding tools" (Cursor, Windsurf, Copilot):**
- They make developers faster at writing code
- The user is a developer. The output is code.
- They stop when the code is written. They don't care what happens next.
- Nucleate: code is an implementation detail, not the product

**"AI app builders" (v0, Lovable, Bolt, Replit):**
- They generate apps from prompts. Creation phase only.
- They produce a starting point, then you're on your own.
- No understanding of *why* you're building this or *how* it performs
- Nucleate: building is step 2 of a continuous cycle

**"Growth/optimization tools" (Optimizely, VWO, Unbounce):**
- They test variants, but a human must design every variant
- They measure, but a human must interpret and act
- They're powerful but require dedicated growth teams
- Nucleate: variant generation, deployment, AND measurement — autonomously

**"AI product assistants" (ChatGPT, Claude):**
- They brainstorm and advise, but can't execute
- Great for ideation, useless for creation and growth
- Nucleate: not just advice — it actually builds and ships

### Nucleate's Unique Position

**Nucleate is the first autonomous product partner.** It doesn't just help you build — it helps you figure out what to build, builds it with you, ships it, watches how it performs, and continuously improves it.

The unique unlock: because Nucleate handles code, design, deployment, measurement, AND creative assets (slides, ad creatives, visualizations) in one system, it can close loops that are impossible when those capabilities live in separate tools. Your ad creatives match your product because the same agent built both. Your investor deck reflects real metrics because the agent has access to them.

Example interaction that no other tool can do:
> "Nucleate noticed your pricing page has 68% bounce on mobile. It analyzed the heatmap, hypothesized the pricing table is too complex on small screens. It generated a simplified mobile variant, deployed it to 20% of traffic, and after 5 days measured a 23% reduction in bounce rate. Approve promoting this to 100% of traffic?"

This requires: analytics reading + design generation + code writing + deployment + experimentation + measurement. Today that's 5 tools and a growth engineer. Nucleate does it as one agent.

### The Category to Create

Don't compete in "AI builders" or "AI coding." Create the category:

**Autonomous Product Engine** — an AI partner that handles the full lifecycle from idea to live product to continuous optimization.

The pitch: *"Stop juggling 6 tools. Give Nucleate your product goals, and it handles the rest — building, shipping, measuring, and improving — with you in the driver's seat."*

### Who Is The User?

This positioning shifts the target user:
- **AI builders** target developers ("build this UI")
- **Growth tools** target marketers ("test this headline")
- **Nucleate** targets **product people** — founders, PMs, growth leads — who care about outcomes, not code

The product person says "I need signups to increase." They don't care if that means redesigning the hero, rewriting the CTA, adding social proof, or speeding up the page. They care about the result. Nucleate figures out the *how*.

---

## The UX Evolution: From Chat to Command Center

### Today's UX (Chat + Preview)

```
┌─────────────────────────────┬───────────────────────┐
│         CHAT PANEL          │      PREVIEW PANE     │
│                             │                       │
│  User: "Build me a..."     │   ┌─────────────────┐ │
│  Agent: "I'll create..."   │   │                 │ │
│  [tool calls happening]    │   │   Live Preview   │ │
│  User: "Change the..."     │   │   (iframe)       │ │
│  Agent: "Done, I..."       │   │                 │ │
│                             │   └─────────────────┘ │
└─────────────────────────────┴───────────────────────┘
```

This works for **Creation**. User says build, agent builds, user sees result. Synchronous, conversational, linear.

But it breaks down for **Ideation** (where the agent needs to pull from many sources and present research) and **Growth** (where the agent runs in the background and needs to surface proposals).

### The Evolution (3 Modes)

The UX should support three distinct modes, reflecting the three phases:

#### Mode 1: Research Studio (Ideation Phase)

```
┌─────────────────────────────────────────────────────────┐
│  RESEARCH CANVAS                                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Competitors  │  │ User Needs   │  │ Market Data  │  │
│  │              │  │              │  │              │  │
│  │ • Acme.com   │  │ • "Users     │  │ • TAM: $2B   │  │
│  │   redesigned │  │   want..."   │  │ • Growing 14% │  │
│  │ • Beta.io    │  │ • NPS: 42    │  │ • Key trend:  │  │
│  │   launched   │  │ • Top ask:   │  │   "..."       │  │
│  │   pricing pg │  │   "simpler"  │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Agent's Recommendation                          │    │
│  │ "Based on competitor moves and user feedback,   │    │
│  │  I recommend building a simplified pricing page │    │
│  │  with annual/monthly toggle and social proof.   │    │
│  │  Here's a rough wireframe..."                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  [ Chat input: refine the research, ask questions ]     │
└─────────────────────────────────────────────────────────┘
```

- Agent pulls from company context, connectors, web research
- Presents findings as cards/tiles, not a chat transcript
- User explores, asks follow-ups, narrows scope
- Output: a clear brief that feeds into Creation mode

#### Mode 2: Build Studio (Creation Phase — exists today, enhanced)

```
┌─────────────────────────────┬───────────────────────┐
│         CHAT PANEL          │      PREVIEW PANE     │
│                             │                       │
│  [same as today but with    │   Live multi-screen   │
│   design review feedback,   │   preview with        │
│   a11y audit results,       │   device frames       │
│   build status inline]      │                       │
│                             │   ┌─────┐ ┌─────┐    │
│  ┌─────────────────────┐    │   │ Web │ │ Mob │    │
│  │ Design Review: PASS │    │   │     │ │     │    │
│  │ A11y Audit: 2 warns │    │   │     │ │     │    │
│  │ Build: ✓ Clean      │    │   └─────┘ └─────┘    │
│  │ Perf: Lighthouse 94 │    │                       │
│  └─────────────────────┘    │   [ Deploy button ]   │
└─────────────────────────────┴───────────────────────┘
```

- Chat is still primary for building
- But guardrail results (design review, a11y, perf) surface inline
- Deploy button appears when ready
- Multi-screen preview with device frames

#### Mode 3: Growth Dashboard (Growth Phase — the new thing)

```
┌─────────────────────────────────────────────────────────┐
│  GROWTH COMMAND CENTER                                  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Agent Proposals (3 pending)                     │    │
│  │                                                 │    │
│  │ 🟡 "Simplify mobile pricing table"              │    │
│  │    Reason: 68% bounce on mobile /pricing        │    │
│  │    Expected: -15% bounce rate                   │    │
│  │    [Preview] [Approve] [Reject] [Discuss]       │    │
│  │                                                 │    │
│  │ 🟡 "Add testimonial above fold on /signup"      │    │
│  │    Reason: Competitor Acme added social proof,  │    │
│  │    their signup rate improved ~20%              │    │
│  │    [Preview] [Approve] [Reject] [Discuss]       │    │
│  │                                                 │    │
│  │ 🟢 "Update hero copy" (auto-approved: copy)     │    │
│  │    Deployed to staging 2h ago                   │    │
│  │    [View in staging] [Promote to prod]          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────────────┐    │
│  │ Active Experiments│  │ Key Metrics (7d)         │    │
│  │                  │  │                          │    │
│  │ Hero CTA color   │  │ Signups: 342 (+8%)      │    │
│  │  Day 4/7         │  │ Bounce: 52% (-3%)       │    │
│  │  B winning +12%  │  │ LCP: 1.2s (unchanged)   │    │
│  │                  │  │ A11y score: 96           │    │
│  │ Pricing layout   │  │                          │    │
│  │  Day 2/7         │  │ Agent actions today: 4   │    │
│  │  Too early       │  │ Credits used: 12         │    │
│  └──────────────────┘  └──────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Decision Journal (recent)                       │    │
│  │                                                 │    │
│  │ Today 2pm: Ran weekly a11y audit. 2 issues      │    │
│  │   found (contrast on footer links). Fix         │    │
│  │   proposed above.                               │    │
│  │ Yesterday: Promoted "shorter signup form"       │    │
│  │   variant. Signup rate +14% over 5 days.        │    │
│  │ Mon: Detected /pricing bounce spike.            │    │
│  │   Investigating...                              │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  [ Chat: ask the agent anything about your product ]    │
└─────────────────────────────────────────────────────────┘
```

This is the **big UX shift**. The Growth Dashboard is where the product person lives day-to-day. They're not chatting — they're reviewing the agent's work, approving proposals, monitoring experiments, and reading the decision journal.

### The Transitions Between Modes

```
RESEARCH STUDIO ──"Let's build this"──► BUILD STUDIO
                                            │
                                       "Ship it"
                                            │
                                            ▼
                                      GROWTH DASHBOARD
                                            │
                                   "I want to add a
                                    new feature"
                                            │
                                            ▼
                                      BUILD STUDIO ──► GROWTH DASHBOARD
                                            ▲
                                            │
                               GROWTH DASHBOARD
                          "Agent: I think we should
                           rebuild the pricing page"
                           [User approves scope]
```

The modes aren't tabs you manually switch between. The agent transitions you:
- Research surfaces a recommendation → "Let's build this" → enters Build mode with context
- Build completes → "Ready to deploy" → enters Growth mode with monitoring
- Growth identifies a bigger change → "This needs a redesign" → enters Build mode

### Notification & Approval Surfaces

The Growth Dashboard isn't the only place approvals happen. Proposals should meet the user where they are:

**In-app:** Growth Dashboard (primary)
**Slack:** "Nucleate proposes: simplify mobile pricing. [Preview] [Approve] [Reject]"
**Email:** Daily digest: "3 proposals pending, 1 experiment concluded, metrics summary"
**Mobile push:** For urgent items (rollback triggers, error spikes)

The key principle: **the agent should never be blocked waiting for approval.** It queues proposals and moves on to the next thing. The human catches up on their schedule.

---

## Open Questions

1. **Pricing for background agents** — credits per chat message works for Creation. But Growth mode has agents running 24/7 (monitoring analytics, running audits). Flat monthly fee for "autonomous mode"? Per-action pricing? Tiered by number of active agents?

2. **Cold start across all three phases:**
   - Ideation: no company context yet → agent can still do market research, competitor analysis from public data
   - Creation: already works today
   - Growth: no analytics yet → agent can still run a11y audits, performance checks, SEO audits. Value from day 1 even without analytics connectors. The first deploy triggers the first measurement.

3. **When does the agent stay in its lane?** The agent shouldn't redesign your entire app because bounce rate is 2% above average. Need clear scope boundaries for autonomous proposals — "optimize within the current page structure" vs "propose structural changes" should be configurable.

4. **The trust ramp** — New users should see the agent in "suggestion only" mode. As they approve more proposals and see results, the agent earns permission for more autonomy. How do you design this trust-building UX so it feels natural, not like a settings page?

5. **Single agent identity or many?** Does the user interact with "Nucleate" as one entity, or do they see "Design Agent proposed X" vs "SEO Agent proposed Y"? One identity is simpler but less transparent. Multiple identities are clearer but feel like managing a team.

6. **Research Studio scope** — How deep does ideation go? Just "what feature to build" or all the way to "should this product exist"? For early-stage founders, Nucleate-as-product-advisor is powerful. For growth teams at established companies, they just need the Build + Growth modes.

7. **Liability & rollback psychology** — Even with approval gates, if the agent proposes a change, the human approves, and it tanks metrics — who does the human blame? Probably the agent. The decision journal helps ("here's why I proposed it, here's the data") but the agent needs to be comfortable saying "I was wrong, here's what I learned."

---

## The Pitch: Selling the Vision While Grounded in Today

### The Problem Statement (open with this)

*"Building a product today means stitching together a dozen tools. You brainstorm in one place, design in another, code in a third, deploy somewhere else, then check analytics in yet another dashboard. When something underperforms, you start the whole cycle over — manually. The human is the glue holding all of it together.*

*And the hardest part isn't any single step. It's the gaps between them. Context gets lost. Decisions aren't tracked. Nobody remembers why the pricing page looks the way it does. The feedback loop from 'we shipped this' to 'here's how it performed' to 'here's what we should change' takes weeks — if it happens at all."*

### The Vision (what Nucleate is becoming)

*"Nucleate is building the first autonomous product engine — an AI partner that works with you across the entire lifecycle, from figuring out what to build, to building it, to making it better over time.*

*Think of it in three phases:*

*First, **ideation** — Nucleate understands your company, your brand, your customers, your competitors. It pulls from your docs, your Linear tickets, your analytics, and helps you shape what to build next. Not generic suggestions — recommendations grounded in your specific context.*

*Second, **creation** — Nucleate builds it with you. Real applications, on-brand, production-quality. Not wireframes, not mockups — working software with real design quality, accessibility, and performance baked in.*

*Third, **growth** — and this is where it gets interesting. Once your product is live, Nucleate doesn't walk away. It monitors how the product performs. It reads your analytics, spots issues, and proposes specific improvements — a simpler mobile layout because bounce rate is high, a new CTA because the current one underperforms. You approve the changes, Nucleate deploys them, measures the impact, and keeps iterating.*

*The result is a closed loop that runs continuously: build → ship → measure → improve → ship again. Today, that loop requires a product manager, a designer, a developer, and a growth engineer coordinating across 6 tools. Nucleate collapses that into one intelligent partner with you in the driver's seat."*

### What We Have Today (credibility anchor)

*"Today, Nucleate is the strongest AI creation tool on the market for on-brand product development. Here's what's live right now:*

- *Real application building — not prototypes, working Next.js and React Native apps*
- *On-brand design generation with an AI design expert that understands your design system*
- *Source repository integration — connect your GitHub repo, Nucleate works within your existing codebase*
- *Multi-screen canvas — build and preview multiple screens simultaneously*
- *Live preview with hot reload — see changes in real-time as the agent builds*
- *Build verification — every change is verified to compile and run*
- *Beyond apps — slides, ad creatives, data visualizations, and AI-generated images (Nano Banana). The same agent builds your product AND the assets that support it*

*This is the Creation phase, and it's production-ready today."*

### The Roadmap Tease (where we're going)

*"We're building the rest of the lifecycle around this core. Here's what's coming:*

**Near-term (next quarter):**
- *One-click deployment to Vercel/Netlify — go from sandbox to production in seconds*
- *Company context — connect your docs, brand guidelines, and product specs so the agent truly understands your business*
- *Accessibility and UX audits — automated WCAG compliance checking after every change*
- *Design review loops — AI reviews its own work for visual consistency, responsiveness, and brand alignment before showing you*

**Medium-term:**
- *Analytics connectors — connect PostHog, Amplitude, GA4 and let the agent read your metrics*
- *Growth proposals — the agent identifies issues from your analytics and proposes specific, previewable changes*
- *Experimentation framework — deploy variants, split traffic, measure what wins*
- *Approval workflows — review and approve agent proposals from Slack, email, or in-app*

**Longer-term:**
- *Fully autonomous optimization loops — the agent continuously improves your product, you approve at each gate*
- *User-defined agents — create custom AI agents for your specific workflows (legal review, performance budgets, content compliance)*
- *Competitive intelligence — monitor competitor changes and adapt*
- *Cross-project learning — the agent gets smarter about what works for your brand over time"*

### The "Why Partner Now" Close

*"We're looking for design-forward companies who want to shape how this evolves. Early partners get:*

- *Direct input on the roadmap — the features we build next are shaped by your use cases*
- *First access to new capabilities as they ship*
- *A product partner that gets smarter about your brand and your customers over time*

*The companies that adopt Nucleate early will have an AI product partner that deeply understands their business by the time their competitors start looking for one."*

### Pitch Variations by Audience

**To a founder/CEO:**
*"You know the feeling of having a great product idea but being bottlenecked by execution speed. Nucleate is the product partner that removes that bottleneck — from ideation through growth, it handles the build-measure-learn cycle with you approving every step. Your competitors ship one version and hope. You ship, measure, and improve continuously."*

**To a Head of Product:**
*"Your team spends 80% of their time coordinating between tools and 20% making actual product decisions. Nucleate flips that ratio. It handles the execution — design, code, deploy, measure — so your team focuses on strategy, customer insight, and prioritization. And because the agent tracks every decision and outcome, you finally have a complete record of why your product looks the way it does."*

**To a Head of Growth:**
*"Every optimization cycle takes your team 2-3 weeks: analyze data, brief design, review mockups, hand off to engineering, QA, deploy, wait for data. Nucleate compresses that to hours. It reads your analytics, generates variants with real code and design quality, and deploys experiments — all with you approving before anything goes live. Imagine running 10x more experiments per quarter."*

**To a Head of Design:**
*"Most AI tools produce generic, cookie-cutter output. Nucleate is different — it understands your design system, your brand guidelines, your typography and spacing rules. It generates on-brand work that a designer would actually approve. And with built-in design review and accessibility auditing, quality doesn't slip as you iterate faster."*

### Key Objections & Responses

**"This sounds like it replaces my team."**
→ *"It doesn't replace anyone — it amplifies them. Your designer still sets the design direction and approves every visual change. Your PM still decides what to build and which experiments to run. Nucleate handles the execution so your team spends their time on judgment calls, not repetitive implementation."*

**"How is this different from v0/Lovable/Bolt?"**
→ *"Those are AI code generators — you describe what you want, they produce a starting point, and you're on your own. Nucleate is an ongoing partner. It understands your brand, it deploys and monitors your product, and it continuously improves it. Imagine if v0 didn't just build your landing page but then watched how it performed and automatically proposed improvements. That's what we're building."*

**"The creation tools exist today but growth is just a vision. Why should I care now?"**
→ *"Two reasons. First, the creation tool alone is the best on-brand AI builder available — that's immediate value. Second, the growth capabilities are built on top of what you create. The agent that builds your product today is the same agent that will optimize it tomorrow — and the more it builds with you now, the better it understands your brand, your patterns, and your preferences for when the growth loop is live."*

**"I don't trust an AI to make changes to my live product."**
→ *"Neither do we — that's why every change goes through an approval gate. The agent proposes, you approve. You see a full preview, the agent's reasoning, and expected impact before anything touches production. One-click rollback if anything goes wrong. You're always in control — the agent just does the analysis and implementation work so you can focus on the decision."*

**"We already have a design system / component library / development workflow."**
→ *"Nucleate connects to your existing GitHub repo and works within your codebase. It learns your design tokens, your component patterns, your naming conventions. It doesn't replace your stack — it accelerates it. And because it understands your existing system, the output is consistent with what your team has already built."*

