import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../../lib/ThemeContext';
import { Heading, BodyText, Label, Input, Button, Card } from '../../components/ui';
import { spacing, borderRadius } from '../../lib/theme';
import { useCreatePrototype } from '../../hooks/useCreatePrototype';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { PrototypeFramework, VisibilityLevel } from '../../lib/types/serverAPITypes';

type Platform = 'mobile' | 'web';
type Visibility = 'public' | 'team' | 'private';

const PLATFORM_TO_FRAMEWORK: Record<Platform, PrototypeFramework> = {
  mobile: 'mobile_expo_react_native',
  web: 'web_nextjs_react',
};

const VISIBILITY_TO_LEVEL: Record<Visibility, VisibilityLevel> = {
  public: 'PUBLIC',
  team: 'TEAM',
  private: 'SELF',
};

export default function CreateScreen() {
  const { theme } = useTheme();
  const { isOnline } = useNetworkStatus();
  const { createPrototype, isCreating, error, reset } = useCreatePrototype();

  const [prompt, setPrompt] = useState('');
  const [platform, setPlatform] = useState<Platform>('mobile');
  const [visibility, setVisibility] = useState<Visibility>('private');

  const canCreate = prompt.trim().length > 0 && isOnline && !isCreating;

  const handleCreate = async () => {
    if (!canCreate) return;

    try {
      // Generate a name from the prompt (first few words)
      const words = prompt.trim().split(/\s+/).slice(0, 4);
      const name = words.join(' ') + (words.length >= 4 ? '...' : '');

      const result = await createPrototype({
        name,
        description: prompt,
        framework: PLATFORM_TO_FRAMEWORK[platform],
        visibility: VISIBILITY_TO_LEVEL[visibility],
      });

      // Navigate to the new project's edit screen
      router.replace(`/project/${result.prototype_id}/edit`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create project';

      // Check if it's a limit reached error
      if (message.includes('limit')) {
        Alert.alert(
          'Project Limit Reached',
          'You have reached your project limit. Please upgrade your plan or delete some projects.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', message, [{ text: 'OK', onPress: reset }]);
      }
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Heading size="3xl">New Project</Heading>
          <BodyText muted style={styles.subtitle}>
            Describe what you want to build and we'll create it for you
          </BodyText>
        </View>

        <View style={styles.form}>
          {/* Prompt Input */}
          <View style={styles.field}>
            <Label>What would you like to build?</Label>
            <Input
              placeholder="A todo app with categories and due dates..."
              value={prompt}
              onChangeText={setPrompt}
              multiline
              numberOfLines={4}
              style={styles.promptInput}
              textAlignVertical="top"
              editable={!isCreating}
            />
          </View>

          {/* Platform Selection */}
          <View style={styles.field}>
            <Label>Platform</Label>
            <View style={styles.platformOptions}>
              <Pressable
                style={[
                  styles.platformOption,
                  {
                    backgroundColor:
                      platform === 'mobile' ? theme.colors.primary : theme.colors.card,
                    borderColor:
                      platform === 'mobile' ? theme.colors.primary : theme.colors.border,
                  },
                ]}
                onPress={() => setPlatform('mobile')}
                disabled={isCreating}
              >
                <BodyText
                  size="2xl"
                  color={platform === 'mobile' ? theme.colors.primaryForeground : undefined}
                >
                  📱
                </BodyText>
                <Label
                  color={
                    platform === 'mobile'
                      ? theme.colors.primaryForeground
                      : theme.colors.foreground
                  }
                >
                  Mobile
                </Label>
                <BodyText
                  size="xs"
                  color={
                    platform === 'mobile'
                      ? theme.colors.primaryForeground
                      : theme.colors.mutedForeground
                  }
                >
                  React Native
                </BodyText>
              </Pressable>

              <Pressable
                style={[
                  styles.platformOption,
                  {
                    backgroundColor:
                      platform === 'web' ? theme.colors.primary : theme.colors.card,
                    borderColor: platform === 'web' ? theme.colors.primary : theme.colors.border,
                  },
                ]}
                onPress={() => setPlatform('web')}
                disabled={isCreating}
              >
                <BodyText
                  size="2xl"
                  color={platform === 'web' ? theme.colors.primaryForeground : undefined}
                >
                  🌐
                </BodyText>
                <Label
                  color={
                    platform === 'web'
                      ? theme.colors.primaryForeground
                      : theme.colors.foreground
                  }
                >
                  Web
                </Label>
                <BodyText
                  size="xs"
                  color={
                    platform === 'web'
                      ? theme.colors.primaryForeground
                      : theme.colors.mutedForeground
                  }
                >
                  Next.js
                </BodyText>
              </Pressable>
            </View>
          </View>

          {/* Visibility Selection */}
          <View style={styles.field}>
            <Label>Visibility</Label>
            <View style={styles.visibilityOptions}>
              {(
                [
                  { value: 'private', label: 'Private', icon: '🔒' },
                  { value: 'team', label: 'Team', icon: '👥' },
                  { value: 'public', label: 'Public', icon: '👁' },
                ] as const
              ).map((v) => (
                <Pressable
                  key={v.value}
                  style={[
                    styles.visibilityOption,
                    {
                      backgroundColor:
                        visibility === v.value ? theme.colors.accent : 'transparent',
                      borderColor:
                        visibility === v.value ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={() => setVisibility(v.value)}
                  disabled={isCreating}
                >
                  <BodyText size="sm">{v.icon}</BodyText>
                  <Label
                    size="sm"
                    color={
                      visibility === v.value ? theme.colors.primary : theme.colors.foreground
                    }
                  >
                    {v.label}
                  </Label>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Offline Warning */}
          {!isOnline && (
            <Card variant="outline" style={styles.offlineWarning}>
              <BodyText size="sm" color={theme.colors.warning}>
                ⚠ You're offline. Creating projects requires an internet connection.
              </BodyText>
            </Card>
          )}

          {/* Create Button */}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canCreate}
            onPress={handleCreate}
            style={styles.createButton}
          >
            {isCreating ? (
              <View style={styles.loadingButton}>
                <ActivityIndicator size="small" color={theme.colors.primaryForeground} />
                <BodyText color={theme.colors.primaryForeground}>Creating...</BodyText>
              </View>
            ) : (
              'Create Project'
            )}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing[4],
  },
  header: {
    marginBottom: spacing[6],
  },
  subtitle: {
    marginTop: spacing[1],
  },
  form: {
    gap: spacing[6],
  },
  field: {
    gap: spacing[2],
  },
  promptInput: {
    height: 120,
    paddingTop: spacing[3],
  },
  platformOptions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  platformOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    gap: spacing[1],
  },
  visibilityOptions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    gap: spacing[1],
  },
  offlineWarning: {
    padding: spacing[3],
  },
  createButton: {
    marginTop: spacing[2],
  },
  loadingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
});
