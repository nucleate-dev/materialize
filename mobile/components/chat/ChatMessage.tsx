import { memo } from 'react';
import type { Message } from '../../stores/chatStore';
import {
  UserMessageBubble,
  AssistantMessageBubble,
  SystemMessageBubble,
  ErrorMessageBubble,
  UsageMessageBubble,
} from './MessageBubble';
import { ToolIndicator, ThinkingIndicator, DesignSpecIndicator } from './ToolIndicator';

interface ChatMessageProps {
  message: Message;
  isThinkingExpanded?: boolean;
  onToggleThinking?: () => void;
}

function ChatMessageComponent({
  message,
  isThinkingExpanded,
  onToggleThinking,
}: ChatMessageProps) {
  switch (message.type) {
    case 'user':
      return <UserMessageBubble message={message} />;

    case 'assistant':
      return <AssistantMessageBubble message={message} />;

    case 'system':
      return <SystemMessageBubble message={message} />;

    case 'error':
      return <ErrorMessageBubble message={message} />;

    case 'usage':
      return <UsageMessageBubble message={message} />;

    case 'tool':
      return (
        <ToolIndicator
          message={message}
          isExpanded={isThinkingExpanded}
          onToggle={onToggleThinking}
        />
      );

    case 'thinking':
      return <ThinkingIndicator message={message} />;

    case 'design_spec':
      return (
        <DesignSpecIndicator
          message={message}
          isExpanded={isThinkingExpanded}
          onToggle={onToggleThinking}
        />
      );

    default:
      // Unknown message type - render as system message
      return <SystemMessageBubble message={message} />;
  }
}

// Memoize to prevent unnecessary re-renders
export const ChatMessage = memo(ChatMessageComponent, (prevProps, nextProps) => {
  // Re-render if message content changed
  if (prevProps.message.content !== nextProps.message.content) return false;
  // Re-render if message status changed
  if (prevProps.message.status !== nextProps.message.status) return false;
  // Re-render if isComplete changed
  if (prevProps.message.isComplete !== nextProps.message.isComplete) return false;
  // Re-render if thinking expansion changed
  if (prevProps.isThinkingExpanded !== nextProps.isThinkingExpanded) return false;
  // Otherwise, don't re-render
  return true;
});
