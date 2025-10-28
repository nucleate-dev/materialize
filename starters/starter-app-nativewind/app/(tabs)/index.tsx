import { Alert, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white p-4 dark:bg-black">
      <Text className="text-center text-3xl font-bold text-black dark:text-white">
        Welcome to Materialize!
      </Text>

      <View className="h-[1px] w-4/5 border-b border-gray-300 dark:border-gray-700" />

      <Text className="max-w-[300px] text-center text-lg text-black dark:text-white">
        This is your main screen. You can start building your app here with beautiful components.
      </Text>

      <Text className="text-center text-sm text-gray-600 opacity-80 dark:text-gray-400">
        The app automatically supports dark and light mode with theme support.
      </Text>

      <TouchableOpacity
        className="mt-4 rounded-lg bg-blue-500 px-6 py-3 dark:bg-blue-600"
        onPress={() => Alert.alert('Button pressed!')}>
        <Text className="text-base font-semibold text-white">Press Me!</Text>
      </TouchableOpacity>
    </View>
  );
}
