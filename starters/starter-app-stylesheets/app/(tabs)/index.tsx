import { StyledText, Theme, useTheme } from '@/theme';
import { StyleSheet, View } from 'react-native';

export default function HomeScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <StyledText variant="h1" style={styles.title}>
        Welcome to Sanara!
      </StyledText>

      <View style={styles.separator} />

      <StyledText variant="bodyLarge" style={styles.paragraph}>
        This is your main screen. You can start building your app here with beautiful components.
      </StyledText>

      <StyledText variant="caption" color="textSecondary" style={styles.subtext}>
        The app automatically supports dark and light mode with theme support.
      </StyledText>
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
    textAlign: 'center',
  },
  separator: {
    width: '80%',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  paragraph: {
    textAlign: 'center',
    maxWidth: 300,
  },
  subtext: {
    textAlign: 'center',
    opacity: 0.8,
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
