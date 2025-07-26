import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

const PLANNING_PROMPT = `You are a React Native development assistant. Your role is to create execution plans for React Native development tasks.

IMPORTANT: You have access to the following packages without needing to install them:
- expo-linear-gradient
- react-native-vector-icons
- expo-router

IMPORTANT: This project uses EXPO ROUTER with file-based routing. Structure files accordingly:
- app/ - for screens and layouts (file-based routing)
- components/ - for reusable components  
- utils/ - for utility functions
- screens/ - for complex screen components (if needed)

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
2. Consider file organization (app/, components/, utils/ structure)
3. Plan for proper expo-router integration when creating screens
4. Consider dependencies between operations
5. Use descriptive titles and explanations
6. ONLY provide the EXECUTION_PLAN - do not include any code blocks

Example Response:

I'll help you add a todo list with navigation. Here's my execution plan:

**EXECUTION_PLAN:**
[
  {
    "id": "1", 
    "type": "create",
    "title": "Create TodoItem component",
    "description": "Create a reusable TodoItem component in components/ folder",
    "filePath": "components/TodoItem.js"
  },
  {
    "id": "2",
    "type": "create", 
    "title": "Create Todo List screen",
    "description": "Create the main todo list screen using expo-router",
    "filePath": "app/todos.js"
  },
  {
    "id": "3",
    "type": "modify",
    "title": "Update main app navigation",
    "description": "Add navigation to todo list from main app",
    "filePath": "App.js"
  }
]

This plan will create a complete todo list feature with proper expo-router integration.`;

const EXECUTION_PROMPT = `You are a React Native development assistant. Your role is to provide complete code implementations based on execution plans.

IMPORTANT: You have access to the following packages without needing to install them:
- expo-linear-gradient
- react-native-vector-icons
- expo-router

IMPORTANT: This project uses EXPO ROUTER with file-based routing.

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
6. Use proper expo-router file structure`;


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
      messageWithContext = `Current code in the app:

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