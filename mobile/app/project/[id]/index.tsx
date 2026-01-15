import { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Share,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../../lib/ThemeContext';
import { BodyText, Button, Heading, Card } from '../../../components/ui';
import { spacing, borderRadius } from '../../../lib/theme';
import { useViewingUrl, getStatusMessage } from '../../../hooks/useViewingUrl';
import { usePrototype } from '../../../hooks/usePrototypes';

export default function ProjectViewScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const webViewRef = useRef<WebView>(null);
  const [webViewLoading, setWebViewLoading] = useState(true);

  const { data: prototype } = usePrototype(id);
  const { viewingUrl, status, isLoading, error, refetch } = useViewingUrl(id, 'view');

  const handleEdit = () => {
    router.push(`/project/${id}/edit`);
  };

  const handleRefresh = () => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
    refetch();
  };

  const handleShare = async () => {
    if (!viewingUrl || !prototype) return;

    try {
      await Share.share({
        title: prototype.name,
        url: viewingUrl,
        message: Platform.OS === 'android' ? viewingUrl : undefined,
      });
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  const isBuilding = status === 'creating' || status === 'building' || status === 'updating';
  const statusMessage = getStatusMessage(status);

  // Loading state
  if (isLoading && !viewingUrl) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['bottom']}
      >
        <Stack.Screen
          options={{
            title: prototype?.name || 'Project',
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <BodyText muted style={styles.loadingText}>
            Loading preview...
          </BodyText>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error && !viewingUrl) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['bottom']}
      >
        <Stack.Screen
          options={{
            title: prototype?.name || 'Project',
          }}
        />
        <View style={styles.errorContainer}>
          <Card variant="outline" style={styles.errorCard}>
            <Heading size="lg" center>
              Unable to load preview
            </Heading>
            <BodyText muted center style={styles.errorText}>
              {error.message}
            </BodyText>
            <Button variant="primary" onPress={refetch}>
              Try Again
            </Button>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <Stack.Screen
        options={{
          title: prototype?.name || 'Project',
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable onPress={handleShare} hitSlop={8} style={styles.headerButton}>
                <BodyText>Share</BodyText>
              </Pressable>
              <Button variant="primary" size="sm" onPress={handleEdit}>
                Edit
              </Button>
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

      {/* WebView */}
      <View style={styles.webViewContainer}>
        {viewingUrl ? (
          <>
            <WebView
              ref={webViewRef}
              source={{ uri: viewingUrl }}
              style={styles.webView}
              onLoadStart={() => setWebViewLoading(true)}
              onLoadEnd={() => setWebViewLoading(false)}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error('WebView error:', nativeEvent);
              }}
              startInLoadingState={false}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
            />

            {/* WebView Loading Overlay */}
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
          </>
        ) : (
          <View style={styles.noPreviewContainer}>
            <BodyText muted center>
              No preview available
            </BodyText>
          </View>
        )}
      </View>

      {/* Bottom Action Bar */}
      <View style={[styles.actionBar, { borderTopColor: theme.colors.border }]}>
        <Pressable style={styles.actionButton} onPress={handleRefresh}>
          <BodyText>↻ Refresh</BodyText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[4],
  },
  loadingText: {
    marginTop: spacing[2],
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  errorCard: {
    padding: spacing[6],
    alignItems: 'center',
    gap: spacing[3],
    maxWidth: 300,
  },
  errorText: {
    marginBottom: spacing[2],
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  headerButton: {
    padding: spacing[2],
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
  },
  webViewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noPreviewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBar: {
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
});
