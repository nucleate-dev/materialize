import { useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../lib/ThemeContext';
import { BodyText } from './ui';
import { spacing } from '../lib/theme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export function OfflineBanner() {
  const { theme } = useTheme();
  const { isOnline } = useNetworkStatus();
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true);
      setWasOffline(true);
    } else if (wasOffline) {
      // Show "Back online" message briefly
      setShowBanner(false);
      setShowBackOnline(true);
      const timer = setTimeout(() => {
        setShowBackOnline(false);
        setWasOffline(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (!showBanner && !showBackOnline) {
    return null;
  }

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: showBackOnline ? theme.colors.success : theme.colors.warning,
        },
      ]}
    >
      <BodyText
        size="sm"
        color={showBackOnline ? theme.colors.successForeground : theme.colors.warningForeground}
      >
        {showBackOnline ? '✓ Back online' : '⚠ You\'re offline'}
      </BodyText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
