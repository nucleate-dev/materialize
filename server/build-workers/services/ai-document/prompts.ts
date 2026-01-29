/**
 * Prompt templates for AI document generation
 */

import type { AIDocumentScreen } from "../../types/AIDocumentTypes.js";

/**
 * System prompt for PRD generation
 */
export const PRD_SYSTEM_PROMPT = `You are a senior product manager with experience at top tech companies like Stripe, Linear, Notion, and Airbnb. You are analyzing screenshots of an application to generate a comprehensive Product Requirements Document (PRD).

Your PRDs are:
- **Actionable**: Every section provides concrete guidance for engineering and design teams
- **Structured**: Following industry-standard PRD formats
- **Insightful**: Going beyond what's visible to infer user needs and business goals
- **Professional**: Written for stakeholder review and team alignment

Output your PRD in clean, well-formatted Markdown.`;

/**
 * Generate PRD user prompt with screen context
 */
export function generatePRDPrompt(
  screens: AIDocumentScreen[],
  prototypeName?: string,
  framework?: string,
  designSystem?: string,
): string {
  const screenList = screens
    .map((s, i) => `${i + 1}. **${s.path}** - [Screenshot ${i + 1}]`)
    .join("\n");

  const contextParts: string[] = [];
  if (prototypeName) contextParts.push(`Product Name: ${prototypeName}`);
  if (framework) contextParts.push(`Framework: ${framework}`);
  if (designSystem) contextParts.push(`Design System: ${designSystem}`);
  const contextSection =
    contextParts.length > 0
      ? `\n## Context\n${contextParts.join("\n")}\n`
      : "";

  return `Analyze the following ${screens.length} screen(s) and generate a comprehensive PRD.
${contextSection}
## Screens Provided
${screenList}

## Required PRD Sections

### 1. Executive Summary
- One paragraph overview of the product
- Primary value proposition
- Target launch timeline (infer from complexity)

### 2. Problem Statement
- What problem does this product solve?
- Who experiences this problem?
- Current alternatives and their limitations

### 3. User Personas
For each identified user type:
- Name and role
- Goals and motivations
- Pain points this product addresses
- Key jobs-to-be-done

### 4. Core Features
For each major feature visible in the screens:
- Feature name
- Description
- User story format: "As a [persona], I want to [action] so that [benefit]"
- Acceptance criteria (3-5 bullet points)
- Priority (P0/P1/P2)

### 5. User Flows
- Map out the primary user journeys through the screens
- Note entry points, decision points, and exit points
- Identify any gaps or missing screens

### 6. Technical Requirements
Based on the UI complexity:
- Frontend considerations
- Likely backend requirements
- Third-party integrations suggested by the UI
- Performance considerations

### 7. Success Metrics
- Primary KPIs to track
- Secondary metrics
- Suggested analytics events

### 8. Open Questions
- Decisions that need stakeholder input
- Areas needing user research
- Technical unknowns

### 9. Out of Scope
- Features that appear intentionally excluded
- Future considerations

Generate the PRD now, referencing specific screens where relevant.`;
}

/**
 * System prompt for design critique
 */
export const CRITIQUE_SYSTEM_PROMPT = `You are a principal product designer who has led design at companies like Linear, Stripe, Apple, and Figma. You are conducting a thorough design review of an application.

Your critiques are:
- **Constructive**: Every criticism comes with a specific solution
- **Evidence-based**: Citing design principles, heuristics, and research
- **Prioritized**: Focusing on high-impact improvements first
- **Actionable**: Providing specific implementation guidance

You reference well-designed products for inspiration: Linear, Notion, Stripe, Airbnb, Apple, Figma, Vercel, Raycast, Arc.

Output your critique in clean, well-formatted Markdown.`;

/**
 * Generate design critique user prompt with screen context
 */
export function generateCritiquePrompt(
  screens: AIDocumentScreen[],
  prototypeName?: string,
  framework?: string,
  designSystem?: string,
): string {
  const screenList = screens
    .map((s, i) => `${i + 1}. **${s.path}** - [Screenshot ${i + 1}]`)
    .join("\n");

  const contextParts: string[] = [];
  if (prototypeName) contextParts.push(`Product Name: ${prototypeName}`);
  if (framework) contextParts.push(`Framework: ${framework}`);
  if (designSystem) contextParts.push(`Design System: ${designSystem}`);
  const contextSection =
    contextParts.length > 0
      ? `\n## Context\n${contextParts.join("\n")}\n`
      : "";

  return `Conduct a comprehensive design review of the following ${screens.length} screen(s).
${contextSection}
## Screens to Review
${screenList}

## Required Critique Sections

### 1. Overall Assessment
- First impressions (be honest)
- Design maturity level (1-5 scale with explanation)
- Strongest aspects of the current design
- Most critical areas for improvement

### 2. Visual Design Analysis

#### Typography
- Font choices and hierarchy
- Readability and contrast
- Consistency across screens
- Specific recommendations

#### Color & Contrast
- Color palette effectiveness
- Accessibility (WCAG compliance)
- Emotional tone
- Specific hex code recommendations

#### Spacing & Layout
- Use of whitespace
- Grid consistency
- Visual rhythm
- Specific spacing recommendations

#### Visual Hierarchy
- Information architecture
- Attention flow
- Call-to-action prominence
- Recommendations

### 3. Screen-by-Screen Analysis
For each screen:
- **What works well** (2-3 points)
- **Usability concerns** (2-3 points)
- **Accessibility issues** (if any)
- **Specific improvements** (3-5 actionable items)

### 4. User Flow Analysis
- Journey coherence between screens
- Navigation clarity
- State management (loading, empty, error)
- Transition suggestions

### 5. Interaction Design
- Affordances and signifiers
- Feedback mechanisms
- Micro-interaction opportunities
- Animation recommendations

### 6. Consistency Audit
- Pattern inconsistencies across screens
- Component variations that should be unified
- Naming/labeling consistency

### 7. Priority Recommendations
Top 5 changes ranked by impact:
1. [Highest impact change]
2. ...
3. ...
4. ...
5. ...

For each, provide:
- What to change
- Why it matters
- How to implement
- Inspiration reference (specific app/site)

### 8. Inspiration Board
- 3-5 apps/products to reference for this type of UI
- What specifically to learn from each

Generate the design critique now, referencing specific screens where relevant.`;
}
