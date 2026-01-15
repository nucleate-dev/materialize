import { View, StyleSheet, ScrollView, Pressable, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useTheme } from '../../lib/ThemeContext';
import { Heading, BodyText, Label, Card, Button } from '../../components/ui';
import { spacing, borderRadius } from '../../lib/theme';
import { useAuthStore } from '../../stores/authStore';
import { useActiveTeam, useTeams } from '../../stores/teamStore';

type ThemeMode = 'light' | 'dark' | 'system';

export default function SettingsScreen() {
  const { theme, themeMode, setThemeMode } = useTheme();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const activeTeam = useActiveTeam();
  const teams = useTeams();

  const themeModes: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  // Get user initials for avatar
  const getInitials = () => {
    if (!user) return '?';
    const metadata = user.user_metadata;
    const firstName = metadata?.first_name || metadata?.name?.split(' ')[0] || '';
    const lastName = metadata?.last_name || metadata?.name?.split(' ')[1] || '';

    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) {
      return firstName.slice(0, 2).toUpperCase();
    }
    if (user.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return '?';
  };

  // Get display name
  const getDisplayName = () => {
    if (!user) return 'Unknown User';
    const metadata = user.user_metadata;
    if (metadata?.first_name && metadata?.last_name) {
      return `${metadata.first_name} ${metadata.last_name}`;
    }
    if (metadata?.name) {
      return metadata.name;
    }
    if (user.email) {
      return user.email.split('@')[0];
    }
    return 'Unknown User';
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: signOut,
        },
      ]
    );
  };

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Heading size="3xl">Settings</Heading>
        </View>

        {/* Profile Section */}
        <Card style={styles.section}>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
              <BodyText size="xl" color={theme.colors.primaryForeground}>
                {getInitials()}
              </BodyText>
            </View>
            <View style={styles.profileInfo}>
              <Label weight="semibold">{getDisplayName()}</Label>
              <BodyText size="sm" muted>
                {user?.email || 'No email'}
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
            <BodyText muted>
              {activeTeam?.personal_owner_user_id ? 'Personal' : activeTeam?.name || 'None'}
            </BodyText>
          </Pressable>
          {teams.length > 1 && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              <View style={styles.settingRow}>
                <BodyText>Teams</BodyText>
                <BodyText muted>{teams.length} teams</BodyText>
              </View>
            </>
          )}
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
        </Card>

        {/* About Section */}
        <View style={styles.sectionHeader}>
          <Label muted>About</Label>
        </View>
        <Card style={styles.section}>
          <View style={styles.settingRow}>
            <BodyText>Version</BodyText>
            <BodyText muted>{appVersion}</BodyText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <Pressable style={styles.settingRow}>
            <BodyText>Terms of Service</BodyText>
            <BodyText muted>→</BodyText>
          </Pressable>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <Pressable style={styles.settingRow}>
            <BodyText>Privacy Policy</BodyText>
            <BodyText muted>→</BodyText>
          </Pressable>
        </Card>

        {/* Sign Out */}
        <Button
          variant="outline"
          fullWidth
          style={styles.signOutButton}
          onPress={handleSignOut}
        >
          Sign Out
        </Button>

        {/* Footer */}
        <BodyText size="sm" muted center style={styles.footer}>
          Made with ❤️ by Nucleate
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
  footer: {
    marginTop: spacing[4],
    marginBottom: spacing[8],
  },
});
