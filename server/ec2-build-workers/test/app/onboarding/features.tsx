import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

export default function FeaturesScreen() {
  const router = useRouter();

  const features = [
    {
      title: 'Modern Architecture',
      description: 'Built with Expo Router, TypeScript, and best practices',
    },
    {
      title: 'State Management',
      description: 'Zustand for simple and efficient state management',
    },
    {
      title: 'Persistent Storage',
      description: 'MMKV for fast and reliable local data storage',
    },
    {
      title: 'Backend Ready',
      description: 'Supabase integration for authentication and database',
    },
  ];

  return (
    <LinearGradient
      colors={['#764ba2', '#667eea']}
      style={styles.container}
    >
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          What&apos;s Included
        </ThemedText>
        
        <ScrollView style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <ThemedText style={styles.featureTitle}>
                {feature.title}
              </ThemedText>
              <ThemedText style={styles.featureDescription}>
                {feature.description}
              </ThemedText>
            </View>
          ))}
        </ScrollView>
        
        <Pressable
          style={styles.button}
          onPress={() => router.push('/onboarding/complete')}
        >
          <Text style={styles.buttonText}>Continue</Text>
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
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 40,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 32,
    color: 'white',
  },
  featuresContainer: {
    flex: 1,
    marginBottom: 32,
  },
  featureItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
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