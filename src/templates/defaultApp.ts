import { SnackFiles } from '../types/chat';

export const DEFAULT_APP_CODE = `import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function App() {
  const [count, setCount] = React.useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to React Native!</Text>
      <Text style={styles.subtitle}>
        This is a live preview powered by Expo Snack
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
          style={styles.button} 
          onPress={() => setCount(0)}
        >
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
      </View>
      
      <Text style={styles.instructions}>
        Chat with the AI to modify this code and see live updates!
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
});`;

export const getDefaultSnackFiles = (): SnackFiles => ({
  'App.js': {
    contents: DEFAULT_APP_CODE,
    type: 'CODE',
  },
});

export const DEFAULT_DEPENDENCIES = {
  'react-native': { version: '0.76.1' },
  'react': { version: '18.2.0' },
  'expo': { version: '~52.0.0' },
};