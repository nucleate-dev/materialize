import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/ThemeContext';
import { useAuthStore } from '../../stores/authStore';
import { Heading, BodyText, Input, PasswordInput, Button } from '../../components/ui';
import { spacing } from '../../lib/theme';

export default function LoginScreen() {
  const { theme } = useTheme();
  const { signIn, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLogin = async () => {
    clearError();
    setLocalError(null);

    // Basic validation
    if (!email.trim()) {
      setLocalError('Please enter your email');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password');
      return;
    }

    const { error } = await signIn(email.trim(), password);

    if (!error) {
      router.replace('/(tabs)');
    }
  };

  const displayError = localError || error?.message;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Heading size="3xl" center>
              Nucleate
            </Heading>
            <BodyText muted center style={styles.subtitle}>
              Sign in to your account
            </BodyText>
          </View>

          <View style={styles.form}>
            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
            />

            <PasswordInput
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              autoComplete="password"
            />

            {displayError && (
              <BodyText color={theme.colors.destructive} size="sm">
                {displayError}
              </BodyText>
            )}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={isLoading}
              onPress={handleLogin}
              style={styles.signInButton}
            >
              Sign In
            </Button>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <BodyText muted size="sm">
                Don't have an account?{' '}
              </BodyText>
              <Link href="/(auth)/signup" asChild>
                <BodyText color={theme.colors.primary} size="sm" weight="medium">
                  Sign up
                </BodyText>
              </Link>
            </View>
            <Link href="/(auth)/forgot-password" asChild>
              <BodyText color={theme.colors.primary} size="sm" style={styles.forgotPassword}>
                Forgot password?
              </BodyText>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing[6],
    justifyContent: 'center',
  },
  header: {
    marginBottom: spacing[8],
  },
  subtitle: {
    marginTop: spacing[2],
  },
  form: {
    gap: spacing[4],
  },
  signInButton: {
    marginTop: spacing[2],
  },
  footer: {
    marginTop: spacing[8],
    alignItems: 'center',
    gap: spacing[2],
  },
  footerRow: {
    flexDirection: 'row',
  },
  forgotPassword: {
    marginTop: spacing[1],
  },
});
