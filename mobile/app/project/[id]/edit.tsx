import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../../lib/ThemeContext';
import { BodyText, Label } from '../../../components/ui';
import { spacing, borderRadius } from '../../../lib/theme';
import { usePrototypeDevServer, type RenderStatus } from '../../../hooks/usePrototypeDevServer';
import { usePrototype } from '../../../hooks/usePrototypes';
import { useClaudeCodeWebSocket } from '../../../hooks/useClaudeCodeWebSocket';
import { useChatStore, type Message, type UploadedImage } from '../../../stores/chatStore';
import { ChatMessage, ChatInput } from '../../../components/chat';
import { ChatContentBlock } from '../../../lib/types/ChatTypes';

type ViewMode = 'chat' | 'preview';

export default function ProjectEditScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [webViewLoading, setWebViewLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const webViewRef = useRef<WebView>(null);

  // Prototype and dev server (follows web app flow)
  const { data: prototype } = usePrototype(id);
  const {
    viewingUrl,
    baseTunnelUrl,
    renderStatus,
    isLoading: isDevServerLoading,
    error: devServerError,
    startDevServer,
    refetch: refetchUrl,
  } = usePrototypeDevServer({ prototypeId: id });

  // Chat store
  const messages = useChatStore((state) => state.messages);
  const isProcessing = useChatStore((state) => state.isProcessing);
  const expandedThinking = useChatStore((state) => state.expandedThinking);
  const sessionId = useChatStore((state) => state.sessionId);
  const addMessage = useChatStore((state) => state.addMessage);
  const handleServerMessage = useChatStore((state) => state.handleServerMessage);
  const toggleThinkingExpanded = useChatStore((state) => state.toggleThinkingExpanded);
  const reset = useChatStore((state) => state.reset);

  // WebSocket connection - only connects when baseTunnelUrl is available from dev server
  const {
    isConnected,
    isConnecting,
    connectionError,
    connect,
    sendQuery,
    sendInterrupt,
  } = useClaudeCodeWebSocket({
    prototypeId: id,
    baseTunnelUrl: baseTunnelUrl,
    onMessage: handleServerMessage,
  });

  // Reset chat store when mounting with a new prototype
  useEffect(() => {
    reset();
  }, [id, reset]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const isBuilding =
    renderStatus === 'Starting Dev Server..' ||
    renderStatus === 'Updating..' ||
    renderStatus === 'Connecting..';
  const statusMessage = renderStatus;

  const handleSend = useCallback(
    (messageText: string, images: UploadedImage[]) => {
      // Build content blocks
      const content: ChatContentBlock[] = [];

      // Add text if present
      if (messageText) {
        content.push({ type: 'text', text: messageText });
      }

      // Add images
      for (const image of images) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mediaType,
            data: image.base64,
          },
        });
      }

      // Add user message to store
      const userMessage: Message = {
        id: `${Date.now()}-user`,
        type: 'user',
        content: messageText,
        timestamp: Date.now(),
        imageUrls: images.map((img) => img.uri),
      };
      addMessage(userMessage);

      // Send via WebSocket
      sendQuery({
        content,
        ai_chat_session_id: sessionId,
      });
    },
    [addMessage, sendQuery, sessionId]
  );

  const handleInterrupt = useCallback(() => {
    sendInterrupt();
  }, [sendInterrupt]);

  const handleRefreshPreview = () => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
    refetchUrl();
  };

  const toggleView = () => {
    if (viewMode === 'chat') setViewMode('preview');
    else if (viewMode === 'preview') setViewMode('chat');
  };

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <ChatMessage
        message={item}
        isThinkingExpanded={expandedThinking.has(item.id)}
        onToggleThinking={() => toggleThinkingExpanded(item.id)}
      />
    ),
    [expandedThinking, toggleThinkingExpanded]
  );

  const renderEmptyChat = () => (
    <View style={styles.emptyChat}>
      <BodyText size="lg" weight="medium" center>
        How can I help you today?
      </BodyText>
      <BodyText muted center style={styles.emptyChatSubtext}>
        Describe what you'd like to build or change
      </BodyText>
    </View>
  );

  // Connection status indicator
  const getConnectionStatusColor = () => {
    if (isConnected) return theme.colors.success;
    if (isConnecting) return theme.colors.warning;
    if (connectionError) return theme.colors.destructive;
    return theme.colors.muted;
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <Stack.Screen
        options={{
          title: prototype?.name || 'Edit',
          headerRight: () => (
            <View style={styles.headerButtons}>
              {/* Connection status dot */}
              <View
                style={[
                  styles.connectionDot,
                  { backgroundColor: getConnectionStatusColor() },
                ]}
              />
              <Pressable onPress={toggleView} hitSlop={8}>
                <Label color={theme.colors.primary}>
                  {viewMode === 'chat' ? 'Preview' : 'Chat'}
                </Label>
              </Pressable>
            </View>
          ),
        }}
      />

      {/* Status Banner (when building) */}
      {isBuilding && (
        <View style={[styles.statusBanner, { backgroundColor: theme.colors.warning }]}>
          <ActivityIndicator size="small" color={theme.colors.warningForeground} />
          <BodyText color={theme.colors.warningForeground} size="sm">
            {statusMessage}
          </BodyText>
        </View>
      )}

      {/* Dev Server Error Banner */}
      {devServerError && (
        <Pressable
          style={[styles.errorBanner, { backgroundColor: theme.colors.destructive }]}
          onPress={startDevServer}
        >
          <BodyText color={theme.colors.destructiveForeground} size="sm">
            {devServerError} - Tap to retry
          </BodyText>
        </Pressable>
      )}

      {/* Connection Error Banner */}
      {connectionError && !isConnecting && !devServerError && (
        <Pressable
          style={[styles.errorBanner, { backgroundColor: theme.colors.destructive }]}
          onPress={connect}
        >
          <BodyText color={theme.colors.destructiveForeground} size="sm">
            {connectionError} - Tap to retry
          </BodyText>
        </Pressable>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={100}
      >
        {/* Preview Section (toggle view) */}
        {viewMode === 'preview' && (
          <View style={styles.previewContainer}>
            {viewingUrl ? (
              <>
                <WebView
                  ref={webViewRef}
                  source={{ uri: viewingUrl }}
                  style={styles.webview}
                  onLoadStart={() => setWebViewLoading(true)}
                  onLoadEnd={() => setWebViewLoading(false)}
                  javaScriptEnabled
                  domStorageEnabled
                />
                {webViewLoading && (
                  <View
                    style={[
                      styles.webViewLoadingOverlay,
                      { backgroundColor: theme.colors.background },
                    ]}
                  >
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                  </View>
                )}
                {/* Refresh Button */}
                <View style={[styles.previewActions, { borderTopColor: theme.colors.border }]}>
                  <Pressable style={styles.actionButton} onPress={handleRefreshPreview}>
                    <BodyText>↻ Refresh</BodyText>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.previewPlaceholder}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <BodyText muted center style={styles.previewPlaceholderText}>
                  Loading preview...
                </BodyText>
              </View>
            )}
          </View>
        )}

        {/* Chat Section */}
        {viewMode === 'chat' && (
          <View style={styles.chatContainer}>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.messagesContent,
                messages.length === 0 && styles.emptyListContent,
              ]}
              ListEmptyComponent={renderEmptyChat}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => {
                if (messages.length > 0) {
                  flatListRef.current?.scrollToEnd({ animated: true });
                }
              }}
            />

            {/* Chat Input */}
            <ChatInput
              onSend={handleSend}
              onInterrupt={handleInterrupt}
              isProcessing={isProcessing}
              isConnected={isConnected}
              placeholder="Describe what you'd like to build..."
            />
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  keyboardView: {
    flex: 1,
  },
  previewContainer: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
  },
  webViewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
    gap: spacing[3],
  },
  previewPlaceholderText: {
    marginTop: spacing[2],
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderTopWidth: 1,
  },
  actionButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  chatContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing[4],
    gap: spacing[2],
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyChat: {
    alignItems: 'center',
    paddingVertical: spacing[8],
  },
  emptyChatSubtext: {
    marginTop: spacing[2],
  },
});
