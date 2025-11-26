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
  APP_NAME: process.env.EXPO_PUBLIC_APP_NAME || expoConfig?.name || 'Materialize',
  APP_VERSION: process.env.EXPO_PUBLIC_APP_VERSION || expoConfig?.version || '1.0.0',
} as const;

/**
 * Validate required environment variables
 * Call this at app startup to ensure all required vars are set
 */
export function validateEnv() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
  ] as const;

  const missing = required.filter(key => !env[key]);

  if (missing.length > 0) {
    console.warn(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file'
    );
  }
}
