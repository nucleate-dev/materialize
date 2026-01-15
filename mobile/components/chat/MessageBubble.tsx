import { View, StyleSheet, Image } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../../lib/ThemeContext';
import { BodyText, Caption } from '../ui';
import { spacing, borderRadius, typography } from '../../lib/theme';
import type { Message } from '../../stores/chatStore';

interface MessageBubbleProps {
  message: Message;
}

export function UserMessageBubble({ message }: MessageBubbleProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.bubbleContainer, styles.userContainer]}>
      <View
        style={[
          styles.bubble,
          styles.userBubble,
          { backgroundColor: theme.colors.primary },
        ]}
      >
        <BodyText color={theme.colors.primaryForeground}>
          {message.content}
        </BodyText>

        {/* Show attached images */}
        {message.imageUrls && message.imageUrls.length > 0 && (
          <View style={styles.imageContainer}>
            {message.imageUrls.map((url, index) => (
              <Image
                key={index}
                source={{ uri: url }}
                style={styles.attachedImage}
                resizeMode="cover"
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export function AssistantMessageBubble({ message }: MessageBubbleProps) {
  const { theme } = useTheme();

  const markdownStyles = {
    body: {
      color: theme.colors.foreground,
      fontSize: typography.fontSize.base,
      lineHeight: typography.fontSize.base * 1.5,
    },
    heading1: {
      color: theme.colors.foreground,
      fontSize: typography.fontSize['2xl'],
      fontWeight: '700' as const,
      marginTop: spacing[4],
      marginBottom: spacing[2],
    },
    heading2: {
      color: theme.colors.foreground,
      fontSize: typography.fontSize.xl,
      fontWeight: '600' as const,
      marginTop: spacing[3],
      marginBottom: spacing[2],
    },
    heading3: {
      color: theme.colors.foreground,
      fontSize: typography.fontSize.lg,
      fontWeight: '600' as const,
      marginTop: spacing[2],
      marginBottom: spacing[1],
    },
    paragraph: {
      marginVertical: spacing[1],
    },
    code_inline: {
      backgroundColor: theme.colors.muted,
      color: theme.colors.foreground,
      paddingHorizontal: spacing[1],
      borderRadius: borderRadius.sm,
      fontFamily: 'monospace',
      fontSize: typography.fontSize.sm,
    },
    code_block: {
      backgroundColor: theme.colors.muted,
      padding: spacing[3],
      borderRadius: borderRadius.md,
      marginVertical: spacing[2],
    },
    fence: {
      backgroundColor: theme.colors.muted,
      padding: spacing[3],
      borderRadius: borderRadius.md,
      marginVertical: spacing[2],
    },
    blockquote: {
      backgroundColor: theme.colors.muted,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
      paddingLeft: spacing[3],
      paddingVertical: spacing[2],
      marginVertical: spacing[2],
    },
    list_item: {
      marginVertical: spacing[0.5],
    },
    bullet_list: {
      marginVertical: spacing[1],
    },
    ordered_list: {
      marginVertical: spacing[1],
    },
    link: {
      color: theme.colors.primary,
    },
    strong: {
      fontWeight: '600' as const,
    },
    em: {
      fontStyle: 'italic' as const,
    },
  };

  return (
    <View style={[styles.bubbleContainer, styles.assistantContainer]}>
      <View
        style={[
          styles.bubble,
          styles.assistantBubble,
          { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
        ]}
      >
        <Markdown style={markdownStyles}>{message.content}</Markdown>
      </View>
    </View>
  );
}

export function SystemMessageBubble({ message }: MessageBubbleProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.systemContainer}>
      <Caption style={{ color: theme.colors.mutedForeground, textAlign: 'center' }}>
        {message.content}
      </Caption>
    </View>
  );
}

export function ErrorMessageBubble({ message }: MessageBubbleProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.bubbleContainer, styles.assistantContainer]}>
      <View
        style={[
          styles.bubble,
          styles.errorBubble,
          { backgroundColor: theme.colors.destructive + '15', borderColor: theme.colors.destructive },
        ]}
      >
        <BodyText color={theme.colors.destructive}>{message.content}</BodyText>
      </View>
    </View>
  );
}

export function UsageMessageBubble({ message }: MessageBubbleProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.usageContainer}>
      <Caption style={{ color: theme.colors.mutedForeground }}>
        {message.creditsUsed?.toFixed(2)} credits used
      </Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleContainer: {
    maxWidth: '85%',
    marginVertical: spacing[1],
  },
  userContainer: {
    alignSelf: 'flex-end',
  },
  assistantContainer: {
    alignSelf: 'flex-start',
  },
  bubble: {
    padding: spacing[3],
    borderRadius: borderRadius.lg,
  },
  userBubble: {
    borderBottomRightRadius: borderRadius.sm,
  },
  assistantBubble: {
    borderBottomLeftRadius: borderRadius.sm,
    borderWidth: 1,
  },
  errorBubble: {
    borderWidth: 1,
    borderBottomLeftRadius: borderRadius.sm,
  },
  systemContainer: {
    alignSelf: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  usageContainer: {
    alignSelf: 'flex-end',
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
  },
  imageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  attachedImage: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.md,
  },
});
