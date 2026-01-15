import { Tabs } from 'expo-router';
import { useTheme } from '../../lib/ThemeContext';
import { View, StyleSheet } from 'react-native';
import { StyledText } from '../../components/ui';

// Simple icon components (we can replace with proper icons later)
function HomeIcon({ color }: { color: string }) {
  return (
    <View style={[styles.iconContainer, { borderColor: color }]}>
      <StyledText size="lg" color={color}>
        H
      </StyledText>
    </View>
  );
}

function PlusIcon({ color }: { color: string }) {
  return (
    <View style={[styles.iconContainer, { borderColor: color }]}>
      <StyledText size="lg" color={color}>
        +
      </StyledText>
    </View>
  );
}

function SettingsIcon({ color }: { color: string }) {
  return (
    <View style={[styles.iconContainer, { borderColor: color }]}>
      <StyledText size="lg" color={color}>
        S
      </StyledText>
    </View>
  );
}

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
        },
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTintColor: theme.colors.foreground,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Projects',
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ color }) => <PlusIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <SettingsIcon color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
