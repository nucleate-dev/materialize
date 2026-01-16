import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { BodyText } from './StyledText';
import { spacing, borderRadius } from '../../lib/theme';
import { RenderStatus } from '../../hooks/usePrototypeDevServer';

interface BadgeConfig {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  dotColor: string;
  text: string;
  animate: boolean;
}

interface ConnectionStatusBadgeProps {
  status: RenderStatus;
  onStartDevServer?: () => void;
}

export function ConnectionStatusBadge({ status, onStartDevServer }: ConnectionStatusBadgeProps) {
  const { theme } = useTheme();

  const getBadgeConfig = (renderStatus: RenderStatus): BadgeConfig => {
    switch (renderStatus) {
      case 'Static build':
        return {
          backgroundColor: theme.colors.accent,
          borderColor: theme.colors.border,
          textColor: theme.colors.mutedForeground,
          dotColor: theme.colors.info,
          text: 'Static Build',
          animate: false,
        };
      case 'Updating..':
      case 'Connecting..':
        return {
          backgroundColor: `${theme.colors.warning}15`,
          borderColor: `${theme.colors.warning}50`,
          textColor: theme.colors.foreground,
          dotColor: theme.colors.warning,
          text: renderStatus,
          animate: true,
        };
      case 'Starting Dev Server..':
        return {
          backgroundColor: `${theme.colors.warning}15`,
          borderColor: `${theme.colors.warning}50`,
          textColor: theme.colors.foreground,
          dotColor: theme.colors.warning,
          text: 'Starting Dev Server.. (~1m)',
          animate: true,
        };
      case 'Error':
        return {
          backgroundColor: `${theme.colors.destructive}15`,
          borderColor: `${theme.colors.destructive}50`,
          textColor: theme.colors.destructive,
          dotColor: theme.colors.destructive,
          text: 'Error',
          animate: false,
        };
      case 'Disconnected':
        return {
          backgroundColor: `${theme.colors.destructive}15`,
          borderColor: `${theme.colors.destructive}50`,
          textColor: theme.colors.destructive,
          dotColor: theme.colors.destructive,
          text: 'Disconnected',
          animate: false,
        };
      case 'Connected':
        return {
          backgroundColor: `${theme.colors.success}15`,
          borderColor: `${theme.colors.success}50`,
          textColor: theme.colors.success,
          dotColor: theme.colors.success,
          text: 'Connected',
          animate: false,
        };
      default:
        return {
          backgroundColor: theme.colors.accent,
          borderColor: theme.colors.border,
          textColor: theme.colors.mutedForeground,
          dotColor: theme.colors.muted,
          text: 'Unknown',
          animate: false,
        };
    }
  };

  const config = getBadgeConfig(status);
  const isStaticBuild = status === 'Static build';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
        },
      ]}
    >
      {config.animate ? (
        <ActivityIndicator size="small" color={config.dotColor} style={styles.dot} />
      ) : (
        <View style={[styles.statusDot, { backgroundColor: config.dotColor }]} />
      )}
      <BodyText size="xs" color={config.textColor} style={styles.text}>
        {config.text}
      </BodyText>
      {isStaticBuild && onStartDevServer && (
        <Pressable
          onPress={onStartDevServer}
          style={styles.startButton}
          hitSlop={8}
        >
          <BodyText size="xs" color={theme.colors.primary}>
            ⚡ Start
          </BodyText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  dot: {
    marginRight: spacing[2],
    transform: [{ scale: 0.6 }],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing[2],
  },
  text: {
    fontWeight: '500',
  },
  startButton: {
    marginLeft: spacing[2],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
});
