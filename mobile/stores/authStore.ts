import { create } from 'zustand';
import { User, Session, AuthError } from '@supabase/supabase-js';
import {
  supabase,
  signIn as supabaseSignIn,
  signUp as supabaseSignUp,
  signOut as supabaseSignOut,
  sendPasswordResetEmail,
} from '../lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: AuthError | null;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (params: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  isInitialized: false,
  error: null,

  initialize: async () => {
    try {
      // Get the current session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      set({
        session,
        user: session?.user ?? null,
        isLoading: false,
        isInitialized: true,
      });

      // Listen for auth state changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
        });
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({
        isLoading: false,
        isInitialized: true,
        error: error as AuthError,
      });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    const { error } = await supabaseSignIn({ email, password });

    set({ isLoading: false, error });
    return { error };
  },

  signUp: async ({ email, password, firstName, lastName }) => {
    set({ isLoading: true, error: null });

    const { error } = await supabaseSignUp({
      email,
      password,
      firstName,
      lastName,
    });

    set({ isLoading: false, error });
    return { error };
  },

  signOut: async () => {
    set({ isLoading: true });
    await supabaseSignOut();
    set({
      user: null,
      session: null,
      isLoading: false,
    });
  },

  resetPassword: async (email: string) => {
    set({ isLoading: true, error: null });

    const { error } = await sendPasswordResetEmail(email);

    set({ isLoading: false, error });
    return { error };
  },

  clearError: () => {
    set({ error: null });
  },
}));

// Selector hooks for convenience
export const useUser = () => useAuthStore((state) => state.user);
export const useSession = () => useAuthStore((state) => state.session);
export const useIsAuthenticated = () => useAuthStore((state) => !!state.session);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
