import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="verify-account" />
      <Stack.Screen name="security" />
      <Stack.Screen name="change-pin" />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="notification-settings" />
      <Stack.Screen name="referral" />
      <Stack.Screen name="contact-us" />
      <Stack.Screen name="chat-support" />
      <Stack.Screen name="delete-account" />
      <Stack.Screen name="terms-conditions" />
      <Stack.Screen name="privacy-policy" />
    </Stack>
  );
}


