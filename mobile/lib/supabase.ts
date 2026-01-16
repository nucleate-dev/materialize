import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Check if we're running on web
const isWeb = Platform.OS === 'web';

// Web storage adapter using localStorage
const WebStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    } catch (error) {
      console.error('localStorage getItem error:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error('localStorage setItem error:', error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('localStorage removeItem error:', error);
    }
  },
};

// Native storage adapter using SecureStore
const NativeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('SecureStore getItem error:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('SecureStore setItem error:', error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('SecureStore removeItem error:', error);
    }
  },
};

// Use the appropriate storage adapter based on platform
const StorageAdapter = isWeb ? WebStorageAdapter : NativeStorageAdapter;

// Environment variables - these should be set in app.json or .env
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing Supabase environment variables. Make sure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: StorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb, // Enable for web, disable for native
  },
});

// Auth helper functions
export async function signUp({
  email,
  password,
  firstName = '',
  lastName = '',
}: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}) {
  const firstNameFormatted =
    firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  const lastNameFormatted =
    lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();

  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: `${firstNameFormatted} ${lastNameFormatted}`.trim(),
        email,
        first_name: firstNameFormatted,
        last_name: lastNameFormatted,
      },
    },
  });
}

export async function signIn({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  return await supabase.auth.signInWithPassword({
    email,
    password,
  });
}

export async function signOut() {
  return await supabase.auth.signOut();
}

export async function sendPasswordResetEmail(email: string) {
  return await supabase.auth.resetPasswordForEmail(email);
}

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user, error };
}

export async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  return { session, error };
}
