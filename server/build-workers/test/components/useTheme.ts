import { useColorScheme } from './useColorScheme';

export type Theme = {
  colors: {
    background: string;
    text: string;
    primary: string;
    secondary: string;
    border: string;
    card: string;
    tint: string;
  };
};

const lightTheme: Theme = {
  colors: {
    background: '#ffffff',
    text: '#000000',
    primary: '#007AFF',
    secondary: '#8E8E93',
    border: '#E1E1E1',
    card: '#F2F2F7',
    tint: '#007AFF',
  },
};

const darkTheme: Theme = {
  colors: {
    background: '#000000',
    text: '#ffffff',
    primary: '#0A84FF',
    secondary: '#8E8E93',
    border: '#38383A',
    card: '#1C1C1E',
    tint: '#0A84FF',
  },
};

export function useTheme(): Theme {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}