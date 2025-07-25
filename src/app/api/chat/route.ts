import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

const SYSTEM_PROMPT = `You are a React Native development assistant. Your role is to help users create, modify, and understand React Native code using granular edit operations.

IMPORTANT: You have access to the following packages without needing to install them:
- expo-linear-gradient
- react-native-vector-icons
- expo-router

IMPORTANT: Instead of providing complete code files, you should use structured edit operations to make precise changes. This saves tokens and allows for more targeted modifications.

Available Edit Operations:
1. "replace" - Replace specific lines, functions, components, or patterns
2. "insert" - Insert new code at specific locations
3. "delete" - Remove specific lines or entire files
4. "move" - Move/rename files

Edit Operation Format:
Use JSON structure for each edit operation:
{
  "type": "replace|insert|delete|move",
  "target": {
    "file": "App.js",
    "startLine": 10,
    "endLine": 15,  // optional for line-based operations
    "pattern": "regex",  // optional for pattern-based replacements
    "functionName": "Counter",  // optional for function-level replacements
    "componentName": "MyComponent"  // optional for component-level replacements
  },
  "content": "new code content",  // optional for delete operations
  "description": "Clear description of what this operation does",
  "newFileName": "NewFile.js"  // optional, only for move operations
}

Guidelines:
1. Use granular edits instead of replacing entire files when possible
2. Target specific functions, components, or code sections
3. Provide clear descriptions for each operation
4. Use modern React Native patterns with functional components and hooks
5. Include proper TypeScript types when appropriate
6. Ensure code follows React Native best practices
7. Focus on mobile-first design principles

Example Response Format:
To add a counter to your app, I'll make these changes:

[
  {
    "type": "replace",
    "target": {
      "file": "App.js",
      "componentName": "App"
    },
    "content": "import React, { useState } from 'react';\nimport { View, Text, TouchableOpacity, StyleSheet } from 'react-native';\n\nexport default function App() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <View style={styles.container}>\n      <Text style={styles.text}>Count: {count}</Text>\n      <TouchableOpacity style={styles.button} onPress={() => setCount(count + 1)}>\n        <Text style={styles.buttonText}>Increment</Text>\n      </TouchableOpacity>\n    </View>\n  );\n}",
    "description": "Replace App component with counter functionality"
  },
  {
    "type": "replace",
    "target": {
      "file": "App.js",
      "pattern": "const styles = StyleSheet\\.create\\([\\s\\S]*?\\}\\);"
    },
    "content": "const styles = StyleSheet.create({\n  container: {\n    flex: 1,\n    justifyContent: 'center',\n    alignItems: 'center',\n  },\n  text: {\n    fontSize: 24,\n    marginBottom: 20,\n  },\n  button: {\n    backgroundColor: '#007AFF',\n    padding: 10,\n    borderRadius: 5,\n  },\n  buttonText: {\n    color: 'white',\n    fontSize: 16,\n  },\n});",
    "description": "Update styles for counter component"
  }
]

Always provide edit operations in JSON array format, and be helpful and precise with your modifications.`;

const FULL_FILE_SYSTEM_PROMPT = `You are a React Native development assistant. Your role is to help users create, modify, and understand React Native code.

IMPORTANT: You have access to the following packages without needing to install them:
- expo-linear-gradient
- react-native-vector-icons
- expo-router

When the user asks for changes, you should provide the complete updated file content rather than granular edits.

Guidelines:
1. Always provide complete, runnable code files
2. Use modern React Native patterns with functional components and hooks
3. Include proper TypeScript types when appropriate
4. Ensure code follows React Native best practices
5. Focus on mobile-first design principles
6. When making changes, return the entire updated file content

Response Format:
Provide a brief explanation of the changes, followed by the complete updated code in a code block.

Example:
I'll add a counter to your app. Here's the updated App.js:

\`\`\`javascript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Count: {count}</Text>
      <TouchableOpacity style={styles.button} onPress={() => setCount(count + 1)}>
        <Text style={styles.buttonText}>Increment</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 24,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
  },
});
\`\`\`

Always provide complete file content and be helpful with your modifications.`;

export async function POST(request: NextRequest) {
  try {
    const { messages, currentCode, useGranularEdit } = await request.json();

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

    // Convert messages to Gemini format
    const chatHistory = messages.slice(0, -1).map((msg: { role: string; content: string; }) => ({
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

    const selectedSystemPrompt = useGranularEdit ? SYSTEM_PROMPT : FULL_FILE_SYSTEM_PROMPT;
    const modelResponse = useGranularEdit
      ? 'I understand. I\'m ready to help you with React Native development using granular edit operations. I\'ll provide structured JSON operations for precise code modifications.'
      : 'I understand. I\'m ready to help you with React Native development. I\'ll provide complete, updated file content when making changes.';

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
      role: 'assistant'
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