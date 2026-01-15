import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { ThemeProvider, useTheme } from '../lib/ThemeContext';
import { queryClient, restoreQueryCache } from '../lib/queryClient';
import { useAuthStore } from '../stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import { useProtectedRoute } from '../components/AuthGuard';

function RootLayoutNav() {
  const { theme, isDark } = useTheme();

  // Handle auth-based navigation
  useProtectedRoute();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.foreground,
          headerTitleStyle: {
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen
          name="project/[id]"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const initializeAuth = useAuthStore((state) => state.initialize);
  const isAuthInitialized = useAuthStore((state) => state.isInitialized);
  const user = useAuthStore((state) => state.user);
  const initializeTeams = useTeamStore((state) => state.initialize);
  const [isReady, setIsReady] = useState(false);

  // Initialize auth on mount
  useEffect(() => {
    async function init() {
      await Promise.all([initializeAuth(), restoreQueryCache()]);
      setIsReady(true);
    }
    init();
  }, [initializeAuth]);

  // Initialize teams when user is authenticated
  useEffect(() => {
    if (user?.id) {
      initializeTeams(user.id);
    }
  }, [user?.id, initializeTeams]);

  if (!isReady || !isAuthInitialized) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppInitializer>
              <RootLayoutNav />
            </AppInitializer>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
