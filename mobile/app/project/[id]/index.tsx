import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../../lib/ThemeContext';
import { BodyText, Button } from '../../../components/ui';
import { spacing } from '../../../lib/theme';

export default function ProjectViewScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  // TODO: Fetch actual viewing URL from API
  const viewingUrl = null; // Will be fetched from useViewingUrl hook

  const handleEdit = () => {
    router.push(`/project/${id}/edit`);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Preview',
          headerRight: () => (
            <Button variant="primary" size="sm" onPress={handleEdit}>
              Edit
            </Button>
          ),
        }}
      />

      <View style={styles.content}>
        {viewingUrl ? (
          <WebView
            source={{ uri: viewingUrl }}
            style={styles.webview}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </View>
            )}
          />
        ) : (
          <View style={styles.placeholder}>
            <BodyText muted center>
              Loading preview...
            </BodyText>
            <ActivityIndicator
              size="large"
              color={theme.colors.primary}
              style={styles.loader}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  loader: {
    marginTop: spacing[4],
  },
});
