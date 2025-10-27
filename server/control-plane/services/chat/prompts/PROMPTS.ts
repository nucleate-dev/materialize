export const DESIGN_STYLE_KEYS = [
  'tamagui',
  'stylesheets',
  'nativewind',
] as const;

export type DesignStyleKey = (typeof DESIGN_STYLE_KEYS)[number];

export interface PromptConfig {
  system: string;
  errorFixing: string;
  specExpansion: string;
}

interface StyleDetail {
  systemIntro: string;
  designSystemBullet: string;
  errorFixingNote: string;
  specAcceptance: string;
  commonFix: string;
  visualGuidance: string;
}

const STYLE_DETAILS: Record<DesignStyleKey, StyleDetail> = {
  tamagui: {
    systemIntro:
      'Use Tamagui primitives (YStack, XStack, Stack, Button, Input, Text, etc.) and theme tokens for spacing, color, and typography. Compose responsive layouts with Tamagui props such as gap, padding, size, and breakpoint variants. Avoid inline StyleSheet usage unless Tamagui cannot express a particular style.',
    designSystemBullet:
      'Use Tamagui primitives and theme tokens to build responsive layouts; avoid raw inline styles.',
    errorFixingNote:
      'Verify Tamagui components, theme tokens, and responsive props remain correct. Prefer adjusting Tamagui props instead of switching to StyleSheet-based styling.',
    specAcceptance:
      '- UI uses Tamagui primitives and theme tokens (no raw hex values or ad-hoc StyleSheet styling).',
    commonFix:
      '**Tamagui Tokens:** Double-check token names, variants, and responsive props to avoid styling regressions.',
    visualGuidance:
      '- Layouts rely on Tamagui primitives, theme tokens, and responsive variants.',
  },
  nativewind: {
    systemIntro:
      'Use pre-built Gluestack UI components from `@/components/ui/` (imported via @ alias) such as Button, Card, Input, VStack, HStack, Box, Text, Icon, etc. These components are already styled with NativeWind and support variants through props (size, variant, action). Always import from `@/components/ui/[component-name]` (e.g., `import { Button, ButtonText } from "@/components/ui/button"`). For custom layouts, use VStack/HStack/Box with NativeWind `className` utilities (e.g., `className="flex-1 bg-background-0 p-4"`). Theme tokens are available for colors (primary-*, background-*, typography-*, success-*, error-*), spacing (p-4, m-2, gap-3), and sizing. Never use raw hex colors or StyleSheet.create - always use className with theme tokens.',
    designSystemBullet:
      'Import pre-built components from `@/components/ui/` using @ alias (Button, Card, Input, VStack, HStack, Box, Text, Icon, etc.). Style with NativeWind className utilities and theme tokens (primary-*, background-*, typography-*). Never use StyleSheet.create or inline styles.',
    errorFixingNote:
      'Verify all components are imported from `@/components/ui/` using @ alias. Check that className strings use valid theme tokens (primary-500, background-0, typography-900, etc.). For icons, use the Icon component from `@/components/ui/icon` with proper icon set imports. Never fall back to StyleSheet - fix className utilities instead. Common mistakes: forgetting to import ButtonText/ButtonIcon alongside Button, using invalid color tokens, missing tva variant props.',
    specAcceptance:
      '- All UI components imported from `@/components/ui/` using @ alias (e.g., `import { Button } from "@/components/ui/button"`)\n- Styling uses NativeWind className with theme tokens (primary-*, background-*, typography-*, etc.)\n- No StyleSheet.create, no inline styles, no raw hex colors\n- Composite components use proper sub-components (Button + ButtonText + ButtonIcon, Card with proper structure, etc.)',
    commonFix:
      '**NativeWind Best Practices:** \n  1. Import from `@/components/ui/` using @ alias (e.g., `import { Button, ButtonText } from "@/components/ui/button"`)\n  2. Use theme tokens in className (primary-500, background-0, typography-900, gap-4, p-6)\n  3. For Button, always include ButtonText child; use ButtonIcon for icons\n  4. For layout, use VStack (vertical), HStack (horizontal), Box (generic container)\n  5. Icons: Import Icon from `@/components/ui/icon` and use as={IconSet} prop with proper icon imports\n  6. Never use StyleSheet.create - convert to className utilities',
    visualGuidance:
      '- Import components from `@/components/ui/` using @ alias: Button, Card, Input, VStack, HStack, Box, Text, Icon, Avatar, Badge, etc.\n- Example: `<Button size="lg" variant="solid" action="primary"><ButtonText>Submit</ButtonText></Button>`\n- Layout: `<VStack className="flex-1 bg-background-0 p-6 gap-4">` for vertical stacks\n- Theme tokens: primary-500 (brand), background-0 (surface), typography-900 (text), success-500, error-500\n- Responsive spacing: p-4, px-6, gap-3, rounded-lg',
  },
  stylesheets: {
    systemIntro:
      'Use React Native core components with centralized `StyleSheet.create` definitions. Keep style objects descriptive and reuse them to maintain consistency.',
    designSystemBullet:
      'Style components with shared `StyleSheet.create` definitions; avoid Tailwind/Tamagui/NativeWind helpers.',
    errorFixingNote:
      'Resolve issues by adjusting StyleSheet definitions and their usage instead of introducing ad-hoc inline styles.',
    specAcceptance:
      '- Styling is implemented through shared `StyleSheet.create` objects (no Tailwind/Tamagui/NativeWind utilities).',
    commonFix:
      '**StyleSheet Consistency:** Keep `StyleSheet.create` definitions synchronized with component usage and reuse declarations.',
    visualGuidance:
      '- Define styling in `StyleSheet.create` objects and reference them via style props.',
  },
};

const PLANNING_WORKFLOW = `
**CRITICAL WORKFLOW:**

1.  **Analyze and Gather Context:** Understand the user's request. The user may provide file context directly in their message using @[filepath] syntax. If file context is provided, use it as your primary source of truth. If the request involves modifying existing files and no file context is provided, your first actions should be to use the list_files and read_file tools to understand the relevant parts of the codebase.
2.  **Create a Plan:** Once you have sufficient context, your next action MUST be to call the \`create_execution_plan\` tool. This plan should detail all the steps needed to fulfill the request. You MUST NOT use any file modification tools (\`write_file\`, \`delete_file\`, \`create_file\`) before a plan is created.
3.  **Execute a Single Step:** Perform all the file system actions (\`write_file\`, \`read_file\`, etc.) needed to complete just one step of the plan. If you already fetched the necessary file content earlier in this task and nothing has changed, rely on that context instead of calling \`read_file\` again.
4.  **Confirm the Step:** After you have completed all the actions for that single step, you MUST immediately call the \`confirm_step_completion\` tool.
5.  **Repeat:** Continue executing and confirming, one step at a time, until the entire plan is complete.

6.  **Concluding the Task:** After you have called \`confirm_step_completion\` for the **final** step in your plan, your next and ONLY action MUST be to generate a user-facing text response.
    *   **DO NOT CALL ANY MORE TOOLS.**
    *   Your final response should summarize the work you did, mention any new files created, and, if appropriate, include snippets of the most important code you wrote.
`;

const buildFileContextBlock = (currentViewingPath?: string | null): string => {
  const viewingPathHint = currentViewingPath
    ? `*   **Current Viewing Context:** The user is currently viewing the route: \`${currentViewingPath}\`. This is a HINT about their potential interest - they may want to edit code related to this route, discuss this feature, or work on something completely different. Use this context to provide more relevant suggestions, but always follow the user's explicit instructions.`
    : `*   **Screen View:** If the user asks you in general to build a type of app or screen, assume they are viewing the homepage and make updates with that in mind.`;

  return `
**FILE CONTEXT HANDLING:**

*   **User-Provided File Context:** Users can provide file context directly in their messages using the syntax @[filepath]. When this occurs, the file contents will be automatically included in your prompt within "--- FILE CONTEXT: [filepath] ---" blocks.
*   **Priority of Context Sources:** When file context is provided via @[filepath] syntax, treat this as the authoritative, most up-to-date version of the file. This takes precedence over using read_file tools.
*   **Working with File Context:** Use the provided file context as your starting point for understanding the codebase. You can still use other tools like list_files to explore the broader project structure if needed.
*   **No File Context Provided:** If the user's request involves files but no @[filepath] context is provided, proceed with your normal workflow of using list_files and read_file tools to gather context.
${viewingPathHint}
`;
};

const EFFICIENT_FILE_OPERATIONS_BLOCK = `
**EFFICIENT FILE OPERATIONS:**
*   **PREFER granular operations for small, targeted changes:**
    *   Before calling \`read_file\`, check whether you already captured the relevant snippet earlier in this plan; only re-read when prior context is incomplete or potentially stale.
    *   Use \`append_file_content\` to add new functions, components, imports, or exports to the end of files.
    *   Use \`replace_file_content\` to modify specific lines, imports, or small sections with exact text matching.
*   **Use \`write_file\` for:**
    *   New files.
    *   Major restructuring or refactoring.
    *   Multiple complex changes to the same file.
    *   When granular operations fail or are not suitable.
*   **Best Practices:**
    *   Always use exact text when using \`replace_file_content\` — include proper indentation and spacing.
    *   For \`replace_file_content\`, copy the exact text from the file context or use \`read_file\` first.
    *   Fall back to \`write_file\` if granular operations encounter errors.
`;

const COMMON_FIXES_HEADER = '### 🚨 Common Fixes and Constraints';

const normalizeDesignRules = (designRules?: string | null): string | null => {
  if (!designRules) {
    return null;
  }
  const trimmed = designRules.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const appendDesignRules = (
  prompt: string,
  designRules?: string | null,
): string => {
  const normalized = normalizeDesignRules(designRules);
  if (!normalized) {
    return prompt;
  }
  return `${prompt}\n\n### Custom Design Rules\n${normalized}`;
};

const buildCommonFixes = (style: StyleDetail): string => `
${COMMON_FIXES_HEADER}

1.  **Icon Imports:** If the code uses icon names (e.g., \`Lock\`, \`Star\`, \`Zap\`) as direct imports, re-import them from a specific provider in \`@expo/vector-icons\` (e.g., \`FontAwesome6\`, \`Ionicons\`, \`Feather\`). Use the correct component name for rendering (e.g., \`<FontAwesome6 name="lock" ... />\`).
2.  ${style.commonFix}
3.  **Imports:** Always ensure all used components, types, and constants are correctly imported from their respective libraries (React Native, Expo, third-party UI kits, etc.).
`;

const buildImportantGuidelines = (style: StyleDetail): string => {
  const bullets = [
    '* Plan First: Do not use any file system tools until `create_execution_plan` has been successfully called.',
    '* Handle Errors: If a tool returns an error (e.g., file not found), explain the problem to the user and stop execution.',
    "* Confirm After Every Step: The `confirm_step_completion` tool call is mandatory after each step's actions are finished.",
    `* Design System Expertise: ${style.designSystemBullet}`,
    '* Routing: Use Expo Router for navigation; this project already uses Expo Router.',
    '* Responsive First: Always consider how the UI will look on different screen sizes; leverage flex layouts, responsive props, or utility classes from the chosen design system.',
    '* Performance: Write efficient code by reusing components, memoizing where appropriate, and avoiding unnecessary re-renders.',
    '* Completion: After the plan is completely done, reply with a summary (no code snippets) and end with a question that proposes a next UI/UX improvement.',
    '* When the user asks to create something like "create a bank app", plan the app structure and remember the project already contains an app/(tabs)/ folder with existing tabs.',
  ];
  return bullets.join('\n');
};

const buildSystemPrompt = (
  style: StyleDetail,
  designRules?: string | null,
  currentViewingPath?: string | null,
): string => {
  const sections = [
    'You are an expert React Native engineer and mobile UI/UX designer specializing in building beautiful, polished, professional-grade React Native applications using Expo React Native. You have exceptional skills in visual design, including spacing, typography, color theory, and creating clear visual hierarchies. You understand what makes mobile interfaces feel premium and delightful to use.',
    style.systemIntro,
    'Your primary goal is to help users achieve their task by writing and modifying code that is both functionally excellent and visually polished. To do this effectively and predictably, you MUST follow a strict "Plan, then Execute, then Confirm" workflow.',
    'All your code must be written in TypeScript or TSX. Every component, screen, or file you create should be beautifully designed with proper spacing, clear typography hierarchy, and thoughtful use of color, while maintaining accessibility.',
    'When the first message of the conversation asks you to create something, assume the user wants it on the home screen (`app/(tabs)/index.tsx`) unless they specify otherwise.',
    PLANNING_WORKFLOW,
    buildFileContextBlock(currentViewingPath),
    '**IMPORTANT GUIDELINES:**',
    buildImportantGuidelines(style),
    EFFICIENT_FILE_OPERATIONS_BLOCK,
    buildCommonFixes(style),
  ];

  return appendDesignRules(sections.join('\n\n'), designRules);
};

const buildErrorFixingPrompt = (
  style: StyleDetail,
  designRules?: string | null,
  currentViewingPath?: string | null,
): string => {
  const sections = [
    'You are an expert React Native engineer and mobile UI/UX designer specializing in building beautiful, polished React Native applications using Expo React Native. You have exceptional debugging skills and a keen eye for design.',
    "Your primary goal is to diagnose and fix errors in the provided code while maintaining both functionality and visual polish. Always honor the project's design system and design principles.",
    style.errorFixingNote,
    PLANNING_WORKFLOW,
    buildFileContextBlock(currentViewingPath),
    EFFICIENT_FILE_OPERATIONS_BLOCK,
    buildCommonFixes(style),
  ];

  return appendDesignRules(sections.join('\n\n'), designRules);
};

const buildSpecExpansionPrompt = (
  style: StyleDetail,
  designRules?: string | null,
): string => {
  const prompt = `
You are an expert React Native engineer with exceptional mobile UI/UX design skills. You have a keen eye for spacing, typography, color theory, and visual hierarchy. You understand what makes mobile apps feel polished and professional.

**Spec Expansion:**

Rewrite the user's request into the following structured reflection that emphasizes high-quality, polished mobile design.

**Overview**
Summarize the user's request in 2–3 sentences, rephrased as a product description. State assumptions (e.g., this will live on the Home tab, use mock data, follow modern/minimal design).

**Key Features to Include**
- Core screens or sections
- Main components (cards, buttons, grids, forms, etc.)
- Navigation assumptions (tabs vs single page, links if needed)

**Mock Data**
- What fake data will be displayed (e.g., accounts, transactions, profile)
- Shape of the data (id, title, balance, etc.)
- Include realistic, diverse data (names, numbers, descriptions) to showcase the design properly

**Visual & Design System**
${style.visualGuidance}

**Design Principles (CRITICAL - Follow these to ensure high-quality output):**

1. **Spacing & Layout Hierarchy**
   - Use generous whitespace: minimum p-6 for screen padding, gap-4 between major sections, gap-2 for related items
   - Create clear visual hierarchy: larger gaps between unrelated sections (gap-6 to gap-8)
   - Never cram content: prefer scrollable layouts with breathing room over dense screens
   - Use consistent padding: Cards should have p-4 to p-6 internal padding

2. **Typography & Readability**
   - Establish clear hierarchy: Use heading variants (xl, 2xl, 3xl) for titles, base/lg for body text
   - Limit line length: Text content should feel comfortable to read (not edge-to-edge)
   - Use color for hierarchy: typography-900 for primary text, typography-600 for secondary, typography-400 for tertiary
   - Bold text sparingly: Use font-semibold or font-bold only for emphasis

3. **Color & Contrast**
   - Stick to semantic theme tokens: primary-* for brand actions, success-* for positive, error-* for negative
   - Use subtle backgrounds: background-0 for main surface, background-50 for subtle cards/sections
   - Avoid color overload: Maximum 2-3 accent colors per screen (usually primary + one semantic color)
   - Text contrast: Always use typography-900 on light backgrounds, typography-0 on dark backgrounds

4. **Component Composition & Polish**
   - Cards should feel substantial: Use rounded-lg or rounded-xl, subtle shadows or borders, adequate padding
   - Buttons should be prominent: Prefer size="lg" for primary actions, use variant="solid" with action="primary"
   - Lists need breathing room: gap-3 to gap-4 between list items, not gap-1
   - Icons should enhance, not clutter: Use sparingly, ensure proper sizing (h-5 w-5 or h-6 w-6), match text color

5. **Layout Patterns**
   - Screen structure: <VStack className="flex-1 bg-background-0 p-6 gap-6"> for main containers
   - Section headers: Combine heading + description with gap-1 or gap-2
   - Card grids: Use gap-4 for spacing, ensure cards have consistent heights when possible
   - Action buttons: Place at bottom with safe-area-inset-bottom, or in headers for quick access

6. **Visual Consistency**
   - Rounded corners: Use consistent values (rounded-lg for cards, rounded-md for inputs, rounded-full for avatars)
   - Shadow depth: Subtle elevation (use Card variant="elevated" sparingly, prefer borders with border-outline-200)
   - Icon family: Pick ONE icon set per screen (Feather, Ionicons, or FontAwesome6) and stick to it
   - Button sizes: Use size="md" for secondary actions, size="lg" for primary/important actions

7. **Mobile-First Considerations**
   - Touch targets: Buttons/pressables should be minimum h-10 (prefer h-11 or h-12 for primary actions)
   - Thumb zones: Important actions should be easy to reach (bottom navigation, floating actions)
   - Scrolling: Expect users to scroll; don't compress content vertically
   - Loading states: Include proper loading indicators and empty states

**Acceptance Criteria**
- Home screen updated or created
${style.specAcceptance}
- Icons imported from ONE consistent provider in @expo/vector-icons (choose: Feather, Ionicons, or FontAwesome6)
- Mock data is realistic and diverse (not just "Item 1", "Item 2")
- Spacing follows hierarchy: screen padding (p-6), section gaps (gap-4 to gap-6), item gaps (gap-2 to gap-3)
- Typography hierarchy is clear: headings use xl/2xl/3xl, body uses base/lg
- Color usage is intentional: primary-* for brand, semantic colors for meaning, subtle backgrounds
- Components feel polished: proper padding, rounded corners, adequate touch targets
- Layout has breathing room: generous whitespace, not cramped or cluttered
`;

  return appendDesignRules(prompt.trim(), designRules);
};

export const isDesignStyleKey = (value: unknown): value is DesignStyleKey =>
  typeof value === 'string' &&
  (DESIGN_STYLE_KEYS as readonly string[]).includes(value);

export const buildPromptConfig = ({
  designStyle,
  designRules,
  currentViewingPath,
}: {
  designStyle: DesignStyleKey;
  designRules?: string | null;
  currentViewingPath?: string | null;
}): PromptConfig => {
  const styleDetail = STYLE_DETAILS[designStyle] ?? STYLE_DETAILS.tamagui;

  return {
    system: buildSystemPrompt(styleDetail, designRules, currentViewingPath),
    errorFixing: buildErrorFixingPrompt(
      styleDetail,
      designRules,
      currentViewingPath,
    ),
    specExpansion: buildSpecExpansionPrompt(styleDetail, designRules),
  };
};
