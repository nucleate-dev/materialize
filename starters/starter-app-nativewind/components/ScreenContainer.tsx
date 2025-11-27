import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SafeAreaEdge = 'top' | 'bottom' | 'left' | 'right';

export interface ScreenContainerProps {
  children: React.ReactNode;
  padded?: boolean;
  edges?: SafeAreaEdge[];
  className?: string;
  style?: ViewStyle;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  padded = true,
  edges = ['top', 'bottom'],
  className = '',
  style,
}) => {
  const insets = useSafeAreaInsets();

  const baseClasses = 'flex-1 bg-white dark:bg-black';
  const paddedClasses = padded ? 'px-4' : '';
  const finalClassName = [baseClasses, paddedClasses, className]
    .filter(Boolean)
    .join(' ');

  const insetStyles: ViewStyle = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: edges.includes('left') ? insets.left : 0,
    paddingRight: edges.includes('right') ? insets.right : 0,
  };

  return (
    <View className={finalClassName} style={[insetStyles, style]}>
      {children}
    </View>
  );
};
