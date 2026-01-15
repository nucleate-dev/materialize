import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../lib/ThemeContext';

export default function ProjectLayout() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTintColor: theme.colors.foreground,
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Project',
        }}
      />
      <Stack.Screen
        name="edit"
        options={{
          title: 'Edit Project',
        }}
      />
    </Stack>
  );
}
