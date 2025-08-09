import { ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAppStore } from '@/store/useAppStore';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const { theme, setTheme, resetOnboarding: resetOnboardingState } = useAppStore();
  const router = useRouter();

  const themeOptions = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];

  const resetOnboarding = () => {
    Alert.alert(
      'Reset Onboarding',
      'This will show the onboarding flow again. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetOnboardingState();
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        Settings
      </ThemedText>
      
      <ScrollView style={styles.content}>
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Appearance
          </ThemedText>
          
          <ThemedText style={styles.label}>Theme</ThemedText>
          {themeOptions.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.option,
                theme === option.value && styles.selectedOption,
              ]}
              onPress={() => setTheme(option.value as 'light' | 'dark' | 'system')}
            >
              <ThemedText
                style={[
                  styles.optionText,
                  theme === option.value && styles.selectedOptionText,
                ]}
              >
                {option.label}
              </ThemedText>
              {theme === option.value && (
                <ThemedText style={styles.checkmark}>✓</ThemedText>
              )}
            </Pressable>
          ))}
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            About
          </ThemedText>
          
          <ThemedView style={styles.infoItem}>
            <ThemedText style={styles.infoLabel}>Version</ThemedText>
            <ThemedText style={styles.infoValue}>1.0.0</ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.infoItem}>
            <ThemedText style={styles.infoLabel}>Template</ThemedText>
            <ThemedText style={styles.infoValue}>ZoltLabs</ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Developer
          </ThemedText>
          
          <Pressable
            style={styles.button}
            onPress={resetOnboarding}
          >
            <ThemedText style={styles.buttonText}>Reset Onboarding</ThemedText>
          </Pressable>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingTop: 60,
    paddingBottom: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  selectedOption: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  optionText: {
    fontSize: 16,
  },
  selectedOptionText: {
    color: '#3B82F6',
    fontWeight: '500',
  },
  checkmark: {
    color: '#3B82F6',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 16,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#EF4444',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});