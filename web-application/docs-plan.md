Nucleate Docs — v1 Master Plan

Top-level navigation (final)

/docs
├─ Getting Started
├─ Build with AI
├─ Guides
├─ Deploy
├─ Troubleshooting
├─ Reference

Each section has a clear job-to-be-done.

⸻

1. Getting Started

Goal: user sees a real app running + understands Nucleate’s mental model

1.1 Getting Started with Nucleate
• Create a project
• Preview the app
• File structure overview
• Share & fork model
• How Nucleate differs from local dev

1.2 Nucleate vs Expo Snack
• When to use each
• Why Snack breaks down for real apps
• Router, theming, integrations, AI steering

1.3 How Nucleate Projects Are Structured
• App folders
• Where config lives
• Where AI edits should happen
• What users should not touch yet

⸻

2. Build with AI (⭐ Core Differentiator)

Goal: users stop “chatting” and start directing a codebase

2.1 Prompting in Nucleate (Cornerstone)

This should be one of your best-written pages.
• Mental model: “You are the tech lead”
• The 3-part prompt (Outcome / Constraints / Acceptance)
• Ask-for-plan → patch workflow
• Referencing files & asking for diffs
• One-task-at-a-time discipline

Includes:
• Best default prompt
• Good vs bad prompts
• Nucleate-specific prompting patterns

⸻

2.2 Fixing Errors While the App Is Running
• Error taxonomy:
• TypeScript errors
• Runtime red screens
• Metro / bundler issues
• 60-second triage checklist
• How to paste errors into prompts correctly
• Ask-for-root-cause-first pattern
• Rollback & isolation strategies

Includes:
• Copy-paste “error fix” prompt
• Common Expo / RN error buckets

⸻

2.3 Using the Default Theme System

Turn this into a selling point, not an implementation detail.

    •	Theme architecture overview
    •	Dark / light mode model
    •	Tokens: colors, spacing, typography, radii
    •	How to add a token
    •	How to theme a component correctly

Anti-patterns section (important):
• Hardcoded hex values
• Inline spacing
• Breaking dark mode contrast

⸻

2.4 Using CLAUDE.md Effectively
• What CLAUDE.md is (project constitution)
• What belongs in it vs prompts
• Recommended sections:
• Code conventions
• UI rules
• Libraries to use/avoid
• Performance rules
• Definition of done
• How to keep it short & powerful
• How to explicitly invoke it in prompts

Includes:
• Nucleate starter CLAUDE.md
• Prompt snippets that reference it

⸻

2.5 Common AI Workflows
• Build a new screen
• Refactor a component safely
• Add a feature without breaking existing flows
• Ask the agent to explain code it generated

(You can ship this slightly later.)

⸻

3. Guides (Product Capabilities)

Goal: unblock real apps, fast

3.1 Using Environment Variables
• Build-time vs runtime
• API keys & secrets
• Common mistakes

3.2 Add Supabase to Your App
• Client setup
• Auth basics
• Database queries
• Env vars

3.3 Authentication Patterns
• Email/password
• Magic links
• OAuth
• Session handling

3.4 Using Expo Router
• File-based routing
• Tabs & stacks
• Deep linking
• Navigation gotchas

3.5 Assets: Icons, Splash Screens, Fonts
• App icons
• Splash screens
• Custom fonts
• Previewing changes

3.6 Push Notifications
• Permissions
• Tokens
• Sending test notifications

3.7 Payments & Subscriptions
• RevenueCat
• Stripe
• Store test users
• Common review issues

⸻

4. Deploy

Goal: get users to “I shipped” with minimal fear

4.1 Deploy to TestFlight (iOS)
• Apple Developer setup
• Bundle IDs
• EAS config
• Common failures

4.2 Submit to the App Store
• Metadata
• Screenshots
• Review checklist
• Rejection gotchas

4.3 Deploy to Google Play
• Internal testing
• Keystores
• Production rollout

4.4 Updating an Existing App
• New builds
• Versioning
• Hotfix workflow

⸻

5. Troubleshooting

Goal: deflect support and reduce rage-quits

5.1 Debugging Build Failures
• EAS build errors
• Native dependency issues
• Missing env vars

5.2 App Crashes & Blank Screens
• Runtime debugging
• Common causes
• Isolation techniques

5.3 AI Didn’t Do What I Wanted
• Prompt too vague
• Missing constraints
• Conflicting instructions
• Reset strategies

⸻

6. Reference

Goal: trust + clarity

6.1 Supported Expo Versions & Limits
• SDK versions
• Unsupported features
• Workarounds

6.2 Security & Privacy
• Secrets handling
• Data isolation
• AI access boundaries

6.3 Known Limitations & Roadmap
• What’s not supported yet
• What’s coming
• How to give feedback

⸻

Global rules for all docs (important)

Every page must include:
• What you’ll accomplish
• Step-by-step
• Checklist
• Common issues
• What’s next

Every page should end with:

Still stuck? Ask Nucleate →
(pre-filled with page context)

⸻

Execution recommendation (realistic)

Phase 1 (must-have, launch docs):
• Getting Started
• Prompting in Nucleate
• Fixing Errors While Running
• Theme System
• Deploy to TestFlight
• Debugging Build Errors

Phase 2 (power users):
• Supabase
• Auth
• Expo Router
• Payments
• CLAUDE.md
