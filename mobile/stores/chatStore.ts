import { create } from 'zustand';
import {
  ChatServerMessage,
  ChatEvent,
  ChatQueryData,
  ChatContentBlock,
} from '../lib/types/ChatTypes';

// Tool input is a flexible record type
type ToolInput = Record<string, unknown>;

// Message types for the chat UI
export type MessageType =
  | 'user'
  | 'assistant'
  | 'system'
  | 'error'
  | 'tool'
  | 'thinking'
  | 'usage'
  | 'design_spec';

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
  // Tool-specific fields
  toolName?: string;
  toolCallId?: string;
  isComplete?: boolean;
  status?: 'running' | 'success' | 'error';
  toolInput?: ToolInput;
  description?: string;
  toolHistory?: ToolInput[];
  // Other fields
  isQueued?: boolean;
  imageUrls?: string[];
  creditsUsed?: number;
  designSpec?: string;
  isCollapsed?: boolean;
}

export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

export interface UploadedImage {
  id: string;
  base64: string;
  mediaType: string;
  name: string;
  uri: string; // Local URI for display
}

interface ChatState {
  // Messages
  messages: Message[];

  // Session
  sessionId: string | null;
  prototypeChatSessionId: string | null;

  // State
  isProcessing: boolean;
  hasReceivedResponse: boolean;

  // Credits
  creditsUsed: number;
  creditsRemaining: number;

  // Todos (from agent)
  currentTodos: Todo[];

  // Input
  inputValue: string;
  uploadedImages: UploadedImage[];

  // Expanded states
  expandedThinking: Set<string>;

  // Actions
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;

  setSessionId: (sessionId: string | null) => void;
  setPrototypeChatSessionId: (id: string | null) => void;

  setIsProcessing: (isProcessing: boolean) => void;
  setHasReceivedResponse: (hasReceived: boolean) => void;

  setCredits: (used: number, remaining: number) => void;
  setCurrentTodos: (todos: Todo[]) => void;

  setInputValue: (value: string) => void;
  addUploadedImage: (image: UploadedImage) => void;
  removeUploadedImage: (id: string) => void;
  clearUploadedImages: () => void;

  toggleThinkingExpanded: (toolCallId: string) => void;

  // WebSocket message handler
  handleServerMessage: (message: ChatServerMessage) => void;

  // Reset for new session
  reset: () => void;
}

// Helper to generate unique IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Helper to get tool description
const getToolDescription = (toolName: string, toolInput?: ToolInput): string => {
  switch (toolName) {
    case 'Read':
      return `Reading ${toolInput?.file_path || 'file'}`;
    case 'Write':
      return `Writing ${toolInput?.file_path || 'file'}`;
    case 'Edit':
      return `Editing ${toolInput?.file_path || 'file'}`;
    case 'Bash':
      return `Running command`;
    case 'Glob':
      return `Searching for ${toolInput?.pattern || 'files'}`;
    case 'Grep':
      return `Searching for "${toolInput?.pattern || 'pattern'}"`;
    case 'TodoWrite':
      return 'Updating tasks';
    case 'WebFetch':
      return `Fetching ${toolInput?.url || 'URL'}`;
    case 'WebSearch':
      return `Searching web`;
    default:
      return `Using ${toolName}`;
  }
};

// Ephemeral tools that we collapse into single entries
const EPHEMERAL_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
]);

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  messages: [],
  sessionId: null,
  prototypeChatSessionId: null,
  isProcessing: false,
  hasReceivedResponse: false,
  creditsUsed: 0,
  creditsRemaining: 0,
  currentTodos: [],
  inputValue: '',
  uploadedImages: [],
  expandedThinking: new Set(),

  // Message actions
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  updateMessage: (id, updates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg
      ),
    }));
  },

  clearMessages: () => {
    set({ messages: [], currentTodos: [] });
  },

  // Session actions
  setSessionId: (sessionId) => {
    set({ sessionId });
  },

  setPrototypeChatSessionId: (id) => {
    set({ prototypeChatSessionId: id });
  },

  // State actions
  setIsProcessing: (isProcessing) => {
    set({ isProcessing });
  },

  setHasReceivedResponse: (hasReceived) => {
    set({ hasReceivedResponse: hasReceived });
  },

  // Credits actions
  setCredits: (used, remaining) => {
    set({ creditsUsed: used, creditsRemaining: remaining });
  },

  setCurrentTodos: (todos) => {
    set({ currentTodos: todos });
  },

  // Input actions
  setInputValue: (value) => {
    set({ inputValue: value });
  },

  addUploadedImage: (image) => {
    set((state) => ({
      uploadedImages: [...state.uploadedImages, image],
    }));
  },

  removeUploadedImage: (id) => {
    set((state) => ({
      uploadedImages: state.uploadedImages.filter((img) => img.id !== id),
    }));
  },

  clearUploadedImages: () => {
    set({ uploadedImages: [] });
  },

  // Thinking expansion
  toggleThinkingExpanded: (toolCallId) => {
    set((state) => {
      const newExpanded = new Set(state.expandedThinking);
      if (newExpanded.has(toolCallId)) {
        newExpanded.delete(toolCallId);
      } else {
        newExpanded.add(toolCallId);
      }
      return { expandedThinking: newExpanded };
    });
  },

  // Handle incoming WebSocket messages
  handleServerMessage: (message) => {
    const state = get();

    switch (message.type) {
      case ChatEvent.SYSTEM: {
        // Connection established
        if ('data' in message && message.data) {
          const data = message.data as { sessionId?: string };
          if (data.sessionId) {
            set({ sessionId: data.sessionId });
          }
        }
        break;
      }

      case ChatEvent.MESSAGE_RECEIVED: {
        // Server acknowledged our message
        set({ isProcessing: true });
        break;
      }

      case ChatEvent.AGENT_MESSAGE: {
        // Assistant response (streaming text)
        const data = message.data as { text?: string; content?: string } | undefined;
        const text = data?.text || data?.content || '';

        if (!text) break;

        set({ hasReceivedResponse: true });

        // Check if we have an existing assistant message to append to
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage?.type === 'assistant' && !lastMessage.isComplete) {
          // Append to existing message
          state.updateMessage(lastMessage.id, {
            content: lastMessage.content + text,
          });
        } else {
          // Create new assistant message
          state.addMessage({
            id: generateId(),
            type: 'assistant',
            content: text,
            timestamp: Date.now(),
            isComplete: false,
          });
        }
        break;
      }

      case ChatEvent.TOOL_START: {
        const data = message.data as {
          tool_name?: string;
          tool_call_id?: string;
          tool_input?: ToolInput;
        };

        if (!data?.tool_name) break;

        const toolName = data.tool_name;
        const toolCallId = data.tool_call_id || generateId();
        const toolInput = data.tool_input;
        const isEphemeral = EPHEMERAL_TOOLS.has(toolName);

        // Check for existing ephemeral tool message
        if (isEphemeral) {
          const existingTool = state.messages.find(
            (m) => m.type === 'tool' && m.toolName === toolName && m.status === 'running'
          );

          if (existingTool) {
            // Update existing with new invocation
            state.updateMessage(existingTool.id, {
              toolHistory: [...(existingTool.toolHistory || []), toolInput || {}],
              description: getToolDescription(toolName, toolInput),
            });
            break;
          }
        }

        // Mark current assistant message as complete if exists
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage?.type === 'assistant' && !lastMessage.isComplete) {
          state.updateMessage(lastMessage.id, { isComplete: true });
        }

        // Add new tool message
        state.addMessage({
          id: toolCallId,
          type: 'tool',
          content: '',
          timestamp: Date.now(),
          toolName,
          toolCallId,
          toolInput,
          status: 'running',
          description: getToolDescription(toolName, toolInput),
          toolHistory: isEphemeral ? [toolInput || {}] : undefined,
        });
        break;
      }

      case ChatEvent.TOOL_COMPLETE: {
        const data = message.data as {
          tool_name?: string;
          tool_call_id?: string;
          tool_response?: unknown;
        };

        if (!data?.tool_name) break;

        const toolName = data.tool_name;
        const toolCallId = data.tool_call_id;

        // Find and update the tool message
        const toolMessage = state.messages.find(
          (m) =>
            m.type === 'tool' &&
            ((toolCallId && m.toolCallId === toolCallId) ||
              (m.toolName === toolName && m.status === 'running'))
        );

        if (toolMessage) {
          state.updateMessage(toolMessage.id, {
            status: 'success',
            isComplete: true,
          });
        }

        // Handle TodoWrite specially to update current todos
        if (toolName === 'TodoWrite' && data.tool_response) {
          const response = data.tool_response as { todos?: Todo[] };
          if (response.todos) {
            set({ currentTodos: response.todos });
          }
        }
        break;
      }

      case ChatEvent.QUERY_COMPLETE: {
        const data = message.data as { sessionId?: string };

        // Mark last assistant message as complete
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage?.type === 'assistant' && !lastMessage.isComplete) {
          state.updateMessage(lastMessage.id, { isComplete: true });
        }

        set({
          isProcessing: false,
          sessionId: data?.sessionId || state.sessionId,
        });
        break;
      }

      case ChatEvent.USAGE_UPDATE: {
        const data = message.data as {
          creditsUsed?: number;
          creditsRemaining?: number;
        };

        if (data?.creditsUsed !== undefined) {
          set({
            creditsUsed: data.creditsUsed,
            creditsRemaining: data.creditsRemaining || 0,
          });

          // Add usage message
          state.addMessage({
            id: generateId(),
            type: 'usage',
            content: `${data.creditsUsed.toFixed(2)} credits used`,
            timestamp: Date.now(),
            creditsUsed: data.creditsUsed,
          });
        }
        break;
      }

      case ChatEvent.ERROR: {
        const errorData = message as { error?: { message?: string } };
        const errorMessage = errorData.error?.message || 'An error occurred';

        state.addMessage({
          id: generateId(),
          type: 'error',
          content: errorMessage,
          timestamp: Date.now(),
        });

        set({ isProcessing: false });
        break;
      }

      case ChatEvent.INTERRUPTED: {
        const data = message.data as { message?: string; sessionId?: string };

        state.addMessage({
          id: generateId(),
          type: 'system',
          content: data?.message || 'Query interrupted',
          timestamp: Date.now(),
        });

        set({
          isProcessing: false,
          sessionId: data?.sessionId || state.sessionId,
        });
        break;
      }

      case ChatEvent.INFO: {
        const infoMessage = message as { message?: string };
        if (infoMessage.message) {
          state.addMessage({
            id: generateId(),
            type: 'system',
            content: infoMessage.message,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case ChatEvent.DESIGN_GENERATION: {
        const data = message.data as {
          status?: string;
          message?: string;
          designSpec?: string;
        };

        if (data?.status === 'started') {
          state.addMessage({
            id: generateId(),
            type: 'thinking',
            content: data.message || 'Generating design...',
            timestamp: Date.now(),
          });
        } else if (data?.status === 'completed' && data.designSpec) {
          state.addMessage({
            id: generateId(),
            type: 'design_spec',
            content: 'Design specification generated',
            timestamp: Date.now(),
            designSpec: data.designSpec,
            isCollapsed: true,
          });
        }
        break;
      }

      case ChatEvent.HISTORY_REQUEST: {
        // Server is requesting message history
        // This will be handled by the component using the WebSocket hook
        break;
      }

      default:
        console.log('[ChatStore] Unhandled message type:', message.type);
    }
  },

  // Reset store
  reset: () => {
    set({
      messages: [],
      sessionId: null,
      prototypeChatSessionId: null,
      isProcessing: false,
      hasReceivedResponse: false,
      creditsUsed: 0,
      creditsRemaining: 0,
      currentTodos: [],
      inputValue: '',
      uploadedImages: [],
      expandedThinking: new Set(),
    });
  },
}));

// Selector hooks for common use cases
export const useMessages = () => useChatStore((state) => state.messages);
export const useIsProcessing = () => useChatStore((state) => state.isProcessing);
export const useCurrentTodos = () => useChatStore((state) => state.currentTodos);
export const useInputValue = () => useChatStore((state) => state.inputValue);
export const useUploadedImages = () => useChatStore((state) => state.uploadedImages);
