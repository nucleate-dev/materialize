# React Native Chat Interface with Expo Snack Integration

This document provides a comprehensive overview of the React Native chat interface implementation, which allows users to interact with an AI assistant to create and modify React Native code with live preview capabilities.

## Overview

The implementation creates a split-screen interface where users can:
- Chat with an AI assistant about React Native development
- Receive React Native code suggestions and explanations
- Apply code changes to see live updates in an Expo Snack preview
- Iterate on React Native components in real-time

## Architecture

### Core Components

The system consists of several interconnected components that work together to provide a seamless development experience:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   ChatWindow    │    │   CreatePage     │    │ ExpoSnackViewer │
│                 │◄──►│  (Main Layout)   │◄──►│                 │
│ - Message UI    │    │ - State Mgmt     │    │ - Live Preview  │
│ - Code Detection│    │ - Communication  │    │ - Snack SDK     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Route     │    │ Code Extractor   │    │ Default Template│
│ - Gemini AI     │    │ - Parse Code     │    │ - Initial App   │
│ - Streaming     │    │ - Validate RN    │    │ - Dependencies  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## File Structure and Descriptions

### Main Application Files

#### `/src/app/create/page.tsx`
**Purpose**: Main page component that orchestrates the entire chat interface
**Key Features**:
- Split-screen layout (40% chat, 60% preview)
- State management for messages and Snack files
- Handles communication between chat and preview components
- Manages API calls to the Gemini AI service

**Core Functionality**:
```typescript
- handleSendMessage(): Processes user input and calls AI API
- handleApplyCode(): Extracts code from AI responses and updates preview
- handleFilesChange(): Manages file updates from the preview component
```

#### `/src/components/ChatWindow.tsx`
**Purpose**: Interactive chat interface component
**Key Features**:
- Message display with user/assistant differentiation
- Automatic code detection in AI responses
- "Apply Code" buttons for code blocks
- Auto-scrolling to latest messages
- Loading states and typing indicators

**UI Elements**:
- Header with title and description
- Scrollable message container
- Text input with send button
- Code syntax highlighting
- Responsive design with proper spacing

#### `/src/components/ExpoSnackViewer.tsx`
**Purpose**: Live React Native preview using Expo Snack SDK
**Key Features**:
- Real-time code preview in iframe
- Integration with Expo Snack SDK v6.5.0
- File and dependency management
- Error handling and loading states
- Refresh and reset functionality

**Technical Implementation**:
- Uses `webPreviewRef` for iframe integration
- Manages Snack state and subscriptions
- Handles file updates via `updateFiles()` method
- Provides copy-to-clipboard functionality for Snack URLs

### API and Backend

#### `/src/app/api/chat/route.ts`
**Purpose**: API endpoint for AI chat functionality using Google Gemini
**Key Features**:
- Integration with Google Generative AI (Gemini 1.5 Flash)
- Specialized system prompt for React Native development
- Streaming responses for better UX
- Error handling and validation

**System Prompt Highlights**:
- Focuses on React Native best practices
- Ensures complete, runnable code examples
- Emphasizes modern functional components and hooks
- Includes proper TypeScript typing guidance

### Utility and Support Files

#### `/src/types/chat.ts`
**Purpose**: TypeScript interfaces and types for the entire system
**Key Types**:
- `ChatMessage`: Structure for chat messages
- `CodeBlock`: Represents extracted code blocks
- `SnackFile`: File format compatible with Snack SDK
- `SnackFiles`: Collection of files for Snack
- `CodeExtractionResult`: Result of code parsing

#### `/src/utils/codeExtractor.ts`
**Purpose**: Utility functions for parsing and processing AI-generated code
**Key Functions**:
- `extractCodeFromMessage()`: Parses markdown code blocks from AI responses
- `isReactNativeCode()`: Validates if code is React Native compatible
- `cleanupCode()`: Ensures proper imports and formatting
- `updateSnackFiles()`: Updates Snack file structure with new code

**Code Detection Logic**:
- Regex-based markdown code block parsing
- Language detection (JavaScript/TypeScript)
- React Native component validation
- Automatic import insertion

#### `/src/templates/defaultApp.ts`
**Purpose**: Default React Native application template
**Key Features**:
- Complete starter React Native component
- Demonstrates basic React Native patterns
- Includes interactive elements (counter, buttons)
- Proper styling with StyleSheet
- Compatible with Expo Snack requirements

**Default Dependencies**:
```typescript
{
  'react-native': { version: '0.76.1' },
  'react': { version: '18.2.0' },
  'expo': { version: '~52.0.0' }
}
```

## Data Flow

### 1. User Interaction Flow
```
User Input → ChatWindow → CreatePage → API Route → Gemini AI
     ↓                                                    ↓
Apply Code ← CodeExtractor ← CreatePage ← API Response ← AI Response
     ↓
ExpoSnackViewer → Snack SDK → Live Preview
```

### 2. Code Processing Pipeline
```
AI Response → extractCodeFromMessage() → CodeBlock[] → updateSnackFiles() → SnackFiles → Expo Snack → Live Preview
```

### 3. State Management
- **Messages**: Managed in CreatePage, displayed in ChatWindow
- **Snack Files**: Managed in CreatePage, consumed by ExpoSnackViewer
- **Loading States**: Distributed across components for optimal UX

## Technical Specifications

### Dependencies
- **Next.js 14**: App Router architecture
- **TypeScript**: Full type safety
- **Tailwind CSS**: Styling and responsive design
- **Expo Snack SDK v6.5.0**: Live preview functionality
- **Google Generative AI**: AI chat capabilities

### Browser Compatibility
- Modern browsers with iframe sandbox support
- JavaScript enabled for Snack SDK functionality
- WebGL support recommended for optimal React Native preview

### Performance Considerations
- Code extraction is performed client-side for responsiveness
- Snack SDK handles preview compilation and rendering
- Message history is maintained in memory (consider persistence for production)

## Setup and Configuration

### Environment Variables Required
```bash
GOOGLE_AI_API_KEY=your_gemini_api_key_here
```

### Usage Instructions
1. Navigate to `/create` in your application
2. Start chatting with the AI about React Native development
3. When AI provides code examples, click "Apply Code" buttons
4. View live updates in the preview panel
5. Use "Refresh" to reload preview or "Reset" to return to default template

### Example Chat Prompts
- "Create a todo list app with React Native"
- "Add a red background to the current view"
- "Create a login form with email and password fields"
- "Make the text larger and center it on the screen"
- "Add navigation between two screens"

## Error Handling

### Common Issues and Solutions
1. **Snack SDK Connection Issues**: Handled with retry logic and user feedback
2. **Code Parsing Errors**: Robust regex patterns with fallback mechanisms
3. **API Rate Limits**: Error messages guide users to wait and retry
4. **Invalid React Native Code**: Validation prevents applying non-RN code

### Debugging Features
- Console logging for Snack SDK events
- Error states displayed in UI
- Loading indicators for all async operations

## Future Enhancements

### Potential Improvements
1. **Code History**: Track and revert to previous code versions
2. **Multiple Files**: Support for multi-file React Native projects
3. **Custom Dependencies**: Allow users to add npm packages
4. **Export Functionality**: Download or share Snack projects
5. **Collaborative Features**: Real-time collaboration on code
6. **Template Library**: Pre-built component templates
7. **Mobile Testing**: QR code generation for mobile device testing

### Scalability Considerations
- Message persistence with database storage
- User authentication and project management
- Rate limiting and usage tracking
- Caching for frequently requested code patterns

## Maintenance Notes

### Regular Updates Required
- Keep Expo Snack SDK updated for latest React Native support
- Monitor Google Gemini API changes and rate limits
- Update default React Native template for new RN versions
- Review and improve system prompts based on user feedback

### Monitoring Recommendations
- Track API usage and costs
- Monitor Snack SDK connection success rates
- Log and analyze code parsing accuracy
- User engagement metrics and session duration

---

This implementation provides a solid foundation for AI-assisted React Native development with live preview capabilities. The modular architecture allows for easy extension and customization based on specific requirements.