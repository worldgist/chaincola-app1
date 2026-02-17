import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="signin" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="create-pin" />
      <Stack.Screen name="biometric-setup" />
    </Stack>
  );
}

