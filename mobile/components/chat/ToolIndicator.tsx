import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { BodyText, Caption } from '../ui';
import { spacing, borderRadius } from '../../lib/theme';
import type { Message } from '../../stores/chatStore';

interface ToolIndicatorProps {
  message: Message;
  isExpanded?: boolean;
  onToggle?: () => void;
}

// Tool icons (using emoji for simplicity - could use icon library)
const getToolIcon = (toolName: string): string => {
  switch (toolName) {
    case 'Read':
      return '📖';
    case 'Write':
      return '✏️';
    case 'Edit':
      return '🔧';
    case 'Bash':
      return '💻';
    case 'Glob':
      return '🔍';
    case 'Grep':
      return '🔎';
    case 'TodoWrite':
      return '📝';
    case 'WebFetch':
      return '🌐';
    case 'WebSearch':
      return '🔍';
    case 'Task':
      return '🤖';
    default:
      return '⚙️';
  }
};

export function ToolIndicator({ message, isExpanded, onToggle }: ToolIndicatorProps) {
  const { theme } = useTheme();
  const isRunning = message.status === 'running';
  const isError = message.status === 'error';
  const isSuccess = message.status === 'success';

  const statusColor = isError
    ? theme.colors.destructive
    : isSuccess
    ? theme.colors.success
    : theme.colors.warning;

  const icon = getToolIcon(message.toolName || '');

  // Count of tool invocations for ephemeral tools
  const invocationCount = message.toolHistory?.length || 1;

  return (
    <Pressable onPress={onToggle} disabled={!onToggle}>
      <View
        style={[
          styles.container,
          { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
        ]}
      >
        <View style={styles.header}>
          {/* Status indicator */}
          <View style={styles.statusRow}>
            {isRunning ? (
              <ActivityIndicator size="small" color={statusColor} />
            ) : (
              <BodyText style={{ color: statusColor }}>
                {isSuccess ? '✓' : isError ? '✕' : '●'}
              </BodyText>
            )}
            <BodyText size="sm" style={styles.iconText}>
              {icon}
            </BodyText>
            <BodyText size="sm" weight="medium" numberOfLines={1} style={styles.description}>
              {message.description || message.toolName}
            </BodyText>
            {invocationCount > 1 && (
              <View style={[styles.countBadge, { backgroundColor: theme.colors.muted }]}>
                <Caption>{invocationCount}x</Caption>
              </View>
            )}
          </View>

          {/* Expand/collapse indicator */}
          {onToggle && (
            <BodyText muted size="sm">
              {isExpanded ? '▼' : '▶'}
            </BodyText>
          )}
        </View>

        {/* Expanded content */}
        {isExpanded && message.toolInput && (
          <View style={[styles.expandedContent, { borderTopColor: theme.colors.border }]}>
            <Caption style={{ fontFamily: 'monospace' }}>
              {JSON.stringify(message.toolInput, null, 2)}
            </Caption>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function ThinkingIndicator({ message }: { message: Message }) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.thinkingContainer,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
      ]}
    >
      <ActivityIndicator size="small" color={theme.colors.primary} />
      <BodyText size="sm" muted>
        {message.content || 'Thinking...'}
      </BodyText>
    </View>
  );
}

export function DesignSpecIndicator({
  message,
  isExpanded,
  onToggle,
}: {
  message: Message;
  isExpanded?: boolean;
  onToggle?: () => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable onPress={onToggle}>
      <View
        style={[
          styles.designSpecContainer,
          { backgroundColor: theme.colors.accent, borderColor: theme.colors.primary },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.statusRow}>
            <BodyText>🎨</BodyText>
            <BodyText size="sm" weight="medium">
              Design Specification
            </BodyText>
          </View>
          <BodyText muted size="sm">
            {isExpanded ? '▼' : '▶'}
          </BodyText>
        </View>

        {isExpanded && message.designSpec && (
          <View style={[styles.expandedContent, { borderTopColor: theme.colors.border }]}>
            <Caption style={{ fontFamily: 'monospace' }}>
              {message.designSpec}
            </Caption>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginVertical: spacing[1],
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[2.5],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
  },
  iconText: {
    marginLeft: spacing[1],
  },
  description: {
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.full,
  },
  expandedContent: {
    padding: spacing[3],
    borderTopWidth: 1,
  },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginVertical: spacing[1],
  },
  designSpecContainer: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginVertical: spacing[1],
    overflow: 'hidden',
  },
});
