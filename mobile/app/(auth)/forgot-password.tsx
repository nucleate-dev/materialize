import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/ThemeContext';
import { useAuthStore } from '../../stores/authStore';
import { Heading, BodyText, Input, Button } from '../../components/ui';
import { spacing } from '../../lib/theme';

export default function ForgotPasswordScreen() {
  const { theme } = useTheme();
  const { resetPassword, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleResetPassword = async () => {
    clearError();
    setLocalError(null);

    if (!email.trim()) {
      setLocalError('Please enter your email');
      return;
    }

    const { error } = await resetPassword(email.trim());

    if (!error) {
      setSubmitted(true);
    }
  };

  const displayError = localError || error?.message;

  if (submitted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.content}>
          <View style={styles.successIcon}>
            <BodyText size="4xl">✉️</BodyText>
          </View>
          <Heading size="2xl" center>
            Check your email
          </Heading>
          <BodyText muted center style={styles.successText}>
            We've sent password reset instructions to {email}
          </BodyText>
          <Button
            variant="primary"
            fullWidth
            onPress={() => router.replace('/(auth)/login')}
            style={styles.backButton}
          >
            Back to Login
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Heading size="2xl" center>
              Reset Password
            </Heading>
            <BodyText muted center style={styles.subtitle}>
              Enter your email and we'll send you instructions to reset your password
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
              onPress={handleResetPassword}
            >
              Send Reset Link
            </Button>
          </View>

          <View style={styles.footer}>
            <Link href="/(auth)/login" asChild>
              <BodyText color={theme.colors.primary} size="sm">
                Back to Login
              </BodyText>
            </Link>
          </View>
        </View>
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
  content: {
    flex: 1,
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
  footer: {
    marginTop: spacing[6],
    alignItems: 'center',
  },
  successIcon: {
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  successText: {
    marginTop: spacing[2],
    marginBottom: spacing[6],
  },
  backButton: {
    marginTop: spacing[4],
  },
});
