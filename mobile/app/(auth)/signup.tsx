import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/ThemeContext';
import { useAuthStore } from '../../stores/authStore';
import { Heading, BodyText, Input, PasswordInput, Button, Caption } from '../../components/ui';
import { spacing } from '../../lib/theme';

export default function SignupScreen() {
  const { theme } = useTheme();
  const { signUp, isLoading, error, clearError } = useAuthStore();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Password requirements
  const hasMinLength = password.length >= 12;
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const isPasswordValid = hasMinLength && hasLowercase && hasUppercase && hasDigit && hasSymbol;

  const handleSignup = async () => {
    clearError();
    setLocalError(null);

    // Validation
    if (!firstName.trim()) {
      setLocalError('Please enter your first name');
      return;
    }
    if (!lastName.trim()) {
      setLocalError('Please enter your last name');
      return;
    }
    if (!email.trim()) {
      setLocalError('Please enter your email');
      return;
    }
    if (!isPasswordValid) {
      setLocalError('Please meet all password requirements');
      return;
    }
    if (!passwordsMatch) {
      setLocalError('Passwords do not match');
      return;
    }

    const { error } = await signUp({
      email: email.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });

    if (!error) {
      // Navigate to login or show success message
      router.replace('/(auth)/login');
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
              Create your account
            </BodyText>
          </View>

          <View style={styles.form}>
            <View style={styles.nameRow}>
              <Input
                label="First name"
                placeholder="John"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                containerStyle={styles.nameInput}
              />
              <Input
                label="Last name"
                placeholder="Doe"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                containerStyle={styles.nameInput}
              />
            </View>

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
              placeholder="Create a password"
              value={password}
              onChangeText={setPassword}
            />

            {/* Password requirements checklist */}
            {password.length > 0 && (
              <View style={styles.requirements}>
                <PasswordRequirement met={hasMinLength} text="At least 12 characters" />
                <PasswordRequirement met={hasLowercase} text="One lowercase letter" />
                <PasswordRequirement met={hasUppercase} text="One uppercase letter" />
                <PasswordRequirement met={hasDigit} text="One number" />
                <PasswordRequirement met={hasSymbol} text="One symbol" />
              </View>
            )}

            <PasswordInput
              label="Confirm Password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              error={confirmPassword && !passwordsMatch ? 'Passwords do not match' : undefined}
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
              onPress={handleSignup}
              style={styles.createButton}
            >
              Create Account
            </Button>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <BodyText muted size="sm">
                Already have an account?{' '}
              </BodyText>
              <Link href="/(auth)/login" asChild>
                <BodyText color={theme.colors.primary} size="sm" weight="medium">
                  Log in
                </BodyText>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  const { theme } = useTheme();
  return (
    <Caption color={met ? theme.colors.success : theme.colors.mutedForeground}>
      {met ? '\u2713' : '\u2022'} {text}
    </Caption>
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
  },
  header: {
    marginBottom: spacing[6],
    marginTop: spacing[4],
  },
  subtitle: {
    marginTop: spacing[2],
  },
  form: {
    gap: spacing[4],
  },
  nameRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  nameInput: {
    flex: 1,
  },
  requirements: {
    gap: spacing[1],
    paddingLeft: spacing[2],
  },
  createButton: {
    marginTop: spacing[2],
  },
  footer: {
    marginTop: spacing[6],
    alignItems: 'center',
  },
  footerRow: {
    flexDirection: 'row',
  },
});
