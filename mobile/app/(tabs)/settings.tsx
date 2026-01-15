import { View, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/ThemeContext';
import { Heading, BodyText, Label, Card, Button } from '../../components/ui';
import { spacing, borderRadius } from '../../lib/theme';

type ThemeMode = 'light' | 'dark' | 'system';

export default function SettingsScreen() {
  const { theme, themeMode, setThemeMode, isDark } = useTheme();

  const themeModes: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Heading size="3xl">Settings</Heading>
        </View>

        {/* Profile Section */}
        <Card style={styles.section}>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
              <BodyText size="xl" color={theme.colors.primaryForeground}>
                JD
              </BodyText>
            </View>
            <View style={styles.profileInfo}>
              <Label weight="semibold">John Doe</Label>
              <BodyText size="sm" muted>
                john@example.com
              </BodyText>
            </View>
          </View>
        </Card>

        {/* Account Section */}
        <View style={styles.sectionHeader}>
          <Label muted>Account</Label>
        </View>
        <Card style={styles.section}>
          <Pressable style={styles.settingRow}>
            <BodyText>Subscription</BodyText>
            <BodyText muted>Free Plan</BodyText>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <Pressable style={styles.settingRow}>
            <BodyText>Team</BodyText>
            <BodyText muted>Personal</BodyText>
          </Pressable>
        </Card>

        {/* Preferences Section */}
        <View style={styles.sectionHeader}>
          <Label muted>Preferences</Label>
        </View>
        <Card style={styles.section}>
          <View style={styles.settingRow}>
            <BodyText>Theme</BodyText>
            <View style={styles.themeOptions}>
              {themeModes.map((mode) => (
                <Pressable
                  key={mode.value}
                  style={[
                    styles.themeOption,
                    {
                      backgroundColor:
                        themeMode === mode.value ? theme.colors.primary : theme.colors.muted,
                    },
                  ]}
                  onPress={() => setThemeMode(mode.value)}
                >
                  <Label
                    size="sm"
                    color={
                      themeMode === mode.value
                        ? theme.colors.primaryForeground
                        : theme.colors.foreground
                    }
                  >
                    {mode.label}
                  </Label>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.settingRow}>
            <BodyText>Notifications</BodyText>
            <Switch
              value={false}
              trackColor={{
                false: theme.colors.muted,
                true: theme.colors.primary,
              }}
              thumbColor={theme.colors.white}
            />
          </View>
        </Card>

        {/* Sign Out */}
        <Button variant="outline" fullWidth style={styles.signOutButton}>
          Sign Out
        </Button>

        {/* Version */}
        <BodyText size="sm" muted center style={styles.version}>
          Version 1.0.0
        </BodyText>
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
  section: {
    marginBottom: spacing[2],
  },
  sectionHeader: {
    marginTop: spacing[4],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[2],
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
  },
  divider: {
    height: 1,
    marginVertical: spacing[2],
  },
  themeOptions: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  themeOption: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.md,
  },
  signOutButton: {
    marginTop: spacing[8],
  },
  version: {
    marginTop: spacing[4],
  },
});
