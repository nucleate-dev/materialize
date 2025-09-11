import { Button, H1, Paragraph, Separator, YStack, Text } from 'tamagui';

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
        Welcome to your app!
      </H1>
      
      <Separator width="80%" borderColor="$borderColor" />
      
      <Paragraph size="$5" color="$color" textAlign="center" maxWidth={300}>
        This is your main screen. You can start building your app here with beautiful Tamagui components.
      </Paragraph>
      
      <Text size="$3" color="$color11" textAlign="center" opacity={0.8}>
        The app automatically supports dark and light mode with Tamagui themes.
      </Text>

      <Button
        size="$4"
        theme="active"
        onPress={() => console.log('Button pressed!')}
        marginTop="$4"
      >
        Get Started
      </Button>
    </YStack>
  );
}
