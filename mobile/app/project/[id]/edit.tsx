import { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../../lib/ThemeContext';
import { BodyText, Card, Label } from '../../../components/ui';
import { spacing, borderRadius } from '../../../lib/theme';

type ViewMode = 'chat' | 'preview' | 'split';

export default function ProjectEditScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // TODO: Implement WebSocket connection and real chat functionality
  const viewingUrl = null;

  const handleSend = () => {
    if (!message.trim()) return;

    const newMessage = { role: 'user' as const, content: message.trim() };
    setMessages((prev) => [...prev, newMessage]);
    setMessage('');
    setIsLoading(true);

    // Simulate response (will be replaced with real WebSocket)
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'This is a placeholder response. Chat functionality will be implemented with WebSocket connection.' },
      ]);
      setIsLoading(false);
    }, 1000);
  };

  const toggleView = () => {
    if (viewMode === 'chat') setViewMode('preview');
    else if (viewMode === 'preview') setViewMode('chat');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Edit',
          headerRight: () => (
            <Pressable onPress={toggleView} hitSlop={8}>
              <Label color={theme.colors.primary}>
                {viewMode === 'chat' ? 'Preview' : 'Chat'}
              </Label>
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={100}
      >
        {/* Preview Section (toggle view) */}
        {viewMode === 'preview' && (
          <View style={styles.previewContainer}>
            {viewingUrl ? (
              <WebView source={{ uri: viewingUrl }} style={styles.webview} />
            ) : (
              <View style={styles.previewPlaceholder}>
                <BodyText muted center>
                  Preview will appear here when the project is running
                </BodyText>
              </View>
            )}
          </View>
        )}

        {/* Chat Section */}
        {viewMode === 'chat' && (
          <View style={styles.chatContainer}>
            <ScrollView
              ref={scrollViewRef}
              style={styles.messagesContainer}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.length === 0 ? (
                <View style={styles.emptyChat}>
                  <BodyText size="lg" weight="medium" center>
                    How can I help you today?
                  </BodyText>
                  <BodyText muted center style={styles.emptyChatSubtext}>
                    Describe what you'd like to build or change
                  </BodyText>
                </View>
              ) : (
                messages.map((msg, index) => (
                  <View
                    key={index}
                    style={[
                      styles.messageBubble,
                      msg.role === 'user' ? styles.userMessage : styles.assistantMessage,
                      {
                        backgroundColor:
                          msg.role === 'user' ? theme.colors.primary : theme.colors.card,
                      },
                    ]}
                  >
                    <BodyText
                      color={msg.role === 'user' ? theme.colors.primaryForeground : undefined}
                    >
                      {msg.content}
                    </BodyText>
                  </View>
                ))
              )}

              {isLoading && (
                <View style={[styles.messageBubble, styles.assistantMessage, { backgroundColor: theme.colors.card }]}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
              )}
            </ScrollView>

            {/* Input Area */}
            <View style={[styles.inputContainer, { borderTopColor: theme.colors.border }]}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.card,
                    color: theme.colors.foreground,
                    borderColor: theme.colors.border,
                  },
                ]}
                placeholder="Message..."
                placeholderTextColor={theme.colors.mutedForeground}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={4000}
              />
              <Pressable
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: message.trim() ? theme.colors.primary : theme.colors.muted,
                  },
                ]}
                onPress={handleSend}
                disabled={!message.trim() || isLoading}
              >
                <Label
                  color={message.trim() ? theme.colors.primaryForeground : theme.colors.mutedForeground}
                >
                  Send
                </Label>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  previewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  previewPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing[4],
    gap: spacing[3],
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing[20],
  },
  emptyChatSubtext: {
    marginTop: spacing[2],
  },
  messageBubble: {
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    maxWidth: '85%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: borderRadius.sm,
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: borderRadius.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: spacing[3],
    gap: spacing[2],
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2.5],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    fontSize: 16,
  },
  sendButton: {
    height: 44,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
