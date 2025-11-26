import { StyleSheet, Text, View } from 'react-native';
import { useTheme, Theme } from '../../../theme';

export default function HomeScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Welcome to Materialize!
      </Text>

      <View style={styles.separator} />

      <Text style={styles.paragraph}>
        This is your main screen. You can start building your app here with beautiful components.
      </Text>

      <Text style={styles.subtext}>
        The app automatically supports dark and light mode with theme support.
      </Text>
    </View>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
    color: theme.colors.text,
  },
  separator: {
    width: '80%',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  paragraph: {
    fontSize: theme.typography.sizes.lg,
    textAlign: 'center',
    maxWidth: 300,
    color: theme.colors.text,
  },
  subtext: {
    fontSize: theme.typography.sizes.sm,
    textAlign: 'center',
    opacity: 0.8,
    color: theme.colors.textSecondary,
  },
  button: {
    paddingVertical: theme.spacing.sm + 4,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.primary,
  },
  buttonText: {
    color: '#fff',
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
});
