# Nucleate Website Builder Framework
**Internal Reference Doc — v2**

This document defines how Nucleate builds **AI-powered business websites** and provides a **repeatable framework** for generating vertical-specific landing pages (lawyers, pharmacies, CPAs, trainers, etc.) using AI.

**SEO Note:** Use "website" in SEO-facing elements (titles, H1s, meta, URLs). Differentiate in body copy by positioning as "more than a website."

This is designed to be:
- Dropped directly into the repo
- Used by AI agents
- Scalable to 100+ small business verticals
- Strictly consistent in structure and positioning

---

## 1. What Nucleate Builds (Authoritative Definition)

Nucleate builds **AI-powered websites** that go beyond static pages.

Every Nucleate website:
- Presents the business professionally
- Educates visitors
- Captures intent through smart forms
- Routes real customer requests
- Integrates with existing tools
- Is editable via AI chat—no code required

These websites sit **in front of** execution software (CRMs, scheduling tools, POS, etc.) and serve as the business's digital front door.

---

## 2. What Nucleate Does NOT Replace

Nucleate does **not** attempt to replace:
- Scheduling engines
- CRMs
- Case / patient management
- POS systems
- Compliance-heavy backend software

Nucleate **orchestrates** the interaction layer instead of owning execution.

---

## 3. Core Mental Model

> **Nucleate is an AI website builder for small businesses—websites you can edit by chatting.**

**SEO headline:** "AI Website Builder for [Vertical]"
**Differentiator:** "More than a website—a client-ready site you can update with AI"

This framing must remain consistent across:
- Homepage
- Vertical landing pages
- Demos
- Sales copy
- AI-generated content

---

## 4. Universal Website Primitives

All Nucleate websites are composed of the same primitives.
Verticals only change **language and defaults**, not structure.

---

### 4.1 Pages  
Structured destinations with intent.

Examples:
- Home
- Services
- About
- Contact
- Location

Pages are purposeful and conversion-oriented.

---

### 4.2 Sections  
Reusable blocks within pages.

Examples:
- Hero
- Offerings list
- Testimonials
- FAQs
- Call-to-action

---

### 4.3 Offerings (Alias Entity)

Internally, all offerings share the same structure.

Externally, the label changes by vertical.

| Vertical | External Name |
|--------|---------------|
| Lawyer | Practice Areas |
| Dentist | Services |
| Restaurant | Menu Items |
| CPA | Services |
| Trainer | Programs |
| Consultant | Offerings |

---

### 4.4 Forms (Core Interaction Primitive)

Forms are first-class system components.

Forms capture:
- Leads
- Requests
- Inquiries
- Pre-qualification data

Forms may include:
- Required fields
- Conditional questions
- Routing rules
- Notifications

Forms = lightweight workflows.

---

### 4.5 Calls to Action (CTAs)

Explicit conversion triggers.

Examples:
- Request a consultation
- Get a quote
- Contact us
- View menu
- Book a call

CTAs vary by page and vertical.

---

### 4.6 Logic (Smart Behavior)

Simple business logic that shapes flow.

Examples:
- Different forms per offering
- Route submissions to different emails
- Mobile-specific CTAs
- Conditional content visibility

This is **business logic**, not backend infrastructure.

---

### 4.7 Integrations (Orchestration Layer)

Nucleate connects outward rather than replacing tools.

Examples:
- Email
- Calendly
- Google Maps
- Ordering platforms
- CRMs (via exports / webhooks)

---

### 4.8 Content (AI-Editable)

All content is:
- Structured
- Editable
- Regeneratable

Examples:
- Headlines
- Descriptions
- FAQs
- Announcements
- Updates

---

### 4.9 AI Chat (Editing Interface)

Every Nucleate website includes a conversational AI interface for editing.

Owners can:
- Update content by describing changes in plain English
- Add new pages or offerings
- Modify forms and logic
- Regenerate copy with different tone or focus
- Iterate without technical skills or hiring help

This is what makes the website **evolvable**—not frozen at launch.

**Key differentiator:** "Edit your website by chatting with AI"

---

## 5. What Makes This More Than a Static Website

A Nucleate website:
- Has structured, editable entities
- Captures user intent through smart forms
- Applies business logic (routing, conditionals)
- Connects to external tools
- Evolves over time via AI chat

Static websites and DIY builders don't offer this.

---

## 6. Verticalization Framework (Reusable Pattern)

Every vertical landing page must follow the same logical structure.

1. Who this is for  
2. What hurts today  
3. What they actually need  
4. What Nucleate builds for them  
5. Example system (concrete)  
6. Clear CTA  

Only **language, tone, and defaults** change per vertical.

---

## 7. Example Vertical #1 — Lawyer (Solo / Small Firm)

### Who it’s for
- Solo attorneys
- Small law firms
- Non-technical, time-constrained

---

### What hurts
- Outdated websites
- High agency costs
- Poor lead quality
- Hard-to-edit content

---

### What they need
- Credibility
- Clear practice areas
- Easy client inquiries
- Control over updates

---

### What Nucleate builds

**Website Components**
- Pages: Home, Practice Areas, About, Contact
- Offerings: Practice Areas
- Forms: Consultation request
- Logic: Practice-specific intake questions
- Integrations: Email, optional scheduling link
- AI Chat: Update case results, add practice areas, edit bios

**Outcome**
> A professional, client-ready website that generates inquiries—editable via AI.

---

### Primary CTA
> Build my law firm website

---

## 8. Example Vertical #2 — Restaurant / Café

### Who it’s for
- Independent restaurants
- Cafés
- Food trucks

---

### What hurts
- Menus as PDFs
- Outdated hours
- Hard updates
- Poor mobile experience

---

### What they need
- Clear menu
- Fast updates
- Mobile-first experience
- Easy location info

---

### What Nucleate builds

**Website Components**
- Pages: Home, Menu, Location, Contact
- Offerings: Menu Items
- Forms: Catering or general inquiry
- Logic: Highlight "Open now", seasonal updates
- Integrations: Google Maps, delivery platforms
- AI Chat: Update menu items, change hours, add specials

**Outcome**
> A mobile-first website customers actually use—updated in seconds via AI.

---

### Primary CTA
> Build my restaurant website

---

## 9. Target Verticals (25)

| # | Vertical | Offerings Label | Primary Outcome | Example CTA |
|---|----------|-----------------|-----------------|-------------|
| 1 | Solo/Small Law Firms | Practice Areas | Get client inquiries | Build my law firm website |
| 2 | CPAs / Accountants | Services | Capture leads | Build my accounting website |
| 3 | Pharmacies | Services | Drive foot traffic | Build my pharmacy website |
| 4 | Dentists | Services | Book appointments | Build my dental website |
| 5 | Chiropractors | Services | Book consultations | Build my chiropractic website |
| 6 | Physical Therapists | Programs | Request evaluation | Build my PT website |
| 7 | Veterinarians | Services | Book visits | Build my vet clinic website |
| 8 | Real Estate Agents | Listings / Services | Get buyer/seller leads | Build my real estate website |
| 9 | Insurance Agents | Coverage Types | Get quote requests | Build my insurance website |
| 10 | Financial Advisors | Services | Schedule consultations | Build my advisor website |
| 11 | Personal Trainers / Gyms | Programs | Start free trial | Build my fitness website |
| 12 | Yoga / Pilates Studios | Classes | Book first class | Build my studio website |
| 13 | Salons / Barbershops | Services | Book appointments | Build my salon website |
| 14 | Spas / Massage Therapists | Treatments | Book sessions | Build my spa website |
| 15 | Photographers | Packages | Check availability | Build my photography website |
| 16 | Wedding Planners | Packages | Request consultation | Build my wedding planner website |
| 17 | Interior Designers | Services | Start a project | Build my design website |
| 18 | Landscapers | Services | Get estimates | Build my landscaping website |
| 19 | HVAC / Plumbers / Electricians | Services | Request service | Build my home services website |
| 20 | Auto Repair Shops | Services | Schedule repairs | Build my auto shop website |
| 21 | Restaurants / Cafés | Menu Items | View menu / Order | Build my restaurant website |
| 22 | Bakeries | Products | Place orders | Build my bakery website |
| 23 | Florists | Arrangements | Order flowers | Build my florist website |
| 24 | Tutors / Music Teachers | Lessons | Book trial lesson | Build my tutoring website |
| 25 | Therapists / Counselors | Specialties | Request appointment | Build my therapy website |

---

## 10. Landing Page Copy Creation Guide (For AI Agents)

Use this guide whenever generating a new vertical landing page.

---

### Step 1: Identify the Vertical

Define:
- Business type
- Typical customer
- Typical operator (owner, manager, etc.)

---

### Step 2: Define the Core Outcome

Answer:
> What must this system accomplish for the business to feel successful?

Examples:
- Get client inquiries
- Drive bookings
- Increase foot traffic
- Capture qualified leads

---

### Step 3: Map Offerings

Determine:
- What does this business sell or provide?
- What is the correct external label?

---

### Step 4: Define the Primary Interaction

Choose **one** main action:
- Contact request
- Inquiry
- Quote request
- Appointment request
- Information request

Avoid promising execution systems.

---

### Step 5: Choose the CTA Language

CTA must be:
- Outcome-focused
- Vertical-specific
- Simple

Examples:
- “Build my CPA system”
- “Create my fitness website”
- “Launch my pharmacy site”

---

### Step 6: Write the Page Using This Template

#### Hero
- Outcome-driven headline
- Calm, confident subheadline
- Single primary CTA

#### Pain Section
- 3–5 common frustrations
- Written in the customer’s language

#### Solution Section
- What Nucleate builds
- Framed as a system, not a tool

#### Example System
- Concrete components (pages, forms, logic)

#### CTA
- Repeat primary CTA

---

## 11. Vertical Prompt Template (Reusable)

Use this prompt to generate demos or landing copy:

> Build a professional, AI-powered website for a **[business type]** in **[location]**.
> The website should help them **[primary outcome]** and include pages for **[pages]**, offerings for **[offerings]**, and a form that captures **[request type]**. Make it editable via AI chat.

---

## 12. Language Rules (Must Follow)

### Use (SEO + Differentiation)
- AI website builder
- AI-powered website
- Edit with AI / Chat to update
- Client-ready
- Conversion-ready
- Built for [vertical]
- More than a template

### Avoid
- No-code / low-code jargon
- Backend terminology
- "System" in SEO-facing copy (use in body for differentiation)
- Overpromising execution features
- Infrastructure language

---

## 13. Final Anchor (Do Not Change)

> **Nucleate is an AI website builder for small businesses—professional, client-ready websites you can edit by chatting.**

All verticals, landing pages, and AI outputs must align with this statement.
