import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <LinearGradient
      colors={['#667eea', '#764ba2']}
      style={styles.container}
    >
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Welcome to materialize
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Your next great app starts here
        </ThemedText>

        <Pressable
          style={styles.button}
          onPress={() => router.push('/onboarding/features')}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </Pressable>
      </ThemedView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: 'white',
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 48,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  button: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});