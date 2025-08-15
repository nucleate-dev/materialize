import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import { Platform } from 'react-native';

const storage = Platform.OS !== 'web' ? new MMKV() : null;

const getStoredValue = (key: string, defaultValue: any) => {
  if (!storage) {return defaultValue;}
  
  if (typeof defaultValue === 'boolean') {
    return storage.getBoolean(key) ?? defaultValue;
  }
  return storage.getString(key) ?? defaultValue;
};

const setStoredValue = (key: string, value: any) => {
  if (!storage) {return;}
  
  if (typeof value === 'boolean') {
    storage.set(key, value);
  } else {
    storage.set(key, value);
  }
};

interface AppState {
  hasCompletedOnboarding: boolean;
  setOnboardingComplete: () => void;
  resetOnboarding: () => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useAppStore = create<AppState>((set) => ({
  hasCompletedOnboarding: getStoredValue('hasCompletedOnboarding', false),
  setOnboardingComplete: () => {
    setStoredValue('hasCompletedOnboarding', true);
    set({ hasCompletedOnboarding: true });
  },
  resetOnboarding: () => {
    setStoredValue('hasCompletedOnboarding', false);
    set({ hasCompletedOnboarding: false });
  },
  theme: getStoredValue('theme', 'system') as 'light' | 'dark' | 'system',
  setTheme: (theme) => {
    setStoredValue('theme', theme);
    set({ theme });
  },
}));