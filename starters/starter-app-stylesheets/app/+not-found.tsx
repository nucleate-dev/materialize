import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';

export default function NotFoundScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
          This screen doesn't exist.
        </Text>

        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: isDark ? '#0A84FF' : '#007AFF' }]}>
            Go to home screen!
          </Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  link: {
    marginTop: 8,
  },
  linkText: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
