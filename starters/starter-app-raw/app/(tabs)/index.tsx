import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>
        Welcome to Materialize!
      </Text>

      <View style={[styles.separator, { borderBottomColor: isDark ? '#333' : '#ccc' }]} />

      <Text style={[styles.paragraph, { color: isDark ? '#fff' : '#000' }]}>
        This is your main screen. You can start building your app here with beautiful components.
      </Text>

      <Text style={[styles.subtext, { color: isDark ? '#aaa' : '#666' }]}>
        The app automatically supports dark and light mode with theme support.
      </Text>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: isDark ? '#0A84FF' : '#007AFF' }]}
        onPress={() => console.log('Button pressed!')}
      >
        <Text style={styles.buttonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  separator: {
    width: '80%',
    borderBottomWidth: 1,
  },
  paragraph: {
    fontSize: 18,
    textAlign: 'center',
    maxWidth: 300,
  },
  subtext: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.8,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
