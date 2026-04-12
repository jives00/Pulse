import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="workout/[id]" />
      <Stack.Screen name="routine/[id]" />
      <Stack.Screen name="exercise/[id]" />
      <Stack.Screen name="recipe/[id]" />
      <Stack.Screen name="recipe/edit" />
    </Stack>
  );
}
