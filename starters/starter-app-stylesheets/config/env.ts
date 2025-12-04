import Constants from 'expo-constants';

/**
 * Environment configuration
 * Access environment variables using EXPO_PUBLIC_ prefix
 *
 * @example
 * import { env } from '@/config/env';
 * console.log(env.SUPABASE_URL);
 */

const expoConfig = Constants.expoConfig;

export const env = {
  // Supabase
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',

  // API
  API_URL: process.env.EXPO_PUBLIC_API_URL || '',

  // Environment
  ENV: process.env.EXPO_PUBLIC_ENV || 'development',

  // App
  APP_NAME: process.env.EXPO_PUBLIC_APP_NAME || expoConfig?.name || 'Sanara',
  APP_VERSION: process.env.EXPO_PUBLIC_APP_VERSION || expoConfig?.version || '1.0.0',
} as const;
