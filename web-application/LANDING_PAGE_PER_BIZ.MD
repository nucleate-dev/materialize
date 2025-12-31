# Nucleate System Framework  
**Internal Reference Doc — v1**

This document defines how Nucleate builds **client-facing business systems** and provides a **repeatable framework** for generating vertical-specific landing pages (lawyers, pharmacies, CPAs, trainers, etc.) using AI.

This is designed to be:
- Dropped directly into the repo
- Used by AI agents
- Scalable to 100+ small business verticals
- Strictly consistent in structure and positioning

---

## 1. What Nucleate Builds (Authoritative Definition)

Nucleate does **not** build “just websites.”

Nucleate builds **front-of-business systems** that:
- Present the business professionally
- Educate visitors
- Capture intent
- Route real customer requests
- Integrate with existing tools
- Are editable and evolvable over time

These systems sit **in front of** execution software (CRMs, scheduling tools, POS, etc.).

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

> **Nucleate is a system generator for the front door of a business.**

This framing must remain consistent across:
- Homepage
- Vertical landing pages
- Demos
- Sales copy
- AI-generated content

---

## 4. Universal System Primitives

All Nucleate systems are composed of the same primitives.  
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

## 5. What Makes This a “System” (Not a Website)

A Nucleate system:
- Has structured entities
- Captures user intent
- Applies business logic
- Routes outcomes
- Evolves over time

Static websites do not meet this definition.

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

**System Components**
- Pages: Home, Practice Areas, About, Contact
- Offerings: Practice Areas
- Forms: Consultation request
- Logic: Practice-specific intake questions
- Integrations: Email, optional scheduling link

**System Outcome**
> A client acquisition system for a law firm.

---

### Primary CTA
> Build my law firm system

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

**System Components**
- Pages: Home, Menu, Location, Contact
- Offerings: Menu Items
- Forms: Catering or general inquiry
- Logic: Highlight “Open now”, seasonal updates
- Integrations: Google Maps, delivery platforms

**System Outcome**
> A living storefront system customers actually use.

---

### Primary CTA
> Build my restaurant system

---

## 9. Landing Page Copy Creation Guide (For AI Agents)

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

## 10. Vertical Prompt Template (Reusable)

Use this prompt to generate demos or landing copy:

> Build a professional, conversion-ready system for a **[business type]** in **[location]**.  
> The system should help them **[primary outcome]** and include pages for **[pages]**, offerings for **[offerings]**, and a form that captures **[request type]**.

---

## 11. Language Rules (Must Follow)

### Use
- Business system
- Client-facing
- Conversion-ready
- Editable workflows
- Built for your industry

### Avoid
- No-code / low-code jargon
- Backend terminology
- Overpromising execution systems
- Infrastructure language

---

## 12. Final Anchor (Do Not Change)

> **Nucleate builds full-featured, client-facing business systems for the front door of a business.**

All verticals, landing pages, and AI outputs must align with this statement.
