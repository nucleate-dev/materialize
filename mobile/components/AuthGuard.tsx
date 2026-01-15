import { useEffect } from 'react';
import { useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '../stores/authStore';

export function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  const { session, isInitialized } = useAuthStore();

  useEffect(() => {
    // Wait for navigation to be ready
    if (!navigationState?.key) return;

    // Wait for auth to initialize
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    const isAuthenticated = !!session;

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login if not authenticated and not already in auth group
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to home if authenticated but in auth group
      router.replace('/(tabs)');
    }
  }, [session, segments, isInitialized, navigationState?.key]);
}
