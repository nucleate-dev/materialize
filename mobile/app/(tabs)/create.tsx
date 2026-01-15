import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/ThemeContext';
import { Heading, BodyText, Label, Input, Button, Card } from '../../components/ui';
import { spacing, borderRadius } from '../../lib/theme';

type Platform = 'mobile' | 'web';
type Visibility = 'public' | 'team' | 'private';

export default function CreateScreen() {
  const { theme } = useTheme();
  const [prompt, setPrompt] = useState('');
  const [platform, setPlatform] = useState<Platform>('mobile');
  const [visibility, setVisibility] = useState<Visibility>('private');

  const handleCreate = () => {
    // TODO: Implement create logic
    console.log({ prompt, platform, visibility });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Heading size="3xl">New Project</Heading>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Label>What would you like to build?</Label>
            <Input
              placeholder="Describe your app idea..."
              value={prompt}
              onChangeText={setPrompt}
              multiline
              numberOfLines={4}
              style={styles.promptInput}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.field}>
            <Label>Platform</Label>
            <View style={styles.platformOptions}>
              <Pressable
                style={[
                  styles.platformOption,
                  {
                    backgroundColor:
                      platform === 'mobile' ? theme.colors.primary : theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
                onPress={() => setPlatform('mobile')}
              >
                <BodyText
                  size="xl"
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
              </Pressable>

              <Pressable
                style={[
                  styles.platformOption,
                  {
                    backgroundColor:
                      platform === 'web' ? theme.colors.primary : theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                ]}
                onPress={() => setPlatform('web')}
              >
                <BodyText
                  size="xl"
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
              </Pressable>
            </View>
          </View>

          <View style={styles.field}>
            <Label>Visibility</Label>
            <View style={styles.visibilityOptions}>
              {(['public', 'team', 'private'] as const).map((v) => (
                <Pressable
                  key={v}
                  style={[
                    styles.visibilityOption,
                    {
                      backgroundColor:
                        visibility === v ? theme.colors.accent : 'transparent',
                      borderColor:
                        visibility === v ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={() => setVisibility(v)}
                >
                  <Label
                    color={
                      visibility === v ? theme.colors.primary : theme.colors.foreground
                    }
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </Label>
                </Pressable>
              ))}
            </View>
          </View>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!prompt.trim()}
            onPress={handleCreate}
            style={styles.createButton}
          >
            Create Project
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
    borderWidth: 1,
    gap: spacing[2],
  },
  visibilityOptions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  visibilityOption: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  createButton: {
    marginTop: spacing[4],
  },
});
