import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

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

UPDATE GUIDELINES:
- When the user asks to "update" or "modify" an existing screen/component, use type "modify" in the execution plan
- When creating a new screen/component, use type "create"
- Always specify the exact file path that will be modified
- For modifications, describe what specific changes will be made to the existing file

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

Example Response:

I'll help you add a todo list with navigation. Here's my execution plan:

**EXECUTION_PLAN:**
[
  {
    "id": "1", 
    "type": "create",
    "title": "Create TodoItem component",
    "description": "Create a reusable TodoItem component in components/ folder for individual todo items",
    "filePath": "components/TodoItem.js"
  },
  {
    "id": "2",
    "type": "create",
    "title": "Create TodoScreen",
    "description": "Create a new TodoScreen in screens/ folder with todo list functionality",
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

MODIFICATION GUIDELINES:
- When the execution plan shows type "modify", you MUST preserve the existing code structure and only make the requested changes
- If current code is provided, use it as the base and make targeted modifications
- Preserve existing imports, component structure, and styling unless specifically asked to change them
- For modifications, clearly indicate what was changed in your response

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
7. For modifications, preserve existing code structure and only make requested changes`;


export async function POST(request: NextRequest) {
  try {
    const { messages, currentCode, phase } = await request.json();

    if (!process.env.GOOGLE_AI_API_KEY) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Determine if this should be planning or execution phase
    const isExecutionPhase = phase === 'execution';

    // For execution phase, we need the plan from the previous message
    let planContext = '';
    if (isExecutionPhase && messages.length >= 2) {
      const previousMessage = messages[messages.length - 2];
      if (previousMessage.role === 'assistant' && previousMessage.content.includes('EXECUTION_PLAN')) {
        planContext = `Previous execution plan:

${previousMessage.content}

Now implement the steps from this plan.`;
      }
    }

    // Convert messages to Gemini format (excluding the plan message for execution phase)
    const chatHistory = messages.slice(0, isExecutionPhase ? -2 : -1).map((msg: { role: string; content: string; }) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    // Include current code context in the user's message if available
    let messageWithContext = lastMessage.content;
    if (currentCode && currentCode.trim()) {
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

    // Select appropriate prompt and response based on phase
    const selectedSystemPrompt = isExecutionPhase ? EXECUTION_PROMPT : PLANNING_PROMPT;
    const modelResponse = isExecutionPhase
      ? 'I understand. I\'m ready to provide complete code implementations for each step in the execution plan.'
      : 'I understand. I\'m ready to create detailed execution plans for React Native development tasks.';

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: selectedSystemPrompt }],
        },
        {
          role: 'model',
          parts: [{ text: modelResponse }],
        },
        ...chatHistory,
      ],
    });

    const result = await chat.sendMessage(messageWithContext);
    const response = result.response;
    const text = response.text();

    return NextResponse.json({
      content: text,
      role: 'assistant',
      phase: isExecutionPhase ? 'execution' : 'planning'
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}