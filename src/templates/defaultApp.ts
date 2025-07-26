import { SnackFiles } from "../lib/types/chat";

export const DEFAULT_APP_CODE = `import { Slot } from 'expo-router';

export default function RootLayout() {
  return <Slot />;
}`;

export const getDefaultSnackFiles = (): SnackFiles => ({
  "app/_layout.tsx": {
    contents: DEFAULT_APP_CODE,
    type: "CODE",
  },
  "app/(tabs)/_layout.tsx": {
    contents: `import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#E5E5EA',
        },
        headerStyle: {
          backgroundColor: '#007AFF',
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}`,
    type: "CODE",
  },
  "app/(tabs)/index.tsx": {
    contents: `import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function HomeScreen() {
  const [count, setCount] = React.useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Materialize!</Text>
      <Text style={styles.subtitle}>
        This is a live preview with Expo Router
      </Text>

      <View style={styles.counterContainer}>
        <Text style={styles.counterText}>Count: {count}</Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => setCount(count + 1)}
        >
          <Text style={styles.buttonText}>Increment</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.button, styles.resetButton]} 
          onPress={() => setCount(0)}
        >
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.instructions}>
        Chat with the AI to modify this code and see live updates!
        Navigate between tabs to explore the app structure.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  counterContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  counterText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginVertical: 5,
  },
  resetButton: {
    backgroundColor: '#8E8E93',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  instructions: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});`,
    type: "CODE",
  },
  "app/(tabs)/explore.tsx": {
    contents: `import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Card from '../../components/Card';

export default function ExploreScreen() {
  const features = [
    {
      title: 'File-based Routing',
      description: 'Navigate between screens using Expo Router file structure.',
      icon: '🗂️',
    },
    {
      title: 'Tab Navigation',
      description: 'Bottom tab navigation with custom icons and styling.',
      icon: '📱',
    },
    {
      title: 'Component Library',
      description: 'Pre-built components for rapid development.',
      icon: '🧩',
    },
    {
      title: 'Live Preview',
      description: 'Real-time updates as you chat with the AI assistant.',
      icon: '⚡',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Explore Features</Text>
      <Text style={styles.subtitle}>
        Discover what makes this app special
      </Text>

      {features.map((feature, index) => (
        <Card key={index} style={styles.featureCard}>
          <View style={styles.featureContent}>
            <Text style={styles.featureIcon}>{feature.icon}</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  featureCard: {
    marginBottom: 16,
  },
  featureContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});`,
    type: "CODE",
  },
  "app/(tabs)/profile.tsx": {
    contents: `import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../../components/Card';

export default function ProfileScreen() {
  const handleSettingPress = (setting: string) => {
    Alert.alert('Setting Pressed', \`You pressed: \${setting}\`);
  };

  const settings = [
    { title: 'Account Settings', icon: 'person-outline' as const },
    { title: 'Notifications', icon: 'notifications-outline' as const },
    { title: 'Privacy', icon: 'lock-closed-outline' as const },
    { title: 'Help & Support', icon: 'help-circle-outline' as const },
    { title: 'About', icon: 'information-circle-outline' as const },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={48} color="#007AFF" />
        </View>
        <Text style={styles.name}>Demo User</Text>
        <Text style={styles.email}>demo@materialize.app</Text>
      </View>

      <View style={styles.settingsContainer}>
        <Text style={styles.sectionTitle}>Settings</Text>
        {settings.map((setting, index) => (
          <Card key={index} style={styles.settingCard}>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => handleSettingPress(setting.title)}
            >
              <Ionicons
                name={setting.icon}
                size={24}
                color="#007AFF"
                style={styles.settingIcon}
              />
              <Text style={styles.settingTitle}>{setting.title}</Text>
              <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
            </TouchableOpacity>
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  header: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#ffffff',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: '#666',
  },
  settingsContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  settingCard: {
    marginBottom: 8,
    padding: 0,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  settingIcon: {
    marginRight: 16,
  },
  settingTitle: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
});`,
    type: "CODE",
  },
  "package.json": {
    contents: JSON.stringify({
      "name": "materialize-project",
      "version": "1.0.0",
      "main": "expo-router/entry",
      "scripts": {
        "start": "expo start",
        "android": "expo start --android",
        "ios": "expo start --ios",
        "web": "expo start --web"
      },
      "dependencies": DEFAULT_DEPENDENCIES,
      "private": true
    }, null, 2),
    type: "CODE",
  },
  "components/Button.js": {
    contents: `import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function Button({ title, onPress, style, textStyle }) {
  return (
    <TouchableOpacity style={[styles.button, style]} onPress={onPress}>
      <Text style={[styles.text, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});`,
    type: "CODE",
  },
  "components/Card.js": {
    contents: `import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function Card({ children, style }) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, y: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginVertical: 8,
  },
});`,
    type: "CODE",
  },
  "styles/theme.js": {
    contents: `export const colors = {
  primary: '#007AFF',
  secondary: '#5AC8FA',
  success: '#34C759',
  warning: '#FF9500',
  danger: '#FF3B30',
  background: '#F2F2F7',
  surface: '#FFFFFF',
  text: {
    primary: '#000000',
    secondary: '#3C3C43',
    tertiary: '#8E8E93',
  },
  border: '#C6C6C8',
};

export const typography = {
  h1: { fontSize: 32, fontWeight: 'bold' },
  h2: { fontSize: 24, fontWeight: 'bold' },
  h3: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 16, fontWeight: 'normal' },
  caption: { fontSize: 12, fontWeight: 'normal' },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};`,
    type: "CODE",
  },
  "README.md": {
    contents: `# Materialize Project

This is a React Native project created with Materialize.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start the development server:
   \`\`\`bash
   npm start
   \`\`\`

3. Open the Expo app on your phone and scan the QR code.

## Project Structure

- \`App.js\` - Main application component
- \`components/\` - Reusable UI components
- \`styles/\` - Theme and styling configuration

## Features

- Live preview with Expo Snack
- AI-powered code generation
- Real-time updates
- Component library

Built with ❤️ using Materialize
`,
    type: "CODE",
  },
});

export const DEFAULT_DEPENDENCIES = {
  "react-native": { version: "0.76.1" },
  react: { version: "18.2.0" },
  expo: { version: "~52.0.0" },
  "expo-linear-gradient": {
    version: "8.2.1",
  },
  "react-native-vector-icons": {
    version: "7.1.0",
  },
  "@expo/vector-icons": { version: "13.0.0" },
  "expo-router": { version: "4.19.0" },
  "expo-linking": { version: "7.0.0" },
  "expo-constants": { version: "17.0.0" },
  "expo-status-bar": { version: "2.0.0" },
  "react-native-safe-area-context": { version: "4.12.0" },
  "react-native-screens": { version: "4.3.0" },
};
