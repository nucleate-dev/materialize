import { H1, Separator, Text, YStack } from 'tamagui';

export default function HomeScreen() {
  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$background"
      padding="$4"
      gap="$4"
    >
      <H1 size="$8" fontWeight="bold" color="$color" textAlign="center">
        Nucleate
      </H1>

      <Separator width="80%" borderColor="$borderColor" />
      <Text fontSize="$3" color="$color11" textAlign="center" opacity={0.8}>
        The app automatically supports dark and light mode with theme support.
      </Text>
    </YStack>
  );
}
