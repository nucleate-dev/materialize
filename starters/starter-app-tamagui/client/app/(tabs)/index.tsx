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
    </YStack>
  );
}
