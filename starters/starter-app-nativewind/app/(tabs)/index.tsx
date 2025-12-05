import { StyledText } from '@/components';
import { View } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white p-4 dark:bg-black">
      <StyledText variant="h1" className="text-center">
        Nucleate
      </StyledText>

      <View className="h-[1px] w-4/5 border-b border-gray-300 dark:border-gray-700" />

      <StyledText variant="caption" className="text-center opacity-80">
        The app automatically supports dark and light mode with theme support.
      </StyledText>
    </View>
  );
}
