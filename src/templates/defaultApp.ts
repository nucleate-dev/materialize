import { Database } from "@/lib/types/database.types";
import { SnackFiles } from "../lib/types/chat";

export const DEFAULT_APP_CODE = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, typography } from './styles/theme';

const Stack = createNativeStackNavigator();

function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.messageText}>
        Chat with the window on the left to update me!
      </Text>
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.text.primary,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'Materialize App' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  messageText: {
    ...typography.h2,
    color: colors.text.primary,
    textAlign: 'center',
    lineHeight: 32,
  },
});`;

type PrototypeFile = Database["public"]["Tables"]["prototype_files"]["Row"];

export function getDefaultPrototypeFiles(
  prototypeId: string,
): Partial<PrototypeFile>[] {
  const snackFiles = getDefaultSnackFiles();

  return Object.entries(snackFiles).map(([fileName, fileData]) => ({
    prototype_id: prototypeId,
    name: fileName,
    contents: fileData.contents,
  }));
}

export const getDefaultSnackFiles = (): SnackFiles => ({
  "App.js": {
    contents: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors, typography } from './styles/theme';

const Stack = createNativeStackNavigator();

function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.messageText}>
        Chat with the window on the left to update me!
      </Text>
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.text.primary,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'Materialize App' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  messageText: {
    ...typography.h2,
    color: colors.text.primary,
    textAlign: 'center',
    lineHeight: 32,
  },
});`,
    type: "CODE",
  },
  "package.json": {
    contents: JSON.stringify(
      {
        name: "materialize-project",
        version: "1.0.0",
        main: "App.js",
        scripts: {
          start: "expo start",
          android: "expo start --android",
          ios: "expo start --ios",
          web: "expo start --web",
        },
        dependencies: DEFAULT_DEPENDENCIES,
        private: true,
      },
      null,
      2,
    ),
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

- \`App.js\` - Main app entry point with tab navigation
- \`components/\` - Reusable UI components
- \`styles/\` - Theme and styling configuration

## Features

- Live preview with Expo Snack
- AI-powered code generation
- Real-time updates
- Component library
- Traditional React Native tab navigation

Built with ❤️ using Materialize
`,
    type: "CODE",
  },
});

export const DEFAULT_DEPENDENCIES = {
  "@expo/vector-icons": { version: "^14.1.0" },
  "@react-native-async-storage/async-storage": { version: "2.1.2" },
  "@tanstack/react-query": { version: "^5.83.0" },
  expo: { version: "^53.0.4" },
  "expo-blur": { version: "~14.1.4" },
  tamagui: { version: "^1.132.15" },
  "expo-constants": { version: "~17.1.4" },
  "expo-font": { version: "~13.3.0" },
  "expo-haptics": { version: "~14.1.4" },
  "expo-image": { version: "~2.1.6" },
  "expo-image-picker": { version: "~16.1.4" },
  "expo-linear-gradient": { version: "~14.1.4" },
  "expo-linking": { version: "~7.1.4" },
  "expo-location": { version: "~18.1.4" },
  "expo-splash-screen": { version: "~0.30.7" },
  "expo-status-bar": { version: "~2.2.3" },
  "expo-symbols": { version: "~0.4.4" },
  "expo-system-ui": { version: "~5.0.6" },
  "expo-web-browser": { version: "~14.1.6" },
  "lucide-react-native": { version: "^0.475.0" },
  react: { version: "19.0.0" },
  "react-dom": { version: "19.0.0" },
  "react-native": { version: "0.79.1" },
  "react-native-reanimated": { version: "~3.16.1" },
  "@react-navigation/native-stack": { version: "7.2.1" },
  "@react-navigation/native": { version: "7.0.14" },
  "@react-navigation/bottom-tabs": { version: "7.4.4" },
  "react-native-gesture-handler": { version: "~2.24.0" },
  "react-native-safe-area-context": { version: "5.3.0" },
  "react-native-screens": { version: "~4.10.0" },
  "react-native-svg": { version: "15.11.2" },
  "react-native-web": { version: "^0.20.0" },
  zustand: { version: "^5.0.2" },
};
