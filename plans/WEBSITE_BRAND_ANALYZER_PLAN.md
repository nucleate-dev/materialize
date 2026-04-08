# Website Brand Analyzer - Feature Plan

> **Status:** Planning
> **Created:** 2024-01-30
> **Author:** Product/Engineering

---

## Table of Contents

1. [Overview](#overview)
2. [Job to Be Done](#job-to-be-done)
3. [Target Users & Use Cases](#target-users--use-cases)
4. [Core Decisions](#core-decisions)
5. [Output: Brand Profile JSON Schema](#output-brand-profile-json-schema)
6. [Multi-Agent Architecture](#multi-agent-architecture)
7. [Background Job Pipeline](#background-job-pipeline)
8. [Data Model](#data-model)
9. [UI Flow](#ui-flow)
10. [Codebase Location](#codebase-location)
11. [MVP Scope](#mvp-scope)
12. [Technical Implementation Plan](#technical-implementation-plan)

---

## Overview

A feature that allows users to input a website URL and receive a comprehensive brand intelligence report. The system crawls the website, extracts brand elements (colors, fonts, logos), analyzes content (company info, ICP, product offerings), and generates actionable recommendations.

**Key Value Proposition:** Turn any website into a structured, machine-readable brand profile that can be used by other agents for tasks like prototype generation, competitive analysis, and brand-aligned development.

---

## Job to Be Done

### Primary JTBD

> *"When I'm starting work on a new project, product feature, or marketing initiative, I need to quickly understand everything about a company's brand, product, and digital presence so that I can make informed decisions that align with their identity."*

### Secondary JTBDs

1. *"Help me understand a competitor's positioning and product strategy"*
2. *"Help me onboard to a client's brand quickly for consulting/agency work"*
3. *"Help me audit my own site for gaps and opportunities"*
4. *"Help me create a brand brief for developers/designers to reference"*

---

## Target Users & Use Cases

| User | Scenario | What They Need |
|------|----------|----------------|
| **Product Manager** | Starting a new feature | Brand voice, existing patterns, ICP understanding |
| **Designer** | Creating mockups | Brand colors, typography, visual language |
| **Developer** | Building a prototype | Design tokens, component patterns, tech stack hints |
| **Marketer** | Campaign planning | Brand positioning, social presence, messaging |
| **Founder** | Competitive analysis | Competitor strengths, gaps, positioning |
| **Consultant** | Client onboarding | Quick comprehensive brand understanding |

---

## Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Crawl scope** | Main pages only (nav-linked, sitemap) | Keep analysis focused, avoid bloat |
| **Output format** | Structured JSON | Enables agentic use + React rendering |
| **Execution model** | Background job | Analysis takes 2-5 min, don't block UI |
| **Persistence** | Saved "Brand Profile" entity | Reusable across sessions |
| **Authentication** | Required (logged in users) | Internal tool for now |
| **Rate limiting** | None (internal use) | Can add later if needed |
| **Data retention** | Forever | Brand profiles are valuable long-term |
| **Competitive analysis** | Post-MVP | Focus on single-site analysis first |
| **Prototype integration** | Not integrated | Standalone feature |

---

## Defining "Main Pages"

### Include
- Homepage
- All top-level navigation links
- Footer links (About, Careers, Legal, etc.)
- Links from sitemap.xml (if available)
- Obvious sub-pages (/pricing, /about, /features, /blog landing)

### Exclude
- Deep blog post archives
- Documentation pages (beyond /docs landing)
- User-generated content
- Paginated lists
- External links
- Auth-gated pages

**Estimated page count:** 10-30 pages for most sites

---

## Output: Brand Profile JSON Schema

```json
{
  "meta": {
    "id": "uuid",
    "url": "https://example.com",
    "analyzedAt": "2024-01-30T12:00:00Z",
    "status": "completed",
    "pagesCrawled": 24
  },

  "company": {
    "name": "Acme Inc",
    "legalName": "Acme Technologies, Inc.",
    "tagline": "Build faster, ship smarter",
    "description": "Acme provides developer tools for modern teams",
    "foundedYear": 2019,
    "stage": "growth",
    "industry": "Developer Tools",
    "headquarters": "San Francisco, CA"
  },

  "product": {
    "type": "saas",
    "offerings": [
      {
        "name": "Acme Platform",
        "description": "All-in-one developer platform",
        "category": "primary"
      }
    ],
    "pricingModel": "freemium",
    "pricingUrl": "/pricing",
    "hasFreeTier": true,
    "techStackHints": ["React", "Node.js", "AWS"]
  },

  "icp": {
    "targetAudience": "Engineering teams at mid-size SaaS companies",
    "companySize": "mid-market",
    "industries": ["Technology", "Fintech"],
    "personas": [
      {
        "title": "Engineering Manager",
        "painPoints": ["Slow deployment cycles", "Poor visibility"]
      }
    ],
    "useCases": ["CI/CD", "Monitoring", "Incident Management"]
  },

  "brand": {
    "colors": {
      "primary": "#6366F1",
      "secondary": "#EC4899",
      "accent": "#10B981",
      "background": "#FFFFFF",
      "text": "#1F2937",
      "palette": ["#6366F1", "#EC4899", "#10B981", "#F3F4F6"]
    },
    "typography": {
      "headingFont": "Inter",
      "bodyFont": "Inter",
      "monoFont": "Fira Code"
    },
    "visualStyle": {
      "aesthetic": "modern-minimal",
      "characteristics": ["clean", "lots of whitespace", "gradient accents"],
      "iconStyle": "outline",
      "illustrationStyle": "abstract-geometric"
    },
    "voice": {
      "tone": "professional-friendly",
      "characteristics": ["confident", "technical but approachable"]
    },
    "logoUrl": "/logo.svg"
  },

  "siteArchitecture": {
    "pages": [
      {
        "url": "/",
        "title": "Home",
        "type": "landing",
        "inNavigation": true
      },
      {
        "url": "/pricing",
        "title": "Pricing",
        "type": "pricing",
        "inNavigation": true
      }
    ],
    "navigation": {
      "style": "top-horizontal",
      "items": ["Product", "Solutions", "Pricing", "Docs", "Blog"]
    },
    "hasSearch": true,
    "hasBlog": true,
    "hasDocs": true,
    "hasChangelog": false
  },

  "socialPresence": {
    "links": {
      "twitter": "https://twitter.com/acme",
      "linkedin": "https://linkedin.com/company/acme",
      "github": "https://github.com/acme",
      "youtube": null,
      "discord": "https://discord.gg/acme"
    },
    "appStores": {
      "ios": "https://apps.apple.com/app/acme",
      "android": null
    },
    "other": [
      {
        "name": "Product Hunt",
        "url": "https://producthunt.com/products/acme"
      }
    ]
  },

  "trustSignals": {
    "customerLogos": ["Stripe", "Vercel", "Linear"],
    "testimonials": [
      {
        "quote": "Acme saved us 10 hours per week",
        "author": "Jane Doe",
        "title": "CTO at TechCorp"
      }
    ],
    "metrics": [
      {
        "value": "10,000+",
        "label": "Teams using Acme"
      }
    ],
    "certifications": ["SOC 2", "GDPR"],
    "pressLogos": ["TechCrunch", "Forbes"]
  },

  "opportunities": [
    {
      "category": "ux",
      "priority": "high",
      "title": "Mobile navigation is hard to use",
      "description": "Hamburger menu requires 3 taps to reach pricing",
      "recommendation": "Add persistent bottom nav for key pages"
    },
    {
      "category": "conversion",
      "priority": "medium",
      "title": "No social proof on pricing page",
      "description": "Pricing page lacks testimonials or trust signals",
      "recommendation": "Add customer quotes near CTA buttons"
    }
  ]
}
```

### Schema Field Reference

| Section | Fields | Source |
|---------|--------|--------|
| `meta` | id, url, analyzedAt, status, pagesCrawled | System-generated |
| `company` | name, tagline, description, stage, industry | Analyst Agent (content analysis) |
| `product` | type, offerings, pricingModel, techStackHints | Analyst Agent (content analysis) |
| `icp` | targetAudience, companySize, personas, useCases | Analyst Agent (messaging analysis) |
| `brand` | colors, typography, visualStyle, voice | Extractor Agent (CSS/HTML parsing) |
| `siteArchitecture` | pages, navigation, hasSearch, hasBlog | Crawler Agent (structure analysis) |
| `socialPresence` | links, appStores, other | Extractor Agent (link parsing) |
| `trustSignals` | customerLogos, testimonials, metrics | Extractor Agent (content parsing) |
| `opportunities` | category, priority, title, recommendation | Analyst Agent (gap analysis) |

---

## Multi-Agent Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR AGENT                        │
│         (Coordinates workflow, assembles final report)       │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  CRAWLER AGENT  │  │  BRAND EXTRACTOR│  │ ANALYST AGENT   │
│                 │  │     AGENT       │  │                 │
│ - Discovers all │  │ - Colors/fonts  │  │ - ICP analysis  │
│   pages         │  │ - Visual style  │  │ - Opportunities │
│ - Builds sitemap│  │ - Logo analysis │  │ - Recommendations│
│ - Finds links   │  │ - Design tokens │  │ - Competitive   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Agent 1: Crawler Agent

**Job:** Discover and fetch all main pages

**Tools:**
- `WebFetch` - Fetch page content
- Custom sitemap parser

**Output:**
```json
{
  "pages": [
    { "url": "/", "html": "...", "title": "Home" },
    { "url": "/pricing", "html": "...", "title": "Pricing" }
  ],
  "sitemap": [...],
  "externalLinks": [...]
}
```

**Logic:**
1. Fetch homepage
2. Parse navigation links
3. Check for sitemap.xml
4. Fetch footer links
5. Deduplicate and filter to main pages
6. Fetch each page (parallel, with rate limiting)

### Agent 2: Brand Extractor Agent

**Job:** Extract structured brand data from HTML/CSS

**Responsibilities:**
- Parse CSS for colors (inline styles, stylesheets)
- Identify fonts from stylesheets/Google Fonts links
- Find social links (footer, header)
- Extract navigation structure
- Identify logos/images
- Find trust signals (customer logos, testimonials)

**Output:** Populates `brand`, `siteArchitecture`, `socialPresence`, `trustSignals`

### Agent 3: Analyst Agent

**Job:** Interpret content and generate insights

**Responsibilities:**
- Determine company/product info from copy
- Infer ICP from messaging
- Identify visual style descriptors
- Generate opportunities/recommendations

**Output:** Populates `company`, `product`, `icp`, `opportunities`

### Assembler (Not an Agent)

**Job:** Merge all agent outputs into final JSON schema, validate, save to database

---

## Background Job Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER FLOW                                │
└─────────────────────────────────────────────────────────────────┘

  [User enters URL]
         │
         ▼
  [API: POST /brand-profiles]
         │
         ├──► Returns immediately: { id, status: "pending" }
         │
         ▼
  [Background Job Queue]
         │
         ▼
  ┌─────────────────────────────────────────────────────────────┐
  │              BRAND ANALYZER PIPELINE                         │
  │                                                              │
  │   ┌──────────┐    ┌──────────┐    ┌──────────┐             │
  │   │ CRAWLER  │───►│ EXTRACTOR│───►│ ANALYST  │             │
  │   │  AGENT   │    │  AGENT   │    │  AGENT   │             │
  │   └──────────┘    └──────────┘    └──────────┘             │
  │         │               │               │                   │
  │         ▼               ▼               ▼                   │
  │   [Raw HTML]     [Brand Data]    [Analysis]                │
  │                                                              │
  │   ────────────────────────────────────────────────────────  │
  │                         │                                    │
  │                         ▼                                    │
  │              [ASSEMBLER: Merge into final JSON]             │
  │                         │                                    │
  │                         ▼                                    │
  │              [Save to Database]                              │
  │                         │                                    │
  │                         ▼                                    │
  │              [Status: completed]                             │
  └─────────────────────────────────────────────────────────────┘
```

### Status Flow

| Status | Description |
|--------|-------------|
| `pending` | Job queued, waiting to start |
| `crawling` | Discovering and fetching pages |
| `extracting` | Pulling brand elements from HTML/CSS |
| `analyzing` | Generating insights and recommendations |
| `completed` | Done, results available |
| `failed` | Error occurred (with error message) |

---

## Data Model

### Database Schema

```sql
-- Brand Profile entity
CREATE TABLE brand_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) NOT NULL,

  -- Input
  url TEXT NOT NULL,

  -- Status
  status TEXT DEFAULT 'pending',
  error_message TEXT,

  -- Output
  profile_data JSONB,

  -- Metadata
  pages_crawled INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for user lookups
CREATE INDEX idx_brand_profiles_user_id ON brand_profiles(user_id);

-- Index for status queries
CREATE INDEX idx_brand_profiles_status ON brand_profiles(status);
```

### TypeScript Types

```typescript
// Status enum
type BrandProfileStatus =
  | 'pending'
  | 'crawling'
  | 'extracting'
  | 'analyzing'
  | 'completed'
  | 'failed';

// Main entity
interface BrandProfile {
  id: string;
  userId: string;
  url: string;
  status: BrandProfileStatus;
  errorMessage?: string;
  profileData?: BrandProfileData;
  pagesCrawled?: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// The JSON schema defined above
interface BrandProfileData {
  meta: MetaSection;
  company: CompanySection;
  product: ProductSection;
  icp: IcpSection;
  brand: BrandSection;
  siteArchitecture: SiteArchitectureSection;
  socialPresence: SocialPresenceSection;
  trustSignals: TrustSignalsSection;
  opportunities: OpportunityItem[];
}
```

---

## UI Flow

### Main Page

```
┌─────────────────────────────────────────────────────────────┐
│  Brand Analyzer                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Enter a website URL to analyze:                            │
│  ┌─────────────────────────────────────┐  ┌──────────────┐ │
│  │ https://stripe.com                  │  │   Analyze    │ │
│  └─────────────────────────────────────┘  └──────────────┘ │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Your Brand Profiles                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ stripe.com        ● Completed    Jan 30    [View]       ││
│  │ linear.app        ◐ Analyzing... Jan 30                 ││
│  │ vercel.com        ● Completed    Jan 29    [View]       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### View Page

The view page will render the JSON using a React component (built by another agent later). For MVP, can show formatted JSON.

---

## Codebase Location

| Component | Location |
|-----------|----------|
| **API Routes** | `server/control-plane/src/routes/brand-profiles/` |
| **Service** | `server/control-plane/src/services/BrandAnalyzerService.ts` |
| **Agents** | `server/control-plane/src/services/brand-analyzer/agents/` |
| **Types** | `server/control-plane/src/types/brand-profile.ts` |
| **Database** | Supabase (existing infrastructure) |
| **UI Pages** | `web-application/src/pages/brand-analyzer/` |
| **UI Components** | `web-application/src/components/brand-analyzer/` |

---

## MVP Scope

### In Scope

- [ ] Single URL input
- [ ] Crawl main pages (nav + sitemap, max ~30 pages)
- [ ] Extract: company info, brand colors, fonts, social links, site structure
- [ ] Generate: ICP analysis, opportunities
- [ ] Output: Structured JSON (schema above)
- [ ] Background processing with status updates
- [ ] Save as persistent Brand Profile entity
- [ ] Basic UI: input URL, view status, view results
- [ ] Authentication required

### Out of Scope (Post-MVP)

- Competitive comparison mode (analyze multiple sites)
- PDF/image export
- Integration with prototype chat
- Historical tracking (re-analyze same site over time)
- Team sharing / collaboration
- Webhook notifications
- Public API access
- Rate limiting

---

## Technical Implementation Plan

### Phase 1: Foundation

#### 1.1 Database Setup
- [ ] Create `brand_profiles` table in Supabase
- [ ] Add indexes for user_id and status
- [ ] Generate TypeScript types from schema

#### 1.2 API Routes
- [ ] `POST /api/brand-profiles` - Create new analysis job
- [ ] `GET /api/brand-profiles` - List user's brand profiles
- [ ] `GET /api/brand-profiles/:id` - Get single brand profile
- [ ] `DELETE /api/brand-profiles/:id` - Delete brand profile

#### 1.3 Basic Service Structure
- [ ] Create `BrandAnalyzerService.ts` skeleton
- [ ] Implement job queue mechanism (can use existing patterns)
- [ ] Status update infrastructure

### Phase 2: Agent Implementation

#### 2.1 Crawler Agent
- [ ] Homepage fetching
- [ ] Navigation link extraction
- [ ] Sitemap.xml parsing
- [ ] Footer link extraction
- [ ] Page deduplication
- [ ] Parallel page fetching with rate limiting
- [ ] Output: raw HTML + page metadata

#### 2.2 Brand Extractor Agent
- [ ] CSS color extraction (inline + stylesheets)
- [ ] Font detection (Google Fonts, system fonts)
- [ ] Social link extraction
- [ ] Navigation structure parsing
- [ ] Logo/image identification
- [ ] Trust signal extraction (logos, testimonials)
- [ ] Output: brand, siteArchitecture, socialPresence, trustSignals

#### 2.3 Analyst Agent
- [ ] Company information inference
- [ ] Product/offering analysis
- [ ] ICP determination from messaging
- [ ] Visual style classification
- [ ] Opportunity identification
- [ ] Output: company, product, icp, opportunities

#### 2.4 Assembler
- [ ] Merge agent outputs
- [ ] Schema validation
- [ ] Save to database
- [ ] Update status to completed

### Phase 3: Frontend

#### 3.1 Brand Analyzer Page
- [ ] URL input form
- [ ] Submit handler (POST to API)
- [ ] Brand profiles list
- [ ] Status polling/refresh
- [ ] Delete functionality

#### 3.2 Brand Profile View Page
- [ ] Route: `/brand-analyzer/:id`
- [ ] Fetch profile data
- [ ] JSON display (MVP)
- [ ] Future: Rich React renderer

#### 3.3 Navigation
- [ ] Add to main navigation/sidebar
- [ ] Route configuration

### Phase 4: Polish & Error Handling

- [ ] Error states in UI
- [ ] Retry logic for failed fetches
- [ ] Timeout handling
- [ ] Partial results (if some pages fail)
- [ ] Loading states
- [ ] Empty states

---

## API Specification

### POST /api/brand-profiles

Create a new brand analysis job.

**Request:**
```json
{
  "url": "https://stripe.com"
}
```

**Response:**
```json
{
  "id": "uuid",
  "url": "https://stripe.com",
  "status": "pending",
  "createdAt": "2024-01-30T12:00:00Z"
}
```

### GET /api/brand-profiles

List user's brand profiles.

**Response:**
```json
{
  "brandProfiles": [
    {
      "id": "uuid",
      "url": "https://stripe.com",
      "status": "completed",
      "pagesCrawled": 24,
      "createdAt": "2024-01-30T12:00:00Z",
      "completedAt": "2024-01-30T12:05:00Z"
    }
  ]
}
```

### GET /api/brand-profiles/:id

Get single brand profile with full data.

**Response:**
```json
{
  "id": "uuid",
  "url": "https://stripe.com",
  "status": "completed",
  "profileData": { /* full JSON schema */ },
  "pagesCrawled": 24,
  "createdAt": "2024-01-30T12:00:00Z",
  "completedAt": "2024-01-30T12:05:00Z"
}
```

### DELETE /api/brand-profiles/:id

Delete a brand profile.

**Response:**
```json
{
  "success": true
}
```

---

## Open Technical Questions

1. **Job Queue:** Use existing patterns from control-plane, or introduce a proper queue (Bull, etc.)?

2. **Agent Execution:** Run agents in control-plane process, or spawn in sandboxes like chat?

3. **WebFetch:** Use Claude's built-in WebFetch, or implement custom fetcher for more control?

4. **Rate Limiting:** How aggressive can we be with fetching? Need delays between requests?

5. **Caching:** Cache fetched pages? For how long?

6. **Large Sites:** Hard limit on pages? Timeout for entire job?

---

## Future Enhancements (Post-MVP)

1. **Competitive Analysis Mode**
   - Input multiple URLs
   - Side-by-side comparison
   - Competitive positioning matrix

2. **Historical Tracking**
   - Re-analyze same site periodically
   - Track brand changes over time
   - Diff view between analyses

3. **Export Options**
   - PDF brand kit
   - Figma-compatible design tokens
   - JSON API endpoint

4. **Team Features**
   - Share brand profiles with team
   - Collaborative annotations
   - Brand library

5. **Integration with Prototypes**
   - Auto-inject brand context into chat
   - Brand-aware component suggestions
   - Style matching

6. **Advanced Analysis**
   - SEO audit
   - Accessibility check
   - Performance metrics
   - Content inventory

---

## Detailed Technical Implementation

This section provides concrete implementation details based on existing patterns in the codebase.

### Service Architecture

Based on control-plane patterns (CleanupService, DispatcherService), the BrandAnalyzerService will:

1. **Register routes** via `registerRoutes(app: FastifyInstance)`
2. **Run background worker** via `setInterval` polling (like CleanupService)
3. **Use Supabase** for persistence (service role client for background jobs)
4. **Use Cache (Valkey)** for job queue and status tracking

```typescript
// server/control-plane/services/brand-analyzer/BrandAnalyzerService.ts

import { FastifyInstance } from "fastify";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { GlideClient } from "@valkey/valkey-glide";
import { SystemLogger } from "../../loggers/SystemLogger";
import { Database } from "../../types/supabase";
import { cryptoRandomId } from "../../utils/cryptoRandomId";
import { BrandAnalyzerOrchestrator } from "./agents/BrandAnalyzerOrchestrator";

export class BrandAnalyzerService {
  private cache: GlideClient;
  private supabase: SupabaseClient<Database>;
  private log2: SystemLogger;
  private workerInterval?: NodeJS.Timeout;

  constructor(cache: GlideClient, logger: SystemLogger) {
    this.cache = cache;
    this.log2 = logger.child({ service: "BrandAnalyzerService" });
    this.supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  public registerRoutes(app: FastifyInstance): void {
    // POST /brand-profiles - Create new analysis
    app.post<{ Body: { url: string } }>(
      "/brand-profiles",
      {
        schema: {
          body: {
            type: "object",
            required: ["url"],
            properties: {
              url: { type: "string", format: "uri" },
            },
          },
        },
      },
      this.handleCreateBrandProfile.bind(this)
    );

    // GET /brand-profiles - List user's profiles
    app.get("/brand-profiles", this.handleListBrandProfiles.bind(this));

    // GET /brand-profiles/:id - Get single profile
    app.get<{ Params: { id: string } }>(
      "/brand-profiles/:id",
      this.handleGetBrandProfile.bind(this)
    );

    // DELETE /brand-profiles/:id - Delete profile
    app.delete<{ Params: { id: string } }>(
      "/brand-profiles/:id",
      this.handleDeleteBrandProfile.bind(this)
    );
  }

  // Background worker (like CleanupService pattern)
  public startWorker(): void {
    if (process.env.NODE_ENV === "development") {
      this.log2.info("Skipping brand analyzer worker in development");
      return;
    }

    this.workerInterval = setInterval(async () => {
      this.log2.setContext({ traceId: cryptoRandomId() });
      try {
        await this.processPendingAnalyses();
      } catch (error) {
        this.log2.error(error, "Brand analyzer worker error");
      }
    }, 10 * 1000); // Poll every 10 seconds

    this.log2.info("Brand analyzer worker started");
  }

  public shutdown(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.log2.info("Brand analyzer worker stopped");
    }
  }

  private async processPendingAnalyses(): Promise<void> {
    // Find pending analyses
    const { data: pendingProfiles } = await this.supabase
      .from("brand_profiles")
      .select("id, url, user_id")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1); // Process one at a time

    if (!pendingProfiles || pendingProfiles.length === 0) {
      return;
    }

    const profile = pendingProfiles[0];
    this.log2.info("Processing brand analysis", { profileId: profile.id });

    try {
      // Update status to crawling
      await this.updateStatus(profile.id, "crawling");

      // Run the orchestrator
      const orchestrator = new BrandAnalyzerOrchestrator(this.log2);
      const result = await orchestrator.analyze(profile.url);

      // Save results
      await this.supabase
        .from("brand_profiles")
        .update({
          status: "completed",
          profile_data: result,
          pages_crawled: result.meta.pagesCrawled,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      this.log2.info("Brand analysis completed", { profileId: profile.id });
    } catch (error) {
      this.log2.error(error, "Brand analysis failed", { profileId: profile.id });
      await this.supabase
        .from("brand_profiles")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
    }
  }

  private async updateStatus(
    profileId: string,
    status: string
  ): Promise<void> {
    await this.supabase
      .from("brand_profiles")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", profileId);
  }

  // Route handlers...
  private async handleCreateBrandProfile(request: any, reply: any) {
    // Auth check, create record, return immediately
  }

  private async handleListBrandProfiles(request: any, reply: any) {
    // Auth check, query user's profiles
  }

  private async handleGetBrandProfile(request: any, reply: any) {
    // Auth check, return profile with data
  }

  private async handleDeleteBrandProfile(request: any, reply: any) {
    // Auth check, delete profile
  }
}
```

### Claude Code SDK Agent Configuration

Based on the ChatQueryHandler patterns, here's how to configure agents:

```typescript
// server/control-plane/services/brand-analyzer/agents/BrandAnalyzerOrchestrator.ts

import { query, Options, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { SystemLogger } from "../../../loggers/SystemLogger";
import { BrandProfileData } from "../../../types/brand-profile";
import { getCrawlerAgentPrompt } from "../prompts/crawler-agent";
import { getExtractorAgentPrompt } from "../prompts/extractor-agent";
import { getAnalystAgentPrompt } from "../prompts/analyst-agent";

export class BrandAnalyzerOrchestrator {
  private log2: SystemLogger;

  constructor(logger: SystemLogger) {
    this.log2 = logger.child({ component: "BrandAnalyzerOrchestrator" });
  }

  async analyze(url: string): Promise<BrandProfileData> {
    // Step 1: Crawl the website
    this.log2.info("Starting crawler agent", { url });
    const crawlResult = await this.runCrawlerAgent(url);

    // Step 2: Extract brand elements
    this.log2.info("Starting extractor agent");
    const extractResult = await this.runExtractorAgent(crawlResult);

    // Step 3: Analyze and generate insights
    this.log2.info("Starting analyst agent");
    const analysisResult = await this.runAnalystAgent(crawlResult, extractResult);

    // Step 4: Assemble final result
    return this.assembleResult(url, crawlResult, extractResult, analysisResult);
  }

  private async runCrawlerAgent(url: string): Promise<CrawlResult> {
    const queryOptions: Options = {
      systemPrompt: {
        type: "text" as const,
        text: getCrawlerAgentPrompt(),
      },
      allowedTools: ["WebFetch"],
      maxTurns: 30, // Allow multiple fetches
      model: "claude-sonnet-4-20250514",
    };

    const userMessage = `
Crawl the website at ${url} and return a structured JSON with all main pages.

Instructions:
1. First fetch the homepage at ${url}
2. Extract all navigation links from the header/nav
3. Extract all footer links
4. Try to fetch /sitemap.xml if it exists
5. Fetch each discovered page (max 30 pages)
6. Return the results as JSON

Return format:
{
  "pages": [
    { "url": "...", "title": "...", "content": "..." }
  ],
  "navigation": ["...", "..."],
  "footerLinks": ["...", "..."]
}
`;

    const result = await this.runAgent(userMessage, queryOptions);
    return JSON.parse(result);
  }

  private async runExtractorAgent(crawlResult: CrawlResult): Promise<ExtractResult> {
    const queryOptions: Options = {
      systemPrompt: {
        type: "text" as const,
        text: getExtractorAgentPrompt(),
      },
      allowedTools: [], // No tools needed, just analysis
      maxTurns: 1,
      model: "claude-sonnet-4-20250514",
    };

    const userMessage = `
Extract brand elements from the following crawled website data:

${JSON.stringify(crawlResult, null, 2)}

Return a JSON object with:
- colors: { primary, secondary, accent, background, text, palette }
- typography: { headingFont, bodyFont, monoFont }
- socialLinks: { twitter, linkedin, github, etc }
- navigation: { style, items }
- trustSignals: { customerLogos, testimonials, metrics }
`;

    const result = await this.runAgent(userMessage, queryOptions);
    return JSON.parse(result);
  }

  private async runAnalystAgent(
    crawlResult: CrawlResult,
    extractResult: ExtractResult
  ): Promise<AnalysisResult> {
    const queryOptions: Options = {
      systemPrompt: {
        type: "text" as const,
        text: getAnalystAgentPrompt(),
      },
      allowedTools: [],
      maxTurns: 1,
      model: "claude-sonnet-4-20250514",
    };

    const userMessage = `
Analyze this website and provide insights:

CRAWLED CONTENT:
${JSON.stringify(crawlResult, null, 2)}

EXTRACTED BRAND DATA:
${JSON.stringify(extractResult, null, 2)}

Return a JSON object with:
- company: { name, tagline, description, stage, industry }
- product: { type, offerings, pricingModel }
- icp: { targetAudience, companySize, personas, useCases }
- visualStyle: { aesthetic, characteristics }
- opportunities: [{ category, priority, title, description, recommendation }]
`;

    const result = await this.runAgent(userMessage, queryOptions);
    return JSON.parse(result);
  }

  private async runAgent(userMessage: string, options: Options): Promise<string> {
    const messages: SDKUserMessage[] = [
      { type: "user", content: userMessage },
    ];

    async function* generateMessages(): AsyncIterable<SDKUserMessage> {
      for (const msg of messages) {
        yield msg;
      }
    }

    const response = query({
      prompt: generateMessages(),
      options,
    });

    let result = "";
    for await (const msg of response) {
      if (msg.type === "assistant") {
        result += msg.content;
      }
    }

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = result.match(/```json\n?([\s\S]*?)\n?```/) ||
                      result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[1] || jsonMatch[0];
    }
    return result;
  }

  private assembleResult(
    url: string,
    crawlResult: CrawlResult,
    extractResult: ExtractResult,
    analysisResult: AnalysisResult
  ): BrandProfileData {
    return {
      meta: {
        id: crypto.randomUUID(),
        url,
        analyzedAt: new Date().toISOString(),
        status: "completed",
        pagesCrawled: crawlResult.pages.length,
      },
      company: analysisResult.company,
      product: analysisResult.product,
      icp: analysisResult.icp,
      brand: {
        colors: extractResult.colors,
        typography: extractResult.typography,
        visualStyle: analysisResult.visualStyle,
        voice: analysisResult.voice || { tone: "professional", characteristics: [] },
        logoUrl: extractResult.logoUrl,
      },
      siteArchitecture: {
        pages: crawlResult.pages.map((p) => ({
          url: p.url,
          title: p.title,
          type: inferPageType(p.url),
          inNavigation: crawlResult.navigation.includes(p.url),
        })),
        navigation: {
          style: extractResult.navigation?.style || "top-horizontal",
          items: crawlResult.navigation,
        },
        hasSearch: extractResult.hasSearch || false,
        hasBlog: crawlResult.pages.some((p) => p.url.includes("/blog")),
        hasDocs: crawlResult.pages.some((p) => p.url.includes("/docs")),
        hasChangelog: crawlResult.pages.some((p) => p.url.includes("/changelog")),
      },
      socialPresence: {
        links: extractResult.socialLinks,
        appStores: extractResult.appStores || {},
        other: extractResult.otherLinks || [],
      },
      trustSignals: extractResult.trustSignals,
      opportunities: analysisResult.opportunities,
    };
  }
}
```

### Agent System Prompts

```typescript
// server/control-plane/services/brand-analyzer/prompts/crawler-agent.ts

export function getCrawlerAgentPrompt(): string {
  return `You are a web crawler agent specialized in discovering and fetching website pages.

Your job is to:
1. Start from a homepage URL
2. Discover all main/important pages (navigation, footer, sitemap)
3. Fetch each page's content
4. Return structured data about what you found

Rules:
- Only fetch pages on the SAME domain (no external links)
- Skip deep blog post archives (just get /blog landing)
- Skip documentation beyond the landing page
- Skip pagination (?page=2, etc)
- Skip auth-gated pages (/login, /signup, /dashboard)
- Maximum 30 pages total
- Wait briefly between requests to be respectful

When using WebFetch:
- Extract the main text content, not raw HTML
- Note the page title from <title> tag
- Identify navigation links
- Identify footer links

Always return valid JSON in your final response.`;
}

// server/control-plane/services/brand-analyzer/prompts/extractor-agent.ts

export function getExtractorAgentPrompt(): string {
  return `You are a brand extraction agent specialized in identifying visual and structural brand elements from website content.

Your job is to analyze crawled website data and extract:

1. **Colors**
   - Look for CSS color values (hex, rgb, hsl)
   - Identify primary (main brand color), secondary, accent colors
   - Look for color references in class names (bg-blue-500, text-primary)
   - Common patterns: buttons, links, headers often use brand colors

2. **Typography**
   - Look for Google Fonts links
   - Look for font-family declarations
   - Identify heading vs body fonts
   - Look for monospace fonts (often used in tech sites)

3. **Social Links**
   - Twitter/X, LinkedIn, GitHub, YouTube, Discord, etc.
   - App Store / Play Store links
   - Product Hunt, etc.

4. **Trust Signals**
   - Customer logos ("Trusted by...", "Used by...")
   - Testimonials with quotes and attribution
   - Metrics ("10,000+ users", "$1B processed")
   - Certifications (SOC 2, GDPR, etc.)
   - Press logos

5. **Navigation Structure**
   - Main nav items
   - Navigation style (horizontal, sidebar, hamburger)

Return valid JSON matching the expected schema.`;
}

// server/control-plane/services/brand-analyzer/prompts/analyst-agent.ts

export function getAnalystAgentPrompt(): string {
  return `You are a brand analyst agent specialized in interpreting website content to understand a company's positioning, product, and target market.

Your job is to analyze website content and provide insights:

1. **Company Information**
   - Company name (from logo, title, footer)
   - Tagline / value proposition (usually hero section)
   - Description (what they do in 1-2 sentences)
   - Stage: startup (< 50 employees), growth (50-500), enterprise (500+)
   - Industry classification

2. **Product Analysis**
   - Type: saas, marketplace, ecommerce, media, agency, other
   - Main offerings / product lines
   - Pricing model: free, freemium, paid, enterprise, usage-based
   - Tech stack hints (from job postings, blog, or explicit mentions)

3. **ICP (Ideal Customer Profile)**
   - Who is the messaging targeting?
   - Company size focus: SMB, mid-market, enterprise, consumer
   - Industries they serve
   - Personas (job titles mentioned)
   - Use cases they highlight

4. **Visual Style Analysis**
   - Aesthetic: modern-minimal, playful, corporate, bold, elegant
   - Characteristics: clean, colorful, dark mode, gradients, etc.
   - Icon style: outline, filled, duotone
   - Illustration style if present

5. **Opportunities for Improvement**
   - UX issues you notice
   - Missing pages/content (no pricing? no about page?)
   - Conversion optimization opportunities
   - Trust signal gaps
   - Mobile considerations

Be specific and actionable in opportunities. Cite evidence from the content.

Return valid JSON matching the expected schema.`;
}
```

### TypeScript Types

```typescript
// server/control-plane/types/brand-profile.ts

export type BrandProfileStatus =
  | "pending"
  | "crawling"
  | "extracting"
  | "analyzing"
  | "completed"
  | "failed";

export interface BrandProfile {
  id: string;
  user_id: string;
  url: string;
  status: BrandProfileStatus;
  error_message?: string;
  profile_data?: BrandProfileData;
  pages_crawled?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface BrandProfileData {
  meta: {
    id: string;
    url: string;
    analyzedAt: string;
    status: "completed";
    pagesCrawled: number;
  };
  company: {
    name: string;
    legalName?: string;
    tagline?: string;
    description: string;
    foundedYear?: number;
    stage: "startup" | "growth" | "enterprise" | "unknown";
    industry: string;
    headquarters?: string;
  };
  product: {
    type: "saas" | "marketplace" | "ecommerce" | "media" | "agency" | "other";
    offerings: Array<{
      name: string;
      description: string;
      category: "primary" | "secondary" | "add-on";
    }>;
    pricingModel: "free" | "freemium" | "paid" | "enterprise" | "usage-based" | "unknown";
    pricingUrl?: string;
    hasFreeTier?: boolean;
    techStackHints?: string[];
  };
  icp: {
    targetAudience: string;
    companySize: "smb" | "mid-market" | "enterprise" | "consumer" | "mixed";
    industries: string[];
    personas: Array<{
      title: string;
      painPoints?: string[];
    }>;
    useCases: string[];
  };
  brand: {
    colors: {
      primary: string;
      secondary?: string;
      accent?: string;
      background: string;
      text: string;
      palette: string[];
    };
    typography: {
      headingFont?: string;
      bodyFont?: string;
      monoFont?: string;
    };
    visualStyle: {
      aesthetic: "modern-minimal" | "playful" | "corporate" | "bold" | "elegant" | "other";
      characteristics: string[];
      iconStyle?: "outline" | "filled" | "duotone";
      illustrationStyle?: string;
    };
    voice: {
      tone: "formal" | "professional-friendly" | "casual" | "playful";
      characteristics: string[];
    };
    logoUrl?: string;
  };
  siteArchitecture: {
    pages: Array<{
      url: string;
      title: string;
      type: "landing" | "pricing" | "about" | "blog" | "docs" | "contact" | "other";
      inNavigation: boolean;
    }>;
    navigation: {
      style: "top-horizontal" | "sidebar" | "hamburger";
      items: string[];
    };
    hasSearch: boolean;
    hasBlog: boolean;
    hasDocs: boolean;
    hasChangelog: boolean;
  };
  socialPresence: {
    links: {
      twitter?: string;
      linkedin?: string;
      github?: string;
      youtube?: string;
      discord?: string;
      slack?: string;
      facebook?: string;
      instagram?: string;
    };
    appStores: {
      ios?: string;
      android?: string;
    };
    other: Array<{
      name: string;
      url: string;
    }>;
  };
  trustSignals: {
    customerLogos: string[];
    testimonials: Array<{
      quote: string;
      author: string;
      title?: string;
      company?: string;
    }>;
    metrics: Array<{
      value: string;
      label: string;
    }>;
    certifications: string[];
    pressLogos: string[];
  };
  opportunities: Array<{
    category: "ux" | "conversion" | "content" | "seo" | "trust" | "mobile";
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    recommendation: string;
  }>;
}

// Internal types for agent communication
export interface CrawlResult {
  pages: Array<{
    url: string;
    title: string;
    content: string;
  }>;
  navigation: string[];
  footerLinks: string[];
}

export interface ExtractResult {
  colors: BrandProfileData["brand"]["colors"];
  typography: BrandProfileData["brand"]["typography"];
  socialLinks: BrandProfileData["socialPresence"]["links"];
  appStores?: BrandProfileData["socialPresence"]["appStores"];
  otherLinks?: BrandProfileData["socialPresence"]["other"];
  navigation?: { style: string };
  trustSignals: BrandProfileData["trustSignals"];
  hasSearch?: boolean;
  logoUrl?: string;
}

export interface AnalysisResult {
  company: BrandProfileData["company"];
  product: BrandProfileData["product"];
  icp: BrandProfileData["icp"];
  visualStyle: BrandProfileData["brand"]["visualStyle"];
  voice?: BrandProfileData["brand"]["voice"];
  opportunities: BrandProfileData["opportunities"];
}
```

### Server Registration

```typescript
// In server/control-plane/server.ts

import { BrandAnalyzerService } from "./services/brand-analyzer/BrandAnalyzerService";

// ... existing code ...

// Initialize service
const brandAnalyzerService = new BrandAnalyzerService(cacheClient, baseLogger);

// Register routes
brandAnalyzerService.registerRoutes(fastify);

// Start background worker
brandAnalyzerService.startWorker();

// Add to shutdown
fastify.addHook("onClose", async () => {
  brandAnalyzerService.shutdown();
  // ... other cleanup
});
```

### File Structure

```
server/control-plane/
├── services/
│   └── brand-analyzer/
│       ├── BrandAnalyzerService.ts      # Main service with routes & worker
│       ├── agents/
│       │   └── BrandAnalyzerOrchestrator.ts  # Agent coordination
│       └── prompts/
│           ├── crawler-agent.ts
│           ├── extractor-agent.ts
│           └── analyst-agent.ts
├── types/
│   └── brand-profile.ts                 # TypeScript types
└── sql/
    └── 20240130_create_brand_profiles.sql  # Database migration

web-application/
├── src/
│   ├── pages/
│   │   └── brand-analyzer/
│   │       ├── index.tsx               # List page
│   │       └── [id].tsx                # Detail page
│   └── components/
│       └── brand-analyzer/
│           ├── BrandProfileList.tsx
│           ├── BrandProfileCard.tsx
│           └── URLInputForm.tsx
```

### Implementation Order

1. **Database**: Create `brand_profiles` table
2. **Types**: Add TypeScript types
3. **Service skeleton**: Routes + basic CRUD
4. **Orchestrator**: Agent coordination logic
5. **Prompts**: System prompts for each agent
6. **Background worker**: Processing loop
7. **Frontend**: Basic UI
8. **Testing**: End-to-end flow
