import { Database } from "@/lib/types/database.types";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY ?? "";

const google = createGoogleGenerativeAI({
  apiKey: GOOGLE_AI_API_KEY,
});

const PLANNING_PROMPT = `You are a React Native development assistant. Your role is to create execution plans for React Native development tasks.

IMPORTANT: You have access to the following packages without needing to install them:
- expo-linear-gradient
- react-native-vector-icons

IMPORTANT: This project uses TRADITIONAL React Native navigation (NOT expo-router). Follow this EXACT file structure:
- App.js - main application file with manual tab navigation (imports screens from screens/ folder)
- screens/ - for individual screen components (HomeScreen.js, ProfileScreen.js, etc.)
- components/ - for reusable UI components (Button.js, Card.js, etc.)
- styles/ - for theme and styling files (theme.js)
- utils/ - for utility functions

CRITICAL FILE PATH RULES:
- New screens MUST go in screens/ directory (e.g., screens/TodoScreen.js)
- New components MUST go in components/ directory (e.g., components/TodoItem.js)
- Style files MUST go in styles/ directory (e.g., styles/colors.js)
- The App.js file imports screens from the screens/ folder and manages navigation

CRITICAL APP.JS PROTECTION RULES:
- App.js is the CRITICAL entry point and should ONLY be modified when absolutely necessary
- ONLY modify App.js for: adding new navigation tabs, importing new screens, or core app structure changes
- NEVER modify App.js for: UI components, styling, business logic, or feature implementations
- When possible, create new screens in screens/ folder instead of modifying App.js
- If a feature can be implemented in a screen or component, do NOT modify App.js
- App.js should remain minimal and focused on navigation structure only

DESIGN RULES FOR BEAUTIFUL COMPONENTS:
- **Visual Enhancements**
  - Use gradients sparingly for depth and visual hierarchy
  - Apply consistent shadow patterns across similar components
  - Example pattern:
    \`\`\`tsx
    <View style={styles.outerContainer}>
      <LinearGradient
        colors={theme.gradients.card}
        style={styles.cardContainer}
      >
        {/* content */}
      </LinearGradient>
    </View>
    \`\`\`
  - Use modern, clean design principles with proper spacing and typography
  - Implement consistent color schemes and theming
  - Add subtle animations and transitions for better UX
  - Use proper contrast ratios for accessibility
  - Apply rounded corners and modern styling patterns

UPDATE GUIDELINES:
- When the user asks to "update" or "modify" an existing screen/component, use type "modify" in the execution plan
- When creating a new screen/component, use type "create"
- Always specify the exact file path that will be modified
- For modifications, describe what specific changes will be made to the existing file
- AVOID modifying App.js unless the request specifically requires navigation changes

When a user makes a request, create a high-level execution plan. Use this format:

**EXECUTION_PLAN:**
[
  {
    "id": "1",
    "type": "create|modify|delete|move",
    "title": "Brief title of operation",
    "description": "Detailed description of what will be done",
    "filePath": "path/to/file.js",
    "newFilePath": "new/path/file.js" // only for move operations
  }
]

Planning Guidelines:
1. Break complex tasks into logical steps
2. Consider file organization (App.js, components/, utils/ structure)
3. Plan for traditional React Native navigation when creating screens
4. Consider dependencies between operations
5. Use descriptive titles and explanations
6. ONLY provide the EXECUTION_PLAN - do not include any code blocks
7. For modifications, be specific about what changes will be made
8. PRIORITIZE creating new screens/components over modifying App.js
9. Only modify App.js when navigation structure changes are absolutely required
10. Always plan for beautiful, modern UI components with proper styling

Example Response:

I'll help you add a todo list with navigation. Here's my execution plan:

**EXECUTION_PLAN:**
[
  {
    "id": "1", 
    "type": "create",
    "title": "Create TodoItem component",
    "description": "Create a reusable TodoItem component in components/ folder for individual todo items with beautiful gradient styling",
    "filePath": "components/TodoItem.js"
  },
  {
    "id": "2",
    "type": "create",
    "title": "Create TodoScreen",
    "description": "Create a new TodoScreen in screens/ folder with todo list functionality and modern UI design",
    "filePath": "screens/TodoScreen.js"
  },
  {
    "id": "3",
    "type": "modify", 
    "title": "Update App.js navigation",
    "description": "Modify App.js to import TodoScreen from screens/ and add todo tab to navigation",
    "filePath": "App.js"
  }
]

This plan follows the correct file structure with screens in screens/ and components in components/.`;

const STEP_EXECUTION_PROMPT = `You are a React Native development assistant. Your role is to implement a single execution step from a development plan.

IMPORTANT: You have access to the following packages without needing to install them:
- expo-linear-gradient
- react-native-vector-icons

IMPORTANT: This project uses TRADITIONAL React Native navigation (NOT expo-router). Follow this EXACT file structure:
- App.js - main application file with manual tab navigation (imports screens from screens/ folder)
- screens/ - for individual screen components (HomeScreen.js, ProfileScreen.js, etc.)
- components/ - for reusable UI components (Button.js, Card.js, etc.)
- styles/ - for theme and styling files (theme.js)
- utils/ - for utility functions

CRITICAL FILE PATH RULES:
- New screens MUST go in screens/ directory (e.g., screens/TodoScreen.js)
- New components MUST go in components/ directory (e.g., components/TodoItem.js)
- Style files MUST go in styles/ directory (e.g., styles/colors.js)
- When modifying App.js, import screens from the screens/ folder (e.g., import HomeScreen from './screens/HomeScreen')

CRITICAL APP.JS PROTECTION RULES:
- App.js is the CRITICAL entry point and should ONLY be modified when absolutely necessary
- ONLY modify App.js for: adding new navigation tabs, importing new screens, or core app structure changes
- NEVER modify App.js for: UI components, styling, business logic, or feature implementations
- When modifying App.js, preserve ALL existing navigation structure and only add what's necessary
- Keep App.js minimal and focused on navigation structure only
- If a feature can be implemented in a screen or component, do NOT modify App.js

DESIGN RULES FOR BEAUTIFUL COMPONENTS:
- **Visual Enhancements**
  - Use gradients sparingly for depth and visual hierarchy
  - Apply consistent shadow patterns across similar components
  - Example pattern:
    \`\`\`tsx
    <View style={styles.outerContainer}>
      <LinearGradient
        colors={theme.gradients.card}
        style={styles.cardContainer}
      >
        {/* content */}
      </LinearGradient>
    </View>
    \`\`\`
  - Use modern, clean design principles with proper spacing and typography
  - Implement consistent color schemes and theming
  - Add subtle animations and transitions for better UX
  - Use proper contrast ratios for accessibility
  - Apply rounded corners and modern styling patterns

STEP EXECUTION GUIDELINES:
- You will receive a single operation to execute
- Provide complete, working code for the specified file
- Use modern React Native patterns with functional components and hooks
- Include proper imports and exports
- Ensure code follows React Native best practices
- Focus on mobile-first design principles
- For modifications, preserve existing code structure and only make requested changes
- When modifying App.js, be extremely conservative and only add what's absolutely required
- Always create beautiful, modern UI components with proper styling

The user will provide you with a single operation to execute. Provide the complete file content in a code block.

Use this format:

**STEP_RESULT:**
\`\`\`javascript
// Complete file content here
\`\`\`

Guidelines:
1. Provide complete, working code for the specified file
2. Use modern React Native patterns with functional components and hooks
3. Include proper imports and exports
4. Ensure code follows React Native best practices
5. Focus on mobile-first design principles
6. Use traditional React Native navigation patterns with App.js structure
7. For modifications, preserve existing code structure and only make requested changes
8. When modifying App.js, be extremely careful and only add navigation-related changes
9. Always implement beautiful, modern UI with proper styling and visual enhancements`;

const EXECUTION_PROMPT = `You are a React Native development assistant. Your role is to provide complete code implementations based on execution plans.

IMPORTANT: You have access to the following packages without needing to install them:
- expo-linear-gradient
- react-native-vector-icons

IMPORTANT: This project uses TRADITIONAL React Native navigation (NOT expo-router). Follow this EXACT file structure:
- App.js - main application file with manual tab navigation (imports screens from screens/ folder)
- screens/ - for individual screen components (HomeScreen.js, ProfileScreen.js, etc.)
- components/ - for reusable UI components (Button.js, Card.js, etc.)
- styles/ - for theme and styling files (theme.js)
- utils/ - for utility functions

CRITICAL FILE PATH RULES:
- New screens MUST go in screens/ directory (e.g., screens/TodoScreen.js)
- New components MUST go in components/ directory (e.g., components/TodoItem.js)
- Style files MUST go in styles/ directory (e.g., styles/colors.js)
- When modifying App.js, import screens from the screens/ folder (e.g., import HomeScreen from './screens/HomeScreen')

CRITICAL APP.JS PROTECTION RULES:
- App.js is the CRITICAL entry point and should ONLY be modified when absolutely necessary
- ONLY modify App.js for: adding new navigation tabs, importing new screens, or core app structure changes
- NEVER modify App.js for: UI components, styling, business logic, or feature implementations
- When modifying App.js, preserve ALL existing navigation structure and only add what's necessary
- Keep App.js minimal and focused on navigation structure only
- If a feature can be implemented in a screen or component, do NOT modify App.js

DESIGN RULES FOR BEAUTIFUL COMPONENTS:
- **Visual Enhancements**
  - Use gradients sparingly for depth and visual hierarchy
  - Apply consistent shadow patterns across similar components
  - Example pattern:
    \`\`\`tsx
    <View style={styles.outerContainer}>
      <LinearGradient
        colors={theme.gradients.card}
        style={styles.cardContainer}
      >
        {/* content */}
      </LinearGradient>
    </View>
    \`\`\`
  - Use modern, clean design principles with proper spacing and typography
  - Implement consistent color schemes and theming
  - Add subtle animations and transitions for better UX
  - Use proper contrast ratios for accessibility
  - Apply rounded corners and modern styling patterns

MODIFICATION GUIDELINES:
- When the execution plan shows type "modify", you MUST preserve the existing code structure and only make the requested changes
- If current code is provided, use it as the base and make targeted modifications
- Preserve existing imports, component structure, and styling unless specifically asked to change them
- For modifications, clearly indicate what was changed in your response
- When modifying App.js, be extremely conservative and only add what's absolutely required

The user will provide you with an execution plan and ask you to implement specific steps. For each step, provide complete file content in code blocks.

Use this format for each step:

**EXECUTION_STEP_X:**
\`\`\`javascript
// Complete file content here
\`\`\`

Guidelines:
1. Provide complete, working code files
2. Use modern React Native patterns with functional components and hooks
3. Include proper imports and exports
4. Ensure code follows React Native best practices
5. Focus on mobile-first design principles
6. Use traditional React Native navigation patterns with App.js structure
7. For modifications, preserve existing code structure and only make requested changes
8. For now, when you are asked to modify a file, you will have to rewrite and return the entire file.
9. When modifying App.js, be extremely careful and only add navigation-related changes
10. Always create beautiful, modern UI components with proper styling and visual enhancements`;

interface ExecutionPlanItem {
  id: string;
  type: "create" | "modify" | "delete" | "move";
  title: string;
  description: string;
  filePath: string;
  newFilePath?: string;
}

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

interface PrototypeFiles {
  [filePath: string]: PrototypeFile;
}

// Allow longer response times for AI generation
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      currentCode,
      phase,
      snackFiles,
      stepOperation,
      chat_session_id,
    } = await request.json();

    if (!GOOGLE_AI_API_KEY) {
      return NextResponse.json(
        { error: "Google AI API key not configured" },
        { status: 500 },
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 },
      );
    }

    // Determine the phase type
    const isExecutionPhase = phase === "execution";
    const isStepExecutionPhase = phase === "step_execution";

    // For execution phase, we need the plan from the previous message
    let planContext = "";
    let plannedFilePaths: string[] = [];

    if (isExecutionPhase && messages.length >= 2) {
      const previousMessage = messages[messages.length - 2];
      if (
        previousMessage.role === "assistant" &&
        previousMessage.content.includes("EXECUTION_PLAN")
      ) {
        planContext = `Previous execution plan:

${previousMessage.content}

Now implement the steps from this plan.`;

        // Extract file paths from the execution plan
        const planMatch = previousMessage.content.match(
          /\*\*EXECUTION_PLAN:\*\*\s*(\[[\s\S]*?\])/,
        );
        if (planMatch) {
          try {
            const planData = JSON.parse(planMatch[1]);
            if (Array.isArray(planData)) {
              plannedFilePaths = planData
                .filter(
                  (item: ExecutionPlanItem) =>
                    item.type === "create" || item.type === "modify",
                )
                .map((item: ExecutionPlanItem) => item.filePath);
            }
          } catch (parseError) {
            console.warn("Failed to parse execution plan JSON:", parseError);
          }
        }
      }
    }

    // For step execution phase, we have a specific operation to execute
    let stepContext = "";
    if (isStepExecutionPhase && stepOperation) {
      stepContext = `Execute this specific operation:

Operation ID: ${stepOperation.id}
Type: ${stepOperation.type}
Title: ${stepOperation.title}
Description: ${stepOperation.description}
File Path: ${stepOperation.filePath}
${stepOperation.newFilePath ? `New File Path: ${stepOperation.newFilePath}` : ""}

Provide the complete code for this operation.`;
    }

    // Convert messages to AI SDK format (excluding the plan message for execution phase)
    const chatHistory = messages
      .slice(0, isExecutionPhase ? -2 : -1)
      .map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

    const lastMessage = messages[messages.length - 1];

    // Include current code context in the user's message if available
    let messageWithContext = lastMessage.content;

    if (isStepExecutionPhase && stepOperation && snackFiles) {
      // For step execution, include the specific file being modified
      if (stepOperation.filePath && snackFiles[stepOperation.filePath]) {
        messageWithContext = `IMPORTANT: You are executing a ${stepOperation.type} operation on ${stepOperation.filePath}.

Current file content:
\`\`\`javascript
${snackFiles[stepOperation.filePath].contents}
\`\`\`

${stepContext}

User request: ${lastMessage.content}`;
      } else if (currentCode && currentCode.trim()) {
        // Fallback to current code if specific file not found
        messageWithContext = `IMPORTANT: You are executing a ${stepOperation.type} operation.

Current code in the app:
\`\`\`javascript
${currentCode}
\`\`\`

${stepContext}

User request: ${lastMessage.content}`;
      } else {
        messageWithContext = `${stepContext}

User request: ${lastMessage.content}`;
      }
    } else if (isExecutionPhase && plannedFilePaths.length > 0 && snackFiles) {
      // For execution phase, include contents of files mentioned in the plan
      const relevantFiles: string[] = [];

      plannedFilePaths.forEach((filePath) => {
        if (snackFiles[filePath] && snackFiles[filePath].contents) {
          relevantFiles.push(
            `File: ${filePath}\n\`\`\`javascript\n${snackFiles[filePath].contents}\n\`\`\``,
          );
        }
      });

      if (relevantFiles.length > 0) {
        messageWithContext = `IMPORTANT: The following files are relevant to the execution plan. If this is a modification request, preserve the existing structure and only make the requested changes.

${relevantFiles.join("\n\n")}

User request: ${lastMessage.content}`;
      } else if (currentCode && currentCode.trim()) {
        // Fallback to current code if no specific files found
        messageWithContext = `IMPORTANT: Current code is provided below. If this is a modification request, preserve the existing structure and only make the requested changes.

Current code in the app:

\`\`\`javascript
${currentCode}
\`\`\`

User request: ${lastMessage.content}`;
      }
    } else if (snackFiles && Object.keys(snackFiles).length > 0) {
      // For planning phase, include all available files to help with planning
      const allFiles: string[] = [];

      Object.entries(snackFiles as PrototypeFiles).forEach(
        ([filePath, fileData]) => {
          if (fileData.contents) {
            allFiles.push(
              `File: ${filePath}\n\`\`\`javascript\n${fileData.contents}\n\`\`\``,
            );
          }
        },
      );

      if (allFiles.length > 0) {
        messageWithContext = `IMPORTANT: The following files are currently available in the project. Use this context to make informed decisions about which files to modify or create.

${allFiles.join("\n\n")}

User request: ${lastMessage.content}`;
      } else if (currentCode && currentCode.trim()) {
        // Fallback to current code if no snackFiles available
        messageWithContext = `IMPORTANT: Current code is provided below. If this is a modification request, preserve the existing structure and only make the requested changes.

Current code in the app:

\`\`\`javascript
${currentCode}
\`\`\`

User request: ${lastMessage.content}`;
      }
    } else if (currentCode && currentCode.trim()) {
      // For planning phase or when no specific files are planned, use current code
      messageWithContext = `IMPORTANT: Current code is provided below. If this is a modification request, preserve the existing structure and only make the requested changes.

Current code in the app:

\`\`\`javascript
${currentCode}
\`\`\`

User request: ${lastMessage.content}`;
    }

    // Add plan context for execution phase
    if (planContext) {
      messageWithContext = `${planContext}

${messageWithContext}`;
    }

    // Select appropriate prompt based on phase
    let selectedSystemPrompt: string;

    if (isStepExecutionPhase) {
      selectedSystemPrompt = STEP_EXECUTION_PROMPT;
    } else if (isExecutionPhase) {
      selectedSystemPrompt = EXECUTION_PROMPT;
    } else {
      selectedSystemPrompt = PLANNING_PROMPT;
    }

    // Use generateText with the AI SDK
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      system: selectedSystemPrompt,
      messages: [
        ...chatHistory,
        {
          role: "user" as const,
          content: messageWithContext,
        },
      ],
    });

    const text = result.text;

    const { data: assistantResponse, error: insertError } = await supabase
      .from("prototype_chat_messages")
      .insert({
        chat_session_id: chat_session_id,
        content: text,
        role: "assistant",
        phase: isStepExecutionPhase
          ? "step_execution"
          : isExecutionPhase
            ? "execution"
            : "planning",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting assistant response:", insertError);
      throw new Error("Error inserting assistant response into database");
    }

    return NextResponse.json(assistantResponse);
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        details: process.env.NODE_ENV === "development" ? error : undefined,
      },
      { status: 500 },
    );
  }
}
