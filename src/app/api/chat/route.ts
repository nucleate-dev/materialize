import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

const SYSTEM_PROMPT = `You are a React Native development assistant. Your role is to help users create, modify, and understand React Native code.

Key guidelines:
1. Always provide complete, runnable React Native code
2. Use modern React Native patterns with functional components and hooks
3. Include proper TypeScript types when appropriate
4. Use StyleSheet for styling
5. Ensure code is properly formatted and follows React Native best practices
6. Include helpful imports from react-native
7. When modifying existing code, provide the complete updated version
8. Focus on mobile-first design principles
9. Use common React Native components like View, Text, TouchableOpacity, ScrollView, etc.
10. Always test that your code would work in a real React Native environment

When providing code:
- Wrap code in \`\`\`javascript or \`\`\`typescript blocks
- Include all necessary imports
- Provide complete, self-contained components
- Add helpful comments where appropriate
- Ensure the code follows React Native conventions

Example response format:
Here's a React Native component that creates a counter:

\`\`\`javascript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function Counter() {
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

Always be helpful, concise, and provide working code that users can immediately use in their React Native projects.`;

export async function POST(request: NextRequest) {
  try {
    const { messages, currentCode } = await request.json();

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

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: SYSTEM_PROMPT }],
        },
        {
          role: 'model',
          parts: [{ text: 'I understand. I\'m ready to help you with React Native development. I\'ll provide complete, runnable code with proper formatting and follow all the guidelines you\'ve outlined.' }],
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