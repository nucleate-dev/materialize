import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/components/useTheme';

export default function HomeScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to your app!</Text>
      <View style={styles.separator} />
      <Text style={styles.description}>
        This is your main screen. You can start building your app here.
      </Text>
      <Text style={styles.hint}>
        The app automatically supports dark and light mode.
      </Text>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.background,
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 16,
    },
    separator: {
      marginVertical: 20,
      height: 1,
      width: '80%',
      backgroundColor: theme.colors.border,
    },
    description: {
      fontSize: 16,
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: 12,
    },
    hint: {
      fontSize: 14,
      color: theme.colors.secondary,
      textAlign: 'center',
    },
  });
}
