import { SnackFiles } from "../lib/types/chat";

export const DEFAULT_APP_CODE = `import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function App() {
  const [currentScreen, setCurrentScreen] = React.useState('home');
  const [count, setCount] = React.useState(0);

  const renderHomeScreen = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
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
        Navigate between screens using the bottom navigation.
      </Text>
    </ScrollView>
  );

  const renderExploreScreen = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Explore Features</Text>
      <Text style={styles.subtitle}>
        Discover what makes this app special
      </Text>

      <View style={styles.featuresContainer}>
        {[
          { title: 'File-based Routing', description: 'Navigate between screens using Expo Router file structure.', icon: '🗂️' },
          { title: 'Tab Navigation', description: 'Bottom tab navigation with custom icons and styling.', icon: '📱' },
          { title: 'Component Library', description: 'Pre-built components for rapid development.', icon: '🧩' },
          { title: 'Live Preview', description: 'Real-time updates as you chat with the AI assistant.', icon: '⚡' },
        ].map((feature, index) => (
          <View key={index} style={styles.featureCard}>
            <View style={styles.featureContent}>
              <Text style={styles.featureIcon}>{feature.icon}</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  const renderProfileScreen = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={48} color="#007AFF" />
        </View>
        <Text style={styles.name}>Demo User</Text>
        <Text style={styles.email}>demo@materialize.app</Text>
      </View>

      <View style={styles.settingsContainer}>
        <Text style={styles.sectionTitle}>Settings</Text>
        {[
          { title: 'Account Settings', icon: 'settings-outline' },
          { title: 'Notifications', icon: 'notifications-outline' },
          { title: 'Privacy', icon: 'lock-closed-outline' },
          { title: 'Help & Support', icon: 'help-circle-outline' },
          { title: 'About', icon: 'information-circle-outline' },
        ].map((setting, index) => (
          <TouchableOpacity key={index} style={styles.settingCard}>
            <View style={styles.settingItem}>
              <Ionicons name={setting.icon} size={24} color="#007AFF" style={styles.settingIcon} />
              <Text style={styles.settingTitle}>{setting.title}</Text>
              <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const renderContent = () => {
    switch (currentScreen) {
      case 'home':
        return renderHomeScreen();
      case 'explore':
        return renderExploreScreen();
      case 'profile':
        return renderProfileScreen();
      default:
        return renderHomeScreen();
    }
  };

  return (
    <View style={styles.appContainer}>
      <View style={styles.content}>
        {renderContent()}
      </View>
      
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, currentScreen === 'home' && styles.activeTab]} 
          onPress={() => setCurrentScreen('home')}
        >
          <Ionicons 
            name="home" 
            size={24} 
            color={currentScreen === 'home' ? '#007AFF' : '#8E8E93'} 
            style={styles.tabIcon} 
          />
          <Text style={[styles.tabLabel, currentScreen === 'home' && styles.activeTabLabel]}>Home</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tab, currentScreen === 'explore' && styles.activeTab]} 
          onPress={() => setCurrentScreen('explore')}
        >
          <Ionicons 
            name="compass" 
            size={24} 
            color={currentScreen === 'explore' ? '#007AFF' : '#8E8E93'} 
            style={styles.tabIcon} 
          />
          <Text style={[styles.tabLabel, currentScreen === 'explore' && styles.activeTabLabel]}>Explore</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tab, currentScreen === 'profile' && styles.activeTab]} 
          onPress={() => setCurrentScreen('profile')}
        >
          <Ionicons 
            name="person" 
            size={24} 
            color={currentScreen === 'profile' ? '#007AFF' : '#8E8E93'} 
            style={styles.tabIcon} 
          />
          <Text style={[styles.tabLabel, currentScreen === 'profile' && styles.activeTabLabel]}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  content: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    minHeight: '100%',
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
  featuresContainer: {
    width: '100%',
  },
  featureCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, y: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 0,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, y: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopColor: '#E5E5EA',
    borderTopWidth: 1,
    paddingBottom: 20,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeTab: {
    // Active state styling
  },
  tabIcon: {
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  activeTabLabel: {
    color: '#007AFF',
    fontWeight: '600',
  },
});`;

export const getDefaultSnackFiles = (): SnackFiles => ({
  "App.js": {
    contents: DEFAULT_APP_CODE,
    type: "CODE",
  },
  "package.json": {
    contents: JSON.stringify({
      "name": "materialize-project",
      "version": "1.0.0",
      "main": "App.js",
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
  "@nkzw/create-context-hook": { version: "^1.1.0" },
  "@react-native-async-storage/async-storage": { version: "2.1.2" },
  "@tanstack/react-query": { version: "^5.83.0" },
  "expo": { version: "^53.0.4" },
  "expo-blur": { version: "~14.1.4" },
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
  "nativewind": { version: "^4.1.23" },
  "react": { version: "19.0.0" },
  "react-dom": { version: "19.0.0" },
  "react-native": { version: "0.79.1" },
  "react-native-gesture-handler": { version: "~2.24.0" },
  "react-native-safe-area-context": { version: "5.3.0" },
  "react-native-screens": { version: "~4.10.0" },
  "react-native-svg": { version: "15.11.2" },
  "react-native-web": { version: "^0.20.0" },
  "zustand": { version: "^5.0.2" }
};
