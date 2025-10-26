import { Link, Stack } from 'expo-router';
import { YStack, Text, styled } from 'tamagui';

const LinkText = styled(Text, {
  fontSize: 14,
  color: '$color',
  textDecorationLine: 'underline',
});

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$4"
        backgroundColor="$background"
      >
        <Text
          fontSize="$6"
          fontWeight="bold"
          color="$color"
          marginBottom="$4"
        >
          This screen doesn't exist.
        </Text>

        <Link href="/">
          <LinkText>Go to home screen!</LinkText>
        </Link>
      </YStack>
    </>
  );
}
