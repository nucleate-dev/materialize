import { SnackFiles } from '../types/chat';

export const DEFAULT_APP_CODE = `import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function App() {
  const [count, setCount] = React.useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Materialize!</Text>
      <Text style={styles.subtitle}>
        This is a live preview
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

export const DEFAULT_APP_CODE_NICE = `import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const useTheme = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  return {
    isDark,
    colors: {
      primary: isDark ? '#007AFF' : '#007AFF',
      secondary: isDark ? '#5AC8FA' : '#5AC8FA',
      success: isDark ? '#32D74B' : '#34C759',
      warning: isDark ? '#FF9F0A' : '#FF9500',
      danger: isDark ? '#FF453A' : '#FF3B30',
      background: {
        primary: isDark ? '#000000' : '#F2F2F7',
        secondary: isDark ? '#1C1C1E' : '#FFFFFF',
        tertiary: isDark ? '#2C2C2E' : '#F2F2F7',
      },
      text: {
        primary: isDark ? '#FFFFFF' : '#000000',
        secondary: isDark ? '#EBEBF5' : '#3C3C43',
        tertiary: isDark ? '#EBEBF599' : '#3C3C4399',
      },
      border: isDark ? '#38383A' : '#C6C6C8',
      shadow: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)',
    },
    gradients: {
      card: isDark 
        ? ['#1C1C1E', '#2C2C2E'] 
        : ['#FFFFFF', '#F8F9FA'],
      hero: isDark
        ? ['#1E3A8A', '#3B82F6']
        : ['#667eea', '#764ba2'],
    }
  };
};

const Card = ({ children, style, onPress, gradient = false }) => {
  const theme = useTheme();
  
  const handlePress = () => {
    if (onPress) {
      // Haptics.impactAsync(// Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const cardContent = (
    <View style={[
      styles.cardContainer,
      {
        shadowColor: theme.colors.shadow,
        borderColor: theme.colors.border,
      },
      style
    ]}>
      {gradient ? (
        <LinearGradient
          colors={theme.gradients.card}
          style={styles.cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {children}
        </LinearGradient>
      ) : (
        <View style={[styles.cardContent, { backgroundColor: theme.colors.background.secondary }]}>
          {children}
        </View>
      )}
    </View>
  );

  return onPress ? (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      {cardContent}
    </TouchableOpacity>
  ) : cardContent;
};

const TabBar = ({ activeTab, setActiveTab }) => {
  const theme = useTheme();
  
  const tabs = [
    { id: 'home', icon: 'home', label: 'Home' },
    { id: 'stats', icon: 'stats-chart', label: 'Stats' },
    { id: 'profile', icon: 'person', label: 'Profile' },
  ];

  return (
    <View style={[
      styles.tabBar,
      {
        backgroundColor: theme.colors.background.secondary,
        borderTopColor: theme.colors.border,
      }
    ]}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.id}
          style={styles.tabItem}
          onPress={() => {
            // Haptics.impactAsync(// Haptics.ImpactFeedbackStyle.Light);
            setActiveTab(tab.id);
          }}
        >
          <Ionicons
            name={tab.icon}
            size={24}
            color={activeTab === tab.id ? theme.colors.primary : theme.colors.text.tertiary}
          />
          <Text style={[
            styles.tabLabel,
            {
              color: activeTab === tab.id ? theme.colors.primary : theme.colors.text.tertiary
            }
          ]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const HomeScreen = () => {
  const theme = useTheme();
  
  return (
    <ScrollView 
      style={[styles.screenContainer, { backgroundColor: theme.colors.background.primary }]}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={theme.gradients.hero}
        style={styles.heroSection}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.heroTitle}>Welcome to Materialize</Text>
        <Text style={styles.heroSubtitle}>Build beautiful React Native apps with AI</Text>
      </LinearGradient>
      
      <View style={styles.contentSection}>
        <Card gradient onPress={() => console.log('Getting Started pressed')}>
          <View style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '20' }]}>
                <Ionicons name="rocket" size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.cardTitleContainer}>
                <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>Getting Started</Text>
                <Text style={[styles.cardSubtitle, { color: theme.colors.text.secondary }]}>Begin your journey</Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: theme.colors.text.secondary }]}>
              Chat with the AI to modify this code and see live updates in real-time. Your changes appear instantly!
            </Text>
          </View>
        </Card>
        
        <Card gradient onPress={() => console.log('Live Preview pressed')}>
          <View style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, { backgroundColor: theme.colors.success + '20' }]}>
                <Ionicons name="eye" size={24} color={theme.colors.success} />
              </View>
              <View style={styles.cardTitleContainer}>
                <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>Live Preview</Text>
                <Text style={[styles.cardSubtitle, { color: theme.colors.text.secondary }]}>Real-time updates</Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: theme.colors.text.secondary }]}>
              Every change you make is instantly reflected in the preview. No need to refresh or rebuild.
            </Text>
          </View>
        </Card>
        
        <Card gradient onPress={() => console.log('AI Powered pressed')}>
          <View style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, { backgroundColor: theme.colors.warning + '20' }]}>
                <Ionicons name="sparkles" size={24} color={theme.colors.warning} />
              </View>
              <View style={styles.cardTitleContainer}>
                <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>AI Powered</Text>
                <Text style={[styles.cardSubtitle, { color: theme.colors.text.secondary }]}>Smart assistance</Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: theme.colors.text.secondary }]}>
              Leverage AI to build complex features with simple conversations. Just describe what you want!
            </Text>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
};

const StatsScreen = () => {
  const theme = useTheme();
  const [count, setCount] = React.useState(0);
  const [streak, setStreak] = React.useState(7);

  return (
    <ScrollView 
      style={[styles.screenContainer, { backgroundColor: theme.colors.background.primary }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.statsHeader}>
        <Text style={[styles.screenTitle, { color: theme.colors.text.primary }]}>Your Statistics</Text>
        <Text style={[styles.screenSubtitle, { color: theme.colors.text.secondary }]}>Track your progress</Text>
      </View>
      
      <View style={styles.contentSection}>
        <Card gradient>
          <View style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary + '20' }]}>
                <Ionicons name="add-circle" size={24} color={theme.colors.primary} />
              </View>
              <View style={styles.cardTitleContainer}>
                <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>Counter</Text>
                <Text style={[styles.cardSubtitle, { color: theme.colors.text.secondary }]}>Current value</Text>
              </View>
            </View>
            
            <View style={styles.counterDisplay}>
              <Text style={[styles.counterNumber, { color: theme.colors.primary }]}>{count}</Text>
              <Text style={[styles.counterLabel, { color: theme.colors.text.tertiary }]}>Total Count</Text>
            </View>
            
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.success }]}
                onPress={() => {
                  // Haptics.impactAsync(// Haptics.ImpactFeedbackStyle.Medium);
                  setCount(count + 1);
                }}
              >
                <Ionicons name="add" size={18} color="white" />
                <Text style={styles.buttonText}>+1</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.danger }]}
                onPress={() => {
                  // Haptics.impactAsync(// Haptics.ImpactFeedbackStyle.Medium);
                  setCount(Math.max(0, count - 1));
                }}
              >
                <Ionicons name="remove" size={18} color="white" />
                <Text style={styles.buttonText}>-1</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.text.tertiary }]}
                onPress={() => {
                  // Haptics.impactAsync(// Haptics.ImpactFeedbackStyle.Heavy);
                  setCount(0);
                }}
              >
                <Ionicons name="refresh" size={18} color="white" />
                <Text style={styles.buttonText}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
        
        <Card gradient>
          <View style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, { backgroundColor: theme.colors.warning + '20' }]}>
                <Ionicons name="flame" size={24} color={theme.colors.warning} />
              </View>
              <View style={styles.cardTitleContainer}>
                <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>Streak</Text>
                <Text style={[styles.cardSubtitle, { color: theme.colors.text.secondary }]}>Daily activity</Text>
              </View>
            </View>
            
            <View style={styles.streakDisplay}>
              <Text style={[styles.streakNumber, { color: theme.colors.warning }]}>{streak}</Text>
              <Text style={[styles.streakLabel, { color: theme.colors.text.secondary }]}>days in a row</Text>
            </View>
            
            <View style={styles.trendSection}>
              <Ionicons name="trending-up" size={16} color={theme.colors.success} />
              <Text style={[styles.trendText, { color: theme.colors.success }]}>+2 from last week</Text>
            </View>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
};

const ProfileScreen = () => {
  const theme = useTheme();
  
  return (
    <ScrollView 
      style={[styles.screenContainer, { backgroundColor: theme.colors.background.primary }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, { backgroundColor: theme.colors.primary + '20' }]}>
          <Ionicons name="person" size={32} color={theme.colors.primary} />
        </View>
        <Text style={[styles.profileName, { color: theme.colors.text.primary }]}>React Native Developer</Text>
        <Text style={[styles.profileBio, { color: theme.colors.text.secondary }]}>Building amazing mobile experiences</Text>
      </View>
      
      <View style={styles.contentSection}>
        <Card gradient>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: theme.colors.primary }]}>12</Text>
              <Text style={[styles.statLabel, { color: theme.colors.text.secondary }]}>Projects</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: theme.colors.success }]}>24</Text>
              <Text style={[styles.statLabel, { color: theme.colors.text.secondary }]}>Components</Text>
            </View>
          </View>
        </Card>
        
        {[
          { icon: 'settings', label: 'Settings', color: theme.colors.text.secondary, detail: 'Preferences' },
          { icon: 'help-circle', label: 'Help & Support', color: theme.colors.success, detail: 'Get assistance' },
          { icon: 'information-circle', label: 'About', color: theme.colors.warning, detail: 'App information' },
        ].map((item, index) => (
          <Card key={index} onPress={() => console.log(\`\${item.label} pressed\`)}>
            <View style={styles.menuItem}>
              <View style={[styles.menuIconContainer, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, { color: theme.colors.text.primary }]}>{item.label}</Text>
                <Text style={[styles.menuDetail, { color: theme.colors.text.tertiary }]}>{item.detail}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
            </View>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = React.useState('home');
  const theme = useTheme();

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen />;
      case 'stats':
        return <StatsScreen />;
      case 'profile':
        return <ProfileScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar 
        barStyle={theme.isDark ? "light-content" : "dark-content"} 
        backgroundColor={theme.colors.background.primary} 
      />
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
        <View style={styles.content}>
          {renderScreen()}
        </View>
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
  
  // Card Styles
  cardContainer: {
    borderRadius: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, y: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardGradient: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardContent: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardInner: {
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  cardDescription: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  
  // Tab Bar Styles
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  
  // Hero Section
  heroSection: {
    paddingHorizontal: 24,
    paddingVertical: 60,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    fontWeight: '500',
  },
  
  // Content Section
  contentSection: {
    padding: 20,
    paddingTop: 30,
  },
  
  // Screen Headers
  screenTitle: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  statsHeader: {
    padding: 24,
    paddingTop: 40,
  },
  
  // Counter Styles
  counterDisplay: {
    alignItems: 'center',
    marginBottom: 24,
  },
  counterNumber: {
    fontSize: 56,
    fontWeight: '800',
    marginBottom: 4,
  },
  counterLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 4,
  },
  
  // Streak Styles
  streakDisplay: {
    alignItems: 'center',
    marginBottom: 16,
  },
  streakNumber: {
    fontSize: 42,
    fontWeight: '800',
    marginBottom: 4,
  },
  streakLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  trendSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  
  // Profile Styles
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  profileBio: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 40,
    marginHorizontal: 20,
  },
  
  // Menu Styles
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  menuDetail: {
    fontSize: 13,
    fontWeight: '500',
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
  'expo-linear-gradient': {
    version: '8.2.1'
  },
  'react-native-vector-icons': {
    version: '7.1.0'
  },
  'react-native-safe-area-context': {
    version: '4.12.0'
  },
  '@expo/vector-icons': { version: '13.0.0' },
};